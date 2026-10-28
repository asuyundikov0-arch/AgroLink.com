import type { FinancialEntry } from "@workspace/api-client-react";
import { UNITS } from "../../engineering/repairs/shared";

export type Book = FinancialEntry["book"];
export const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
export const BOOK_LABEL: Record<Book, string> = { budget: "Производственный бюджет", cash_flow: "Cash Flow" };
export const BASIS_LABEL: Record<FinancialEntry["basis"], string> = { plan: "План", actual: "Факт" };
export const STATUS_LABEL: Record<FinancialEntry["status"], string> = { recorded: "Учтено", pending: "Ожидает оплаты", completed: "Проведено", voided: "Аннулировано" };
export const SOURCE_LABEL: Record<FinancialEntry["source"], string> = { manual: "Вручную", spare_part: "Реестр оплат запчастей" };
export const BUDGET_CATEGORIES = ["Семена", "Удобрения", "СЗР", "ГСМ", "Запчасти и ремонт", "Оплата труда", "Налоги на ФОТ", "Аренда земли", "Страхование", "Электроэнергия", "Услуги сторонних организаций", "Прочие затраты"];
export const CASH_INCOME_CATEGORIES = ["Реализация зерна", "Реализация прочей продукции", "Субсидии", "Кредиты и займы", "Прочие поступления"];
export const CASH_EXPENSE_CATEGORIES = [...BUDGET_CATEGORIES, "Погашение кредитов", "Проценты по кредитам", "Капитальные вложения", "Прочие выплаты"];
export const unitSuggestions = (entries: FinancialEntry[]) => [...new Set<string>([...UNITS, ...entries.map((e) => e.unit)])].sort((a, b) => a.localeCompare(b, "ru"));
export const typeLabel = (e: Pick<FinancialEntry, "book" | "basis" | "direction">) =>
  e.book === "budget" ? `Затраты · ${BASIS_LABEL[e.basis].toLowerCase()}` : `${e.direction === "income" ? "Поступление" : "Выплата"} · ${BASIS_LABEL[e.basis].toLowerCase()}`;
export const canEditEntry = (e: FinancialEntry) => e.source === "manual" && e.id > 0 && (e.status === "recorded" || e.status === "pending");
export const canCompleteEntry = (e: FinancialEntry) => e.source === "manual" && e.id > 0 && e.book === "cash_flow" && e.basis === "actual" && e.status === "pending";
export const canVoidEntry = (e: FinancialEntry) => e.source === "manual" && e.id > 0 && e.status !== "voided";
export const stamp = (v: string | null | undefined) => v ? new Date(v).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", dateStyle: "short", timeStyle: "short" }) : "—";
