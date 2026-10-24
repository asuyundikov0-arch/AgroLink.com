---
name: Salary accrual handoff
description: Daily payroll accrual input and dispatcher-to-economist workflow.
---

The daily register must fill automatically from employee-linked field work and transport accruals, not from manually typed salary lines. The dispatcher reviews employee totals and work details, then submits a snapshot to the economist. The general director retains full access. A submitted salary register is an accrual handoff, not an actual payment record.

**Why:** The user explicitly asked for a shared employee-by-day accrual register sent from the dispatcher to the economist; it must not be confused with the separate spare-parts payment register.

**How to apply:** Keep submitted registers read-only for the economist and do not add payment or “paid” status to salary accruals without a new explicit request.

Chief department specialists and the dispatcher maintain the shared employee directory; employees are selected from it in work and transport records.

**Why:** The user explicitly chose “Главные специалисты подразделений и диспетчер” and required accruals to enter the daily register automatically when an employee is selected.

**How to apply:** Preserve historical earnings when an employee is deactivated. Do not use a free-text name as a new employee identity or silently discard unmatched legacy names.

Sending fixes a snapshot of source accruals. Late-rated work for an already submitted date must remain eligible for a supplementary handoff rather than disappear or overwrite the earlier snapshot.

**Why:** Rates can be entered later than the work date; one permanently closed register per date would silently omit late accruals.

**How to apply:** Prevent duplicate source accruals across snapshots and prevent changing submitted source amounts without an explicit correction workflow.
