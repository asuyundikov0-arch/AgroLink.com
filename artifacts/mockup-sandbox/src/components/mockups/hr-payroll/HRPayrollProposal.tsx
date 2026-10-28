import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleAlert, ClipboardList, Clock3, FileCheck2, Filter, RotateCcw, Search, Settings2, Truck, Wheat, X } from "lucide-react";
import { CurrentPayrollLines } from "./_shared/CurrentPayrollLines";
import { calcCard, cardError } from "./_calculations";
import "./_group.css";
import "./_proposal.css";

type OrderStatus = "incoming" | "returned" | "confirmed";
type WorkOrder = { id: string; employee: string; role: string; type: string; status: OrderStatus; date: string; amount: number; quantity: number; rate: number; details: string; field: string; machine: string; explanation?: string };
type Timecard = { id: string; employee: string; role: "general" | "salary"; measure: "hours" | "days"; quantity: number; rate: number; standardDays?: number; status: "draft" | "confirmed"; month: string; snapshotAmount?: number; snapshotQuantity?: number; snapshotRate?: number };
type Accrual = { id: string; employee: string; role: string; type: string; date: string; amount: number; details: string; source: string };

const money = (value: number) => `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ₸`;
const shortMoney = (value: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ₸`;
const initialOrders: WorkOrder[] = [
  { id: "Н-1048", employee: "Ерлан Садыков", role: "Механизатор", type: "Полевые работы", status: "incoming", date: "12 окт 2026", amount: 18450, quantity: 12.3, rate: 1500, details: "Дискование · участок 7 · 12,3 га × 1 500 ₸/га", field: "Поле № 7 · озимая пшеница", machine: "Трактор МТЗ-1221 · агрегат БДМ-4" },
  { id: "Н-1049", employee: "Айдар Нуртаев", role: "Водитель", type: "Перевозка зерна", status: "incoming", date: "12 окт 2026", amount: 15600, quantity: 4, rate: 3900, details: "4 рейса × 3 900 ₸/рейс", field: "Ток → элеватор «Северный»", machine: "КамАЗ  зерновоз · гос. номер 482" },
  { id: "Н-1047", employee: "Ерлан Садыков", role: "Механизатор", type: "Полевые работы", status: "returned", date: "11 окт 2026", amount: 12750, quantity: 8.5, rate: 1500, details: "Культивация · участок 4 · 8,5 га × 1 500 ₸/га", field: "Поле № 4 · яровой ячмень", machine: "Трактор МТЗ-1221 · культиватор КПС-4", explanation: "Проверьте фактическую площадь: в наряде указано 8,5 га, в дневном отчёте — 8,2 га." },
];
const initialCards: Timecard[] = [
  { id: "ТБ-023", employee: "Мария Иманова", role: "general", measure: "hours", quantity: 156, rate: 920, status: "draft", month: "Октябрь 2026" },
  { id: "ТБ-026", employee: "Руслан Беков", role: "general", measure: "days", quantity: 18, rate: 8500, status: "draft", month: "Октябрь 2026" },
  { id: "ТБ-024", employee: "Данияр Ахметов", role: "salary", measure: "days", quantity: 18, rate: 300000, standardDays: 22, status: "draft", month: "Октябрь 2026" },
  { id: "ТБ-025", employee: "Ольга Ким", role: "salary", measure: "days", quantity: 22, rate: 270000, standardDays: 22, status: "draft", month: "Октябрь 2026" },
];
const seedAccruals: Accrual[] = [
  { id: "И-101", employee: "Ерлан Садыков", role: "Механизатор", type: "Полевые работы", date: "08 окт", amount: 22500, details: "Вспашка · поле № 2 · 15 га", source: "Н-1041" },
  { id: "И-102", employee: "Айдар Нуртаев", role: "Водитель", type: "Перевозка зерна", date: "09 окт", amount: 11700, details: "3 рейса · ток → элеватор", source: "Н-1043" },
  { id: "И-103", employee: "Ерлан Садыков", role: "Механизатор", type: "Полевые работы", date: "10 окт", amount: 17250, details: "Боронование · поле № 5 · 11,5 га", source: "Н-1045" },
];
const employeeRoles: Record<string, string> = { "Ерлан Садыков": "Механизатор", "Айдар Нуртаев": "Водитель", "Мария Иманова": "Общий рабочий", "Руслан Беков": "Общий рабочий", "Данияр Ахметов": "Агроном", "Ольга Ким": "Бухгалтер" };

function IconButton({ children, onClick, label, className = "" }: { children: ReactNode; onClick: () => void; label: string; className?: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`ag-icon-button ${className}`}>{children}</button>;
}
function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) { return <span className={`ag-tag ag-tag-${tone}`}>{children}</span>; }

export function HRPayrollProposal() {
  const [orders, setOrders] = useState(initialOrders);
  const [cards, setCards] = useState(initialCards);
  const [accruals, setAccruals] = useState(seedAccruals);
  const [section, setSection] = useState<"register" | "orders" | "timecards">("register");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Все сотрудники");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [employeeDetail, setEmployeeDetail] = useState<string | null>(null);
  const [contractRate, setContractRate] = useState<number | null>(null);
  const [agreementRates, setAgreementRates] = useState<Record<string, number>>({});

  const confirmedTotal = useMemo(() => accruals.reduce((sum, row) => sum + row.amount, 0), [accruals]);
  const pendingTotal = useMemo(() => orders.filter((order) => order.status === "incoming").reduce((sum, order) => sum + order.amount, 0) + cards.filter((card) => card.status === "draft").reduce((sum, card) => sum + calcCard(card), 0), [orders, cards]);
  const names = useMemo(() => [...new Set([...Object.keys(employeeRoles), ...accruals.map((row) => row.employee), ...orders.map((row) => row.employee), ...cards.map((row) => row.employee)])], [accruals, orders, cards]);
  const visibleNames = names.filter((name) => name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")) && (filter === "Все сотрудники" || employeeRoles[name] === filter));
  const totalsByName = (name: string) => accruals.filter((row) => row.employee === name).reduce((sum, row) => sum + row.amount, 0);
  const detailsFor = (name: string) => accruals.filter((row) => row.employee === name);
  const selectedCard = cards.find((card) => card.employee === employeeDetail);
  const validContractRate = contractRate !== null && Number.isFinite(contractRate) && contractRate > 0 && contractRate <= 1_000_000_000;

  function notify(text: string) { setNotice(text); window.setTimeout(() => setNotice(""), 3200); }
  function openEmployee(name: string) {
    setEmployeeDetail(name);
    setContractRate(agreementRates[name] ?? cards.find((card) => card.employee === name)?.rate ?? null);
  }
  function saveAgreement() {
    if (!employeeDetail || !selectedCard || !validContractRate || contractRate === null) return;
    setAgreementRates((old) => ({ ...old, [employeeDetail]: contractRate }));
    setCards((old) => old.map((card) => card.employee === employeeDetail && card.status === "draft" ? { ...card, rate: contractRate } : card));
    setEmployeeDetail(null);
    notify("Условие оплаты сохранено в примере. Подтверждённые суммы не изменены.");
  }
  function approveOrder(order: WorkOrder) {
    if (order.status === "confirmed") return;
    setOrders((old) => old.map((row) => row.id === order.id ? { ...row, status: "confirmed" } : row));
    setAccruals((old) => old.some((row) => row.source === order.id) ? old : [...old, { id: `И-${order.id}`, employee: order.employee, role: order.role, type: order.type, date: order.date.replace(" окт 2026", " окт"), amount: order.amount, details: `${order.details} · ${order.machine}`, source: order.id }]);
    setReturning(null); setReason(""); notify(`Наряд ${order.id} подтверждён и включён в реестр.`);
  }
  function returnOrder(order: WorkOrder) {
    if (!reason.trim()) return;
    setOrders((old) => old.map((row) => row.id === order.id ? { ...row, status: "returned", explanation: reason.trim() } : row));
    setReturning(null); setReason(""); notify(`Наряд ${order.id} возвращён с пояснением.`);
  }
  function resubmit(order: WorkOrder) {
    const newAmount = order.id === "Н-1047" ? 8.2 * order.rate : order.amount;
    setOrders((old) => old.map((row) => row.id === order.id ? { ...row, status: "incoming", quantity: order.id === "Н-1047" ? 8.2 : row.quantity, amount: newAmount, details: order.id === "Н-1047" ? `Культивация · участок 4 · 8,2 га × ${new Intl.NumberFormat("ru-RU").format(order.rate)} ₸/га` : row.details, explanation: undefined } : row));
    notify(`Исправленный наряд ${order.id} снова отправлен на проверку.`);
  }
  function updateCard(id: string, field: "quantity" | "rate", value: string) {
    const number = value === "" ? 0 : Number(value);
    setCards((old) => old.map((card) => card.id === id && card.status === "draft" ? { ...card, [field]: Number.isFinite(number) ? number : 0 } : card));
  }
  function confirmCard(card: Timecard) {
    if (card.status !== "draft" || cardError(card) || calcCard(card) <= 0) return;
    const amount = calcCard(card);
    setCards((old) => old.map((row) => row.id === card.id ? { ...row, status: "confirmed", snapshotAmount: amount, snapshotQuantity: row.quantity, snapshotRate: row.rate } : row));
    setAccruals((old) => old.some((row) => row.source === card.id) ? old : [...old, { id: `И-${card.id}`, employee: card.employee, role: employeeRoles[card.employee] ?? "Сотрудник", type: card.role === "general" ? "Общие работы" : "Оклад", date: "Октябрь", amount, details: card.role === "general" ? `${card.snapshotQuantity ?? card.quantity} ${card.measure === "hours" ? "ч" : "дн"} × ${shortMoney(card.snapshotRate ?? card.rate)}` : `${shortMoney(card.snapshotRate ?? card.rate)} × ${card.snapshotQuantity ?? card.quantity} / ${card.standardDays} дн.`, source: card.id }]);
    notify(`Табель ${card.id} подтверждён. Снимок расчёта зафиксирован.`);
  }
  function reset() {
    setOrders(initialOrders.map((row) => ({ ...row }))); setCards(initialCards.map((row) => ({ ...row }))); setAccruals(seedAccruals.map((row) => ({ ...row })));
    setQuery(""); setFilter("Все сотрудники"); setExpanded(null); setReturning(null); setReason(""); setEmployeeDetail(null); setContractRate(null); setAgreementRates({}); notify("Пример восстановлен. Изменения в демонстрации сброшены.");
  }

  return <main className="agrolink-payroll-proposal ag-payroll">
    <div className="ag-photo-wash" aria-hidden="true" />
    <div className="ag-demo-banner"><span className="ag-demo-dot" />Демонстрация · пример данных · основной сайт не изменён<span className="ag-demo-right">Октябрь 2026 <span>·</span> только начисления до удержаний</span></div>
    <header className="ag-header">
      <div className="ag-brand"><div className="ag-mark">AL<span>/</span></div><div><div className="ag-brand-name">AgroLink <span>Операции</span></div><div className="ag-brand-sub">Управление начислениями</div></div></div>
      <div className="ag-header-actions"><span className="ag-hr-user"><span className="ag-avatar">HR</span><span>Отдел кадров</span></span><button className="ag-reset" aria-label="Сбросить пример данных" title="Сбросить пример данных" onClick={reset}><RotateCcw size={14} /><span>Сбросить пример</span></button></div>
    </header>
    <section className="ag-intro">
      <div className="ag-overline">РАСЧЁТНЫЙ КОНТУР <i /> ПРЕДЛОЖЕНИЕ</div>
      <div className="ag-intro-row"><div><h1>Начисления<br className="ag-mobile-break" /> за месяц<span className="ag-period"> / ОКТЯБРЬ ’26</span></h1><p>Проверяем первичные записи и собираем понятный расчёт по каждому человеку.</p></div><div className="ag-intro-aside"><span>СНАЧАЛА ФАКТЫ</span><span>ЗАТЕМ ПОДТВЕРЖДЕНИЕ</span><span>И ТОЛЬКО ПОТОМ РЕЕСТР</span></div></div>
    </section>
    <section className="ag-metrics" aria-label="Итоги за месяц">
      <div className="ag-metric ag-metric-main"><span className="ag-metric-label">Подтверждено · начислено брутто</span><strong>{shortMoney(confirmedTotal)}</strong><span className="ag-metric-note"><BadgeCheck size={14} /> {accruals.length} строк в накопительном реестре</span></div>
      <div className="ag-metric"><span className="ag-metric-label">Ожидает проверки</span><strong>{shortMoney(pendingTotal)}</strong><span className="ag-metric-note"><Clock3 size={14} /> {orders.filter((x) => x.status === "incoming").length + cards.filter((x) => x.status === "draft").length} записи требуют решения</span></div>
      <div className="ag-metric ag-metric-context"><span className="ag-metric-label">Принцип расчёта</span><strong>Факт × ставка</strong><span className="ag-metric-note">Плановые нормы не входят в фактическую зарплату</span></div>
    </section>
    <div className="ag-rule-note"><CircleAlert size={16} /><span><b>Только начисления до удержаний.</b> Отпускные и больничные требуют отдельного согласования — система не подставляет правила автоматически.</span></div>
    <nav className="ag-tabs" aria-label="Разделы расчёта">
      <button onClick={() => setSection("register")} className={section === "register" ? "is-active" : ""}><ClipboardList size={16} />Накопительный реестр <span>{names.length}</span></button>
      <button onClick={() => setSection("orders")} className={section === "orders" ? "is-active" : ""}><Truck size={16} />Наряды диспетчера <span>{orders.filter((x) => x.status === "incoming").length}</span></button>
      <button onClick={() => setSection("timecards")} className={section === "timecards" ? "is-active" : ""}><FileCheck2 size={16} />Табели <span>{cards.filter((x) => x.status === "draft").length}</span></button>
    </nav>

    {section === "register" && <section className="ag-panel">
      <div className="ag-section-head"><div><div className="ag-overline">СВОДНЫЙ ВИД · МЕСЯЦ К НАКОПЛЕНИЮ</div><h2>Реестр по сотрудникам</h2><p>В подтверждённую сумму входят только зафиксированные начисления. Черновики показаны отдельно.</p></div><div className="ag-register-count"><b>{visibleNames.length}</b><span>сотрудников</span></div></div>
      <div className="ag-toolbar"><label className="ag-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти сотрудника" aria-label="Поиск по сотрудникам" /></label><label className="ag-filter"><Filter size={15} /><select aria-label="Фильтр по типу сотрудника" value={filter} onChange={(e) => setFilter(e.target.value)}><option>Все сотрудники</option>{[...new Set(Object.values(employeeRoles))].map((role) => <option key={role}>{role}</option>)}</select><ChevronDown size={14} /></label><span className="ag-toolbar-period">Октябрь 2026</span></div>
      <div className="ag-table-scroll"><table className="ag-register-table"><thead><tr><th>Сотрудник</th><th>Тип оплаты</th><th>Источники начислений</th><th className="ag-align-right">Подтверждено</th><th className="ag-align-right">Ожидает</th><th></th></tr></thead><tbody>
        {visibleNames.map((name) => {
          const rows = detailsFor(name); const pending = orders.filter((x) => x.employee === name && x.status === "incoming").reduce((s, x) => s + x.amount, 0) + cards.filter((x) => x.employee === name && x.status === "draft").reduce((s, x) => s + calcCard(x), 0);
          const kind = name === "Ерлан Садыков" ? "Сдельная · поле" : name === "Айдар Нуртаев" ? "Сдельная · рейсы" : name === "Мария Иманова" ? "Почасовая" : name === "Руслан Беков" ? "Дневная ставка" : "Оклад";
          return <Fragment key={name}><tr className="ag-employee-row" onClick={() => setExpanded(expanded === name ? null : name)}><td><span className="ag-name-line"><span className="ag-person-mark">{initials(name)}</span><span><b>{name}</b><small>{employeeRoles[name]}</small></span></span></td><td><span className="ag-pay-kind">{kind}</span></td><td><div className="ag-source-chips">{rows.length ? [...new Set(rows.map((r) => r.type))].map((type) => <Tag key={type}>{type}</Tag>) : <span className="ag-dim">Нет подтверждённых строк</span>}</div></td><td className="ag-align-right ag-amount">{shortMoney(totalsByName(name))}</td><td className="ag-align-right">{pending > 0 ? <span className="ag-pending-value">{shortMoney(pending)}</span> : <span className="ag-dim">—</span>}</td><td className="ag-chevron-cell"><button type="button" className="ag-link-button" aria-label={`Расшифровка начислений: ${name}`} aria-expanded={expanded === name} onClick={(e) => { e.stopPropagation(); setExpanded(expanded === name ? null : name); }}><ChevronRight className={expanded === name ? "ag-rotated" : ""} size={16} /></button></td></tr>
            {expanded === name && <tr className="ag-expanded-row"><td colSpan={6}><div className="ag-expanded-content"><div className="ag-expanded-head"><span>Расшифровка · {name}</span><button onClick={(e) => { e.stopPropagation(); openEmployee(name); }}>Настройки сотрудника <Settings2 size={14} /></button></div>{rows.length ? <CurrentPayrollLines groups={[{ key: `detail-${name}`, name: "Подтверждённые начисления · октябрь", total: totalsByName(name), lines: rows.map((r) => ({ key: r.id, workType: r.type, details: `${r.date} · ${r.details} · источник ${r.source}`, amountKzt: r.amount, sourceType: r.type.includes("Полевые") ? "field_operation" : r.type.includes("Перевозка") ? "grain_trip" : "timecard" })) }]} testPrefix={`employee-${initials(name)}`} /> : <div className="ag-empty-inline">Подтверждённых начислений пока нет. После проверки строки появятся здесь.</div>}{pending > 0 && <div className="ag-pending-inline"><Clock3 size={14} />Черновики на проверке: {shortMoney(pending)} · не включены в итог</div>}<p className="ag-allocation-note"><Wheat size={14} />Полевой сдельный заработок можно отнести на исходное поле. Время общих рабочих и специалистов не относится на поле автоматически: нужна документированная производственная задача.</p></div></td></tr>}</Fragment>;
        })}
        {!visibleNames.length && <tr><td colSpan={6}><div className="ag-empty"><Search size={20} /><b>Сотрудники не найдены</b><span>Измените запрос или выберите другой тип.</span></div></td></tr>}
      </tbody></table></div>
      <div className="ag-register-foot"><span>Начисления показаны до налогов и иных удержаний.</span><span>Подтверждённых строк: <b>{accruals.length}</b></span></div>
    </section>}

    {section === "orders" && <section className="ag-panel">
      <div className="ag-section-head"><div><div className="ag-overline">ИСТОЧНИК: ДИСПЕТЧЕРСКАЯ · ФАКТИЧЕСКАЯ ВЫРАБОТКА</div><h2>Входящие наряды</h2><p>Кадры сверяют детали первичной записи. Фактические объёмы и тарифы диспетчера не редактируются здесь.</p></div><Tag tone="light">{orders.filter((x) => x.status === "incoming").length} к проверке</Tag></div>
      <div className="ag-workflow"><div><span>01</span><b>Диспетчер</b><small>Факт, объём, тариф</small></div><ChevronRight size={15} /><div className="ag-workflow-current"><span>02</span><b>Кадры</b><small>Сверка и решение</small></div><ChevronRight size={15} /><div><span>03</span><b>Реестр</b><small>Только после подтверждения</small></div></div>
      <div className="ag-order-list">{orders.map((order) => <article className={`ag-order-card ${order.status === "returned" ? "is-returned" : ""}`} key={order.id}>
        <div className="ag-order-top"><div className="ag-order-id">{order.id}<span> · {order.date}</span></div><Tag tone={order.status === "incoming" ? "amber" : order.status === "confirmed" ? "green" : "red"}>{order.status === "incoming" ? "Ожидает проверки" : order.status === "confirmed" ? "Подтверждён" : "Возвращён"}</Tag></div>
        <div className="ag-order-body"><div className="ag-order-person"><span className="ag-person-mark">{initials(order.employee)}</span><span><b>{order.employee}</b><small>{order.role}</small></span></div><div className="ag-order-work"><b>{order.type}</b><span>{order.details}</span><small>{order.field} <i>·</i> {order.machine}</small></div><div className="ag-order-calc"><span>К начислению</span><b>{shortMoney(order.amount)}</b><small>{new Intl.NumberFormat("ru-RU").format(order.quantity)} × {new Intl.NumberFormat("ru-RU").format(order.rate)} ₸</small></div></div>
        {order.explanation && <div className="ag-explanation"><CircleAlert size={15} /><div><b>Пояснение при возврате</b><span>{order.explanation}</span></div></div>}
        {order.status === "incoming" && <div className="ag-order-actions"><button className="ag-button ag-button-primary" onClick={() => approveOrder(order)}><Check size={15} />Подтвердить наряд</button><button className="ag-button ag-button-quiet" onClick={() => { setReturning(returning === order.id ? null : order.id); setReason(""); }}><ArrowDownRight size={15} />Вернуть на исправление</button><button className="ag-link-button" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>{expanded === order.id ? "Скрыть детали" : "Детали источника"}<ChevronDown size={14} /></button></div>}
        {order.status === "returned" && <div className="ag-order-actions"><button className="ag-button ag-button-outline" onClick={() => resubmit(order)}><ArrowUpRight size={15} />Смоделировать повторную отправку</button><span className="ag-locked-note">Действие диспетчера · в реестре не учтён</span></div>}
        {order.status === "confirmed" && <div className="ag-confirmed-strip"><BadgeCheck size={15} />Источник зарезервирован · повторного начисления не будет</div>}
        {returning === order.id && <div className="ag-return-form"><label htmlFor={`reason-${order.id}`}>Обязательное пояснение для диспетчера</label><textarea id={`reason-${order.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Укажите, что нужно сверить или исправить" rows={2} /><div><button className="ag-button ag-button-primary" disabled={!reason.trim()} onClick={() => returnOrder(order)}>Вернуть наряд</button><button className="ag-link-button" onClick={() => setReturning(null)}>Отмена</button></div></div>}
        {expanded === order.id && <div className="ag-source-detail"><b>Детали первичной строки</b><div><span>Сотрудник</span><strong>{order.employee}</strong><span>Дата факта</span><strong>{order.date}</strong><span>Участок / маршрут</span><strong>{order.field}</strong><span>Техника</span><strong>{order.machine}</strong><span>Объём × ставка</span><strong>{new Intl.NumberFormat("ru-RU").format(order.quantity)} × {shortMoney(order.rate)}</strong><span>Расчётная сумма</span><strong>{money(order.quantity * order.rate)}</strong></div></div>}
      </article>)}</div>
      <div className="ag-principle"><Wheat size={17} /><span><b>План ≠ начисление.</b> Главный агроном сохраняет плановую ставку за гектар в сезонном плане. В расчёт попадают только фактическая площадь и утверждённый фактический тариф из наряда диспетчера.</span></div>
    </section>}

    {section === "timecards" && <section className="ag-panel">
      <div className="ag-section-head"><div><div className="ag-overline">ИСТОЧНИК: ТАБЕЛЬ · ПРОВЕРКА КАДРОВ</div><h2>Рабочее время и оклад</h2><p>Введите проверенные фактические дни или часы. Подтверждение фиксирует расчётный снимок.</p></div><Tag tone="light">Октябрь 2026</Tag></div>
      <div className="ag-policy-grid"><div><span className="ag-policy-index">А</span><span><b>Общие рабочие</b><small>Часовая или дневная ставка × фактическое время</small></span><span className="ag-policy-icon"><Clock3 size={17} /></span></div><div><span className="ag-policy-index">Б</span><span><b>Окладные специалисты</b><small>Оклад по договору × факт дней / норма месяца</small></span><span className="ag-policy-icon"><BriefcaseBusiness size={17} /></span></div></div>
      {cards.map((card) => <article className="ag-timecard" key={card.id}>
        <div className="ag-timecard-head"><div><span className="ag-timecard-id">{card.id}</span><Tag tone={card.status === "draft" ? "amber" : "green"}>{card.status === "draft" ? "Черновик · не начислено" : "Подтверждён · снимок закреплён"}</Tag></div><button className="ag-link-button" onClick={() => openEmployee(card.employee)}>Условия сотрудника <Settings2 size={14} /></button></div>
        <div className="ag-timecard-content"><div className="ag-timecard-employee"><span className="ag-person-mark">{initials(card.employee)}</span><span><b>{card.employee}</b><small>{card.role === "general" ? "Общий рабочий · табель смены" : "Специалист · окладный договор"}</small></span></div>
          <div className="ag-input-group"><label htmlFor={`qty-${card.id}`}>{card.role === "general" ? `Фактические ${card.measure === "hours" ? "часы" : "дни"}` : "Фактически отработано, дней"}</label><div className="ag-number-wrap"><input id={`qty-${card.id}`} type="number" min="0.01" max={card.role === "salary" ? card.standardDays : card.measure === "days" ? 31 : 744} step="0.5" disabled={card.status === "confirmed"} value={card.status === "confirmed" ? card.snapshotQuantity : card.quantity} onChange={(e) => updateCard(card.id, "quantity", e.target.value)} /><span>{card.role === "general" ? card.measure === "hours" ? "часов" : "дней" : `из ${card.standardDays} дн.`}</span></div>{card.role === "salary" && <small className="ag-input-hint">Норма в этом примере — 22 рабочих дня; это демонстрационное значение, не календарь РК.</small>}</div>
          <div className="ag-input-group"><label htmlFor={`rate-${card.id}`}>{card.role === "general" ? `Согласованная ставка, ₸/${card.measure === "hours" ? "ч" : "день"}` : "Оклад по договору, ₸/месяц"}</label><div className="ag-number-wrap"><input id={`rate-${card.id}`} type="number" min="0.01" max="1000000000" step="0.01" disabled={card.status === "confirmed"} value={card.status === "confirmed" ? card.snapshotRate : card.rate} onChange={(e) => updateCard(card.id, "rate", e.target.value)} /><span>₸</span></div>{card.role === "salary" && <small className="ag-input-hint">Договорный параметр · не прогнозная ставка.</small>}</div>
          <div className="ag-formula"><span>{card.status === "confirmed" ? "ПОДТВЕРЖДЁННОЕ НАЧИСЛЕНИЕ" : "ПРЕДВАРИТЕЛЬНОЕ НАЧИСЛЕНИЕ"}</span><b>{money(card.status === "confirmed" ? card.snapshotAmount ?? 0 : calcCard(card))}</b><small>{card.role === "general" ? `${fmt(card.quantity)} × ${fmt(card.rate)} ₸/${card.measure === "hours" ? "ч" : "день"}` : `${shortMoney(card.rate)} × ${fmt(card.quantity)} / ${card.standardDays} дней`}</small></div>
        </div>
        <div className="ag-timecard-footer">{card.status === "draft" ? <><span className={`ag-validation ${!cardError(card) ? "valid" : ""}`}>{cardError(card) ?? "Проверьте источник и согласованную ставку"}</span><button className="ag-button ag-button-primary" disabled={!!cardError(card) || calcCard(card) <= 0} onClick={() => confirmCard(card)}><Check size={15} />Подтвердить табель</button></> : <span className="ag-confirmed-strip"><BadgeCheck size={15} />Сумма, время и ставка сохранены в примере и не пересчитываются от будущих изменений договора.</span>}</div>
      </article>)}
      <div className="ag-safeguard"><CircleAlert size={17} /><div><b>Одна схема оплаты — один расчёт.</b><span>Сдельные работы не добавляются поверх полного оклада автоматически. Для смешанной схемы нужны отдельный согласованный договорный параметр и отдельная подтверждённая сдельная строка.</span></div></div>
    </section>}
    <footer className="ag-footer"><span><span className="ag-mark-small">AL/</span> AgroLink · предложение расчётного процесса</span><span>Все суммы — начисления брутто · пример не меняет основной сайт</span></footer>

    {employeeDetail && <div className="ag-modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEmployeeDetail(null); }}>
      <section className="ag-employee-modal" role="dialog" aria-modal="true" aria-labelledby="ag-modal-title" onKeyDown={(e) => { if (e.key === "Escape") setEmployeeDetail(null); }}>
        <div className="ag-modal-top"><div><div className="ag-overline">КАРТОЧКА СОТРУДНИКА · ДЕМО</div><h2 id="ag-modal-title">{employeeDetail}</h2><span>{employeeRoles[employeeDetail]}</span></div><IconButton label="Закрыть карточку" onClick={() => setEmployeeDetail(null)}><X size={18} /></IconButton></div>
        <div className="ag-modal-body">
          <div className="ag-modal-field"><span>Выбранная схема</span><b>{!selectedCard ? "Сдельная" : selectedCard.role === "salary" ? "Окладная" : selectedCard.measure === "hours" ? "Почасовая ставка" : "Дневная ставка"}</b></div>
          {selectedCard ? <><div className="ag-modal-field"><label htmlFor="contract-rate">Согласованный {selectedCard.role === "salary" ? "оклад, ₸/месяц" : selectedCard.measure === "hours" ? "тариф, ₸/час" : "тариф, ₸/день"}</label><input autoFocus id="contract-rate" type="number" min="0.01" max="1000000000" step="0.01" value={contractRate ?? ""} onChange={(e) => setContractRate(e.target.value === "" ? null : Number(e.target.value))} aria-invalid={!validContractRate} /></div>{!validContractRate && <p role="alert">Введите положительную сумму не выше 1 млрд ₸.</p>}<p>Изменение применяется только к черновику и демонстрационному условию следующих расчётов. Уже подтверждённые начисления сохраняют ставку и сумму.</p></> : <p>Фактические тарифы по видам работ указывает диспетчер в нарядах. В отделе кадров их не меняют: наряд можно подтвердить или вернуть диспетчеру с пояснением.</p>}
          <div className="ag-modal-total"><span>Подтверждено за октябрь</span><b>{shortMoney(totalsByName(employeeDetail))}</b></div>
        </div>
        <div className="ag-modal-actions"><button autoFocus={!selectedCard} className="ag-button ag-button-quiet" onClick={() => setEmployeeDetail(null)}>Закрыть</button>{selectedCard && <button className="ag-button ag-button-primary" disabled={!validContractRate} onClick={saveAgreement}>Сохранить параметр</button>}</div>
      </section>
    </div>}
    {notice && <div className="ag-toast" role="status"><BadgeCheck size={16} />{notice}</div>}
    <div className="ag-persistent-demo"><span className="ag-demo-dot" />Демонстрация · пример данных · основной сайт не изменён</div>
  </main>;
}

function fmt(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value); }
function initials(name: string) { return name.split(" ").map((part) => part[0]).slice(0, 2).join(""); }
