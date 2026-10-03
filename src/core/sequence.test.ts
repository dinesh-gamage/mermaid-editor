import * as s from './sequence';

const ORDER = `sequenceDiagram
  autonumber
  actor U as User
  participant W as Web
  U->>W: open page
  W->>+API: POST /order
  Note over W,API: retried up to 3 times
  alt paid
    API-->>-W: 201
  else declined
    API--xW: 402
  end
  %% keep polling
  loop every minute
    W->>API: poll
  end`;
const read = (text: string) => { const sequence = s.readSequence(text); if (!s.isSequence(sequence)) throw new Error(sequence.unsupported); return sequence; };
const changed = (before: string, after: string) => ({
  added: after.split('\n').filter(line => !before.split('\n').includes(line)),
  removed: before.split('\n').filter(line => !after.split('\n').includes(line)),
});
const lineOf = (text: string, has: string) => text.split('\n').findIndex(line => line.includes(has));

describe('reading a sequence diagram', () => {
  it('finds participants in the order they appear, and every step', () => {
    const sequence = read(ORDER);
    expect(sequence.participants.map(one => [one.id, one.label, one.actor, one.line !== null])).toEqual([['U', 'User', true, true], ['W', 'Web', false, true], ['API', 'API', false, false]]);
    expect(sequence.items.map(item => item.kind)).toEqual(['other', 'participant', 'participant', 'message', 'message', 'note', 'block', 'message', 'branch', 'message', 'end', 'other', 'block', 'message', 'end']);
    expect(sequence.items[4]).toMatchObject({ from: 'W', to: 'API', arrow: '->>', activate: '+', text: 'POST /order' });
    expect(sequence.items[5]).toMatchObject({ placement: 'over', actors: ['W', 'API'], text: 'retried up to 3 times' });
    expect(sequence.items[9]).toMatchObject({ arrow: '--x', depth: 1 });
    expect(sequence.items[6]).toMatchObject({ keyword: 'alt', label: 'paid', end: 11 });
  });
  it('refuses a block that is never closed', () => {
    expect(s.readSequence('sequenceDiagram\n  loop x\n  A->>B: hi')).toMatchObject({ unsupported: 'A block is not closed with end.' });
  });
});

describe('editing a sequence diagram changes only the lines it has to', () => {
  it('changes a message, a note and a block label in place', () => {
    expect(changed(ORDER, s.setMessage(ORDER, lineOf(ORDER, 'POST'), { text: 'POST /orders', arrow: '-->>' }))).toEqual({ added: ['  W-->>+API: POST /orders'], removed: ['  W->>+API: POST /order'] });
    expect(changed(ORDER, s.setMessage(ORDER, lineOf(ORDER, '402'), { from: 'W', to: 'U' })).added).toEqual(['    W--xU: 402']);
    expect(changed(ORDER, s.setNote(ORDER, lineOf(ORDER, 'Note'), { placement: 'right of', text: 'once' })).added).toEqual(['  Note right of W: once']);
    expect(changed(ORDER, s.setBlock(ORDER, lineOf(ORDER, 'alt paid'), { keyword: 'opt', label: 'has card' })).added).toEqual(['  opt has card']);
    expect(changed(ORDER, s.setBlock(ORDER, lineOf(ORDER, 'else'), { label: 'no funds' })).added).toEqual(['  else no funds']);
  });
  it('adds a message or a note after a step, inside the same block', () => {
    const inBlock = s.addMessage(ORDER, { from: 'API', to: 'W', text: 'ok' }, lineOf(ORDER, ': poll'));
    expect(changed(ORDER, inBlock.text)).toEqual({ added: ['    API->>W: ok'], removed: [] });
    expect(inBlock.line).toBe(lineOf(ORDER, ': poll') + 1);
    expect(changed(ORDER, s.addMessage(ORDER, { from: 'U', to: 'W' }, lineOf(ORDER, 'loop')).text).added).toEqual(['    U->>W:']);
    expect(s.addNote(ORDER, { actors: ['U'] }).text.split('\n').at(-1)).toBe('  Note over U: Note');
  });
  it('moves a step, into and out of a block', () => {
    const up = s.moveStep(ORDER, lineOf(ORDER, 'POST'), -1);
    expect(up.split('\n').slice(4, 6)).toEqual(['  W->>+API: POST /order', '  U->>W: open page']);
    const into = s.moveStep(ORDER, lineOf(ORDER, 'Note over'), 1);
    expect(into.split('\n').slice(6, 9)).toEqual(['  alt paid', '    Note over W,API: retried up to 3 times', '    API-->>-W: 201']);
    const out = s.moveStep(ORDER, lineOf(ORDER, ': poll'), 1);
    expect(out.split('\n').slice(-3)).toEqual(['  loop every minute', '  end', '  W->>API: poll']);
    expect(s.moveStep(ORDER, lineOf(ORDER, 'alt paid'), 1)).toBe(ORDER);
  });
  it('removes a step, and removes a block keeping its steps', () => {
    expect(changed(ORDER, s.removeStep(ORDER, lineOf(ORDER, 'Note')))).toEqual({ added: [], removed: ['  Note over W,API: retried up to 3 times'] });
    const flat = s.removeStep(ORDER, lineOf(ORDER, 'alt paid'));
    expect(changed(ORDER, flat)).toEqual({ added: ['  API-->>-W: 201', '  API--xW: 402'], removed: ['  alt paid', '    API-->>-W: 201', '  else declined', '    API--xW: 402'] });
    expect(read(flat).items.filter(item => item.kind === 'block')).toHaveLength(1);
  });
  it('wraps steps in a block and adds a branch', () => {
    const wrapped = s.wrap(ORDER, lineOf(ORDER, 'open page'), lineOf(ORDER, 'POST'), 'opt', 'signed in');
    expect(wrapped.split('\n').slice(4, 8)).toEqual(['  opt signed in', '    U->>W: open page', '    W->>+API: POST /order', '  end']);
    expect(changed(ORDER, s.addBranch(ORDER, lineOf(ORDER, 'alt paid'), 'timeout'))).toEqual({ added: ['  else timeout'], removed: [] });
  });
});

describe('participants', () => {
  it('gives every participant a line before one is renamed or moved', () => {
    const renamed = s.setParticipant(ORDER, 'API', { label: 'Orders API' });
    expect(changed(ORDER, renamed)).toEqual({ added: ['  participant API as Orders API'], removed: [] });
    expect(read(renamed).participants.map(one => one.id)).toEqual(['U', 'W', 'API']);
    expect(changed(ORDER, s.setParticipant(ORDER, 'W', { actor: true })).added).toEqual(['  actor W as Web', '  participant API']);
    const moved = s.moveParticipant(ORDER, 'API', -1);
    expect(read(moved).participants.map(one => one.id)).toEqual(['U', 'API', 'W']);
    expect(moved).toContain('  autonumber');
  });
  it('adds a participant at the end, with a name made from its label', () => {
    const added = s.addParticipant(ORDER, 'Payment gateway');
    expect(added.id).toBe('PaymentGateway');
    expect(read(added.text).participants.map(one => one.id)).toEqual(['U', 'W', 'API', 'PaymentGateway']);
    expect(s.addParticipant(ORDER, 'W').id).toBe('W2');
  });
  it('removes a participant with the messages and notes that name it', () => {
    const next = s.removeParticipant(ORDER, 'U');
    expect(changed(ORDER, next)).toEqual({ added: [], removed: ['  actor U as User', '  U->>W: open page'] });
    expect(read(s.removeParticipant(ORDER, 'API')).items.filter(item => item.kind === 'message')).toHaveLength(1);
  });
});
