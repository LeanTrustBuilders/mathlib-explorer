"""The site's data, built from the extractor's fixture (tests/vectors/fixture-b, a small library on
Lean core) and catalogue files written here in Mathlib's formats.

Run with ``python3 -m unittest discover -s tests`` (evidence-core installed).
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from mathlib_explorer import Options, build
from mathlib_explorer.build import hash_name, humanize

V = Path(__file__).parent / "vectors"
F = "Fixture."


def write_docs(docs: Path) -> None:
    """Mathlib's catalogues, in its formats, about the fixture."""
    docs.mkdir(parents=True)
    (docs / "overview.yaml").write_text(f"Arithmetic:\n  Doubling:\n    doubling: '{F}double'\n    halving: ''\n")
    (docs / "undergrad.yaml").write_text(f"Numbers:\n  tripling: '{F}triple'\n")
    (docs / "100.yaml").write_text(f"1:\n  title  : Triples are positive\n  decl   : {F}triple_pos\n  authors: Someone\n")
    (docs / "1000.yaml").write_text("Q1:\n  title: Something not formalized\n")
    (docs / "references.bib").write_text("@Book{key1,\n  author = {Noether, Emmy},\n  title = {Idealtheorie},\n  year = {1921}\n}\n")


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        write_docs(root / "mathlib" / "docs")
        cls.out = root / "site"
        cls.result = build(Options(dataset=V / "fixture-b", mathlib=root / "mathlib", out=cls.out))
        cls.data = cls.out / "data"
        cls.site = json.loads((cls.data / "site.json").read_text())
        cls.nodes = {}
        for p in (cls.data / "nodes").glob("*.json"):
            for j, row in enumerate(json.loads(p.read_text())):
                cls.nodes[int(p.stem) * cls.site["shards"]["nodes"] + j] = row
        cls.id = {row[0]: i for i, row in cls.nodes.items()}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def entry(self, name: str) -> dict:
        mid = self.nodes[self.id[name]][3]
        return next(e for e in json.loads((self.data / "m" / f"{mid}.json").read_text())["decls"] if e["name"] == name)

    def test_the_page_and_its_data_are_written(self):
        self.assertTrue((self.out / "index.html").exists() and (self.out / "app.js").exists())
        self.assertGreater(self.result["concepts"], 0)
        self.assertGreater(self.result["results"], 0)
        self.assertEqual(self.site["counts"]["concepts"], self.result["concepts"])

    def test_a_concept_page_says_what_it_is_built_from_and_what_is_proved_about_it(self):
        e = self.entry(F + "double")
        self.assertEqual(e["kind"], "definition")
        self.assertIn(self.id["Nat"], e["basic"])                    # Lean's own ℕ: a basic notion
        self.assertIn(self.id[F + "double_triple"], e["facts"])
        self.assertEqual(e["nFacts"], len(e["facts"]))

    def test_a_result_page_says_what_it_is_about(self):
        e = self.entry(F + "double_triple")
        self.assertIn(e["kind"], ("theorem", "lemma"))
        self.assertIn(self.id[F + "double"], e["about"])
        self.assertIn("uses", e)

    def test_catalogue_titles_name_what_they_point_at(self):
        self.assertEqual(self.nodes[self.id[F + "double"]][1], "Doubling")      # from overview.yaml
        self.assertEqual(self.nodes[self.id[F + "triple_pos"]][1], "Triples are positive")
        self.assertEqual(self.entry(F + "triple_pos")["famous"][0]["authors"], "Someone")
        cat = json.loads((self.data / "catalogs.json").read_text())
        [arith] = cat["overview"]["children"]
        self.assertEqual([(e["title"], bool(e["decls"])) for e in arith["children"][0]["entries"]], [("doubling", True), ("halving", False)])
        self.assertEqual([r["title"] for r in cat["thousand"] if not r["decls"]], ["Something not formalized"])

    def test_every_node_resolves_by_name(self):
        for name in (F + "double", "Nat"):
            rows = json.loads((self.data / "names" / f"{hash_name(name)}.json").read_text())
            self.assertIn([self.id[name], name], rows)

    def test_the_bibliography_and_the_subjects(self):
        books = json.loads((self.data / "books.json").read_text())
        self.assertEqual(books["key1"]["cite"], "Noether, Idealtheorie (1921)")
        self.assertEqual(self.site["subjects"]["title"], "Mathlib")
        search = json.loads((self.data / "search.json").read_text())
        self.assertIn(self.id[F + "double"], [r[0] for r in search])

    def test_without_a_store_no_records(self):
        self.assertIsNone(self.site["store"])
        self.assertNotIn("evidence", self.entry(F + "double"))

    def test_directories_read_as_subjects(self):
        self.assertEqual(humanize("NumberTheory"), "Number theory")
        self.assertEqual(humanize("SpecialFunctions"), "Special functions")
        self.assertEqual(humanize("LSeries"), "L-series")
        self.assertEqual(humanize("AperiodicOrder"), "Aperiodic order")


