/**
 * Sequence diagrams, read and changed line by line.
 *
 * A sequence diagram is a list: one participant, message, note or block edge per line. So an edit
 * is a line replaced, added, removed or moved. A line this does not recognise (autonumber, a
 * comment, activate) is kept as written and can still be moved or removed.
 */

export const ARROWS = ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)', '<<->>', '<<-->>'] as const;
export type Arrow = typeof ARROWS[number];
export const BLOCKS = ['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect', 'box'] as const;
export type BlockKind = typeof BLOCKS[number];
const BRANCHES = ['else', 'and', 'option'] as const;
export type Placement = 'over' | 'left of' | 'right of';

export type SeqItem = { line: number; depth: number } & (
  | { kind: 'participant'; id: string; label: string; actor: boolean }
  | { kind: 'message'; from: string; to: string; arrow: Arrow; activate: '' | '+' | '-'; text: string }
  | { kind: 'note'; placement: Placement; actors: string[]; text: string }
  | { kind: 'block'; keyword: BlockKind; label: string; end: number }
  | { kind: 'branch'; keyword: typeof BRANCHES[number]; label: string }
  | { kind: 'end'; start: number }
  | { kind: 'other'; text: string });
export type Participant = { id: string; label: string; actor: boolean; line: number | null };
export type Sequence = { lines: string[]; header: number; items: SeqItem[]; participants: Participant[] };
export type Unsupported = { unsupported: string; line?: number };

const HEADER = /^\s*sequenceDiagram\s*$/;
const PARTICIPANT = /^\s*(participant|actor)\s+(.+?)(?:\s+as\s+(.+?))?\s*$/;
const NOTE = /^\s*note\s+(over|left of|right of)\s+([^:]+?)\s*:\s*(.*)$/i;
// Longest arrow first, so `-->>` is never read as `--` and `>>`.
const ARROW = /(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)/;
const indentOf = (line: string) => /^\s*/.exec(line)![0];

export function readSequence(text: string): Sequence | Unsupported {
  const lines = text.split('\n');
  let header = -1, front = false;
  for (let i = 0; i < lines.length && header < 0; i++) {
    if (/^\s*---\s*$/.test(lines[i])) { front = !front; continue; }
    if (front || /^\s*(%%.*)?$/.test(lines[i])) continue;
    if (HEADER.test(lines[i])) header = i; else return { unsupported: 'It does not start with a sequenceDiagram line on its own.', line: i + 1 };
  }
  if (header < 0) return { unsupported: 'It has no sequenceDiagram line.' };
  const items: SeqItem[] = [], open: Extract<SeqItem, { kind: 'block' }>[] = [], seen = new Map<string, Participant>();
  const meet = (id: string) => { if (!seen.has(id)) seen.set(id, { id, label: id, actor: false, line: null }); };

  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i], body = line.trim(), depth = open.length;
    if (!body) continue;
    const word = /^(\w+)\b\s*(.*)$/.exec(body);
    const declared = PARTICIPANT.exec(line);
    if (declared) {
      const [, kind, id, label] = declared;
      seen.set(id, { id, label: label ?? id, actor: kind === 'actor', line: i });
      items.push({ kind: 'participant', line: i, depth, id, label: label ?? id, actor: kind === 'actor' });
    } else if (word && (BLOCKS as readonly string[]).includes(word[1])) {
      const block = { kind: 'block' as const, line: i, depth, keyword: word[1] as BlockKind, label: word[2], end: -1 };
      items.push(block); open.push(block);
    } else if (word && (BRANCHES as readonly string[]).includes(word[1]) && open.length) {
      items.push({ kind: 'branch', line: i, depth: depth - 1, keyword: word[1] as typeof BRANCHES[number], label: word[2] });
    } else if (body === 'end' && open.length) {
      const block = open.pop()!;
      block.end = i;
      items.push({ kind: 'end', line: i, depth: depth - 1, start: block.line });
    } else if (NOTE.test(line)) {
      const [, placement, actors, noteText] = NOTE.exec(line)!;
      const ids = actors.split(',').map(one => one.trim());
      ids.forEach(meet);
      items.push({ kind: 'note', line: i, depth, placement: placement.toLowerCase() as Placement, actors: ids, text: noteText });
    } else {
      const colon = body.indexOf(':'), arrow = ARROW.exec(colon < 0 ? '' : body.slice(0, colon));
      const to = arrow && colon >= 0 ? /^([+-]?)\s*(.+)$/.exec(body.slice(arrow.index + arrow[0].length, colon).trim()) : null;
      const from = arrow ? body.slice(0, arrow.index).trim() : '';
      if (arrow && to && from && !body.startsWith('%%')) {
        meet(from); meet(to[2]);
        items.push({ kind: 'message', line: i, depth, from, to: to[2], arrow: arrow[0] as Arrow, activate: to[1] as '' | '+' | '-', text: body.slice(colon + 1).trim() });
      } else items.push({ kind: 'other', line: i, depth, text: body });
    }
  }
  if (open.length) return { unsupported: 'A block is not closed with end.', line: open.at(-1)!.line + 1 };
  return { lines, header, items, participants: [...seen.values()] };
}
export const isSequence = (value: Sequence | Unsupported): value is Sequence => 'lines' in value;

