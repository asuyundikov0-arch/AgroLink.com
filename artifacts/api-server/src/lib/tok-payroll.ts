export const tokBasisLabels: Record<string, string> = {
  shift: "смен", hour: "часов", ton: "тонн", fixed: "фиксированная сумма",
};

/** Quantities have three decimals; rates have two. Round the final amount only. */
export function calculateTokPay(basis: string, quantity: number, rateKzt: number): string {
  if (!Object.hasOwn(tokBasisLabels, basis)) throw new Error("Выберите способ расчёта.");
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || Number(quantity.toFixed(3)) !== quantity) {
    throw new Error("Количество должно быть положительным, с точностью до 0,001.");
  }
  if (!Number.isFinite(rateKzt) || rateKzt <= 0 || rateKzt > 1_000_000_000 || Number(rateKzt.toFixed(2)) !== rateKzt) {
    throw new Error("Укажите положительную расценку с точностью до 0,01 ₸.");
  }
  if (basis === "fixed" && quantity !== 1) throw new Error("Для фиксированной суммы количество должно быть равно 1.");
  const amountCents = (BigInt(Math.round(quantity * 1000)) * BigInt(Math.round(rateKzt * 100)) + 500n) / 1000n;
  if (amountCents < 1n || amountCents > 99999999999999n) throw new Error("Итог должен составлять от 0,01 до 999 999 999 999,99 ₸.");
  return `${amountCents / 100n}.${String(amountCents % 100n).padStart(2, "0")}`;
}
