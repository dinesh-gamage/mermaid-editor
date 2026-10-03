/**
 * The editor driven in a real browser, where Mermaid can draw: `?selftest` on the showcase.
 * Unit tests cover the text operations; this covers the part they cannot, which is whether a click
 * on Mermaid's drawing reaches the right line of text.
 */
const wait = (ms: number) => new Promise(done => setTimeout(done, ms));
async function until<T>(what: string, check: () => T | null | undefined | false, ms = 8000): Promise<T> {
  for (const start = Date.now(); Date.now() - start < ms;) { const found = check(); if (found) return found; await wait(50); }
  throw new Error(`timed out waiting for ${what}`);
}
const $ = (selector: string) => document.querySelector(selector);
const all = (selector: string) => [...document.querySelectorAll(selector)];
const value = () => $('#value')!.textContent ?? '';
const centre = (element: Element) => { const box = element.getBoundingClientRect(); return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }; };
const pointer = (type: string, element: Element, at = centre(element)) =>
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...at }));
const click = (element: Element) => { pointer('pointerdown', element); pointer('pointerup', element); };
/** Type into a React input: set the value the way the browser would, then say it changed. */
function type(input: HTMLInputElement, text: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function selfTest() {
  const out = await until('the page', () => $('#selftest')), lines: string[] = [];
  const check = (name: string, ok: unknown, detail = '') => { lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); out.textContent = lines.join('\n'); };
  try {
    // Flowchart: every node, arrow and group in the drawing is traced to the text.
    await until('the flowchart', () => $('.mmde-drawing svg') && all('[data-mmde-node]').length);
    check('flowchart: 6 nodes marked', all('g[data-mmde-node]').length === 6, String(all('g[data-mmde-node]').length));
    check('flowchart: 5 arrows marked', all('path[data-mmde-edge]:not(.mmde-hit)').length === 5, String(all('path[data-mmde-edge]:not(.mmde-hit)').length));
    check('flowchart: the group is marked', !!$('[data-mmde-group="billing"]'));
    check('flowchart: the labelled arrow\'s label is marked', !!$('g.edgeLabel[data-mmde-edge="0"]'));

    click($('[data-mmde-node="api"]')!);
    const label = await until('the node form', () => $('.mmde-side input') as HTMLInputElement | null);
    check('click a node: its label is in the form', label.value === 'API', label.value);
    type(label, 'Public API');
    await until('the renamed node in the text', () => value().includes('api{{Public API}}'));
    check('rename: one line of text changed', value().includes('%% the order path') && value().includes('class api hot'));
    await until('the redrawn node', () => $('[data-mmde-node="api"]')?.textContent?.includes('Public API'));
    check('rename: the drawing follows', true);

    const undo = all('.mmde-bar .mmde-btn').find(one => one.textContent === 'Undo') as HTMLButtonElement;
    undo.click();
    await until('the label undone', () => value().includes('api{{API}}'));
    check('undo: typing a label is one step', !value().includes('Public'));
    (all('.mmde-bar .mmde-btn').find(one => one.textContent === 'Redo') as HTMLButtonElement).click();
    await until('the label redone', () => value().includes('api{{Public API}}'));
    check('redo brings it back', true);
    await until('the redrawn node again', () => $('[data-mmde-node="api"]')?.textContent?.includes('Public API'));

    // Drag from one node to another.
    const from = $('[data-mmde-node="web"]')!, to = $('[data-mmde-node="db"]')!;
    pointer('pointerdown', from);
    pointer('pointermove', from, { clientX: centre(from).clientX + 20, clientY: centre(from).clientY + 20 });
    await wait(50);
    check('drag: a line follows the pointer', !!$('.mmde-rubber line'));
    pointer('pointermove', to); pointer('pointerup', to);
    await until('the new arrow in the text', () => value().includes('web --> db'));
    check('drag from web to db adds "web --> db"', true);
    await until('six arrows drawn', () => all('path[data-mmde-edge]:not(.mmde-hit)').length === 6);

    click($('path.mmde-hit[data-mmde-edge="2"]')!);
    await until('the arrow form', () => $('.mmde-side h3')?.textContent === 'Arrow');
    check('click an arrow: the form names its ends', $('.mmde-side .mmde-hint')?.textContent === 'Public API to Queue', $('.mmde-side .mmde-hint')?.textContent ?? '');

    // The middle of a group is covered by its nodes, so click just inside its corner, as a person would.
    const frame = $('[data-mmde-group="billing"] rect')!, corner = { clientX: frame.getBoundingClientRect().left + 6, clientY: frame.getBoundingClientRect().top + 6 };
    pointer('pointerdown', frame, corner); pointer('pointerup', frame, corner);
    await until('the group form', () => $('.mmde-side h3')?.textContent === 'Group');
    check('click a group: its title is in the form', ($('.mmde-side input') as HTMLInputElement).value === 'Billing');

    // Sequence diagram.
    ($('#sample-Sequence') as HTMLButtonElement).click();
    await until('the sequence diagram', () => all('[data-mmde-step]').length && all('[data-mmde-participant]').length);
    check('sequence: 4 message lines marked', all('[class^="messageLine"][data-mmde-step]').length === 4, String(all('[class^="messageLine"][data-mmde-step]').length));
    check('sequence: the note is marked', all('rect.note[data-mmde-step]').length === 1);
    check('sequence: participants are marked', new Set(all('[data-mmde-participant]').map(one => one.getAttribute('data-mmde-participant'))).size === 3);
    const second = all('.messageText[data-mmde-step]')[1];
    click(second);
    const row = await until('the selected step', () => $('.mmde-row.mmde-on'));
    const text = row.querySelector('input') as HTMLInputElement;
    check('click a message: its row is selected', text.value === 'POST /order', text.value);
    type(text, 'POST /orders');
    await until('the changed message in the text', () => value().includes('W->>+API: POST /orders'));
    check('edit a message: its line changed', true);

    // A kind the editor does not edit visually.
    ($('#sample-State') as HTMLButtonElement).click();
    await until('the state diagram as text', () => $('.mmde-text') && $('.mmde-drawing svg'));
    check('another kind: text beside its drawing', ($('[role=tab][aria-selected=true]')?.textContent) === 'Text');
  } catch (error) { check('self test ran to the end', false, (error as Error).message); }
  lines.push(lines.some(line => line.startsWith('FAIL')) ? 'RESULT: FAILED' : 'RESULT: PASSED');
  out.textContent = lines.join('\n');
}
