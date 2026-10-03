/**
 * Flowcharts, read and changed line by line.
 *
 * The Mermaid text is the diagram. Reading it here never produces something to write back whole:
 * every operation changes only the lines it has to and leaves the rest exactly as written, comments,
 * styles and spacing included. A flowchart with a line this cannot follow is not edited at all;
 * `readFlowchart` says which line, and the host falls back to text.
 */

export type Shape =
  | 'rect' | 'round' | 'stadium' | 'subroutine' | 'cylinder' | 'circle' | 'double-circle' | 'diamond' | 'hexagon'
  | 'asymmetric' | 'parallelogram' | 'parallelogram-alt' | 'trapezoid' | 'trapezoid-alt';
/** Longest opener first, so `([` is never read as `(`. */
const SHAPES: [Shape, string, string][] = [
  ['double-circle', '(((', ')))'], ['circle', '((', '))'], ['stadium', '([', '])'], ['subroutine', '[[', ']]'],
  ['cylinder', '[(', ')]'], ['parallelogram', '[/', '/]'], ['parallelogram-alt', '[\\', '\\]'], ['trapezoid', '[/', '\\]'],
  ['trapezoid-alt', '[\\', '/]'], ['hexagon', '{{', '}}'], ['round', '(', ')'], ['rect', '[', ']'], ['diamond', '{', '}'],
  ['asymmetric', '>', ']'],
];
export const FLOW_SHAPES = SHAPES.map(([shape]) => shape);
const delimiters = (shape: Shape) => SHAPES.find(([name]) => name === shape)!;

export type Stroke = 'solid' | 'thick' | 'dotted' | 'invisible';
export type Head = '' | 'arrow' | 'circle' | 'cross';
export type Link = { stroke: Stroke; left: Head; right: Head; text: string; extra: number };
export const DIRECTIONS = ['TB', 'TD', 'BT', 'LR', 'RL'] as const;
export type Direction = typeof DIRECTIONS[number];

type Ref = { id: string; start: number; end: number; shape: Shape | null; text: string };
type Span = Link & { start: number; end: number };
type Statement = { groups: Ref[][]; links: Span[] };

export type FlowNode = { id: string; text: string; shape: Shape | null; group: string | null };
export type FlowEdge = { index: number; from: string; to: string; line: number; link: Link };
export type FlowGroup = { id: string; title: string; start: number; end: number; parent: string | null };
export type Flowchart = {
  lines: string[]; header: number; keyword: string; direction: Direction;
  nodes: FlowNode[]; edges: FlowEdge[]; groups: FlowGroup[];
  /** Node and edge statements by line. A line not in here is kept as written and never changed. */
  statements: Map<number, Statement>;
  /** The innermost group each statement line sits in. */
  scope: Map<number, string | null>;
};
export type Unsupported = { unsupported: string; line?: number };

const ID = /^[\p{L}\p{N}_]+(?:[-.][\p{L}\p{N}_]+)*/u;
/** Lines that are part of a flowchart but are not nodes or edges. They are kept as written. */
const KEPT = /^\s*(%%|classDef\b|class\b|style\b|click\b|linkStyle\b|direction\b|accTitle\b|accDescr\b|$)/;
const HEADER = /^(\s*)(flowchart|graph)(?:[ \t]+(TB|TD|BT|LR|RL))?\s*$/;
const SUBGRAPH = /^(\s*)subgraph\b\s*(.*?)\s*$/;
const END = /^\s*end\s*$/;

