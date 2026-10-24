---
name: Agro rates and dispatcher scope
description: User-confirmed responsibilities and calculations for field-work pay and grain transport.
---

The chief agronomist enters the planned per-hectare rate when adding a field-operation plan. The agronomist records the actual operation, completed area, mechanic, and equipment. After completion, the dispatcher enters the actual per-hectare rate; the system calculates the amount from actual hectares × actual rate.

For grain arrivals from fields, transfers, and shipments to drying or cleaning, record the KamAZ number and driver. Each grain movement is a transport trip with a separate dispatcher-entered fee. The dispatcher uses a dedicated role limited to transport trips and rates, not the full grain balance or field-history modules.

**Why:** the user confirmed this role split and workflow, including a separate dispatcher role with limited access.

**How to apply:** keep planned rates editable only through field planning, actual field rates and per-trip transport fees in the dispatcher workflow, and server-side access limited to the dispatch endpoints.
