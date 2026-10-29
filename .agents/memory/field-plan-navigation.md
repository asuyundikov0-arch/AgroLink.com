---
name: Field plans, actual work and daily sowing
description: Separate field-first plans and actual work, unplanned operations, per-field compliance and automatic crop-level sowing reports.
---

The seasonal agronomy plan must begin with field numbers. Opening a field shows its dates, operations, equipment and mechanics. Planning uses the existing equipment, employee and operation lists rather than requiring these names to be typed again.

**Why:** The user explicitly asked to simplify planning to a field-first view with those four pieces of information.

**How to apply:** Preserve field history and actual-work flows separately. Keep the selected season and farm in scope, and continue to reserve plan editing for the chief agronomist and general director.

Справочник полей должен быть единым источником для планов, фактических работ и истории: одна карточка поля в рамках хозяйства, без повторного создания карточек по сезонам. Существующие планы и факты сохраняют связи с исходным полем.

**Why:** Пользователь попросил объединить ранее введённые поля и работы в общий справочник, а не завести второй, независимый список.

**How to apply:** При изменении навигации или справочника не копировать поля и не перепривязывать связанные работы без проверки исходных идентичностей. Показывать историю всех сезонов выбранного поля; отсутствие факта не заменять примером или вымышленной записью.

Для хозяйства «АПК Арыстан Grain» пользователь указал площадь поля №4 — 500 га, поля №5 — 600 га.

**Why:** Это заданные пользователем характеристики полей, а не предположение по соседним полям.

**How to apply:** При восстановлении или сверке справочника опираться на эти значения до нового указания пользователя; не выводить площадь полей из площади сезонных операций.

The selected field is fixed when entering either a plan or actual work; users must not move the operation to another field from its form. Plan and actual forms should use the same order of business fields, with planned fuel budget separate from actual depot expense.

**Why:** The user explicitly requested a fixed default field, editable area, and matching plan/fact forms. This is a form simplification, not a request to remove the established agronomist/dispatcher division of responsibilities.

**How to apply:** Keep the field context when creating and editing. Area corrections still use the actor authorized for that kind of record; daily actual hectares and rates belong to the dispatcher. A planned fuel amount is only a budget and must not increase actual field costs.

К основной агрооперации пользователь хочет добавлять сопутствующие работы: например, при посеве — машину заправки семян и заправщиков, с предполагаемыми затратами на зарплату, ГСМ и семена. При начале факта агроном также должен иметь возможность указать сопутствующие работы на этом поле.

**Why:** Пользователь попросил учитывать обеспечивающие работы в составе основной операции, а не заводить их как независимые гектары плана.

**How to apply:** Сохранять исходный план отдельно от сведений начала факта. Предполагаемые затраты не подменяют подтверждённые начисления и складские списания и не увеличивают выполненные гектары.

Actual work has its own field-first view, separate from planning. Opening a field shows its plan directly and an unplanned-work request action. Out-of-plan operations are allowed only after the chief agronomist approves the request; approval does not itself start the operation.

**Why:** The user separated planning from factual entry, then required approval by the chief agronomist before any unplanned work starts.

**How to apply:** Chief agronomist builds the plan. Farm agronomist starts approved planned/unplanned work and changes current mechanic, equipment and implement. Only the dispatcher records daily hectares. Changes of current assignments affect subsequent daily snapshots, never past work or payroll attribution. Show unplanned work separately from planned work.

The dispatcher sees started operations immediately and requests completion. The farm agronomist approves completion before the operation enters completed field history, or returns it for continued work with a reason.

**Why:** The user required dispatcher daily entry, an agronomist resource-change action, and an agronomist's agreement after the dispatcher's completion notice.

**How to apply:** Keep an operation active while completion awaits approval, freeze daily entry during that review, and preserve daily hectares and resource history when completion is accepted. Do not let the old agronomist fact form bypass dispatcher entry or approval.

Partial daily performance of a planned chemical field operation is still work under that plan, not an unplanned operation.

**Why:** The user explicitly corrected treating a 100-hectare daily fact as unplanned when it was part of the planned chemical treatment.

**How to apply:** Never infer business intent from a saved unplanned flag alone when the user reports an incorrect plan/fact link. Preserve the plan association during daily fact entry; do not require full-field completion to recognise a day's work.

The main operations screen must show per-field planned-work progress percentages. Unplanned work is displayed separately and does not improve plan compliance.

**Why:** The user requested a compact per-field plan/fact dashboard; counting unrelated unplanned work toward completion would misrepresent whether the plan was followed.

**How to apply:** Compare worked hectares of planned operations against their planned hectares; use no percentage when a field has no plan.

The agro block has a separate automatic daily report for sowing only: crop, daily output and total sowing for the season up to the selected date. It must not contain field numbers.

**Why:** The user explicitly limited the initial daily report to sowing and requested crop-level figures without field numbers.

**How to apply:** Combine planned and unplanned sowing facts by crop. A cumulative daily field report contributes only its increase to that day's output, not its entire cumulative area again.
