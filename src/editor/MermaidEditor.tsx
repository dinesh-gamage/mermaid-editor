import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { flowchart as f, kindOf, readFlowchart, readSequence, sequence as s } from '../core';
import { highlight, markFlowchart, markSequence, pick } from './canvas';
import type { Selection } from './canvas';
import { useMermaid } from './useMermaid';
import { FlowchartPanel, FlowchartToolbar } from './FlowchartPanel';
import { SequencePanel, SequenceToolbar } from './SequencePanel';
import './editor.css';

export type MermaidEditorProps = {
  /** The diagram, as Mermaid text. This is all the editor reads and all it changes. */
  value: string;
  onChange: (value: string) => void;
  /** Passed to `mermaid.initialize`, for a theme. `securityLevel` stays strict unless set here. */
  mermaidConfig?: Record<string, unknown>;
  className?: string;
};

type View = 'diagram' | 'text';
const KIND_NAMES = { flowchart: 'Flowchart', sequence: 'Sequence diagram', other: 'Diagram', empty: 'New diagram' };

/**
 * A Mermaid diagram, edited on its own drawing. Flowcharts and sequence diagrams can be changed by
 * clicking; every other kind, and any text the editor cannot follow, is edited as text beside its
 * drawing. Either way the value is plain Mermaid.
 */
