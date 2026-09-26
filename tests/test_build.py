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


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        docs = root / "mathlib" / "docs"
        docs.mkdir(parents=True)
        (docs / "overview.yaml").write_text(f"Arithmetic:\n  Doubling:\n    doubling: '{F}double'\n    halving: ''\n")
        (docs / "undergrad.yaml").write_text(f"Numbers:\n  tripling: '{F}triple'\n")
        (docs / "100.yaml").write_text(f"1:\n  title  : Triples are positive\n  decl   : {F}triple_pos\n  authors: Someone\n")
        (docs / "1000.yaml").write_text("Q1:\n  title: Something not formalized\n")
        (docs / "references.bib").write_text("@Book{key1,\n  author = {Noether, Emmy},\n  title = {Idealtheorie},\n  year = {1921}\n}\n")
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

    def test_directories_read_as_subjects(self):
        self.assertEqual(humanize("NumberTheory"), "Number theory")
        self.assertEqual(humanize("SpecialFunctions"), "Special functions")
        self.assertEqual(humanize("LSeries"), "L-series")
        self.assertEqual(humanize("AperiodicOrder"), "Aperiodic order")


if __name__ == "__main__":
    unittest.main()
