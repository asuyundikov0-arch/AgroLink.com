---
name: Agro rates and dispatcher scope
description: User-confirmed responsibilities and calculations for field-work pay and grain transport.
---

The chief agronomist enters the planned per-hectare rate when adding a field-operation plan. The agronomist starts the actual work and maintains its mechanic, equipment and implement. The dispatcher enters completed hectares and the actual per-hectare rate in each daily work record, without waiting for the whole operation to finish. Pay is daily hectares × that day's actual rate.

**Why:** The user expects to enter the actual rate while recording daily output, not only after operation completion. Daily rates must not silently reprice other days or overwrite the agronomist's plan.

**How to apply:** Keep actual rates with the corresponding daily work. Preserve the legacy operation-wide rate as fallback for older daily records without their own rate. Sending an earlier day's payroll must not prevent entering later days or updating current resource assignments. Protect saved payroll snapshots and earlier cumulative-area records whose changes would alter them.

For grain arrivals from fields, transfers, and shipments to drying or cleaning, record the KamAZ number and driver. Each grain movement is a transport trip with a separate dispatcher-entered fee. The dispatcher uses a dedicated role limited to transport trips and rates, not the full grain balance or field-history modules.

**Why:** the user confirmed this role split and workflow, including a separate dispatcher role with limited access.

**How to apply:** keep planned rates editable only through field planning, actual field rates and per-trip transport fees in the dispatcher workflow, and server-side access limited to the dispatch endpoints.