/* ── writing ─────────────────────────────────────────────────────────────── */

function must(text: string): Sequence {
  const sequence = readSequence(text);
  if (!isSequence(sequence)) throw new Error(`${sequence.unsupported}${sequence.line ? ` Line ${sequence.line}.` : ''}`);
  return sequence;
}
const join = (lines: string[]) => lines.join('\n');
const replace = (sequence: Sequence, line: number, written: string) => join(sequence.lines.map((one, n) => n === line ? `${indentOf(one)}${written}` : one));
const insert = (sequence: Sequence, at: number, ...written: string[]) => join([...sequence.lines.slice(0, at), ...written, ...sequence.lines.slice(at)]);
const pad = (sequence: Sequence) => { const first = sequence.items[0]; return first ? indentOf(sequence.lines[first.line]) : `${indentOf(sequence.lines[sequence.header])}  `; };
/** The line after the last item, or after `after` when given: where a new step goes. */
const below = (sequence: Sequence, after?: number) => after !== undefined ? after + 1 : (sequence.items.at(-1)?.line ?? sequence.header) + 1;
const declare = (one: { id: string; label: string; actor: boolean }) => `${one.actor ? 'actor' : 'participant'} ${one.id}${one.label !== one.id ? ` as ${one.label}` : ''}`;

/**
 * Every participant on a line of its own under the header, in the order the diagram shows them.
 * Mermaid orders participants by first appearance, so a participant can only be moved or renamed
 * once it has a line to move or rewrite.
 */
function declareAll(text: string, order?: (list: Participant[]) => Participant[]): string {
  const sequence = must(text), inBox = new Set<number>();
  for (const item of sequence.items) if (item.kind === 'block' && item.keyword === 'box') for (let n = item.line; n <= item.end; n++) inBox.add(n);
  // Participants inside a box stay where they are: the box is what groups them.
  const free = sequence.participants.filter(one => one.line === null || !inBox.has(one.line));
  const drop = new Set(free.flatMap(one => one.line === null ? [] : [one.line]));
  const lines = (order ? order(free) : free).map(one => `${pad(sequence)}${declare(one)}`);
  const kept = sequence.lines.flatMap((line, n) => drop.has(n) ? [] : n === sequence.header ? [line, ...lines] : [line]);
  return join(kept);
}
const slug = (label: string, used: Set<string>) => {
  const base = /^[\p{L}\p{N}_]+$/u.test(label) ? label : (label.match(/[\p{L}\p{N}]+/gu)?.map(word => word[0].toUpperCase() + word.slice(1)).join('') || 'P');
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
};

