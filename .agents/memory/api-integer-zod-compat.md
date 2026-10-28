---
name: OpenAPI Zod compatibility
description: Orval's generated Zod schemas can emit unsupported integer and URL helpers while the workspace uses Zod 3.x.
---

When adding numeric fields to the OpenAPI contract, prefer `number` unless integer-specific validation is required. Avoid `format: uri` unless the generated output is verified with the installed Zod version.

**Why:** The current generated Zod runtime does not expose the helpers emitted by this Orval version for integer and URI schemas (`z.int()` and `z.url()`), so codegen's chained typecheck fails.

**How to apply:** If integer or URI validation is semantically important, verify the installed Zod version and generation output before adding it broadly; otherwise keep the contract field as a plain string or number and enforce contextual validation on the server.

Prefer named component schemas referenced by request bodies when they contain enum properties.

**Why:** With this workspace's paired Orval generators, an inline enum-bearing request body produced conflicting exports between the generated TypeScript body type and the generated Zod body validator.

**How to apply:** Move the body to an explicitly named components schema and reference it from the operation. Regenerate both outputs; never repair generated exports by hand.