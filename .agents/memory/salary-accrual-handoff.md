---
name: Salary accrual handoff
description: Employee-linked daily work orders, mandatory HR approval and cumulative payroll for the economist.
---

Daily work orders must fill automatically from employee-linked field work and grain transport accruals, not from manually typed salary lines. The dispatcher reviews the work and rates, then sends a daily work order to the separate “Отдел кадров” role. HR confirms the accruals; only then do they enter cumulative payroll per employee and become visible to the economist. The general director retains full access. This is an accrual handoff, not an actual payment record.

**Why:** The user added mandatory HR confirmation and explicitly chose “Перевозки и полевые работы” for its scope. Dispatcher submission is a daily work order, not yet confirmed salary; it must not be confused with the separate spare-parts payment register.

**How to apply:** Exclude orders waiting for HR from employee salary totals and the economist's register. Keep confirmed snapshots read-only and do not add payment or “paid” status without an explicit request. Preserve previously submitted historical sheets without requiring retrospective HR approval.

Every HR-confirmed daily order contributes to an accumulating economist register per employee, with a breakdown by work type and the original dated work lines.

**Why:** The user requested cumulative employee totals with work details, and subsequently made HR confirmation the prerequisite for these accruals.

**How to apply:** Count submitted sheets only, retain their individual history, and do not collapse distinct confirmed work lines merely because their employee, date or work type is the same.

Chief department specialists and the dispatcher maintain the shared employee directory; employees are selected from it in work and transport records.

**Why:** The user explicitly chose “Главные специалисты подразделений и диспетчер” and required accruals to enter the daily register automatically when an employee is selected.

**How to apply:** Preserve historical earnings when an employee is deactivated. Do not use a free-text name as a new employee identity or silently discard unmatched legacy names.

Sending a work order to HR fixes and reserves its source accruals even before salary confirmation. Late-rated work for an already submitted date must remain eligible for a supplementary daily order rather than disappear or overwrite the earlier snapshot.

**Why:** Rates can be entered later than the work date; one permanently closed register per date would silently omit late accruals.

**How to apply:** Prevent duplicate source accruals across snapshots and prevent changing submitted source amounts without an explicit correction workflow.
