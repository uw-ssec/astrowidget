# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in astrowidget, please report it
responsibly. **Do not open a public issue.**

1. Use [GitHub's private vulnerability reporting](https://github.com/uw-ssec/astrowidget/security/advisories/new)
2. Include a description of the vulnerability, steps to reproduce, and any
   potential impact
3. You can expect an initial response within 7 days

We will work with you to understand the issue, develop a fix, and coordinate
disclosure.

## Scope

astrowidget is a client-side Jupyter widget that renders astronomical data
in the browser using WebGL2. Security concerns most likely involve:

- Malicious data inputs (crafted FITS/zarr files)
- Cross-origin issues in the Jupyter rendering context
- Dependency vulnerabilities

## Dependencies

We use [Dependabot](https://github.com/uw-ssec/astrowidget/blob/main/.github/dependabot.yml)
to monitor and update dependencies for known vulnerabilities.
