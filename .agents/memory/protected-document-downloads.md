---
name: Protected document downloads
description: Rules for serving template and report originals without bypassing role checks.
---

Original documents must never be stored in a web artifact's public directory or exposed with a stable static URL. Return role-checked API download URLs, load the record server-side, apply the same visibility rule as the listing, and only then stream the file.

**Why:** A hidden button or filtered list does not protect a publicly hosted file; anyone can request a remembered `/files/...` URL directly.

**How to apply:** Keep protected originals outside public web roots. When adding a new document type or storage provider, test both an unauthenticated request and a role that is not entitled to that particular record before publishing.