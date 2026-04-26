"""Tests for scripts/sync_zenodo.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.sync_zenodo import cff_author_to_zenodo_creator, sync_zenodo


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


class TestSyncZenodo:
    def test_updates_creators_preserves_other_fields(self, tmp_path):
        citation = tmp_path / "CITATION.cff"
        citation.write_text(
            "cff-version: 1.2.0\n"
            "title: test\n"
            "authors:\n"
            "  - given-names: Alice\n"
            "    family-names: Smith\n"
            "    orcid: 'https://orcid.org/0000-0001-2345-6789'\n"
            "    affiliation: MIT\n"
            "  - given-names: Bob\n"
            "    family-names: Jones\n"
        )
        zenodo = tmp_path / ".zenodo.json"
        zenodo.write_text(
            json.dumps(
                {
                    "title": "test project",
                    "creators": [{"name": "Old, Author"}],
                    "keywords": ["science"],
                },
                indent=2,
            )
        )

        sync_zenodo(tmp_path)

        result = json.loads(zenodo.read_text())
        assert result["title"] == "test project"
        assert result["keywords"] == ["science"]
        assert result["creators"] == [
            {
                "name": "Smith, Alice",
                "affiliation": "MIT",
                "orcid": "0000-0001-2345-6789",
            },
            {"name": "Jones, Bob"},
        ]

    def test_no_authors_raises(self, tmp_path):
        citation = tmp_path / "CITATION.cff"
        citation.write_text("cff-version: 1.2.0\ntitle: test\n")
        zenodo = tmp_path / ".zenodo.json"
        zenodo.write_text(json.dumps({"creators": []}))

        with pytest.raises(SystemExit):
            sync_zenodo(tmp_path)
