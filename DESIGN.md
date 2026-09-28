# Mathlib Explorer: design

A website to discover and understand [Mathlib](https://github.com/leanprover-community/mathlib4),
for people who know mathematics but not Lean.

## Who it is for, and what they come to do

Mathematicians, students, teachers and curious readers. They think in concepts ("Hilbert space"),
theorems ("the spectral theorem"), subjects ("measure theory") and books ("Atiyah–Macdonald"), not in
Lean names like `InnerProductSpace` or `LinearMap.IsSymmetric.hasEigenvector_of_isMaxOn`. They come
to:

1. **find out whether Mathlib has something**, and what it is called;
2. **see what Mathlib knows about a subject**;
3. **understand a definition**: what it means, what it is built from, what is known about it, what
   its examples are;
4. **understand a theorem**: what it says, what it is about, how its proof goes, what it is used for;
5. **get the big picture**: the famous theorems, how much of an undergraduate curriculum is there,
   how the subjects depend on each other;
6. **connect it to what they already know**: a book, the Stacks project, Wikipedia.

## Principles

- **Words first, Lean second.** A page leads with a title and an explanation in words (the
  docstring, with its mathematics rendered); the Lean text comes after, with every constant it
  names explained on hover and linked.
- **Two maps for two questions.** The *concept map* answers "what is it?": the concepts a definition
  is built from, or that a statement is about (the meaning graph). The *proof map* answers "why is it
  true?": the results a proof uses (the proof graph). Named by the question, not by the graph.
- **Hide the machinery.** Instances, generated helper lemmas, deprecated aliases and core logic are
  gone through or put aside; notions used almost everywhere (equality, addition, order) are listed
  apart as "basic notions" rather than as what something is built from.
- **Few, ranked, then more.** Every list is ranked by importance (how much rests on a declaration,
  whether it is documented, whether Mathlib's own catalogues single it out) and shows a few first.
- **Everything links.** Concepts, results, files, subjects, books and famous theorems link to each
  other.
- **Say where things come from.** Every title, keyword and link is Mathlib's own: its docstrings,
  its catalogues, its attributes.

## What Mathlib gives us

- **Docstrings** of declarations, and of modules: 8,563 modules, most with a `# Title` and a summary,
  and sections the documentation style asks for: `## Main definitions` (1,485 modules), `## Main
  results` / `statements` (about 1,250), `## Tags` (keywords, 1,103), `## References` (904).
- **Catalogues** in `docs/`: `overview.yaml` (a subject tree of 512 concepts), `undergrad.yaml` (an
  undergraduate curriculum, 566 topics, 130 not yet formalized), `100.yaml` and `1000.yaml` (famous
  theorems, the latter keyed by Wikidata items), `references.bib` (505 books and papers).
- **Attributes**: `@[stacks TAG]` (572), `@[kerodon TAG]`, `@[wikidata QID]` (152), which link a
  declaration to the Stacks project, Kerodon and Wikipedia; `@[deprecated]`, which marks aliases kept
  for compatibility.
- **The directory tree**, `Mathlib/Analysis/SpecialFunctions/Gamma/…`: a subject classification.
- **The dependency graphs**, from the compiled library: what each declaration's meaning rests on,
  and what each proof uses.

## Pages

- **Home**: the search box, and ways in: Subjects, Famous theorems, Undergraduate curriculum, Books
  and papers, the Map; a few sentences on what Mathlib is and how to read a page.
- **Search**: by words, as a mathematician would type them: titles (catalogue names, docstrings'
  first sentences, module titles), keywords (module tags), Lean names. Results come grouped (concepts,
  results, subjects) with their subject.
- **Subject** (a directory): its files' titles and summaries, its key concepts and results, its
  subtopics; the matching part of Mathlib's overview.
- **File** (a module): its docstring as the author wrote it, with the main definitions and results
  linked by title; its references (linked to Books); its keywords; its declarations; what it builds on
  and what builds on it.
- **Concept** (a definition, structure, class, inductive type): title and explanation; external links
  (Wikipedia, Stacks, Kerodon); the Lean definition; *what it is built from* (concept map); examples
  (its instances, for a class); *what Mathlib proves about it*; *built on it* (concepts that use it);
  its neighbours in the file.
- **Result** (a theorem): title and explanation; the statement in Lean; *what it is about*; *how it
  is proved* (proof map, expandable); *used to prove*; whether it is a famous theorem, with who
  formalized it and when.
- **Famous theorems**: the 100 and the 1000+ lists, formalized or not, linked.
- **Undergraduate curriculum** and **Overview**: Mathlib's two subject trees, each concept linked or
  marked "not yet".
- **Books and papers**: the bibliography, each entry with the files that cite it.
- **Map**: the subjects, sized by how much is in them, and how they depend on each other.

A small glossary explains the Lean words that do show: type, proposition, structure, class,
instance, namespace, `theorem` versus `lemma`.

## Where the work is done

As everywhere in the LeanTrustBuilders suite, the site computes nothing: it lays out what the tools
computed.

- **extractor** (`trust-extract` and its scripts): the dataset of Mathlib (S2): declarations, their
  docstrings, statements taken apart with the constant each identifier names (for hovers), source
  ranges, `sorry` and axioms, the meaning, statement and proof graphs; and `attributes.py` (the
  attributes, read from the sources).
- **evidence-core**: `docs` (module docstrings read as their sections, their names resolved; the
  attributes read as links), `catalogs` (Mathlib's catalogues and bibliography, matched against the
  dataset), `graphs` (concepts and results, what each is built from, is about and uses, and the
  reverse; importance; basic notions), `source` (text from the checkout).
- **mathlib-explorer** (this repository): `mathlib_explorer.build` asks those for everything a page
  shows and writes it as JSON, sharded so that a page loads only what it shows; `static/` is the page.

The site follows Mathlib's newest commit that trust-extract has a release for, and is rebuilt when it
moves.
