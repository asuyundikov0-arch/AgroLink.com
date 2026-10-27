export const standardFieldOperations = [
  "Посев", "Культивация", "Предпосевная культивация", "Дискование", "Боронование",
  "Прикатывание", "Внесение удобрений", "Обработка СЗР", "Гербицидная обработка",
  "Десикация", "Уборка", "Лущение стерни", "Снегозадержание",
];

export function fieldOperationSuggestions(existing: { name: string }[]) {
  return [...new Set([...standardFieldOperations, ...existing.map((operation) => operation.name)])]
    .sort((a, b) => a.localeCompare(b, "ru"));
}
