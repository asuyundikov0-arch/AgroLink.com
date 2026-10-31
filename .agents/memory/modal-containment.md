---
name: Modal containment and native forms
description: Why repair overlays must escape blurred cards without separating submit buttons from their native form.
---

Render engineering repair overlays outside the card and page-animation containers. Move the whole native form together with its fields and submit footer, not just the visible drawer.

**Why:** The shared blurred cards establish a containing block for fixed-position descendants. A drawer inside one can be clipped or positioned below other controls despite a high z-index. Portaling only the drawer would create a different bug: its submit button and fields would no longer belong to the surrounding HTML form.

**How to apply:** For related overlay changes, keep the complete form in one body-level portal. Verify ordinary pointer clicks, saving and reopening on desktop and mobile; merely opening the drawer or checking its static markup is insufficient.
