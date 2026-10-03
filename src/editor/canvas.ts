import type { Flowchart, Sequence } from '../core';

/**
 * Mermaid's drawing, marked so a click can be traced back to the text. Mermaid draws; this only
 * adds `data-mmde-*` attributes and a wide invisible copy of each arrow to make it easy to hit.
 */

export type Selection =
  | { kind: 'node'; id: string } | { kind: 'edge'; index: number } | { kind: 'group'; id: string }
  | { kind: 'step'; line: number } | { kind: 'participant'; id: string };

export function markFlowchart(root: HTMLElement, flow: Flowchart) {
  const svg = root.querySelector('svg');
  if (!svg) return;
  const prefix = `${svg.id}-`;
  for (const node of svg.querySelectorAll<SVGGElement>('g.node')) {
    const id = node.id.startsWith(`${prefix}flowchart-`) ? node.id.slice(prefix.length + 'flowchart-'.length).replace(/-\d+$/, '') : '';
    if (flow.nodes.some(one => one.id === id)) node.setAttribute('data-mmde-node', id);
  }
  // Arrows are drawn in the order they are written. When Mermaid's own name for one disagrees, the
  // name wins: it says which two nodes the arrow joins.
  const paths = [...svg.querySelectorAll<SVGPathElement>('path[data-edge="true"]')], used = new Set<number>(), byName = new Map<string, number>();
  paths.forEach((path, n) => {
    const name = path.getAttribute('data-id') ?? '';
    const fits = (index: number) => !used.has(index) && !!flow.edges[index] && name.startsWith(`L_${flow.edges[index].from}_${flow.edges[index].to}_`);
    const index = fits(n) ? n : flow.edges.findIndex((_, each) => fits(each));
    if (index < 0) return;
    used.add(index); byName.set(name, index);
    path.setAttribute('data-mmde-edge', String(index));
    const hit = path.cloneNode() as SVGPathElement;
    for (const attribute of ['id', 'marker-end', 'marker-start', 'style', 'data-id', 'data-edge']) hit.removeAttribute(attribute);
    hit.setAttribute('class', 'mmde-hit');
    path.parentNode!.insertBefore(hit, path.nextSibling);
  });
  for (const text of svg.querySelectorAll<SVGGElement>('g.edgeLabel g.label[data-id]')) {
    const index = byName.get(text.getAttribute('data-id')!);
    if (index !== undefined) text.closest('g.edgeLabel')!.setAttribute('data-mmde-edge', String(index));
  }
  for (const cluster of svg.querySelectorAll<SVGGElement>('g.cluster')) {
    const id = cluster.id.startsWith(prefix) ? cluster.id.slice(prefix.length) : cluster.id, title = cluster.textContent?.trim();
    const group = flow.groups.find(one => one.id === id) ?? flow.groups.find(one => one.title === title);
    if (group) cluster.setAttribute('data-mmde-group', group.id);
  }
}

export function markSequence(root: HTMLElement, sequence: Sequence) {
  const svg = root.querySelector('svg');
  if (!svg) return;
  const lines = (kind: string) => sequence.items.filter(item => item.kind === kind).map(item => item.line);
  const stamp = (selector: string, kind: string) => {
    const of = lines(kind);
    svg.querySelectorAll(selector).forEach((element, n) => { if (of[n] !== undefined) element.setAttribute('data-mmde-step', String(of[n])); });
  };
  // Messages and notes are drawn in the order they are written.
  stamp('[class^="messageLine"]', 'message'); stamp('.messageText', 'message');
  stamp('rect.note', 'note'); stamp('.noteText', 'note');
  for (const actor of svg.querySelectorAll('rect.actor[name], g.actor-man[name]')) actor.setAttribute('data-mmde-participant', actor.getAttribute('name')!);
}

/** What a click landed on, from the marks above. */
export function pick(target: EventTarget | null): Selection | null {
  if (!(target instanceof Element)) return null;
  const hit = target.closest('[data-mmde-node],[data-mmde-edge],[data-mmde-step],[data-mmde-participant],[data-mmde-group]');
  if (!hit) return null;
  const at = (name: string) => hit.getAttribute(`data-mmde-${name}`);
  if (at('node') !== null) return { kind: 'node', id: at('node')! };
  if (at('edge') !== null) return { kind: 'edge', index: Number(at('edge')) };
  if (at('step') !== null) return { kind: 'step', line: Number(at('step')) };
  if (at('participant') !== null) return { kind: 'participant', id: at('participant')! };
  return { kind: 'group', id: at('group')! };
}

export function highlight(root: HTMLElement, selection: Selection | null) {
  root.querySelectorAll('.mmde-selected').forEach(element => element.classList.remove('mmde-selected'));
  if (!selection) return;
  const selector = selection.kind === 'node' ? `[data-mmde-node="${CSS.escape(selection.id)}"]`
    : selection.kind === 'edge' ? `[data-mmde-edge="${selection.index}"]`
    : selection.kind === 'group' ? `[data-mmde-group="${CSS.escape(selection.id)}"]`
    : selection.kind === 'step' ? `[data-mmde-step="${selection.line}"]`
    : `[data-mmde-participant="${CSS.escape(selection.id)}"]`;
  root.querySelectorAll(selector).forEach(element => element.classList.add('mmde-selected'));
}
