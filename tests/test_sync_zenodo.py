"""Tests for scripts/sync_zenodo.py."""

from __future__ import annotations

import pytest

from scripts.sync_zenodo import cff_author_to_zenodo_creator


class TestCffAuthorToZenodoCreator:
    def test_full_author(self):
        author = {
            "given-names": "Cordero",
            "family-names": "Core",
            "orcid": "https://orcid.org/0000-0002-3531-3221",
            "affiliation": "UW Scientific Software Engineering Center",
            "email": "cdcore09@gmail.com",
        }
        result = cff_author_to_zenodo_creator(author)
        assert result == {
            "name": "Core, Cordero",
            "affiliation": "UW Scientific Software Engineering Center",
            "orcid": "0000-0002-3531-3221",
        }

    def test_name_only(self):
        author = {
            "given-names": "Jane",
            "family-names": "Doe",
        }
        result = cff_author_to_zenodo_creator(author)
        assert result == {"name": "Doe, Jane"}

    def test_orcid_bare_id(self):
        """ORCID already a bare ID (no URL prefix)."""
        author = {
            "given-names": "Jane",
            "family-names": "Doe",
            "orcid": "0000-0001-2345-6789",
        }
        result = cff_author_to_zenodo_creator(author)
        assert result["orcid"] == "0000-0001-2345-6789"

    def test_affiliation_without_orcid(self):
        author = {
            "given-names": "Jane",
            "family-names": "Doe",
            "affiliation": "MIT",
        }
        result = cff_author_to_zenodo_creator(author)
        assert result == {"name": "Doe, Jane", "affiliation": "MIT"}
