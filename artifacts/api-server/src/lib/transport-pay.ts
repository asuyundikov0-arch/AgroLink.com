const MAX_CENTS = 99_999_999_999_999n;

function scaled(value: number, scale: number, label: string): bigint {
  const n = value * scale;
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(n))
    || Math.abs(n - Math.round(n)) > 0.00001) {
    throw new Error(`Укажите корректное значение: ${label}.`);
  }
  return BigInt(Math.round(n));
}

/** Round only the final salary, not tonnage, distance or intermediate ton-kilometres. */
export function transportPay(
  basis: string, quantityKg: number, distanceKm: number,
  input: { rateKzt?: number; tariffPerTonKm?: number },
) {
  let cents: bigint;
  if (basis === "ton_km") {
    if (!Number.isSafeInteger(quantityKg) || quantityKg <= 0) throw new Error("Укажите положительный тоннаж.");
    const distance = scaled(distanceKm, 1000, "расстояние — до 3 знаков после запятой");
    const tariff = scaled(input.tariffPerTonKm ?? 0, 10000, "тариф ₸/т·км — до 4 знаков после запятой");
    cents = (BigInt(quantityKg) * distance * tariff + 50_000_000n) / 100_000_000n;
  } else {
    cents = scaled(input.rateKzt ?? 0, 100, "оплата за рейс — до 2 знаков после запятой");
  }
  if (cents <= 0n || cents > MAX_CENTS) throw new Error("Сумма зарплаты должна быть от 0,01 до 999 999 999 999,99 ₸.");
  return (Number(cents) / 100).toFixed(2);
}
