import { eq } from "drizzle-orm";
import { activityTable, db, payrollRegisterItemsTable, payrollRegistersTable } from "@workspace/db";
import type { RoleAccess } from "../middlewares/auth";
import { lockPayrollSources } from "./payroll-source-guard";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function approveDailyOrder(tx: Tx, id: number, version: number, access: RoleAccess) {
  if (!access.role || !["hr", "general_director"].includes(access.role)) {
    return { error: "Подтверждать начисления может только отдел кадров или генеральный директор.", status: 403 };
  }
  await lockPayrollSources(tx);
  const [current] = await tx.select().from(payrollRegistersTable)
    .where(eq(payrollRegistersTable.id, id)).for("update");
  if (!current) return { error: "Наряд не найден.", status: 404 };
  if (current.status !== "pending_hr") return { error: "Этот наряд уже подтверждён или ещё не отправлен в отдел кадров.", status: 409 };
  if (current.version !== version) return { error: "Наряд изменился. Обновите список перед подтверждением.", status: 409 };
  const items = await tx.select().from(payrollRegisterItemsTable).where(eq(payrollRegisterItemsTable.registerId, current.id));
  if (!items.length || items.some((item) => item.employeeId === null)) {
    return { error: "Все строки наряда должны быть связаны с сотрудниками из справочника.", status: 409 };
  }
  const sumCents = items.reduce((sum, item) => sum + Math.round(Number(item.amountKzt) * 100), 0);
  if (sumCents !== Math.round(Number(current.totalAmount) * 100)) {
    return { error: "Сумма наряда не совпадает с суммой начислений. Подтверждение остановлено.", status: 409 };
  }
  const now = new Date();
  const actor = `${access.displayName} · ${access.role}`;
  const [register] = await tx.update(payrollRegistersTable).set({
    status: "sent_to_economist", hrApprovedByUserId: access.userId,
    hrApprovedByName: actor, hrApprovedAt: now, version: current.version + 1, updatedAt: now,
  }).where(eq(payrollRegistersTable.id, current.id)).returning();
  await tx.insert(activityTable).values({
    action: "Отдел кадров подтвердил начисления по ежедневному наряду",
    templateName: `${current.unit} · ${current.workDate} · наряд №${current.id}`, userName: actor,
  });
  return { register, items };
}
