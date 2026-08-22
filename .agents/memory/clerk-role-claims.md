---
name: Role claims
description: How application roles are assigned and enforced for the document workflow.
---

Use Clerk public metadata field `role` as the source of truth for application access. Valid values are `agronomist`, `chief_agronomist`, `economist`, `farm_director`, and `general_director`.

**Why:** The client must not offer a role switcher or be trusted to decide access. Interface visibility alone cannot protect documents.

**How to apply:** Assign a user’s role in Clerk public metadata. Keep frontend views role-scoped for usability and enforce the same boundaries server-side before reading, submitting, or approving reports.