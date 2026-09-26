"""mathlib-explorer build --dataset DIR --mathlib CHECKOUT --out SITE"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .build import Options, build


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="mathlib-explorer", description="Build the Mathlib Explorer site.")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="build the site")
    b.add_argument("--dataset", type=Path, required=True, help="Mathlib's dataset (S2), with the attributes and examples facets")
    b.add_argument("--mathlib", type=Path, required=True, help="a checkout of Mathlib at the dataset's commit (for docs/)")
    b.add_argument("--out", type=Path, required=True, help="where to write the site")
    b.add_argument("--repo", default="leanprover-community/mathlib4", help="Mathlib's repository, for links to the sources")
    args = p.parse_args(argv)
    r = build(Options(dataset=args.dataset, mathlib=args.mathlib, out=args.out, repo=args.repo))
    print(f"site: {r['concepts']:,} concepts, {r['results']:,} results, {r['instances']:,} instances in "
          f"{r['modules']:,} files; {r['search']:,} searchable by title → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
