export type TimecardBasis = {
  role: "general" | "salary";
  measure: "hours" | "days";
  quantity: number;
  rate: number;
  standardDays?: number;
};

export function cardError(card: TimecardBasis): string | null {
  if (!Number.isFinite(card.quantity) || card.quantity <= 0) return "Укажите положительное фактическое время";
  if (!Number.isFinite(card.rate) || card.rate <= 0 || card.rate > 1_000_000_000) return "Укажите ставку больше нуля и не выше 1 млрд ₸";
  if (card.role === "salary") {
    if (!Number.isFinite(card.standardDays) || (card.standardDays ?? 0) <= 0) return "Нужна положительная норма месяца";
    if (card.quantity > card.standardDays!) return "Факт дней не может превышать норму";
  } else if (card.quantity > (card.measure === "days" ? 31 : 744)) {
    return card.measure === "days" ? "В октябре не больше 31 календарного дня" : "В октябре не больше 744 календарных часов";
  }
  return null;
}

export function calcCard(card: TimecardBasis): number {
  if (cardError(card)) return 0;
  const amount = card.role === "general"
    ? card.quantity * card.rate
    : card.rate * card.quantity / card.standardDays!;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
