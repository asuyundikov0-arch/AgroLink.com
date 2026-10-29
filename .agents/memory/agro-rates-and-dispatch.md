---
name: Agro rates and dispatcher scope
description: User-confirmed responsibilities and calculations for field-work pay and grain transport.
---

The chief agronomist enters the planned per-hectare rate when adding a field-operation plan. The agronomist starts the actual work and maintains its mechanic, equipment and implement. The dispatcher enters completed hectares and the actual per-hectare rate in each daily work record, without waiting for the whole operation to finish. Pay is daily hectares × that day's actual rate.

**Why:** The user expects to enter the actual rate while recording daily output, not only after operation completion. Daily rates must not silently reprice other days or overwrite the agronomist's plan.

**How to apply:** Keep actual rates with the corresponding daily work. Preserve the legacy operation-wide rate as fallback for older daily records without their own rate. Sending an earlier day's payroll must not prevent entering later days or updating current resource assignments. Protect saved payroll snapshots and earlier cumulative-area records whose changes would alter them.

For grain arrivals, transfers and shipments, including elevator transport and sales, record the KamAZ and driver. Grain transport payroll is handled by the separate “Заведующий автобазой” role in the engineering block, not the dispatcher. The dispatcher continues to handle field work and its daily rates.

**Why:** The user explicitly moved transport payroll to “Автобаза” and chose a new “Заведующий автобазой” role. This supersedes the earlier assignment of transport pricing to the dispatcher.

**How to apply:** Keep planned field rates in planning and actual field rates with the dispatcher. For transport payroll and tonne-kilometre pricing, follow [Motor-pool payroll](motor-pool-payroll.md).
