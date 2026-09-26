"""Build the Mathlib Explorer: lay out, for the page, what the suite's tools say about Mathlib.

Nothing is decided here about the mathematics or the code: the dataset (S2, from trust-extract)
gives the declarations, their docstrings, statements and graphs; evidence-core reads the module
docstrings and attributes (`docs`), Mathlib's catalogues and bibliography (`catalogs`), and
summarizes the graphs for readers (`graphs`: concepts and results, what each is built from, is about
and uses, the reverse, importance, basic notions). This module writes that as JSON, sharded so that a
page loads only what it shows:

- ``data/site.json``: counts, the subject tree, the modules' titles, the Map;
- ``data/catalogs.json``: the overview, the undergraduate curriculum, the famous theorems;
- ``data/books.json``: the bibliography, with the modules citing each entry;
- ``data/search.json``: the notable declarations, by title and keywords, which search looks through
  first; ``data/names/<k>.json``: every listed declaration's Lean name, for a search by name;
- ``data/nodes/<k>.json``: every node's name, title, kind, module and flags, for labels and hovers;
- ``data/m/<module>.json``: a module's docstring and its declarations in full;
- ``data/g/<module>.json``: its declarations' edges in the concept and proof maps, for expanding them.
"""
from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from evidence_core import Dataset
from evidence_core import catalogs, docs as docs_mod
from evidence_core.graphs import Graphs, is_auxiliary

STATIC = Path(__file__).parent / "static"
NODE_SHARD = 4096
NAME_SHARDS = 64
KIND = {"definition": "definition", "structure": "structure", "class": "class", "inductive": "inductive type",
        "opaque": "definition", "axiom": "axiom", "instance": "instance"}
#: A directory's title, where splitting its name is not enough.
TITLES = {"RingTheory": "Ring theory", "NumberTheory": "Number theory", "CategoryTheory": "Category theory",
          "MeasureTheory": "Measure theory", "SetTheory": "Set theory", "FieldTheory": "Field theory",
          "GroupTheory": "Group theory", "LinearAlgebra": "Linear algebra", "AlgebraicGeometry": "Algebraic geometry",
          "AlgebraicTopology": "Algebraic topology", "RepresentationTheory": "Representation theory",
          "InformationTheory": "Information theory", "ModelTheory": "Model theory", "KleeneAlgebra": "Kleene algebra",
          "SpecialFunctions": "Special functions", "InnerProductSpace": "Inner product spaces",
          "NormedSpace": "Normed spaces", "Order": "Order theory", "Probability": "Probability theory",
          "Data": "Numbers and basic structures", "Topology": "Topology", "Analysis": "Analysis", "Algebra": "Algebra",
          "Combinatorics": "Combinatorics", "Geometry": "Geometry", "Dynamics": "Dynamical systems",
          "Logic": "Logic", "Computability": "Computability", "Condensed": "Condensed mathematics",
          "Tactic": "Tactics (Lean's proof automation)", "Lean": "Lean metaprogramming", "Util": "Utilities",
          "Testing": "Testing", "Control": "Control structures", "Deprecated": "Deprecated", "Init": "Foundations",
          "Basic": "Basics",
          # Some folders below, whose names do not read as a subject.
          "CStarAlgebra": "C*-algebras", "RCLike": "ℝ or ℂ", "ODE": "Differential equations", "Normed": "Normed groups and spaces",
          "Rat": "Rational numbers", "Real": "Real numbers", "Complex": "Complex numbers", "Matrix": "Matrices",
          "Fourier": "Fourier analysis", "Convex": "Convexity", "Meromorphic": "Meromorphic functions",
          "Analytic": "Analytic functions", "Distribution": "Distributions", "BoxIntegral": "Box integrals",
          "VonNeumannAlgebra": "Von Neumann algebras", "LocallyConvex": "Locally convex spaces",
          "AbsoluteValue": "Absolute values", "FunctionalSpaces": "Function spaces", "Nat": "Natural numbers",
          "Int": "Integers", "ENNReal": "Extended nonnegative reals", "NNReal": "Nonnegative reals", "EReal": "Extended reals",
          "Finset": "Finite sets", "Multiset": "Multisets", "List": "Lists", "Set": "Sets", "Fintype": "Finite types",
          "Polynomial": "Polynomials", "MvPolynomial": "Multivariate polynomials", "PowerSeries": "Power series",
          "Finsupp": "Finitely supported functions", "ZMod": "Integers modulo n", "PNat": "Positive natural numbers",
          "Quaternion": "Quaternions", "Sym": "Symmetric powers", "Bundle": "Bundles", "Manifold": "Manifolds",
          "LSeries": "L-series", "ModularForms": "Modular forms", "NumberField": "Number fields", "Padics": "p-adic numbers",
          "Cyclotomic": "Cyclotomic fields", "SimpleGraph": "Graph theory (simple graphs)", "Additive": "Additive combinatorics",
          "SpecialFunctions": "Special functions", "Calculus": "Calculus", "Asymptotics": "Asymptotics",
          "InnerProductSpace": "Inner product spaces", "Martingale": "Martingales", "Kernel": "Kernels",
          "Integral": "Integration", "Measure": "Measures", "Function": "Functions", "Group": "Groups", "Ring": "Rings",
          "Module": "Modules", "Field": "Fields", "Order": "Order theory", "Category": "Categories", "Homology": "Homology",
          "Sheaf": "Sheaves", "Scheme": "Schemes", "Limits": "Limits", "Monoidal": "Monoidal categories",
          "Algebra": "Algebra", "Lie": "Lie algebras", "Star": "Star algebras", "BigOperators": "Sums and products",
          "Ideal": "Ideals", "Localization": "Localization", "Valuation": "Valuations", "DedekindDomain": "Dedekind domains",
          "Perfectoid": "Perfectoid rings", "Galois": "Galois theory", "Sylow": "Sylow theory", "Perm": "Permutations",
          "Probability": "Probability theory", "Distributions": "Distributions", "Independence": "Independence",
          "Euclidean": "Euclidean geometry", "Metric": "Metric spaces", "MetricSpace": "Metric spaces",
          "UniformSpace": "Uniform spaces", "Compactness": "Compactness", "Connected": "Connectedness",
          "Homotopy": "Homotopy", "ContinuousMap": "Continuous maps", "Instances": "Examples"}
