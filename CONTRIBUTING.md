# Contributing to astrowidget

Thank you for your interest in contributing to **astrowidget** -- an interactive radio astronomy visualization widget for Jupyter, developed at the University of Washington's [Scientific Software Engineering Center (SSEC)](https://escience.washington.edu/software-engineering/ssec/).

This guide covers project-specific setup and workflows. For general SSEC contribution guidelines (including AI-usage policy), see the [organization-level CONTRIBUTING.md](https://github.com/uw-ssec/.github/blob/main/CONTRIBUTING.md).

---

## Before You Start

- Read the [README](https://github.com/uw-ssec/astrowidget#readme) and [architecture docs](https://github.com/uw-ssec/astrowidget/tree/main/docs/architecture)
- Check the [issue tracker](https://github.com/uw-ssec/astrowidget/issues) to see if someone is already working on your idea
- Comment on an issue before starting work, especially if you're a new contributor
- For a deeper dive into internals (traitlet bridge, ESM loading, uint8 pipeline, WebGL renderer), see the [Development Guide](https://github.com/uw-ssec/astrowidget/blob/main/docs/guides/development.md)

## Development Setup

astrowidget uses [pixi](https://pixi.sh) for reproducible environments.

```bash
git clone https://github.com/uw-ssec/astrowidget.git
cd astrowidget
pixi install
pixi run test  # verify everything works
```

This installs Python (>=3.11), Node.js (>=20), and all dependencies.

### Useful Tasks

| Task | Description |
|---|---|
| `pixi run test` | Run all Python and JS tests |
| `pixi run test-py` | Run Python tests only |
| `pixi run test-js` | Run JS tests only |
| `pixi run lint` | Lint Python code with ruff |
| `pixi run build` | Build JS bundle with Vite |
| `pixi run dev` | Watch mode for JS development |
| `pixi run docs-serve` | Serve docs locally at localhost:8000 |

## Project Structure

```
src/astrowidget/
    widget.py        # SkyWidget (anywidget class)
    viewer.py        # SkyViewer (Panel dashboard)
    cube.py          # PreloadedCube (LRU-cached slice loader)
    io.py            # open_dataset (zarr loader)
    wcs.py           # WCS extraction from zarr metadata
    static/          # Compiled JS bundle (do not edit directly)
js/
    inline_widget.js # WebGL2 renderer (source of truth for JS)
tests/
    test_*.py        # Python tests (pytest)
    js/              # JS tests (vitest)
docs/                # MkDocs documentation
```

> **Note:** The compiled bundle at `src/astrowidget/static/widget.js` is built from `js/inline_widget.js`. Edit the source file, then run `pixi run build` to regenerate the bundle.

## Making Changes

### Python

- Follow the existing code style (enforced by ruff)
- Add tests for new functionality in `tests/`
- Run `pixi run lint` before committing

### JavaScript (WebGL renderer)

- All renderer code lives in `js/inline_widget.js` (raw WebGL2, no framework)
- Projection math is validated against astropy-generated test vectors in `tests/fixtures/`
- Run `pixi run test-js` to verify projection correctness
- Run `pixi run build` after changes to regenerate the static bundle

### Documentation

- Docs use MkDocs with the Material theme
- Source files are in `docs/`
- Preview locally with `pixi run docs-serve`

## Pull Request Guidelines

Your PR should:

1. **Reference the related issue** (e.g., "Fixes #42")
2. Include a clear description of what changed and why
3. Contain focused commits (one logical change per PR)
4. Include tests if adding or changing functionality
5. Update documentation if behavior changes
6. Pass CI checks (tests, linting, build)

### PR Checklist

- [ ] Tests pass (`pixi run test`)
- [ ] Linting passes (`pixi run lint`)
- [ ] JS bundle rebuilt if renderer changed (`pixi run build`)
- [ ] Documentation updated if applicable

## Reporting Bugs

Use the [bug report template](https://github.com/uw-ssec/astrowidget/issues/new?template=bug_report.yml) and include:

- Steps to reproduce
- Expected vs actual behavior
- Python version, browser, and Jupyter environment
- Sample data or minimal reproducer if possible

## Requesting Features

Use the [feature request template](https://github.com/uw-ssec/astrowidget/issues/new?template=feature_request.yml). Describe the problem you're trying to solve, not just the solution you have in mind.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://github.com/uw-ssec/astrowidget/blob/main/CODE_OF_CONDUCT.md). Please read it before participating.

## License

By contributing, you agree that your contributions will be licensed under the [BSD 3-Clause License](LICENSE).
