---
name: Role API contract consistency
description: Role additions must work in current-user responses as well as registration and approval.
---

Keep current-user role responses based on the same canonical role schema as registration and role administration; avoid an independent inline copy.

**Why:** A stale response enum omitted valid staff roles. Their approved applications existed, but serializing the current-user response failed and prevented the whole workspace from loading.

**How to apply:** When adding a role, verify every canonical role against both registration input and the current-user response, including the null response for a new account. An approval badge or a stored approved application alone is not proof that the authenticated workspace loads.
