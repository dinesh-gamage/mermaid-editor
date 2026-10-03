import { useEffect, useRef } from 'react';
import type { Arrow, BlockKind, Placement, SeqItem, Sequence } from '../core';
import { sequence as s } from '../core';
import type { Selection } from './canvas';

const ARROW_NAMES: Record<Arrow, string> = {
  '->>': 'Arrow', '-->>': 'Dashed arrow', '->': 'Line', '-->': 'Dashed line', '-x': 'Cross', '--x': 'Dashed cross',
  '-)': 'Open arrow', '--)': 'Dashed open arrow', '<<->>': 'Two-way', '<<-->>': 'Dashed two-way',
};
const EDITABLE_BLOCKS: BlockKind[] = ['loop', 'alt', 'opt', 'par', 'critical', 'break'];

type Props = {
  sequence: Sequence; text: string; selection: Selection | null; select: (selection: Selection | null) => void;
  apply: (next: string, key?: string) => void;
};

export function SequenceToolbar({ sequence, text, selection, select, apply }: Props) {
  const [first, second] = sequence.participants, after = selection?.kind === 'step' ? selection.line : undefined;
  return <>
    <button type="button" className="mmde-btn" onClick={() => { const added = s.addParticipant(text); apply(added.text); select({ kind: 'participant', id: added.id }); }}>+ Participant</button>
    <button type="button" className="mmde-btn" disabled={!first} title="After the selected step, or at the end" onClick={() => {
      const added = s.addMessage(text, { from: first.id, to: (second ?? first).id, text: 'Message' }, after);
      apply(added.text); select({ kind: 'step', line: added.line });
    }}>+ Message</button>
    <button type="button" className="mmde-btn" disabled={!first} title="After the selected step, or at the end" onClick={() => {
      const added = s.addNote(text, { actors: [first.id] }, after);
      apply(added.text); select({ kind: 'step', line: added.line });
    }}>+ Note</button>
  </>;
}

