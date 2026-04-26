"""Sync .zenodo.json creators from CITATION.cff authors."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ORCID_URL_PREFIX = "https://orcid.org/"


def cff_author_to_zenodo_creator(author: dict) -> dict:
    """Map a CITATION.cff author entry to a Zenodo creator entry."""
    creator: dict = {
        "name": f"{author['family-names']}, {author['given-names']}",
    }
    if "affiliation" in author:
        creator["affiliation"] = author["affiliation"]
    if "orcid" in author:
        orcid = author["orcid"]
        if orcid.startswith(ORCID_URL_PREFIX):
            orcid = orcid[len(ORCID_URL_PREFIX):]
        creator["orcid"] = orcid
    return creator


def sync_zenodo(repo_root: Path) -> None:
    """Read CITATION.cff authors and update .zenodo.json creators."""
    citation_path = repo_root / "CITATION.cff"
    zenodo_path = repo_root / ".zenodo.json"

    with open(citation_path) as f:
        cff = yaml.safe_load(f)

    authors = cff.get("authors")
    if not authors:
        print("Error: no authors found in CITATION.cff", file=sys.stderr)
        sys.exit(1)

    creators = [cff_author_to_zenodo_creator(a) for a in authors]

    with open(zenodo_path) as f:
        zenodo = json.load(f)

    zenodo["creators"] = creators

    with open(zenodo_path, "w") as f:
        json.dump(zenodo, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent
    sync_zenodo(repo_root)