export function addParticipant(text: string, label = 'New participant', actor = false) {
  const declared = declareAll(text), sequence = must(declared);
  const id = slug(label, new Set(sequence.participants.map(one => one.id)));
  const last = Math.max(sequence.header, ...sequence.participants.flatMap(one => one.line ?? []));
  return { text: insert(sequence, last + 1, `${pad(sequence)}${declare({ id, label, actor })}`), id };
}
export function setParticipant(text: string, id: string, change: { label?: string; actor?: boolean }) {
  const sequence = must(declareAll(text)), one = sequence.participants.find(each => each.id === id);
  if (!one || one.line === null) throw new Error(`No participant ${id}.`);
  return replace(sequence, one.line, declare({ ...one, ...change, label: (change.label ?? one.label) || id }));
}
export function moveParticipant(text: string, id: string, by: -1 | 1) {
  return declareAll(text, list => {
    const at = list.findIndex(one => one.id === id), to = at + by;
    if (at < 0 || to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[at], next[to]] = [next[to], next[at]];
    return next;
  });
}
/** Remove a participant and every message and note that names it. */
export function removeParticipant(text: string, id: string) {
  const sequence = must(text), drop = new Set<number>();
  for (const item of sequence.items) {
    if (item.kind === 'participant' && item.id === id) drop.add(item.line);
    if (item.kind === 'message' && (item.from === id || item.to === id)) drop.add(item.line);
    if (item.kind === 'note' && item.actors.includes(id)) drop.add(item.line);
    if (item.kind === 'other' && new RegExp(`^(activate|deactivate|destroy)\\s+${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(item.text)) drop.add(item.line);
  }
  return join(sequence.lines.filter((_, n) => !drop.has(n)));
}

export type MessageInput = { from: string; to: string; arrow?: Arrow; activate?: '' | '+' | '-'; text?: string };
const message = (one: MessageInput) => `${one.from}${one.arrow ?? '->>'}${one.activate ?? ''}${one.to}: ${one.text ?? ''}`.trimEnd();
const note = (one: { placement: Placement; actors: string[]; text: string }) => `Note ${one.placement} ${one.actors.join(',')}: ${one.text}`;
/** A new step takes the indentation of the line it follows, so it lands inside the same block. */
function step(text: string, written: string, after?: number) {
  const sequence = must(text), at = below(sequence, after);
  const item = sequence.items.find(one => one.line === after);
  const lead = after === undefined ? pad(sequence) : `${indentOf(sequence.lines[after])}${item && (item.kind === 'block' || item.kind === 'branch') ? '  ' : ''}`;
  return { text: insert(sequence, at, `${lead}${written}`), line: at };
}
export const addMessage = (text: string, input: MessageInput, after?: number) => step(text, message(input), after);
export const addNote = (text: string, input: { placement?: Placement; actors: string[]; text?: string }, after?: number) =>
  step(text, note({ placement: input.placement ?? 'over', actors: input.actors, text: input.text ?? 'Note' }), after);

export function setMessage(text: string, line: number, change: Partial<MessageInput>) {
  const sequence = must(text), item = sequence.items.find(one => one.line === line);
  if (item?.kind !== 'message') throw new Error(`Line ${line + 1} is not a message.`);
  return replace(sequence, line, message({ ...item, ...change }));
}
export function setNote(text: string, line: number, change: { placement?: Placement; actors?: string[]; text?: string }) {
  const sequence = must(text), item = sequence.items.find(one => one.line === line);
  if (item?.kind !== 'note') throw new Error(`Line ${line + 1} is not a note.`);
  const next = { ...item, ...change };
  // A note beside a participant names one; a note over names one or two.
  return replace(sequence, line, note({ ...next, actors: next.actors.slice(0, next.placement === 'over' ? 2 : 1) }));
}
export function setBlock(text: string, line: number, change: { keyword?: BlockKind; label?: string }) {
  const sequence = must(text), item = sequence.items.find(one => one.line === line);
  if (item?.kind !== 'block' && item?.kind !== 'branch') throw new Error(`Line ${line + 1} is not a block.`);
  const keyword = item.kind === 'block' ? change.keyword ?? item.keyword : item.keyword;
  return replace(sequence, line, `${keyword} ${change.label ?? item.label}`.trimEnd());
}

/** Remove one line. Removing a block's first or last line removes the block and keeps what was in it. */
export function removeStep(text: string, line: number) {
  const sequence = must(text), item = sequence.items.find(one => one.line === line);
  if (!item) throw new Error(`Nothing to remove on line ${line + 1}.`);
  if (item.kind !== 'block' && item.kind !== 'end') return join(sequence.lines.filter((_, n) => n !== line));
  const start = item.kind === 'block' ? item.line : item.start;
  const block = sequence.items.find(one => one.line === start) as Extract<SeqItem, { kind: 'block' }>;
  const branches = new Set(sequence.items.filter(one => one.kind === 'branch' && one.line > start && one.line < block.end && one.depth === block.depth).map(one => one.line));
  return join(sequence.lines.flatMap((one, n) => n === start || n === block.end || branches.has(n) ? []
    : n > start && n < block.end && one.startsWith('  ') ? [one.slice(2)] : [one]));
}
/** Swap a step with the line above or below it. Crossing a block's edge moves it into or out of the block. */
export function moveStep(text: string, line: number, by: -1 | 1) {
  const sequence = must(text), steps = sequence.items.filter(one => one.kind !== 'participant');
  const at = steps.findIndex(one => one.line === line), other = steps[at + by];
  const item = steps[at];
  if (!item || !other || item.kind === 'block' || item.kind === 'end' || item.kind === 'branch') return text;
  const lines = [...sequence.lines], body = lines[line].trim();
  // Crossing into a block indents; crossing out of one takes the indentation outside it.
  const entering = (by === 1 && (other.kind === 'block' || other.kind === 'branch')) || (by === -1 && (other.kind === 'end' || other.kind === 'branch'));
  const lead = other.kind === 'message' || other.kind === 'note' || other.kind === 'other' ? indentOf(lines[other.line]) : `${indentOf(lines[other.line])}${entering ? '  ' : ''}`;
  lines[line] = lines[other.line];
  lines[other.line] = `${lead}${body}`;
  return join(lines);
}
/** Put the steps from `first` to `last` inside a new block. */
export function wrap(text: string, first: number, last: number, keyword: BlockKind = 'loop', label = '') {
  const sequence = must(text), lead = indentOf(sequence.lines[first]);
  return join(sequence.lines.flatMap((line, n) => n < first || n > last ? [line]
    : [...(n === first ? [`${lead}${keyword} ${label}`.trimEnd()] : []), `  ${line}`, ...(n === last ? [`${lead}end`] : [])]));
}
/** Add an `else` (or `and`, `option`) to a block, just before its end. */
export function addBranch(text: string, line: number, label = '') {
  const sequence = must(text), item = sequence.items.find(one => one.line === line);
  if (item?.kind !== 'block') throw new Error(`Line ${line + 1} is not a block.`);
  const keyword = item.keyword === 'par' ? 'and' : item.keyword === 'critical' ? 'option' : 'else';
  return insert(sequence, item.end, `${indentOf(sequence.lines[line])}${keyword} ${label}`.trimEnd());
}

export const NEW_SEQUENCE = 'sequenceDiagram\n  participant A as Client\n  participant B as Server\n  A->>B: Request\n  B-->>A: Response';
