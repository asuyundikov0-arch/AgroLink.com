import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  approveRequest, avgCost, computeBalances, empHolder, fulfillRequest, holderName, issue, receive, rejectRequest,
  returnToWarehouse, submitRequest, transfer, type DemoState, type Result, type Tracking,
} from '@/demo/engine';
import { fmtKzt, today, useDemo, useDemoState } from '@/demo/store';
import { Field, HolderOptions, NativeSelect } from './bits';

const toNum = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

function useSubmit(onDone: () => void) {
  const { run } = useDemo();
  const { toast } = useToast();
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = (fn: (s: DemoState) => Result) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const r = run(fn);
    if (r.ok) {
      toast({ title: 'Готово (демо)', description: r.message });
      onDone();
    } else {
      setError(r.error);
      busy.current = false;
      setPending(false);
    }
  };
  return { submit, error, setError, pending };
}

function Shell({ title, desc, children, error, pending, submitLabel, onSubmit, onClose, destructive }: {
  title: string; desc: string; children: ReactNode; error: string | null; pending: boolean; submitLabel: string;
  onSubmit: () => void; onClose: () => void; destructive?: boolean;
}) {
  const handle = (e: FormEvent) => { e.preventDefault(); onSubmit(); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-4" noValidate>
          {children}
          {error && (
            <div role="alert" data-testid="text-dialog-error" className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-dialog-cancel">Отмена</Button>
            <Button type="submit" disabled={pending} variant={destructive ? 'destructive' : 'default'} data-testid="button-dialog-submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemSelect({ s, value, onChange, filter }: { s: DemoState; value: string; onChange: (v: string) => void; filter?: (id: string) => boolean }) {
  const items = s.items.filter((i) => !filter || filter(i.id));
  return (
    <NativeSelect id="f-item" value={value} onChange={(e) => onChange(e.target.value)} data-testid="select-item">
      <option value="">Выберите позицию</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
    </NativeSelect>
  );
}

function Avail({ n, unit }: { n: number; unit: string }) {
  return <span>Доступно: <b className="num">{n}</b> {unit}</span>;
}

// ---------- receipt ----------
function ReceiptDialog({ initialItemId, onClose }: { initialItemId?: string; onClose: () => void }) {
  const s = useDemoState();
  const { role } = useDemo();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [itemId, setItemId] = useState(initialItemId ?? '');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Хозтовары');
  const [unit, setUnit] = useState('шт');
  const [tracking, setTracking] = useState<Tracking>('reusable');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [to, setTo] = useState(`wh:${s.warehouses[0]?.id ?? ''}`);
  const { submit, error, setError, pending } = useSubmit(onClose);
  const item = s.items.find((i) => i.id === itemId);
  const q = toNum(qty), p = toNum(price);
  return (
    <Shell title="Приход по счёту" desc="Поступление на склад. Номер счёта или накладной обязателен." error={error} pending={pending} submitLabel="Провести приход" onClose={onClose}
      onSubmit={() => {
        if (mode === 'existing' && !itemId) return setError('Выберите позицию');
        submit((st) => receive(st, role, {
          itemId: mode === 'existing' ? itemId : undefined,
          newItem: mode === 'new' ? { sku, name, category, unit, tracking } : undefined,
          quantity: q, unitCostKzt: p, reference, toHolder: to, date: today(), note,
        }));
      }}>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Тип позиции">
        {(['existing', 'new'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} data-testid={`toggle-receipt-${m}`}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
            {m === 'existing' ? 'Существующая позиция' : 'Новая позиция'}
          </button>
        ))}
      </div>
      {mode === 'existing' ? (
        <Field label="Позиция" htmlFor="f-item"><ItemSelect s={s} value={itemId} onChange={setItemId} /></Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Артикул" htmlFor="f-sku"><Input id="f-sku" value={sku} onChange={(e) => setSku(e.target.value)} data-testid="input-sku" /></Field>
          <Field label="Единица" htmlFor="f-unit"><Input id="f-unit" value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="input-unit" /></Field>
          <div className="col-span-2"><Field label="Наименование" htmlFor="f-name"><Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-name" /></Field></div>
          <Field label="Категория" htmlFor="f-cat">
            <NativeSelect id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="select-category">
              {['Мебель', 'Компьютеры', 'Оргтехника', 'Инструмент', 'СИЗ', 'Канцелярия', 'Хозтовары'].map((c) => <option key={c}>{c}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Учёт" htmlFor="f-track">
            <NativeSelect id="f-track" value={tracking} onChange={(e) => setTracking(e.target.value as Tracking)} data-testid="select-tracking">
              <option value="reusable">Многоразовое (подотчёт)</option>
              <option value="consumable">Расходное</option>
            </NativeSelect>
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Количество" htmlFor="f-qty" hint={item ? item.unit : undefined}><Input id="f-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="input-quantity" /></Field>
        <Field label="Цена за ед., ₸" htmlFor="f-price" hint={item ? `Учётная сейчас: ${fmtKzt(avgCost(s, item.id))}` : undefined}><Input id="f-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-price" /></Field>
      </div>
      {Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0 && <div className="text-sm">Сумма по счёту: <b className="num">{fmtKzt(q * p)}</b></div>}
      <Field label="Счёт / накладная №" htmlFor="f-ref"><Input id="f-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Например, СФ-2207" data-testid="input-reference" /></Field>
      <Field label="Склад" htmlFor="f-to"><NativeSelect id="f-to" value={to} onChange={(e) => setTo(e.target.value)} data-testid="select-to"><HolderOptions s={s} kinds={['warehouse']} /></NativeSelect></Field>
      <Field label="Примечание" htmlFor="f-note"><Input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-note" /></Field>
    </Shell>
  );
}

// ---------- issue ----------
function IssueDialog({ initialItemId, initialFrom, onClose }: { initialItemId?: string; initialFrom?: string; onClose: () => void }) {
  const s = useDemoState();
  const { role } = useDemo();
  const [itemId, setItemId] = useState(initialItemId ?? '');
  const [from, setFrom] = useState(initialFrom ?? `wh:${s.warehouses[0]?.id}`);
  const [emp, setEmp] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const { submit, error, setError, pending } = useSubmit(onClose);
  const b = useMemo(() => computeBalances(s), [s]);
  const item = s.items.find((i) => i.id === itemId);
  const avail = b.get(itemId)?.get(from) ?? 0;
  return (
    <Shell title="Выдача сотруднику" desc="Многоразовое имущество переходит в подотчёт и остаётся активом компании. Расходное — списывается в затраты подразделения." error={error} pending={pending} submitLabel="Выдать" onClose={onClose}
      onSubmit={() => {
        if (!itemId || !emp) return setError('Выберите позицию и сотрудника');
        submit((st) => issue(st, role, { itemId, quantity: toNum(qty), fromHolder: from, employeeId: emp, date: today(), note }));
      }}>
      <Field label="Позиция" htmlFor="f-item"><ItemSelect s={s} value={itemId} onChange={setItemId} /></Field>
      <Field label="Откуда" htmlFor="f-from" hint={item && <Avail n={avail} unit={item.unit} />}>
        <NativeSelect id="f-from" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="select-from"><HolderOptions s={s} kinds={['warehouse', 'location']} /></NativeSelect>
      </Field>
      <Field label="Сотрудник" htmlFor="f-emp">
        <NativeSelect id="f-emp" value={emp} onChange={(e) => setEmp(e.target.value)} data-testid="select-employee">
          <option value="">Выберите сотрудника</option>
          {s.employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Количество" htmlFor="f-qty"><Input id="f-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="input-quantity" /></Field>
      <Field label="Примечание" htmlFor="f-note"><Input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-note" /></Field>
    </Shell>
  );
}

// ---------- transfer ----------
function TransferDialog({ initialItemId, initialFrom, onClose }: { initialItemId?: string; initialFrom?: string; onClose: () => void }) {
  const s = useDemoState();
  const { role } = useDemo();
  const [itemId, setItemId] = useState(initialItemId ?? '');
  const [from, setFrom] = useState(initialFrom ?? `wh:${s.warehouses[0]?.id}`);
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const { submit, error, setError, pending } = useSubmit(onClose);
  const b = useMemo(() => computeBalances(s), [s]);
  const item = s.items.find((i) => i.id === itemId);
  return (
    <Shell title="Перемещение между держателями" desc="Меняется только держатель. Стоимость имущества компании не меняется." error={error} pending={pending} submitLabel="Переместить" onClose={onClose}
      onSubmit={() => {
        if (!itemId || !to) return setError('Выберите позицию и получателя');
        submit((st) => transfer(st, role, { itemId, quantity: toNum(qty), fromHolder: from, toHolder: to, date: today(), note }));
      }}>
      <Field label="Позиция" htmlFor="f-item"><ItemSelect s={s} value={itemId} onChange={setItemId} /></Field>
      <Field label="Откуда" htmlFor="f-from" hint={item && <Avail n={b.get(itemId)?.get(from) ?? 0} unit={item.unit} />}>
        <NativeSelect id="f-from" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="select-from"><HolderOptions s={s} kinds={['warehouse', 'location', 'employee']} /></NativeSelect>
      </Field>
      <Field label="Куда" htmlFor="f-to">
        <NativeSelect id="f-to" value={to} onChange={(e) => setTo(e.target.value)} data-testid="select-to">
          <option value="">Выберите получателя</option>
          <HolderOptions s={s} kinds={['warehouse', 'location', 'employee']} exclude={from} />
        </NativeSelect>
      </Field>
      <Field label="Количество" htmlFor="f-qty"><Input id="f-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="input-quantity" /></Field>
      <Field label="Примечание" htmlFor="f-note"><Input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-note" /></Field>
    </Shell>
  );
}

// ---------- return ----------
function ReturnDialog({ initialItemId, initialEmp, onClose }: { initialItemId?: string; initialEmp?: string; onClose: () => void }) {
  const s = useDemoState();
  const { role } = useDemo();
  const [emp, setEmp] = useState(initialEmp ?? '');
  const [itemId, setItemId] = useState(initialItemId ?? '');
  const [to, setTo] = useState(`wh:${s.warehouses[0]?.id}`);
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const { submit, error, setError, pending } = useSubmit(onClose);
  const b = useMemo(() => computeBalances(s), [s]);
  const held = (id: string) => (emp ? (b.get(id)?.get(empHolder(emp)) ?? 0) > 0 : false);
  const item = s.items.find((i) => i.id === itemId);
  return (
    <Shell title="Возврат на склад" desc="Снимает имущество с подотчёта сотрудника. Повторный учёт стоимости не возникает." error={error} pending={pending} submitLabel="Принять возврат" onClose={onClose}
      onSubmit={() => {
        if (!itemId || !emp) return setError('Выберите сотрудника и позицию');
        submit((st) => returnToWarehouse(st, role, { itemId, quantity: toNum(qty), employeeId: emp, toHolder: to, date: today(), note }));
      }}>
      <Field label="Сотрудник" htmlFor="f-emp">
        <NativeSelect id="f-emp" value={emp} onChange={(e) => { setEmp(e.target.value); setItemId(''); }} data-testid="select-employee">
          <option value="">Выберите сотрудника</option>
          {s.employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Позиция в подотчёте" htmlFor="f-item" hint={item && emp ? <span>На руках: <b className="num">{b.get(itemId)?.get(empHolder(emp)) ?? 0}</b> {item.unit}</span> : emp ? undefined : 'Сначала выберите сотрудника'}>
        <ItemSelect s={s} value={itemId} onChange={setItemId} filter={held} />
      </Field>
      <Field label="На склад" htmlFor="f-to"><NativeSelect id="f-to" value={to} onChange={(e) => setTo(e.target.value)} data-testid="select-to"><HolderOptions s={s} kinds={['warehouse']} /></NativeSelect></Field>
      <Field label="Количество" htmlFor="f-qty"><Input id="f-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="input-quantity" /></Field>
      <Field label="Состояние / примечание" htmlFor="f-note"><Input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-note" /></Field>
    </Shell>
  );
}

// ---------- request ----------
function RequestDialog({ type, initialItemId, initialSource, onClose }: { type: 'supply' | 'writeoff'; initialItemId?: string; initialSource?: string; onClose: () => void }) {
  const s = useDemoState();
  const { role, actingEmployeeId } = useDemo();
  const [itemId, setItemId] = useState(initialItemId ?? '');
  const [source, setSource] = useState(initialSource ?? '');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const { submit, error, setError, pending } = useSubmit(onClose);
  const b = useMemo(() => computeBalances(s), [s]);
  const emp = s.employees.find((e) => e.id === actingEmployeeId);
  const item = s.items.find((i) => i.id === itemId);
  const wh = `wh:${s.warehouses[0]?.id}`;
  return (
    <Shell
      title={type === 'supply' ? 'Заявка на выдачу' : 'Заявка на списание'}
      desc={type === 'supply' ? 'Заявка уйдёт директору. После согласования кладовщик выдаст со склада.' : 'Директор согласует списание — только тогда остаток уменьшится, ровно один раз.'}
      error={error} pending={pending} submitLabel="Отправить директору" onClose={onClose}
      onSubmit={() => {
        if (!itemId) return setError('Выберите позицию');
        if (type === 'writeoff' && !source) return setError('Укажите, где находится имущество');
        submit((st) => submitRequest(st, role, { type, itemId, quantity: toNum(qty), employeeId: actingEmployeeId, reason, sourceHolderId: type === 'writeoff' ? source : undefined, date: today() }));
      }}>
      <div className="rounded-md bg-muted px-3 py-2 text-sm">Заявитель: <b>{emp?.name}</b>, {emp?.position}</div>
      <Field label="Позиция" htmlFor="f-item" hint={item && type === 'supply' ? <span>На складе сейчас: <b className="num">{b.get(itemId)?.get(wh) ?? 0}</b> {item.unit}</span> : undefined}>
        <ItemSelect s={s} value={itemId} onChange={setItemId} />
      </Field>
      {type === 'writeoff' && (
        <Field label="Где находится" htmlFor="f-src" hint={item && source ? <Avail n={b.get(itemId)?.get(source) ?? 0} unit={item.unit} /> : undefined}>
          <NativeSelect id="f-src" value={source} onChange={(e) => setSource(e.target.value)} data-testid="select-source">
            <option value="">Выберите держателя</option>
            <HolderOptions s={s} kinds={['warehouse', 'location', 'employee']} />
          </NativeSelect>
        </Field>
      )}
      <Field label="Количество" htmlFor="f-qty"><Input id="f-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="input-quantity" /></Field>
      <Field label="Причина" htmlFor="f-reason"><Textarea id="f-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={type === 'writeoff' ? 'Например: сломана крестовина, ремонт нецелесообразен' : 'Для чего нужно'} data-testid="input-reason" /></Field>
    </Shell>
  );
}

// ---------- decide ----------
function DecideDialog({ requestId, decision, onClose }: { requestId: string; decision: 'approve' | 'reject'; onClose: () => void }) {
  const s = useDemoState();
  const { role } = useDemo();
  const [note, setNote] = useState('');
  const { submit, error, pending } = useSubmit(onClose);
  const req = s.requests.find((r) => r.id === requestId);
  if (!req) return null;
  const item = s.items.find((i) => i.id === req.itemId);
  const approve = decision === 'approve';
  const effect = req.type === 'writeoff'
    ? approve ? `Будет списано ${req.quantity} ${item?.unit} у держателя «${holderName(s, req.sourceHolderId ?? null)}» на ${fmtKzt(req.quantity * avgCost(s, req.itemId))}.` : 'Остатки не изменятся.'
    : approve ? 'Заявка перейдёт кладовщику на выдачу. Остатки изменятся только при выдаче.' : 'Заявка будет закрыта без выдачи.';
  return (
    <Shell title={`${approve ? 'Согласовать' : 'Отклонить'} ${req.id}`} desc={effect} error={error} pending={pending}
      submitLabel={approve ? (req.type === 'writeoff' ? 'Согласовать и списать' : 'Согласовать') : 'Отклонить'} destructive={!approve || req.type === 'writeoff'} onClose={onClose}
      onSubmit={() => submit((st) => (approve ? approveRequest(st, role, requestId, today(), note) : rejectRequest(st, role, requestId, today(), note)))}>
      <div className="rounded-md border px-3 py-2 text-sm">
        <div className="font-semibold">{item?.name} × <span className="num">{req.quantity}</span> {item?.unit}</div>
        <div className="text-muted-foreground">{s.employees.find((e) => e.id === req.employeeId)?.name}: {req.reason}</div>
      </div>
      <Field label="Комментарий директора" htmlFor="f-dn"><Input id="f-dn" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-decision-note" /></Field>
    </Shell>
  );
}

// ---------- fulfill ----------
function FulfillDialog({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const s = useDemoState();
  const { role } = useDemo();
  const [from, setFrom] = useState(`wh:${s.warehouses[0]?.id}`);
  const { submit, error, pending } = useSubmit(onClose);
  const b = useMemo(() => computeBalances(s), [s]);
  const req = s.requests.find((r) => r.id === requestId);
  if (!req) return null;
  const item = s.items.find((i) => i.id === req.itemId);
  const avail = b.get(req.itemId)?.get(from) ?? 0;
  return (
    <Shell title={`Исполнить ${req.id}`} desc="Выдача по согласованной заявке. Повторное исполнение заблокировано." error={error} pending={pending} submitLabel="Выдать по заявке" onClose={onClose}
      onSubmit={() => submit((st) => fulfillRequest(st, role, requestId, from, today()))}>
      <div className="rounded-md border px-3 py-2 text-sm">
        <div className="font-semibold">{item?.name} × <span className="num">{req.quantity}</span> {item?.unit}</div>
        <div className="text-muted-foreground">Получатель: {s.employees.find((e) => e.id === req.employeeId)?.name}</div>
      </div>
      <Field label="Со склада / локации" htmlFor="f-from" hint={<span className={avail < req.quantity ? 'font-semibold text-destructive' : ''}>Доступно: <b className="num">{avail}</b> из <span className="num">{req.quantity}</span> требуемых</span>}>
        <NativeSelect id="f-from" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="select-from"><HolderOptions s={s} kinds={['warehouse', 'location']} /></NativeSelect>
      </Field>
    </Shell>
  );
}

function ResetDialog({ onClose }: { onClose: () => void }) {
  const { resetDemo } = useDemo();
  const { toast } = useToast();
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Сбросить демонстрационные данные?</AlertDialogTitle>
          <AlertDialogDescription>
            Будут восстановлены исходные синтетические примеры. Это касается только данных демо в этом браузере
            (ключ agrolink.company-ecosystem-demo.v1). Рабочая система AgroLink не затрагивается.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-reset-cancel">Отмена</AlertDialogCancel>
          <AlertDialogAction data-testid="button-reset-confirm" onClick={() => { resetDemo(); toast({ title: 'Демо сброшено' }); onClose(); }}>Сбросить демо</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DialogHost() {
  const { dialog: d, setDialog, state } = useDemo();
  const close = () => setDialog(null);
  if (!d) return null;
  if (d.kind === 'reset') return <ResetDialog onClose={close} />;
  if (!state) return null;
  switch (d.kind) {
    case 'receipt': return <ReceiptDialog initialItemId={d.itemId} onClose={close} />;
    case 'issue': return <IssueDialog initialItemId={d.itemId} initialFrom={d.fromHolder} onClose={close} />;
    case 'transfer': return <TransferDialog initialItemId={d.itemId} initialFrom={d.fromHolder} onClose={close} />;
    case 'return': return <ReturnDialog initialItemId={d.itemId} initialEmp={d.employeeId} onClose={close} />;
    case 'request': return <RequestDialog type={d.type} initialItemId={d.itemId} initialSource={d.sourceHolderId} onClose={close} />;
    case 'decide': return <DecideDialog requestId={d.requestId} decision={d.decision} onClose={close} />;
    case 'fulfill': return <FulfillDialog requestId={d.requestId} onClose={close} />;
  }
}
