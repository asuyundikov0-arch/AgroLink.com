import { Fragment } from "react";
import { money } from "../../engineering/repairs/shared";
import type { summarizeFinance, FinancialSummaryRow } from "../financial-summary";
import { MONTHS, type Book } from "./shared";

type Summary = ReturnType<typeof summarizeFinance>;
const cell = (v: number) => <td className={`num ${v === 0 ? "zero" : ""}`}>{v === 0 ? "—" : money(v)}</td>;
const diffCell = (v: number, overIsBad: boolean) => <td className={`num ${v === 0 ? "zero" : overIsBad && v > 0 ? "over" : ""}`}>{v === 0 ? "—" : `${v > 0 ? "+" : ""}${money(v)}`}</td>;
const sub = (a: number, b: number) => Math.round((a - b) * 100) / 100;

function Triple({ label, plan, actual, planTotal, actualTotal, overIsBad, cls = "", first }: { label: string; plan: number[]; actual: number[]; planTotal: number; actualTotal: number; overIsBad: boolean; cls?: string; first?: boolean }) {
  return <>
    <tr className={`${cls} ${first ? "cat-first" : ""}`}><td className="stick" rowSpan={3}><b>{label}</b></td><td className="k" style={{ textAlign: "left" }}>План</td>{plan.map((v, i) => <Fragment key={i}>{cell(v)}</Fragment>)}<td className="num tot">{money(planTotal)}</td></tr>
    <tr className={cls}><td style={{ textAlign: "left" }}>Факт</td>{actual.map((v, i) => <Fragment key={i}>{cell(v)}</Fragment>)}<td className="num tot">{money(actualTotal)}</td></tr>
    <tr className={`${cls} diff`}><td style={{ textAlign: "left" }}>Факт − план</td>{actual.map((v, i) => <Fragment key={i}>{diffCell(sub(v, plan[i]), overIsBad)}</Fragment>)}{diffCell(sub(actualTotal, planTotal), overIsBad)}</tr>
  </>;
}

export default function MonthlyTable({ book, summary }: { book: Book; summary: Summary }) {
  const groups: [string, FinancialSummaryRow[]][] = book === "budget"
    ? [["Затраты", summary.categories]]
    : [["Поступления", summary.categories.filter((r) => r.direction === "income")], ["Выплаты", summary.categories.filter((r) => r.direction === "expense")]];
  return <div className="fin-scroll" data-testid="finance-monthly-table">
    <table className="fin-table">
      <thead><tr><th className="stick">Статья</th><th style={{ textAlign: "left" }}>Показатель</th>{MONTHS.map((m) => <th key={m}>{m}</th>)}<th>Итого за год</th></tr></thead>
      <tbody>
        {groups.map(([title, rows]) => <Fragment key={title}>
          <tr className="group"><td className="stick">{title}</td><td colSpan={14}>{rows.length === 0 ? "Нет учтённых записей" : `${rows.length} ст.`}</td></tr>
          {rows.map((r) => <Triple key={r.key} first label={r.category} plan={r.plan} actual={r.actual} planTotal={r.planTotal} actualTotal={r.actualTotal} overIsBad={r.direction === "expense"} />)}
        </Fragment>)}
        <Triple cls="total" first label={book === "budget" ? "Итого затраты" : "Чистый денежный поток"} plan={summary.plan} actual={summary.actual} planTotal={summary.planTotal} actualTotal={summary.actualTotal} overIsBad={book === "budget"} />
      </tbody>
    </table>
  </div>;
}
