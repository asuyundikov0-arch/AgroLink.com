---
name: Secure role bootstrap
description: How the first general-director role is initialized without allowing browser self-escalation.
---

The first general director is initialized only when the signed-in Clerk user's verified e-mail matches the server-side `INITIAL_GENERAL_DIRECTOR_EMAIL` configuration. Every later role request remains pending until a permitted reviewer approves it in the app.

**Why:** Letting the first authenticated browser user choose and approve the highest role would create a privilege-escalation path and could race under concurrent sign-ups.

**How to apply:** Keep the bootstrap identity in protected environment configuration, not client payloads or Clerk public metadata. Do not restore automatic “first user is director” logic; use the regular approval queue once a director exists.