def person(login: str) -> dict:
    return {"kind": "person", "identity": {"kind": "github", "id": login}, "involvement": "outsider"}


class WithStore(unittest.TestCase):
    """A build that shows an evidence store's records on the pages of the declarations they are about."""

    @classmethod
    def setUpClass(cls):
        from evidence_core import Dataset
        from evidence_core import records as rec
        from evidence_core.store import Store, default_config

        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        write_docs(root / "mathlib" / "docs")
        ds = Dataset.load(V / "fixture-b")
        store = Store.init(root / "store", default_config("Owner/lib", "Fixture", "Fixture"))

        def record(n: int, kind: str, decl: str, by: dict, **fields) -> dict:
            return {"schema": rec.SCHEMA, "kind": kind, "at": f"2026-10-{n:02d}T10:00:00Z", "by": by,
                    "subject": rec.subject_from_decl(ds.by_name[decl], ds),
                    "origin": {"kind": "issue", "ref": f"Owner/store#{n}"}, **fields}
        agent = {**person("bob"), "kind": "agent", "agent": {"tool": "Claude Code", "model": "claude-opus-5-5"}}
        accept = record(1, "review", F + "double", person("alice"), verdict="accept", rubric="ltb-rubric/1",
                        checked={"object": "checked", "edge-cases": "checked"}, reference={"text": "Bourbaki"},
                        text="It is $2n$.")
        problem = record(2, "review", F + "triple", agent, verdict="problem", rubric="ltb-rubric/1",
                         category="edge-cases", text="What at 0?")
        old = record(3, "review", F + "triple", person("alice"), verdict="accept")
        old["subject"]["hashes"] = {"meaning": "0" * 16, "local": "1" * 16}    # made on another version
        question = record(4, "review", F + "triple_pos", person("carol"), verdict="question", text="Why?")
        [accept, problem, old, question] = store.add([accept, problem, old, question])
        store.add([{"schema": rec.SCHEMA, "kind": "comment", "at": "2026-10-05T10:00:00Z", "by": person("alice"),
                    "links": {"replies_to": problem["id"]}, "text": "It is 0.",
                    "origin": {"kind": "comment", "ref": "Owner/store#2-1"}}])
        cls.ids = {"accept": accept["id"], "problem": problem["id"], "old": old["id"]}
        cls.out = root / "site"
        build(Options(dataset=V / "fixture-b", mathlib=root / "mathlib", out=cls.out, evidence=root / "store",
                      evidence_repo="Owner/store"))
        cls.data = cls.out / "data"
        cls.site = json.loads((cls.data / "site.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def entry(self, name: str) -> dict:
        for p in (self.data / "m").glob("*.json"):
            for e in json.loads(p.read_text())["decls"]:
                if e["name"] == name:
                    return e
        raise KeyError(name)

    def test_a_review_shows_on_its_declaration(self):
        e = self.entry(F + "double")
        [r] = e["evidence"]
        self.assertEqual((r["id"], r["verdict"], r["status"], r["inForce"]), (self.ids["accept"], "accept", "current", True))
        self.assertEqual(r["by"]["login"], "alice")
        self.assertEqual(r["url"], "https://github.com/Owner/store/issues/1")
        self.assertEqual(e["standing"], "covered")

    def test_an_open_problem_with_its_reply_and_a_review_of_an_earlier_version(self):
        e = self.entry(F + "triple")
        self.assertEqual(e["standing"], "problem")
        by_id = {r["id"]: r for r in e["evidence"]}
        self.assertEqual(by_id[self.ids["problem"]]["state"], "open")
        self.assertEqual(by_id[self.ids["problem"]]["by"]["kind"], "agent")
        [reply] = [r for r in e["evidence"] if r["kind"] == "comment"]
        self.assertEqual(reply["repliesTo"], self.ids["problem"])
        self.assertEqual((by_id[self.ids["old"]]["status"], by_id[self.ids["old"]]["applies"]), ("stale", False))

    def test_only_declarations_with_records_carry_them(self):
        self.assertEqual(self.entry(F + "triple_pos")["standing"], "unreviewed")
        self.assertNotIn("evidence", self.entry(F + "double_triple"))

    def test_the_site_names_the_store_and_its_forms(self):
        store = self.site["store"]
        self.assertEqual((store["repo"], store["name"]), ("Owner/store", "Fixture"))
        self.assertEqual(store["forms"]["review"], {"file": "evidence-review.yml", "title": "Review: "})
        self.assertIn("ltb-rubric/1", store["rubrics"])
        self.assertEqual((store["records"], store["decls"]), (5, 3))
        # The newest records first, without the replies.
        self.assertEqual([r[4][:10] for r in store["recent"]], ["2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01"])


if __name__ == "__main__":
    unittest.main()
