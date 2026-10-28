import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Banknote, Clock3, FileText } from "lucide-react";
import {
  getListFinancialEntriesQueryKey,
  getListSparePartPaymentRegisterQueryKey,
  getListSparePartRequestsQueryKey,
  type SparePartPaymentRegisterItem,
  useListSparePartPaymentRegister,
  useMarkSparePartPaymentPaid,
} from "@workspace/api-client-react";
import { ConfirmDialog, errorInfo, money } from "../engineering/repairs/shared";

const dateTime = (value: string | null) => value
  ? new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
  : "—";

export default function PaymentRegister({ canMarkPaid }: { canMarkPaid: boolean }) {
  const queryClient = useQueryClient();
  const query = useListSparePartPaymentRegister({
    query: { queryKey: getListSparePartPaymentRegisterQueryKey(), refetchInterval: 15000 },
  });
  const pay = useMarkSparePartPaymentPaid();
  const [filter, setFilter] = useState<"pending" | "paid">("pending");
  const [selected, setSelected] = useState<SparePartPaymentRegisterItem | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const entries = query.data ?? [];
  const pending = entries.filter((entry) => entry.paymentStatus === "pending");
  const paid = entries.filter((entry) => entry.paymentStatus === "paid");
  const visible = filter === "pending" ? pending : paid;
  const pendingTotal = pending.reduce((sum, entry) => sum + entry.amount, 0);

  const confirmPayment = async () => {
    if (!selected) return;
    setError("");
    setNotice("");
    try {
      await pay.mutateAsync({ itemId: selected.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListFinancialEntriesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSparePartPaymentRegisterQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSparePartRequestsQueryKey() }),
      ]);
      setNotice(`Оплата позиции «${selected.name}» отмечена. Заведующий складом может принять её по накладной.`);
      setSelected(null);
    } catch (err) {
      setError(errorInfo(err).message);
    }
  };

  if (query.isLoading) return <section className="surface-card p-5" data-testid="payment-register-loading"><div className="skeleton h-7 w-52 rounded-lg" /><div className="skeleton mt-4 h-20 rounded-lg" /></section>;
  if (query.isError) return <section className="surface-card p-5" role="alert" data-testid="payment-register-error"><p className="text-sm font-semibold text-destructive">{errorInfo(query.error).message}</p><button type="button" className="button button-secondary mt-3 text-xs" onClick={() => void query.refetch()}>Повторить</button></section>;

  return (
    <section className="space-y-4" data-testid="payment-register">
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="surface-card flex items-center gap-3 p-4">
          <div className="setting-icon"><Clock3 size={17} /></div>
          <div><p className="eyebrow">Ожидают оплаты</p><p className="mt-1 text-xl font-bold">{pending.length} поз. · {money(pendingTotal)}</p></div>
        </article>
        <article className="surface-card flex items-center gap-3 p-4">
          <div className="setting-icon"><BadgeCheck size={17} /></div>
          <div><p className="eyebrow">Оплачено</p><p className="mt-1 text-xl font-bold">{paid.length} поз.</p></div>
        </article>
      </div>

      <section className="surface-card p-4 sm:p-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Экономический блок · закупки запчастей</p>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.04em]">Реестр платежей</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Сюда попадают только позиции, одобренные генеральным директором. После фактической оплаты экономист или генеральный директор отмечает её здесь; затем позиция становится доступна заведующему складом и отражается в Cash Flow.</p>
          </div>
          <div className="inline-flex self-start rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Статус оплаты">
            <button type="button" role="tab" aria-selected={filter === "pending"} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${filter === "pending" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setFilter("pending")} data-testid="tab-payment-pending">К оплате ({pending.length})</button>
            <button type="button" role="tab" aria-selected={filter === "paid"} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${filter === "paid" ? "bg-foreground text-background" : "text-muted-foreground"}`} onClick={() => setFilter("paid")} data-testid="tab-payment-paid">Оплачено ({paid.length})</button>
          </div>
        </header>

        {notice && <p className="notice-banner mt-4" role="status" data-testid="payment-register-notice"><BadgeCheck size={15} />{notice}</p>}
        {error && <p className="mt-3 text-xs font-semibold text-destructive" role="alert">{error}</p>}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center" data-testid="payment-register-empty">
            <Banknote size={22} className="text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">{filter === "pending" ? "Нет одобренных заявок к оплате" : "Оплаченных позиций пока нет"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{filter === "pending" ? "Позиции появятся здесь после решения генерального директора." : "Оплаченные позиции сохраняются в истории реестра."}</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border" data-testid="payment-register-list">
            {visible.map((entry) => (
              <li key={entry.id} className="py-4" data-testid={`payment-register-row-${entry.id}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{entry.name}</p>
                      {entry.articleNumber && <span className="text-[10px] text-muted-foreground">№ {entry.articleNumber}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.paymentStatus === "paid" ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"}`}>
                        {entry.paymentStatus === "paid" ? "Оплачено" : "Ожидает оплаты"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.fleetKind}{entry.registrationNumber ? ` · ${entry.registrationNumber}` : ""} · {entry.quantity} {entry.unit} × {money(entry.unitPrice)} · заявка №{entry.requestNumber}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{entry.requesterName} · {entry.department} · подана {dateTime(entry.submittedAt)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><FileText size={12} />Согласовал: {entry.approvedByName}{entry.approvedAt ? ` · ${dateTime(entry.approvedAt)}` : ""}</p>
                    {entry.paymentStatus === "paid" && <p className="mt-1 text-[11px] font-medium text-teal-800">Отметил оплату: {entry.paidByName || "Не указано"}{entry.paidAt ? ` · ${dateTime(entry.paidAt)}` : ""}</p>}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
                    <p className="font-mono text-base font-bold">{money(entry.amount)}</p>
                    {entry.paymentStatus === "pending" && canMarkPaid && <button type="button" className="button button-primary text-xs" onClick={() => { setError(""); setSelected(entry); }} data-testid={`button-mark-payment-paid-${entry.id}`}>Отметить оплаченной</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && <ConfirmDialog
        title="Подтвердить оплату?"
        testId="dialog-confirm-payment"
        error={error}
        pending={pay.isPending}
        body={<>Позиция «{selected.name}» по заявке №{selected.requestNumber} · {money(selected.amount)}. После подтверждения она станет доступна заведующему складом для приёмки по накладной.</>}
        onCancel={() => setSelected(null)}
        onConfirm={() => void confirmPayment()}
      />}
    </section>
  );
}