export function SequencePanel({ sequence, text, selection, select, apply }: Props) {
  const chosen = useRef<HTMLDivElement>(null);
  useEffect(() => { chosen.current?.scrollIntoView?.({ block: 'nearest' }); }, [selection]);
  const people = sequence.participants;
  const who = (value: string, onChange: (id: string) => void) => (
    <select className="mmde-input" value={value} onChange={event => onChange(event.target.value)}>
      {people.map(one => <option key={one.id} value={one.id}>{one.label}</option>)}
    </select>
  );
  const moves = (line: number) => <>
    <button type="button" className="mmde-icon" title="Move up" onClick={() => { apply(s.moveStep(text, line, -1)); select(null); }}>↑</button>
    <button type="button" className="mmde-icon" title="Move down" onClick={() => { apply(s.moveStep(text, line, 1)); select(null); }}>↓</button>
  </>;
  const remove = (line: number, title = 'Delete') =>
    <button type="button" className="mmde-icon mmde-danger" title={title} onClick={() => { apply(s.removeStep(text, line)); select(null); }}>✕</button>;

  const row = (item: SeqItem) => {
    const on = selection?.kind === 'step' && selection.line === item.line;
    const frame = (children: React.ReactNode) => (
      <div key={item.line} ref={on ? chosen : undefined} className={`mmde-row${on ? ' mmde-on' : ''}`} style={{ paddingLeft: 8 + item.depth * 14 }}
        onFocus={() => { if (!on) select({ kind: 'step', line: item.line }); }}>{children}</div>
    );
    switch (item.kind) {
      case 'message': return frame(<>
        {who(item.from, from => apply(s.setMessage(text, item.line, { from })))}
        <select className="mmde-input" value={item.arrow} title="How the message is drawn" onChange={event => apply(s.setMessage(text, item.line, { arrow: event.target.value as Arrow }))}>
          {s.ARROWS.map(arrow => <option key={arrow} value={arrow}>{ARROW_NAMES[arrow]}</option>)}
        </select>
        {who(item.to, to => apply(s.setMessage(text, item.line, { to })))}
        <input className="mmde-input mmde-grow" value={item.text} placeholder="Message" onChange={event => apply(s.setMessage(text, item.line, { text: event.target.value }), `step:${item.line}`)} />
        <button type="button" className="mmde-icon" title="Put this step in a loop. Change the kind on the block's row." onClick={() => apply(s.wrap(text, item.line, item.line, 'loop', 'condition'))}>⟳</button>
        {moves(item.line)}{remove(item.line)}
      </>);
      case 'note': return frame(<>
        <span className="mmde-tag">Note</span>
        <select className="mmde-input" value={item.placement} onChange={event => apply(s.setNote(text, item.line, { placement: event.target.value as Placement }))}>
          <option value="over">over</option><option value="left of">left of</option><option value="right of">right of</option>
        </select>
        {who(item.actors[0], id => apply(s.setNote(text, item.line, { actors: [id, ...item.actors.slice(1)] })))}
        {item.placement === 'over' && (
          <select className="mmde-input" value={item.actors[1] ?? ''} title="A second participant, for a note across both" onChange={event => apply(s.setNote(text, item.line, { actors: [item.actors[0], ...(event.target.value ? [event.target.value] : [])] }))}>
            <option value="">only</option>
            {people.filter(one => one.id !== item.actors[0]).map(one => <option key={one.id} value={one.id}>and {one.label}</option>)}
          </select>
        )}
        <input className="mmde-input mmde-grow" value={item.text} onChange={event => apply(s.setNote(text, item.line, { text: event.target.value }), `step:${item.line}`)} />
        {moves(item.line)}{remove(item.line)}
      </>);
      case 'block': return frame(<>
        {EDITABLE_BLOCKS.includes(item.keyword)
          ? <select className="mmde-input" value={item.keyword} onChange={event => apply(s.setBlock(text, item.line, { keyword: event.target.value as BlockKind }))}>
              {EDITABLE_BLOCKS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          : <span className="mmde-tag">{item.keyword}</span>}
        <input className="mmde-input mmde-grow" value={item.label} placeholder="Condition" onChange={event => apply(s.setBlock(text, item.line, { label: event.target.value }), `step:${item.line}`)} />
        {['alt', 'par', 'critical'].includes(item.keyword) && <button type="button" className="mmde-icon" title="Add another branch" onClick={() => apply(s.addBranch(text, item.line, 'otherwise'))}>＋</button>}
        {remove(item.line, 'Remove the block and keep its steps')}
      </>);
      case 'branch': return frame(<>
        <span className="mmde-tag">{item.keyword}</span>
        <input className="mmde-input mmde-grow" value={item.label} onChange={event => apply(s.setBlock(text, item.line, { label: event.target.value }), `step:${item.line}`)} />
        {remove(item.line)}
      </>);
      case 'end': return frame(<span className="mmde-tag">end</span>);
      case 'other': return frame(<><code className="mmde-grow mmde-code">{item.text}</code>{moves(item.line)}{remove(item.line)}</>);
      default: return null;
    }
  };

  return (
    <div className="mmde-form">
      <h3>Participants</h3>
      {people.map((one, n) => {
        const on = selection?.kind === 'participant' && selection.id === one.id;
        return (
          <div key={one.id} ref={on ? chosen : undefined} className={`mmde-row${on ? ' mmde-on' : ''}`}>
            <input className="mmde-input mmde-grow" value={one.label} onChange={event => apply(s.setParticipant(text, one.id, { label: event.target.value }), `participant:${one.id}`)} />
            <select className="mmde-input" value={one.actor ? 'actor' : 'participant'} title="Drawn as a box or as a person" onChange={event => apply(s.setParticipant(text, one.id, { actor: event.target.value === 'actor' }))}>
              <option value="participant">Box</option><option value="actor">Person</option>
            </select>
            <button type="button" className="mmde-icon" title="Move left" disabled={n === 0} onClick={() => apply(s.moveParticipant(text, one.id, -1))}>←</button>
            <button type="button" className="mmde-icon" title="Move right" disabled={n === people.length - 1} onClick={() => apply(s.moveParticipant(text, one.id, 1))}>→</button>
            <button type="button" className="mmde-icon mmde-danger" title="Delete, with its messages and notes" onClick={() => { apply(s.removeParticipant(text, one.id)); select(null); }}>✕</button>
          </div>
        );
      })}
      <h3>Steps</h3>
      {sequence.items.filter(item => item.kind !== 'participant').map(row)}
      {!sequence.items.some(item => item.kind !== 'participant') && <p className="mmde-hint">No steps yet. Add a message.</p>}
    </div>
  );
}
