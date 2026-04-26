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
