import type { DemoState } from './engine.ts';

export function createSeed(): DemoState {
  return {
    schema: 'agrolink.company-ecosystem-demo',
    version: 1,
    seq: 20,
    departments: [
      { id: 'DEP-AHO', name: 'АХО и имущество' },
      { id: 'DEP-AGRO', name: 'Агроблок' },
      { id: 'DEP-ENG', name: 'Инженерная служба' },
      { id: 'DEP-ECO', name: 'Экономика и финансы' },
      { id: 'DEP-HR', name: 'Кадры' },
      { id: 'DEP-IT', name: 'ИТ' },
    ],
    employees: [
      { id: 'EMP-01', name: 'Сотрудник 01', departmentId: 'DEP-AHO', position: 'Кладовщик АХО' },
      { id: 'EMP-02', name: 'Сотрудник 02', departmentId: 'DEP-AGRO', position: 'Агроном' },
      { id: 'EMP-03', name: 'Сотрудник 03', departmentId: 'DEP-ECO', position: 'Экономист' },
      { id: 'EMP-04', name: 'Сотрудник 04', departmentId: 'DEP-HR', position: 'Специалист по кадрам' },
      { id: 'EMP-05', name: 'Сотрудник 05', departmentId: 'DEP-ENG', position: 'Механик' },
      { id: 'EMP-06', name: 'Сотрудник 06', departmentId: 'DEP-ENG', position: 'Инженер-энергетик' },
      { id: 'EMP-07', name: 'Сотрудник 07', departmentId: 'DEP-ECO', position: 'Бухгалтер' },
      { id: 'EMP-08', name: 'Сотрудник 08', departmentId: 'DEP-IT', position: 'Системный администратор' },
      { id: 'EMP-09', name: 'Сотрудник 09', departmentId: 'DEP-AGRO', position: 'Бригадир полевой бригады' },
      { id: 'EMP-10', name: 'Сотрудник 10', departmentId: 'DEP-AHO', position: 'Менеджер АХО' },
    ],
    warehouses: [{ id: 'WH-01', name: 'Центральный склад АХО' }],
    locations: [
      { id: 'LOC-01', name: 'Админкорпус, каб. 12', departmentId: 'DEP-ECO' },
      { id: 'LOC-02', name: 'Мехмастерская', departmentId: 'DEP-ENG' },
      { id: 'LOC-03', name: 'Полевой стан № 2', departmentId: 'DEP-AGRO' },
      { id: 'LOC-04', name: 'Серверная', departmentId: 'DEP-IT' },
    ],
    items: [
      { id: 'ITM-0001', sku: 'IT-001', name: 'Ноутбук офисный 14"', category: 'Компьютеры', unit: 'шт', tracking: 'reusable', unitCostKzt: 385000, initialBalances: { 'wh:WH-01': 3, 'emp:EMP-03': 1 } },
      { id: 'ITM-0002', sku: 'IT-002', name: 'Монитор 24"', category: 'Компьютеры', unit: 'шт', tracking: 'reusable', unitCostKzt: 78500, initialBalances: { 'wh:WH-01': 5, 'loc:LOC-01': 4 } },
      { id: 'ITM-0003', sku: 'IT-003', name: 'МФУ лазерное', category: 'Оргтехника', unit: 'шт', tracking: 'reusable', unitCostKzt: 142300, initialBalances: { 'wh:WH-01': 1, 'loc:LOC-01': 1 } },
      { id: 'ITM-0004', sku: 'FUR-001', name: 'Стул офисный', category: 'Мебель', unit: 'шт', tracking: 'reusable', unitCostKzt: 32400, initialBalances: { 'wh:WH-01': 2, 'loc:LOC-01': 14 } },
      { id: 'ITM-0005', sku: 'FUR-002', name: 'Стол письменный', category: 'Мебель', unit: 'шт', tracking: 'reusable', unitCostKzt: 58900, initialBalances: { 'loc:LOC-01': 6, 'loc:LOC-03': 2 } },
      { id: 'ITM-0006', sku: 'TL-001', name: 'Шуруповёрт аккумуляторный', category: 'Инструмент', unit: 'шт', tracking: 'reusable', unitCostKzt: 46700, initialBalances: { 'wh:WH-01': 2, 'emp:EMP-05': 1 } },
      { id: 'ITM-0007', sku: 'TL-002', name: 'Набор ключей, 72 предмета', category: 'Инструмент', unit: 'шт', tracking: 'reusable', unitCostKzt: 38200, initialBalances: { 'wh:WH-01': 1, 'loc:LOC-02': 3 } },
      { id: 'ITM-0008', sku: 'PPE-001', name: 'Перчатки рабочие', category: 'СИЗ', unit: 'пара', tracking: 'consumable', unitCostKzt: 890, initialBalances: { 'wh:WH-01': 240 } },
      { id: 'ITM-0009', sku: 'PPE-002', name: 'Каска защитная', category: 'СИЗ', unit: 'шт', tracking: 'reusable', unitCostKzt: 6450, initialBalances: { 'wh:WH-01': 18, 'emp:EMP-06': 1 } },
      { id: 'ITM-0010', sku: 'PPE-003', name: 'Костюм рабочий летний', category: 'СИЗ', unit: 'шт', tracking: 'reusable', unitCostKzt: 18600, initialBalances: { 'wh:WH-01': 12 } },
      { id: 'ITM-0011', sku: 'OFS-001', name: 'Бумага А4, 500 л.', category: 'Канцелярия', unit: 'пачка', tracking: 'consumable', unitCostKzt: 2650, initialBalances: { 'wh:WH-01': 26 } },
      { id: 'ITM-0012', sku: 'HH-001', name: 'Средство моющее, 5 л', category: 'Хозтовары', unit: 'шт', tracking: 'consumable', unitCostKzt: 4320, initialBalances: { 'wh:WH-01': 11 } },
      { id: 'ITM-0013', sku: 'IT-004', name: 'Маршрутизатор Wi-Fi', category: 'Компьютеры', unit: 'шт', tracking: 'reusable', unitCostKzt: 27800, initialBalances: { 'loc:LOC-04': 2 } },
    ],
    movements: [
      { id: 'MV-0001', itemId: 'ITM-0011', quantity: 20, fromHolder: null, toHolder: 'wh:WH-01', type: 'receipt', date: '2025-05-12', reference: 'Счёт-фактура № 418', note: 'Поставщик канцтоваров (пример)', actor: 'storekeeper', unitCostKzt: 2710 },
      { id: 'MV-0002', itemId: 'ITM-0008', quantity: 30, fromHolder: 'wh:WH-01', toHolder: 'emp:EMP-09', type: 'issue', date: '2025-05-13', reference: 'Выдача в подотчёт', note: 'Посевная бригада', actor: 'storekeeper' },
      { id: 'MV-0003', itemId: 'ITM-0002', quantity: 1, fromHolder: 'wh:WH-01', toHolder: 'loc:LOC-04', type: 'transfer', date: '2025-05-14', reference: 'Внутреннее перемещение', note: 'Рабочее место администратора', actor: 'storekeeper' },
    ],
    requests: [
      { id: 'REQ-0011', itemId: 'ITM-0010', quantity: 2, employeeId: 'EMP-09', departmentId: 'DEP-AGRO', reason: 'Новые механизаторы на уборку', status: 'pending', type: 'supply', createdAt: '2025-05-15' },
      { id: 'REQ-0012', itemId: 'ITM-0007', quantity: 1, employeeId: 'EMP-05', departmentId: 'DEP-ENG', reason: 'Сорвана головка, набор неполный', status: 'pending', type: 'writeoff', sourceHolderId: 'loc:LOC-02', createdAt: '2025-05-15' },
      { id: 'REQ-0013', itemId: 'ITM-0011', quantity: 5, employeeId: 'EMP-07', departmentId: 'DEP-ECO', reason: 'Квартальная отчётность', status: 'approved', type: 'supply', createdAt: '2025-05-14', decidedAt: '2025-05-14' },
      { id: 'REQ-0014', itemId: 'ITM-0002', quantity: 6, employeeId: 'EMP-08', departmentId: 'DEP-IT', reason: 'Оснащение диспетчерской', status: 'approved', type: 'supply', createdAt: '2025-05-13', decidedAt: '2025-05-13', decisionNote: 'Согласовано, ждать поставки' },
    ],
  };
}
