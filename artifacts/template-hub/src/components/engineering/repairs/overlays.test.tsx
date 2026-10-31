import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Drawer, OverlayForm, OverlayPortal } from "./shared";

test("repair overlay retains a single native form around fields and submit footer", () => {
  const html = renderToStaticMarkup(
    <OverlayForm noValidate>
      <Drawer title="План ремонта" onClose={() => {}} testId="test-repair-overlay"
        footer={<button type="submit">Сохранить</button>}>
        <input name="responsible" />
      </Drawer>
    </OverlayForm>,
  );
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
  assert.ok(html.startsWith("<form"));
  assert.ok(html.endsWith("</form>"));
  assert.match(html, /<input name="responsible"/);
  assert.match(html, /<button type="submit">Сохранить<\/button>/);
});

test("repair overlay portals the complete form outside blurred and transformed containers", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const body = { nodeType: 1 } as HTMLElement;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body } });
  try {
    const onSubmit = () => {};
    const wrapper = OverlayForm({ onSubmit, children: <button type="submit">Save</button> });
    const form = wrapper.props.children;
    const portal = OverlayPortal({ children: form }) as unknown as { containerInfo: HTMLElement; children: typeof form };
    assert.equal(portal.containerInfo, body);
    assert.equal(portal.children.type, "form");
    assert.equal(portal.children.props.onSubmit, onSubmit);
    assert.equal(portal.children.props.children.props.type, "submit");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
