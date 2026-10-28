---
name: Salary accrual handoff
description: Employee-linked daily work orders, mandatory HR approval and cumulative payroll available to the general director.
---

Daily work orders must fill automatically from employee-linked field work and grain transport accruals, not from manually typed salary lines. The dispatcher reviews the work and rates, then sends a daily work order to the separate “Отдел кадров” role. HR confirms the accruals; only then do they enter cumulative payroll per employee. The general director retains full access, including the cumulative register. Restoring the economist for budget and Cash Flow does not change this HR confirmation handoff or automatically grant payroll-editing rights. This is an accrual handoff, not an actual payment record.

**Why:** The user added mandatory HR confirmation and explicitly chose “Перевозки и полевые работы” for its scope. Dispatcher submission is a daily work order, not yet confirmed salary; it must not be confused with the separate spare-parts payment register.

**How to apply:** Exclude orders waiting for HR from employee salary totals and the cumulative register. Keep confirmed snapshots read-only and do not add payment or “paid” status without an explicit request. Preserve previously submitted historical sheets without requiring retrospective HR approval.

Every HR-confirmed daily order contributes to a cumulative register per employee available to the general director, with a breakdown by work type and the original dated work lines.

**Why:** The user requested cumulative employee totals with work details, subsequently made HR confirmation the prerequisite, and later removed the economist role without removing payroll.

**How to apply:** Count submitted sheets only, retain their individual history, and do not collapse distinct confirmed work lines merely because their employee, date or work type is the same.

HR-confirmed field-work wages also contribute to the costs of their original field season and operation.

**Why:** The user explicitly requested field-level wage costs after HR confirmation, alongside chemicals and fuel.

**How to apply:** Resolve the original work operation from the accrual source, not a name in the notes. Pending HR orders do not contribute to field costs. Keep employee payroll and field-cost breakdowns consistent without duplicating the accrual.

Chief department specialists and the dispatcher maintain the shared employee directory; employees are selected from it in work and transport records.

**Why:** The user explicitly chose “Главные специалисты подразделений и диспетчер” and required accruals to enter the daily register automatically when an employee is selected.

**How to apply:** Preserve historical earnings when an employee is deactivated. Do not use a free-text name as a new employee identity or silently discard unmatched legacy names.

Sending a work order to HR fixes and reserves its source accruals even before salary confirmation. Late-rated work for an already submitted date must remain eligible for a supplementary daily order rather than disappear or overwrite the earlier snapshot.

**Why:** Rates can be entered later than the work date; one permanently closed register per date would silently omit late accruals.

**How to apply:** Prevent duplicate source accruals across snapshots and prevent changing submitted source amounts without an explicit correction workflow.

В хозяйстве есть не только сотрудники со сдельными начислениями за полевые работы и перевозки, но и разнорабочие, а также специалисты на окладах.

**Why:** Пользователь прямо указал эти категории при обсуждении расширения работы отдела кадров.

**How to apply:** Не считать гектары и рейсы единственными возможными основаниями зарплаты. При предложении новых схем учитывать табель и договорные условия оплаты; сам факт существования этих категорий не разрешает автоматически добавлять оклад к сдельной оплате или менять действующий расчёт.

Основное деление кадрового раздела — «Бригада», «Автобаза», «Ток», «МТМ», «Машдвор», а не источники «наряды диспетчера» и «табели».

**Why:** Пользователь одобрил демонстрационный экран, но прямо изменил организацию раздела на эти пять групп.

**How to apply:** Показывать сотрудников и реальные начисления внутри групп. Не распределять людей по догадке о должности; неназначенных и неразрешённые исторические записи сохранять видимыми отдельно. Группа относится к текущему составу, а её смена не изменяет начисленные суммы.

Зарплатная группа не заменяет принадлежность к хозяйству. Распределение по группам не даёт отделу кадров права менять весь общий справочник сотрудников.

**Why:** В существующем справочнике подразделение используется в том числе для хозяйства, а его ведение пользователь ранее закрепил за главными специалистами и диспетчером. Для группировки не нужно переписывать эти сведения или расширять все права.

**How to apply:** Давать кадрам и генеральному директору узкую возможность назначить группу, сохраняя прежние права на создание, имя и деактивацию карточки.

Одобрение внешнего вида кадрового экрана не означает одобрение новых формул зарплаты: пользователь сказал «А позже я тебе подскажу кому и как считать зарплату».

**Why:** Пользователь отдельно отложил правила начисления после переноса предложения в основной сайт.

**How to apply:** Пока нет новых указаний, сохранять действующие сдельные начисления и кадровое подтверждение; не переносить демонстрационные оклады, табели, условную норму 22 дня или смешанную оплату в реальные расчёты.

Существующий ежедневный наряд подтверждается целиком, даже если в нём сотрудники разных зарплатных групп.

**Why:** Ранее согласованное подтверждение относится ко всему наряду. Фильтрация по группе не должна незаметно подтверждать скрытые строки.

**How to apply:** Перед решением показывать полный состав и полную сумму, явно предупреждать о других группах. Не подменять исходный наряд отфильтрованной копией при подтверждении.
