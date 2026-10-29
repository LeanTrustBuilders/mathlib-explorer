"""mathlib-explorer build --dataset DIR --mathlib CHECKOUT --out SITE [--evidence STORE --evidence-repo OWNER/NAME [--imports DIR]]"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .build import Options, build


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="mathlib-explorer", description="Build the Mathlib Explorer site.")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="build the site")
    b.add_argument("--dataset", type=Path, required=True, help="Mathlib's dataset (S2), with the attributes facet")
    b.add_argument("--mathlib", type=Path, required=True, help="a checkout of Mathlib at the dataset's commit (for docs/)")
    b.add_argument("--out", type=Path, required=True, help="where to write the site")
    b.add_argument("--repo", default="leanprover-community/mathlib4", help="Mathlib's repository, for links to the sources")
    b.add_argument("--evidence", type=Path, help="an evidence store about Mathlib (its evidence/ directory): the pages show its records")
    b.add_argument("--evidence-repo", default="", help="the store's repository, owner/name, whose issue forms the pages open")
    b.add_argument("--imports", type=Path, help="the stores it imports, fetched by `evidence-store fetch-imports`")
    args = p.parse_args(argv)
    if args.evidence and not args.evidence_repo:
        p.error("--evidence needs --evidence-repo")
    r = build(Options(dataset=args.dataset, mathlib=args.mathlib, out=args.out, repo=args.repo,
                      evidence=args.evidence, evidence_repo=args.evidence_repo, imports=args.imports))
    print(f"site: {r['concepts']:,} concepts, {r['results']:,} results, {r['instances']:,} instances in "
          f"{r['modules']:,} files; {r['search']:,} searchable by title; "
          f"{r.get('records', 0):,} records on {r.get('withRecords', 0):,} declarations → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
