---
name: Partial index changes
description: Schema synchronization can overlook a changed partial-index predicate in this workspace.
---

Do not trust a successful Drizzle push alone when changing the WHERE predicate of an existing index.

**Why:** changing an existing unique index to exclude cancelled rows produced “No changes detected”, while `pg_indexes` still showed the original unconditional index.

**How to apply:** inspect the live index definition after predicate changes. If necessary replace the index explicitly, for example by giving the corrected index a new name in the schema, then verify the database definition.