#: Top-level directories that are about Lean rather than mathematics: kept, listed last.
TOOLING = {"Tactic", "Lean", "Util", "Testing", "Control", "Deprecated", "Std", "Init"}


@dataclass
class Options:
    dataset: Path
    mathlib: Path           # a checkout of Mathlib at the dataset's commit (docs/ and sources)
    out: Path
    repo: str = "leanprover-community/mathlib4"
    list_limit: int = 15    # how many of a ranked list a page shows first
    proof_limit: int = 30


def humanize(segment: str) -> str:
    if segment in TITLES:
        return TITLES[segment]
    words = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", segment).split()
    return " ".join([words[0]] + [w.lower() if not w.isupper() else w for w in words[1:]]) if words else segment


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build(opt: Options) -> dict:
    ds = Dataset.load(opt.dataset)
    decls = ds.decls
    docs_dir = opt.mathlib / "docs"

    # --- what Mathlib says of itself -------------------------------------------------------------
    resolver = docs_mod.Resolver(ds)
    mdocs = {m["name"]: docs_mod.module_doc(ds, m, resolver) for m in ds.modules}
    overview = catalogs.topic_tree(docs_dir / "overview.yaml", ds, "Overview") if (docs_dir / "overview.yaml").exists() else None
    undergrad = catalogs.topic_tree(docs_dir / "undergrad.yaml", ds, "Undergraduate curriculum") \
        if (docs_dir / "undergrad.yaml").exists() else None
    hundred = catalogs.famous_theorems(docs_dir / "100.yaml", ds) if (docs_dir / "100.yaml").exists() else []
    thousand = catalogs.famous_theorems(docs_dir / "1000.yaml", ds) if (docs_dir / "1000.yaml").exists() else []
    bib = catalogs.bibliography(docs_dir / "references.bib") if (docs_dir / "references.bib").exists() else {}
    deprecated = docs_mod.deprecated(ds)

    # Titles and emphasis from the catalogues: a concept or theorem they name is known by that name.
    curated_title: dict[str, str] = {}
    famous: dict[str, list[dict]] = defaultdict(list)
    for tree, key in ((overview, "overview"), (undergrad, "undergrad")):
        for topic in (tree.walk() if tree else []):
            for e in topic.entries:
                for d in e.found:
                    curated_title.setdefault(d, e.title[:1].upper() + e.title[1:])
    for listing, key in ((hundred, "100"), (thousand, "1000")):
        for e in listing:
            for d in e.found:
                curated_title[d] = e.title
                famous[d].append({"list": key, "id": e.meta.get("id"), "title": e.title, "authors": e.meta.get("authors"),
                                  "date": e.meta.get("date"), "wikidata": e.meta.get("wikidata")})
    main_named: dict[str, str] = {}
    for md in mdocs.values():
        for item in md.definitions + md.results:
            for n in item.names:
                main_named.setdefault(n, item.text)
    boost = {n: 1.5 for n in main_named}
    for n in curated_title:
        boost[n] = boost.get(n, 0) + 3.0
    g = Graphs(ds, boost=boost)
    rev = g.reverse()

    # --- modules and subjects ----------------------------------------------------------------------
    modules = sorted(m["name"] for m in ds.modules)
    mid = {m: i for i, m in enumerate(modules)}
    mod_rows = {m["name"]: m for m in ds.modules}
    listed_by_module: dict[str, list] = defaultdict(list)
    for d in decls:
        if d.is_project and d.name not in deprecated and not is_auxiliary(d.name) and \
                (g.concept[d.id] or g.result[d.id] or d.kind == "instance"):
            listed_by_module[d.module].append(d)
    docstrings = {n: rows[0].get("text", "") for n, rows in ds.facet("docstring").items()}

    def title_of(name: str) -> str:
        return curated_title.get(name) or docs_mod.first_sentence(docstrings.get(name, ""))

    def formula_of(name: str) -> str:
        """An undocumented result is shown by what it states: its conclusion, when it is short."""
        concl = (ds.facet_row("statement", name) or {}).get("conclusion", "")
        return concl if 0 < len(concl) <= 140 else ""

    def kind_of(d) -> str:
        if g.result[d.id]:
            kw = (ds.facet_row("source", d.name) or {}).get("keyword")
            return "theorem" if kw == "theorem" or d.name in famous else "lemma"
        return KIND.get(d.kind, d.kind)

    # The subject tree: Mathlib's directories, each with its modules and how much is in them.
    tree: dict = {"key": "", "title": "Mathlib", "children": {}, "modules": [], "decls": 0}
    for m in modules:
        parts = m.split(".")[1:]
        node = tree
        node["decls"] += len(listed_by_module.get(m, []))
        for k, seg in enumerate(parts[:-1]):
            node = node["children"].setdefault(seg, {"key": ".".join(parts[:k + 1]), "title": humanize(seg),
                                                      "children": {}, "modules": [], "decls": 0})
            node["decls"] += len(listed_by_module.get(m, []))
        node["modules"].append(mid[m])

    def freeze(node) -> dict:
        kids = sorted(node["children"].values(), key=lambda c: (c["key"].split(".")[0] in TOOLING, c["title"].lower()))
        frozen = [freeze(c) for c in kids if c["decls"]]
        members = [d for m in node["modules"] for d in listed_by_module.get(modules[m], [])]
        concepts = [d.id for d in members if g.concept[d.id]] + [x for c in frozen for x in c["keyConcepts"]]
        results = [d.id for d in members if g.result[d.id]] + [x for c in frozen for x in c["keyResults"]]
        return {"key": node["key"], "title": node["title"], "decls": node["decls"], "modules": node["modules"],
                "tooling": node["key"].split(".")[0] in TOOLING,
                "keyConcepts": g.rank(concepts, 12), "keyResults": g.rank(results, 12), "children": frozen}
    subjects = freeze(tree)

    def subject_of(module: str) -> str:
        parts = module.split(".")[1:-1]
        return ".".join(parts)

    module_table = []
    for m in modules:
        md = mdocs.get(m)
        module_table.append([m, (md.title if md else "") or humanize(m.rsplit(".", 1)[-1]), md.summary if md else "",
                             len(listed_by_module.get(m, []))])

    # The Map: the top-level subjects and how much each one's concepts are built from the others'.
    area_of = lambda d: d.module.split(".")[1] if d.module.startswith("Mathlib.") and d.module.count(".") >= 1 else ""
    area_size: dict[str, int] = defaultdict(int)
    area_edges: dict[tuple[str, str], int] = defaultdict(int)
    for d in decls:
        if not d.is_project or not (g.concept[d.id] or g.result[d.id]):
            continue
        a = area_of(d)
        area_size[a] += 1
        if g.concept[d.id]:
            for t in g.built_from(d.id):
                b = area_of(decls[t]) if decls[t].is_project else ""
                if b and b != a:
                    area_edges[(a, b)] += 1

    # --- nodes: every declaration a page may name --------------------------------------------------
    node_rows: dict[int, list] = {}
    for d in decls:
        flags = (1 if g.basic[d.id] else 0) | (2 if d.name in docstrings else 0) | (4 if d.name in deprecated else 0) | \
            (8 if not d.is_project else 0) | (16 if d.name in famous else 0) | (32 if g.routine[d.id] else 0)
        kind = "result" if g.result[d.id] else ("concept" if g.concept[d.id] else ("instance" if d.kind == "instance" else "other"))
        title = title_of(d.name) if d.is_project or d.name in docstrings else ""
        if not title and g.result[d.id] and d.is_project:
            title = formula_of(d.name)
            flags |= 64 if title else 0
        node_rows[d.id] = [d.name, title, kind, mid.get(d.module, -1), flags, round(g.importance[d.id], 2)]

    # --- per module: the page of each declaration --------------------------------------------------
    out = opt.out
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(STATIC, out)
    data = out / "data"
    L, P = opt.list_limit, opt.proof_limit

    def ids(xs, limit=None):
        return g.rank(xs, limit)

    stats = defaultdict(int)
    for m in modules:
        entries, edges = [], {}
        for d in sorted(listed_by_module.get(m, []), key=lambda d: (ds.facet_row("source", d.name) or {}).get("start", [0])[0]):
            i = d.id
            src = ds.facet_row("source", d.name) or {}
            sig = ds.facet_row("signature", d.name) or {}
            stmt = ds.facet_row("statement", d.name) or {}
            doc = docstrings.get(d.name, "")
            e = {"id": i, "name": d.name, "title": title_of(d.name), "kind": kind_of(d), "doc": doc,
                 "sig": [sig.get("text", ""), sig.get("refs", [])] if sig else None,
                 "line": [src["start"][0], src["end"][0]] if src else None}
            if stmt.get("fields"):
                # A structure's or class's fields: its parents (`toMonoid : Monoid G`), its data, its axioms.
                e["fields"] = [[f.get("name", ""), f.get("type", "")[:1500], [r for r in f.get("typeRefs", []) if r[1] <= 1500]]
                               for f in stmt["fields"]]
            if stmt.get("value") and not d.is_prop:
                e["value"] = [stmt["value"][:3000], [r for r in stmt.get("valueRefs", []) if r[1] <= 3000]]
            names = resolver.names_in(doc, d.module) if "`" in doc else {}
            if names:
                e["names"] = names
            links = docs_mod.links(ds, d.name).as_json()
            if links:
                e["links"] = links
            if d.name in famous:
                e["famous"] = famous[d.name]
            if d.name in main_named:
                e["main"] = main_named[d.name]
            if g.concept[i]:
                built = g.built_from(i)
                e["built"] = g.rank([x for x in built if not g.basic[x]])
                e["basic"] = [x for x in built if g.basic[x]]
                e["facts"], e["nFacts"] = ids(rev.facts[i], L), len(rev.facts[i])
                e["examples"], e["nExamples"] = ids(rev.examples[i], L), len(rev.examples[i])
                e["builtOn"], e["nBuiltOn"] = ids(rev.built_on[i], L), len(rev.built_on[i])
                edges[i] = [e["built"], []]
                stats["concepts"] += 1
            elif g.result[i]:
                concl = stmt.get("conclusion")
                if concl:
                    e["concl"] = [concl[:3000], [r for r in stmt.get("conclusionRefs", []) if r[1] <= 3000]]
                about = g.about(i)
                e["about"] = g.rank([x for x in about if not g.basic[x]])
                e["basic"] = [x for x in about if g.basic[x]]
                uses = g.proof_uses(i)
                steps = [x for x in uses if not g.routine[x]]
                e["uses"], e["nUses"], e["nRoutine"] = g.rank_steps(steps, P), len(steps), len(uses) - len(steps)
                e["usedIn"], e["nUsedIn"] = ids(rev.used_in[i], L), len(rev.used_in[i])
                edges[i] = [e["about"], e["uses"][:12]]
                stats["results"] += 1
            else:
                e["about"] = [x for x in g.about(i) if not g.basic[x]]
                stats["instances"] += 1
            entries.append(e)
        md = mdocs.get(m)
        row = mod_rows.get(m, {})
        imports = [mid[x] for x in row.get("imports", []) if x in mid]
        write(data / "m" / f"{mid[m]}.json", {
            "name": m, "path": row.get("path", ""), "doc": md.as_json() if md else None,
            "docText": md.text if md else "", "imports": imports, "decls": entries,
            "url": f"https://github.com/{opt.repo}/blob/{ds.commit}/{row.get('path', '')}"})
        write(data / "g" / f"{mid[m]}.json", edges)
        stats["modules"] += 1
    imported_by: dict[int, list[int]] = defaultdict(list)
    for m in modules:
        for x in mod_rows.get(m, {}).get("imports", []):
            if x in mid:
                imported_by[mid[x]].append(mid[m])

    for k in range(0, len(decls), NODE_SHARD):
        write(data / "nodes" / f"{k // NODE_SHARD}.json", [node_rows[i] for i in range(k, min(k + NODE_SHARD, len(decls)))])

    # --- search -------------------------------------------------------------------------------------
    search = []
    names_by_shard: dict[int, list] = defaultdict(list)
    for m in modules:
        md = mdocs.get(m)
        tags = " ".join(md.tags) if md else ""
        for d in listed_by_module.get(m, []):
            if d.kind == "instance":
                continue
            title = title_of(d.name)
            if title or d.name in main_named:
                search.append([d.id, title, tags if d.name in main_named else "", round(g.importance[d.id], 1), d.name])
    # Every node by name: a page resolves any name it shows (a Lean text's constants included).
    for d in decls:
        names_by_shard[hash_name(d.name)].append([d.id, d.name])
    write(data / "search.json", search)
    for k, rows in names_by_shard.items():
        write(data / "names" / f"{k}.json", rows)

    # --- catalogues, books, site -------------------------------------------------------------------
    def resolve_tree(t):
        return {"title": t.title, "entries": [{"title": e.title, "decls": [ds.by_name[x].id for x in e.found],
                                                "missing": [x for x in e.decls if x not in e.found]} for e in t.entries],
                "children": [resolve_tree(c) for c in t.children]}

    def resolve_list(listing):
        return [{"id": e.meta.get("id"), "title": e.title, "decls": [ds.by_name[x].id for x in e.found],
                 "missing": [x for x in e.decls if x not in e.found],
                 **{k: e.meta[k] for k in ("authors", "date", "wikidata", "url", "note", "statement", "links") if e.meta.get(k)}}
                for e in listing]
    write(data / "catalogs.json", {"overview": resolve_tree(overview) if overview else None,
                                   "undergrad": resolve_tree(undergrad) if undergrad else None,
                                   "hundred": resolve_list(hundred), "thousand": resolve_list(thousand)})
    cited: dict[str, list[int]] = defaultdict(list)
    for m, md in mdocs.items():
        for key in md.references:
            cited[key].append(mid[m])
    write(data / "books.json", {key: {"cite": catalogs.cite(entry), **entry, "modules": cited.get(key, [])}
                                for key, entry in bib.items()})
    areas = sorted((a for a in area_size if a), key=lambda a: -area_size[a])
    site = {
        "mathlib": {"commit": ds.commit, "toolchain": ds.toolchain, "producer": ds.producer(), "repo": opt.repo},
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {**stats, "declarations": sum(1 for d in decls if d.is_project), "documented": len(docstrings),
                   "famous": sum(1 for e in hundred + thousand if e.found), "books": len(bib)},
        "subjects": subjects, "modules": module_table,
        "importedBy": {str(k): v for k, v in imported_by.items()},
        "map": {"areas": [{"key": a, "title": humanize(a), "size": area_size[a], "tooling": a in TOOLING} for a in areas],
                "edges": map_edges(area_edges, [a for a in areas if a not in TOOLING])},
        "shards": {"nodes": NODE_SHARD, "names": NAME_SHARDS},
    }
    write(data / "site.json", site)
    return {**stats, "search": len(search), "nodes": len(decls)}


def map_edges(edges: dict, areas: list[str], top: int = 60) -> list:
    """The Map's arrows: the strongest overall, and each subject's strongest, so that none is alone."""
    ranked = sorted(((a, b, w) for (a, b), w in edges.items() if a in areas and b in areas), key=lambda e: -e[2])
    keep = set(ranked[:top])
    for a in areas:
        own = [e for e in ranked if e[0] == a or e[1] == a]
        if own:
            keep.add(own[0])
    return [list(e) for e in sorted(keep, key=lambda e: -e[2])]


def hash_name(name: str) -> int:
    """The shard of a name in data/names/: FNV-1a over its UTF-16 code units (the page computes the same)."""
    h = 0x811C9DC5
    data = name.encode("utf-16-le")
    for i in range(0, len(data), 2):
        h ^= data[i] | (data[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h % NAME_SHARDS