export function MermaidEditor({ value, onChange, mermaidConfig, className }: MermaidEditorProps) {
  const [view, setView] = useState<View>('diagram');
  const [selection, select] = useState<Selection | null>(null);
  const [problem, setProblem] = useState<string>();
  const canvas = useRef<HTMLDivElement>(null);
  const drawn = useMermaid(value, mermaidConfig);

  const kind = kindOf(value);
  const model = useMemo(() => kind === 'flowchart' ? readFlowchart(value) : kind === 'sequence' ? readSequence(value) : null, [kind, value]);
  const flow = model && kind === 'flowchart' && f.isFlowchart(model as never) ? model as f.Flowchart : null;
  const sequence = model && kind === 'sequence' && s.isSequence(model as never) ? model as s.Sequence : null;
  const unsupported = model && 'unsupported' in model ? model : null;
  const visual = !!(flow || sequence);
  const showing: View = visual ? view : 'text';

  /* Undo. Quick changes to one field, such as typing a label, are one step. */
  const history = useRef<{ past: string[]; future: string[]; key?: string; at: number }>({ past: [], future: [], at: 0 });
  const apply = (next: string, key?: string) => {
    if (next === value) return;
    const h = history.current, now = Date.now();
    if (!(key && h.key === key && now - h.at < 1500)) h.past.push(value);
    h.future = []; h.key = key; h.at = now;
    setProblem(undefined);
    onChange(next);
  };
  /** A change from a click. The text may be mid-edit and not readable; that is said, not thrown. */
  const guarded = (next: () => void) => { try { next(); } catch (error) { setProblem((error as Error).message); } };
  const safe = (next: string | (() => string), key?: string) => guarded(() => apply(typeof next === 'function' ? next() : next, key));
  const undo = () => { const h = history.current, previous = h.past.pop(); if (previous === undefined) return; h.future.push(value); h.key = undefined; select(null); onChange(previous); };
  const redo = () => { const h = history.current, next = h.future.pop(); if (next === undefined) return; h.past.push(value); h.key = undefined; select(null); onChange(next); };

  /* The drawing is marked from the text it was drawn from, which can be a keystroke behind the value. */
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root || !drawn.svg) return;
    const of = kindOf(drawn.of);
    if (of === 'flowchart') { const read = readFlowchart(drawn.of); if (f.isFlowchart(read)) markFlowchart(root, read); }
    if (of === 'sequence') { const read = readSequence(drawn.of); if (s.isSequence(read)) markSequence(root, read); }
    highlight(root, selection);
  }, [drawn.svg, drawn.of, showing]);
  useEffect(() => { if (canvas.current) highlight(canvas.current, selection); }, [selection]);

  /* Dragging from one node to another connects them. Nodes cannot be placed, so a drag means nothing else. */
  const drag = useRef<{ from: string; x: number; y: number } | null>(null);
  const [rubber, setRubber] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const point = (event: PointerEvent) => { const box = canvas.current!.getBoundingClientRect(); return { x: event.clientX - box.left + canvas.current!.scrollLeft, y: event.clientY - box.top + canvas.current!.scrollTop }; };
  const down = (event: PointerEvent) => {
    const hit = flow ? pick(event.target) : null;
    if (hit?.kind === 'node') drag.current = { from: hit.id, ...point(event) };
  };
  const move = (event: PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    const at = point(event);
    if (rubber || Math.hypot(at.x - start.x, at.y - start.y) > 6) setRubber({ x1: start.x, y1: start.y, x2: at.x, y2: at.y });
  };
  const up = (event: PointerEvent) => {
    const start = drag.current, dragged = !!rubber;
    drag.current = null; setRubber(null);
    const hit = pick(document.elementFromPoint(event.clientX, event.clientY));
    if (dragged && start && flow) {
      if (hit?.kind === 'node' && hit.id !== start.from) safe(() => { select({ kind: 'edge', index: flow.edges.length }); return f.addEdge(value, start.from, hit.id); });
      return;
    }
    select(hit);
  };

  const removeSelected = () => {
    if (!selection) return;
    safe(() => selection.kind === 'node' ? f.removeNode(value, selection.id) : selection.kind === 'edge' ? f.removeEdge(value, selection.index)
      : selection.kind === 'group' ? f.ungroup(value, selection.id) : selection.kind === 'step' ? s.removeStep(value, selection.line)
      : s.removeParticipant(value, selection.id));
    select(null);
  };
  const keys = (event: KeyboardEvent) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !(typing && event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if (!typing && (event.key === 'Delete' || event.key === 'Backspace') && selection && showing === 'diagram') { event.preventDefault(); removeSelected(); }
    else if (event.key === 'Escape') select(null);
  };

  const panel = { text: value, selection, select, apply: safe };
  const drawing = (
    <div className="mmde-canvas" ref={canvas} tabIndex={0} onPointerDown={showing === 'diagram' ? down : undefined}
      onPointerMove={showing === 'diagram' ? move : undefined} onPointerUp={showing === 'diagram' ? up : undefined}
      onPointerLeave={() => { drag.current = null; setRubber(null); }}
      data-editable={showing === 'diagram' ? '' : undefined}>
      {drawn.svg ? <div className="mmde-drawing" dangerouslySetInnerHTML={{ __html: drawn.svg }} /> : <p className="mmde-hint">Nothing to draw yet.</p>}
      {rubber && <svg className="mmde-rubber"><line x1={rubber.x1} y1={rubber.y1} x2={rubber.x2} y2={rubber.y2} /></svg>}
    </div>
  );

  return (
    <div className={`mmde${className ? ` ${className}` : ''}`} onKeyDown={keys}>
      <div className="mmde-bar">
        <span className="mmde-kind">{KIND_NAMES[kind]}</span>
        {showing === 'diagram' && flow && <FlowchartToolbar flow={flow} {...panel} />}
        {showing === 'diagram' && sequence && <SequenceToolbar sequence={sequence} {...panel} />}
        <span className="mmde-spacer" />
        <button type="button" className="mmde-btn" title="Undo" disabled={!history.current.past.length} onClick={undo}>Undo</button>
        <button type="button" className="mmde-btn" title="Redo" disabled={!history.current.future.length} onClick={redo}>Redo</button>
        <span className="mmde-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={showing === 'diagram'} disabled={!visual} title={visual ? undefined : 'This diagram is edited as text'} onClick={() => setView('diagram')}>Diagram</button>
          <button type="button" role="tab" aria-selected={showing === 'text'} onClick={() => setView('text')}>Text</button>
        </span>
      </div>
      {(problem || drawn.error) && <p className="mmde-problem" role="alert">{problem ?? `Mermaid cannot draw this text: ${drawn.error}`}</p>}
      {kind === 'empty' ? (
        <div className="mmde-start">
          <p className="mmde-hint">Start with a kind of diagram, or switch to Text and write any Mermaid.</p>
          <button type="button" className="mmde-btn" onClick={() => apply(f.NEW_FLOWCHART)}>Flowchart</button>
          <button type="button" className="mmde-btn" onClick={() => apply(s.NEW_SEQUENCE)}>Sequence diagram</button>
          <textarea className="mmde-text" value={value} spellCheck={false} placeholder="Or paste Mermaid text here" onChange={event => apply(event.target.value, 'text')} />
        </div>
      ) : showing === 'diagram' ? (
        <div className="mmde-body">
          {drawing}
          <div className="mmde-side">
            {flow && <FlowchartPanel flow={flow} {...panel} />}
            {sequence && <SequencePanel sequence={sequence} {...panel} />}
          </div>
        </div>
      ) : (
        <div className="mmde-body mmde-split">
          <div className="mmde-side">
            {!visual && <p className="mmde-hint">{unsupported
              ? `${unsupported.unsupported}${unsupported.line ? ` Line ${unsupported.line}.` : ''} Edit it as text.`
              : 'Flowcharts and sequence diagrams can be edited on the drawing. This kind is edited as text.'}</p>}
            <textarea className="mmde-text" value={value} spellCheck={false} onChange={event => apply(event.target.value, 'text')} />
          </div>
          {drawing}
        </div>
      )}
    </div>
  );
}
