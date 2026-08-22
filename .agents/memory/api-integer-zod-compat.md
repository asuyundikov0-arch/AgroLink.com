---
name: OpenAPI integer compatibility
description: Orval's generated Zod schemas can emit z.int() while the workspace uses Zod 3.x.
---

When adding numeric fields to the OpenAPI contract, prefer `number` unless integer-specific validation is required.

**Why:** The current generated Zod runtime does not expose `z.int()`, so integer schemas make codegen's chained typecheck fail.

**How to apply:** If an integer is semantically important, verify the installed Zod version and generation output before adding it broadly.