const HEADS: Record<string, Head> = { '': '', '<': 'arrow', '>': 'arrow', o: 'circle', x: 'cross' };
const unquote = (text: string) => /^".*"$/s.test(text) ? text.slice(1, -1).replaceAll('#quot;', '"') : text;
/** Text that reads the same with or without quotes is left bare; anything else is quoted. */
const label = (text: string) => /^[\p{L}\p{N} _.,!?'-]+$/u.test(text) && text.trim() === text && !/^(end|o|x)$/i.test(text) ? text : `"${text.replaceAll('"', '#quot;')}"`;

function readRef(line: string, at: number): Ref | null {
  const id = ID.exec(line.slice(at))?.[0];
  if (!id) return null;
  let end = at + id.length;
  for (const [, open] of SHAPES) {
    if (!line.startsWith(open, end)) continue;
    const from = end + open.length, closers = SHAPES.filter(([, o]) => o === open);
    let stop = -1, found: [Shape, string, string] | undefined;
    if (line[from] === '"') {
      const quote = line.indexOf('"', from + 1);
      found = quote < 0 ? undefined : closers.find(([, , close]) => line.startsWith(close, quote + 1));
      stop = quote + 1;
    } else for (const candidate of closers) {
      const index = line.indexOf(candidate[2], from);
      if (index >= 0 && (stop < 0 || index < stop)) { stop = index; found = candidate; }
    }
    if (!found) return null;
    return { id, start: at, end: stop + found[2].length, shape: found[0], text: unquote(line.slice(from, stop).trim()) };
  }
  return { id, start: at, end, shape: null, text: id };
}

function readLink(line: string, at: number): Span | null {
  const rest = line.slice(at);
  const plain = /^([<ox]?)(-{2,}|={2,}|-\.+-|~{3,})([>ox]?)(?:\s*\|([^|]*)\|)?/.exec(rest);
  if (plain) {
    const [whole, left, body, right, text] = plain;
    const stroke: Stroke = body[0] === '=' ? 'thick' : body[0] === '~' ? 'invisible' : body.includes('.') ? 'dotted' : 'solid';
    const least = stroke === 'dotted' ? 3 : stroke === 'invisible' ? 3 : right ? 2 : 3;
    if (body.length >= least)
      return { start: at, end: at + whole.length, stroke, left: HEADS[left], right: HEADS[right], text: unquote((text ?? '').trim()), extra: body.length - least };
  }
  // Text written inside the link: `-- text -->`, `== text ==>`, `-. text .->`.
  const inline = /^([<ox]?)(--|==|-\.)\s*([^\s\-=.>|][^|]*?)\s*(-{2,}|={2,}|\.+-)([>ox]?)(?=\s|$|[\p{L}\p{N}_])/u.exec(rest);
  if (!inline) return null;
  const [whole, left, open, text, , right] = inline;
  return { start: at, end: at + whole.length, stroke: open === '==' ? 'thick' : open === '-.' ? 'dotted' : 'solid',
    left: HEADS[left], right: HEADS[right], text: unquote(text.trim()), extra: 0 };
}

const skip = (line: string, at: number) => { while (line[at] === ' ' || line[at] === '\t') at++; return at; };
/** One line as nodes and the links between them, or null when it is not that. */
function readStatement(line: string): Statement | null {
  const groups: Ref[][] = [], links: Span[] = [];
  let at = skip(line, 0);
  for (;;) {
    const group: Ref[] = [];
    for (;;) {
      const ref = readRef(line, at);
      if (!ref) return null;
      group.push(ref);
      at = skip(line, ref.end);
      if (line[at] !== '&') break;
      at = skip(line, at + 1);
    }
    groups.push(group);
    if (at >= line.length || /^;?\s*$/.test(line.slice(at))) return { groups, links };
    const link = readLink(line, at);
    if (!link) return null;
    links.push(link);
    at = skip(line, link.end);
  }
}

export function readFlowchart(text: string): Flowchart | Unsupported {
  const lines = text.split('\n');
  let header = -1, front = false;
  for (let i = 0; i < lines.length && header < 0; i++) {
    const line = lines[i];
    if (/^\s*---\s*$/.test(line)) { front = !front; continue; }
    if (front || /^\s*(%%.*)?$/.test(line)) continue;
    if (HEADER.test(line)) header = i; else return { unsupported: 'It does not start with a flowchart line on its own.', line: i + 1 };
  }
  if (header < 0) return { unsupported: 'It has no flowchart line.' };
  const [, , keyword, direction] = HEADER.exec(lines[header])!;
  const flow: Flowchart = { lines, header, keyword, direction: (direction ?? 'TB') as Direction, nodes: [], edges: [], groups: [], statements: new Map(), scope: new Map() };
  const nodes = new Map<string, FlowNode>(), open: { group: FlowGroup; mentioned: Set<string> }[] = [], top = new Set<string>();
  const taken = new Set<string>();

  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i], inside = open.at(-1);
    flow.scope.set(i, inside?.group.id ?? null);
    const sub = SUBGRAPH.exec(line);
    if (sub) {
      const titled = /^([^\s[]+)\s*\[(.*)\]$/.exec(sub[2]);
      const id = titled ? titled[1] : unquote(sub[2]) || `subGraph${flow.groups.length}`;
      const group: FlowGroup = { id, title: titled ? unquote(titled[2].trim()) : unquote(sub[2]), start: i, end: -1, parent: inside?.group.id ?? null };
      flow.groups.push(group); open.push({ group, mentioned: new Set() });
      continue;
    }
    if (END.test(line) && inside) {
      inside.group.end = i;
      // A node belongs to the first group to close that mentions it, as Mermaid has it.
      for (const id of inside.mentioned) if (!taken.has(id)) { taken.add(id); nodes.get(id)!.group = inside.group.id; }
      open.pop();
      continue;
    }
    if (KEPT.test(line)) continue;
    const statement = readStatement(line);
    if (!statement) return { unsupported: 'The visual editor cannot follow this line yet.', line: i + 1 };
    flow.statements.set(i, statement);
    for (const ref of statement.groups.flat()) {
      const known = nodes.get(ref.id);
      if (!known) nodes.set(ref.id, { id: ref.id, text: ref.text, shape: ref.shape, group: null });
      else if (ref.shape) { known.text = ref.text; known.shape = ref.shape; }
      (inside?.mentioned ?? top).add(ref.id);
    }
    statement.links.forEach((link, n) => {
      for (const from of statement.groups[n]) for (const to of statement.groups[n + 1]) {
        const { start: _s, end: _e, ...kind } = link;
        flow.edges.push({ index: flow.edges.length, from: from.id, to: to.id, line: i, link: kind });
      }
    });
  }
  if (open.length) return { unsupported: 'A subgraph is not closed with end.', line: open.at(-1)!.group.start + 1 };
  flow.nodes = [...nodes.values()];
  return flow;
}
export const isFlowchart = (value: Flowchart | Unsupported): value is Flowchart => 'lines' in value;

/* ── writing ─────────────────────────────────────────────────────────────── */

const HEAD_LEFT: Record<Head, string> = { '': '', arrow: '<', circle: 'o', cross: 'x' };
const HEAD_RIGHT: Record<Head, string> = { '': '', arrow: '>', circle: 'o', cross: 'x' };
export function writeLink(link: Link) {
  const body = link.stroke === 'thick' ? '='.repeat((link.right ? 2 : 3) + link.extra)
    : link.stroke === 'dotted' ? `-${'.'.repeat(1 + link.extra)}-`
    : link.stroke === 'invisible' ? '~'.repeat(3 + link.extra)
    : '-'.repeat((link.right ? 2 : 3) + link.extra);
  return `${HEAD_LEFT[link.left]}${body}${HEAD_RIGHT[link.right]}${link.text ? `|${label(link.text)}|` : ''}`;
}
const writeNode = (id: string, shape: Shape, text: string) => { const [, open, close] = delimiters(shape); return `${id}${open}${label(text)}${close}`; };
const indentOf = (line: string) => /^\s*/.exec(line)![0];

function must(text: string): Flowchart {
  const flow = readFlowchart(text);
  if (!isFlowchart(flow)) throw new Error(`${flow.unsupported}${flow.line ? ` Line ${flow.line}.` : ''}`);
  return flow;
}
const join = (lines: string[]) => lines.join('\n');
/** Where a new top-level statement goes: after the last node, edge or group, before trailing styles. */
function bottom(flow: Flowchart) {
  let last = flow.header;
  for (const line of flow.statements.keys()) if (flow.scope.get(line) === null) last = Math.max(last, line);
  for (const group of flow.groups) if (!group.parent) last = Math.max(last, group.end);
  return last + 1;
}
function indent(flow: Flowchart, group: string | null) {
  for (const line of flow.statements.keys()) if (flow.scope.get(line) === group) return indentOf(flow.lines[line]);
  const parent = group ? flow.groups.find(one => one.id === group)! : null;
  return parent ? `${indentOf(flow.lines[parent.start])}  ` : `${indentOf(flow.lines[flow.header])}  `;
}
function freshId(flow: Flowchart, prefix: string) {
  const used = new Set([...flow.nodes.map(node => node.id), ...flow.groups.map(group => group.id)]);
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}
const simple = (statement: Statement) => statement.links.length <= 1 && statement.groups.every(group => group.length === 1);

/**
 * A chain or an `&` line as one edge per line, so one edge can be changed without touching the
 * others. The edges keep their order, and each node keeps its label on the first line that names it.
 */
function spread(text: string, line: number): string {
  const flow = must(text), statement = flow.statements.get(line);
  if (!statement || simple(statement)) return text;
  const source = flow.lines[line], pad = indentOf(source), said = new Set<string>();
  const write = (ref: Ref) => { if (said.has(ref.id) || !ref.shape) return ref.id; said.add(ref.id); return source.slice(ref.start, ref.end); };
  const out: string[] = [];
  statement.links.forEach((link, n) => {
    for (const from of statement.groups[n]) for (const to of statement.groups[n + 1])
      out.push(`${pad}${write(from)} ${source.slice(link.start, link.end)} ${write(to)}`);
  });
  if (!statement.links.length) for (const ref of statement.groups[0]) out.push(`${pad}${source.slice(ref.start, ref.end)}`);
  return join([...flow.lines.slice(0, line), ...out, ...flow.lines.slice(line + 1)]);
}
/** Spread every line that names one of these nodes, or holds this edge, until each is one edge per line. */
function spreadFor(text: string, wants: (statement: Statement, line: number, flow: Flowchart) => boolean): string {
  for (;;) {
    const flow = must(text);
    const line = [...flow.statements].find(([number, statement]) => !simple(statement) && wants(statement, number, flow))?.[0];
    if (line === undefined) return text;
    text = spread(text, line);
  }
}

/** linkStyle names edges by number. When edges go, the numbers after them move down. */
function renumber(lines: string[], removed: number[]) {
  if (!removed.length) return lines;
  return lines.flatMap(line => {
    const found = /^(\s*linkStyle\s+)([\d,\s]+?)(\s+\S.*)$/.exec(line);
    if (!found) return [line];
    const kept = found[2].split(',').map(n => Number(n.trim())).filter(n => !removed.includes(n)).map(n => n - removed.filter(r => r < n).length);
    return kept.length ? [`${found[1]}${kept.join(',')}${found[3]}`] : [];
  });
}

export function setDirection(text: string, direction: Direction) {
  const flow = must(text);
  return join(flow.lines.map((line, n) => n === flow.header ? `${indentOf(line)}${flow.keyword} ${direction}` : line));
}

export function addNode(text: string, options: { text?: string; shape?: Shape; group?: string | null } = {}) {
  const flow = must(text), id = freshId(flow, 'n'), group = options.group ? flow.groups.find(one => one.id === options.group) : undefined;
  const line = `${indent(flow, group?.id ?? null)}${writeNode(id, options.shape ?? 'rect', options.text ?? 'New node')}`;
  const at = group ? group.end : bottom(flow);
  return { text: join([...flow.lines.slice(0, at), line, ...flow.lines.slice(at)]), id };
}

/** The place a node's label and shape are written: its first labelled mention, else its first mention. */
function declaration(flow: Flowchart, id: string) {
  let first: { line: number; ref: Ref } | undefined;
  for (const [line, statement] of flow.statements) for (const ref of statement.groups.flat()) if (ref.id === id) {
    if (ref.shape) return { line, ref };
    first ??= { line, ref };
  }
  if (!first) throw new Error(`No node ${id}.`);
  return first;
}
function redeclare(text: string, id: string, shape: Shape | null, labelText: string | null) {
  const flow = must(text), { line, ref } = declaration(flow, id), source = flow.lines[line];
  const written = writeNode(id, shape ?? ref.shape ?? 'rect', labelText ?? ref.text);
  return join(flow.lines.map((one, n) => n === line ? `${source.slice(0, ref.start)}${written}${source.slice(ref.end)}` : one));
}
export const setNodeText = (text: string, id: string, labelText: string) => redeclare(text, id, null, labelText);
export const setNodeShape = (text: string, id: string, shape: Shape) => redeclare(text, id, shape, null);

export function removeNode(text: string, id: string) {
  text = spreadFor(text, statement => statement.groups.flat().some(ref => ref.id === id));
  const flow = must(text), mentions = new Map<string, number>();
  for (const statement of flow.statements.values()) for (const ref of statement.groups.flat()) mentions.set(ref.id, (mentions.get(ref.id) ?? 0) + 1);
  const gone = flow.edges.filter(edge => edge.from === id || edge.to === id).map(edge => edge.index);
  const lines = flow.lines.flatMap((source, n) => {
    const statement = flow.statements.get(n);
    if (!statement) {
      if (new RegExp(`^\\s*(style|click)\\s+${id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(\\s|$)`).test(source)) return [];
      const classed = /^(\s*class\s+)([^\s]+)(\s+.*)$/.exec(source);
      if (classed) { const ids = classed[2].split(',').filter(one => one !== id); return ids.length ? [`${classed[1]}${ids.join(',')}${classed[3]}`] : []; }
      return [source];
    }
    const refs = statement.groups.flat();
    if (!refs.some(ref => ref.id === id)) return [source];
    // The other end of a removed edge stays in the diagram: with its label if this line held it,
    // and as a bare name if this line was the only place it appeared.
    return refs.filter(ref => ref.id !== id && (ref.shape || mentions.get(ref.id) === 1)).map(ref => `${indentOf(source)}${source.slice(ref.start, ref.end)}`);
  });
  return join(renumber(lines, gone));
}

export function addEdge(text: string, from: string, to: string, link: Partial<Link> = {}) {
  const flow = must(text), at = bottom(flow);
  const line = `${indent(flow, null)}${from} ${writeLink({ stroke: 'solid', left: '', right: 'arrow', text: '', extra: 0, ...link })} ${to}`;
  return join([...flow.lines.slice(0, at), line, ...flow.lines.slice(at)]);
}

/** The line that holds only this edge, after spreading the line it was written on. */
function alone(text: string, index: number) {
  text = spreadFor(text, (_, line, flow) => flow.edges[index]?.line === line);
  const flow = must(text), edge = flow.edges[index];
  if (!edge) throw new Error(`No edge ${index}.`);
  return { text, flow, edge, statement: flow.statements.get(edge.line)!, source: flow.lines[edge.line] };
}
export function setEdge(text: string, index: number, change: Partial<Link>) {
  const { flow, edge, statement, source } = alone(text, index), span = statement.links[0];
  const written = writeLink({ ...edge.link, ...change });
  return join(flow.lines.map((line, n) => n === edge.line ? `${source.slice(0, span.start)}${written}${source.slice(span.end)}` : line));
}
export function reverseEdge(text: string, index: number) {
  const { flow, edge, statement, source } = alone(text, index), [[from], [to]] = statement.groups, span = statement.links[0];
  const line = `${source.slice(0, from.start)}${source.slice(to.start, to.end)}${source.slice(from.end, span.start)}${source.slice(span.start, span.end)}${source.slice(span.end, to.start)}${source.slice(from.start, from.end)}${source.slice(to.end)}`;
  return join(flow.lines.map((one, n) => n === edge.line ? line : one));
}
export function removeEdge(text: string, index: number) {
  const { flow, edge, statement, source } = alone(text, index), mentions = new Map<string, number>();
  for (const one of flow.statements.values()) for (const ref of one.groups.flat()) mentions.set(ref.id, (mentions.get(ref.id) ?? 0) + 1);
  const kept = statement.groups.flat().filter(ref => ref.shape || mentions.get(ref.id) === 1).map(ref => `${indentOf(source)}${source.slice(ref.start, ref.end)}`);
  return join(renumber([...flow.lines.slice(0, edge.line), ...kept, ...flow.lines.slice(edge.line + 1)], [index]));
}

/* ── groups (subgraphs) ──────────────────────────────────────────────────── */

/** Take a node out of the group it is in: its own lines leave, and edges written there move out after it. */
function release(text: string, id: string): { text: string; held: string[] } {
  text = spreadFor(text, (statement, line, flow) => flow.scope.get(line) !== null && statement.groups.flat().some(ref => ref.id === id));
  const flow = must(text), node = flow.nodes.find(one => one.id === id);
  if (!node) throw new Error(`No node ${id}.`);
  const group = flow.groups.find(one => one.id === node.group);
  if (!group) return { text, held: [] };
  const inGroup = (line: number) => flow.scope.get(line) === group.id;
  const mine = [...flow.statements].filter(([line, statement]) => inGroup(line) && statement.groups.flat().some(ref => ref.id === id));
  const others = new Map<string, number>();
  for (const [line, statement] of flow.statements) if (inGroup(line)) for (const ref of statement.groups.flat()) others.set(ref.id, (others.get(ref.id) ?? 0) + 1);
  const held: string[] = [], moved: string[] = [], stay: string[] = [], drop = new Set<number>();
  for (const [line, statement] of mine) {
    drop.add(line);
    const source = flow.lines[line].trim();
    if (!statement.links.length) { if (statement.groups[0][0].shape) held.push(source); continue; }
    moved.push(source);
    // A neighbour named only on that edge would leave with it, so it gets a line of its own.
    for (const ref of statement.groups.flat()) if (ref.id !== id && others.get(ref.id) === 1) stay.push(`${indent(flow, group.id)}${ref.id}`);
  }
  const outer = indentOf(flow.lines[group.start]);
  const lines = flow.lines.flatMap((line, n) => drop.has(n) ? [] : n === group.end ? [...stay, line, ...moved.map(one => `${outer}${one}`)] : [line]);
  return { text: join(lines), held };
}
export function moveNode(text: string, id: string, group: string | null) {
  const released = release(text, id);
  if (!group) {
    // Its label left the group with it; a bare node keeps its place through its edges, or gets a line.
    const flow = must(released.text), at = bottom(flow), still = flow.nodes.some(node => node.id === id);
    const lines = released.held.length ? released.held : still ? [] : [id];
    return join([...flow.lines.slice(0, at), ...lines.map(line => `${indent(flow, null)}${line}`), ...flow.lines.slice(at)]);
  }
  const flow = must(released.text), target = flow.groups.find(one => one.id === group);
  if (!target) throw new Error(`No group ${group}.`);
  const lines = (released.held.length ? released.held : [id]).map(line => `${indent(flow, group)}${line}`);
  return join([...flow.lines.slice(0, target.end), ...lines, ...flow.lines.slice(target.end)]);
}
export function addGroup(text: string, title = 'New group', nodes: string[] = []) {
  const flow = must(text), id = freshId(flow, 'g'), at = bottom(flow), pad = indent(flow, null);
  let next = join([...flow.lines.slice(0, at), `${pad}subgraph ${id} [${label(title)}]`, `${pad}end`, ...flow.lines.slice(at)]);
  for (const node of nodes) next = moveNode(next, node, id);
  return { text: next, id };
}
export function setGroupTitle(text: string, id: string, title: string) {
  const flow = must(text), group = flow.groups.find(one => one.id === id);
  if (!group) throw new Error(`No group ${id}.`);
  // A group written by its title alone has that title as its name. Naming it apart keeps its name steady.
  return join(flow.lines.map((line, n) => n === group.start ? `${indentOf(line)}subgraph ${/^[\p{L}\p{N}_-]+$/u.test(id) ? id : freshId(flow, 'g')} [${label(title)}]` : line));
}
/** Remove the group and keep what was in it. */
export function ungroup(text: string, id: string) {
  const flow = must(text), group = flow.groups.find(one => one.id === id);
  if (!group) throw new Error(`No group ${id}.`);
  return join(flow.lines.flatMap((line, n) => {
    if (n === group.start || n === group.end) return [];
    if (n > group.start && n < group.end) {
      if (flow.scope.get(n) === id && /^\s*direction\b/.test(line)) return [];
      return [line.startsWith('  ') ? line.slice(2) : line];
    }
    return [line];
  }));
}

export const NEW_FLOWCHART = 'flowchart TB\n  n1[Start] --> n2[End]';
