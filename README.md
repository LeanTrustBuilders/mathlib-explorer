# Mathlib Explorer

A website to discover and understand [Mathlib](https://github.com/leanprover-community/mathlib4),
for people who know mathematics but not Lean.

**Site:** https://leantrustbuilders.github.io/mathlib-explorer/

Search Mathlib in words ("prime number", "Bochner integral", "fundamental theorem of algebra"),
browse it by subject, and open any concept or theorem to read:

- what it means, in words, with its mathematics rendered, and then in Lean, with every name
  explained on hover;
- for a concept, **what it is built from** (the concept map), its examples, what Mathlib proves about
  it, and what is built on it;
- for a theorem, **what it is about**, **how it is proved** (the proof map, which unfolds step by step,
  routine steps counted apart), and what it is used to prove;
- where it is also described: Wikipedia, the Stacks project, Kerodon, the books its file cites.

And the big picture: Mathlib's famous theorems (the 100 and the 1000+ lists), how much of an
undergraduate curriculum it covers, its own overview, its bibliography, and a map of how its subjects
build on one another.

[DESIGN.md](DESIGN.md) says who it is for, how it is organized and why.

## How it is built

Everything the site shows is Mathlib's own, computed by the
[LeanTrustBuilders](https://github.com/LeanTrustBuilders) tools; this repository only lays it out.

1. [trust-extract](https://github.com/LeanTrustBuilders/extractor) reads the compiled library into a
   dataset: declarations, docstrings, statements taken apart (for hovers), the meaning and proof
   graphs; its scripts add the `example`s and the attributes (`@[stacks]`, `@[wikidata]`, …) read from
   the sources.
2. [evidence-core](https://github.com/LeanTrustBuilders/evidence-core) reads module docstrings and
   Mathlib's catalogues (`docs/overview.yaml`, `undergrad.yaml`, `100.yaml`, `1000.yaml`,
   `references.bib`), and summarizes the graphs for readers: concepts and results, what each is built
   from, is about and uses, and the reverse, ranked, with basic notions and routine steps set apart.
3. `mathlib_explorer.build` writes that as JSON, sharded so that a page loads only what it shows;
   `mathlib_explorer/static/` is the page.

The [Site](.github/workflows/site.yml) workflow follows Mathlib's newest release tag that
trust-extract supports, weekly. Mathlib's dataset (about 314,000 declarations) is kept as the release
`mathlib-dataset-<commit>` of this repository.

## Locally

```bash
pip install .                      # with evidence-core
mathlib-explorer build --dataset path/to/dataset --mathlib path/to/mathlib4 --out _site
python3 -m http.server -d _site
python3 -m unittest discover -s tests
```

The dataset is `trust-extract extract --root Mathlib`, run in a built checkout of Mathlib (with
`lake env`), followed by the extractor's `scripts/examples.py` and `scripts/attributes.py`; or download
it from this repository's releases.
