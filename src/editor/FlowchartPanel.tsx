import type { Flowchart, Head, Shape, Stroke } from '../core';
import { flowchart as f } from '../core';
import type { Selection } from './canvas';

const SHAPE_NAMES: Record<Shape, string> = {
  rect: 'Rectangle', round: 'Rounded', stadium: 'Pill', subroutine: 'Subroutine', cylinder: 'Database', circle: 'Circle',
  'double-circle': 'Double circle', diamond: 'Decision', hexagon: 'Hexagon', asymmetric: 'Flag', parallelogram: 'Input / output',
  'parallelogram-alt': 'Input / output, reversed', trapezoid: 'Trapezoid', 'trapezoid-alt': 'Trapezoid, reversed',
};
const STROKES: [Stroke, string][] = [['solid', 'Solid'], ['thick', 'Thick'], ['dotted', 'Dotted'], ['invisible', 'Invisible']];
const HEADS: [Head, string][] = [['', 'None'], ['arrow', 'Arrow'], ['circle', 'Circle'], ['cross', 'Cross']];

type Props = {
  flow: Flowchart; text: string; selection: Selection | null; select: (selection: Selection | null) => void;
  /** Apply a change. `key` joins quick changes of the same field into one undo step. */
  apply: (next: string, key?: string) => void;
};

export function FlowchartToolbar({ flow, text, selection, select, apply }: Props) {
  return <>
    <button type="button" className="mmde-btn" onClick={() => {
      const added = f.addNode(text, { group: selection?.kind === 'group' ? selection.id : null });
      apply(added.text); select({ kind: 'node', id: added.id });
    }}>+ Node</button>
    <button type="button" className="mmde-btn" title="A group around the selected node, or an empty one" onClick={() => {
      const added = f.addGroup(text, 'New group', selection?.kind === 'node' ? [selection.id] : []);
      apply(added.text); select({ kind: 'group', id: added.id });
    }}>+ Group</button>
    <label className="mmde-inline">Direction
      <select className="mmde-input" value={flow.direction === 'TD' ? 'TB' : flow.direction} onChange={event => apply(f.setDirection(text, event.target.value as 'TB'))}>
        <option value="TB">Top to bottom</option><option value="BT">Bottom to top</option>
        <option value="LR">Left to right</option><option value="RL">Right to left</option>
      </select>
    </label>
  </>;
}

export function FlowchartPanel({ flow, text, selection, select, apply }: Props) {
  const node = selection?.kind === 'node' ? flow.nodes.find(one => one.id === selection.id) : undefined;
  const edge = selection?.kind === 'edge' ? flow.edges[selection.index] : undefined;
  const group = selection?.kind === 'group' ? flow.groups.find(one => one.id === selection.id) : undefined;
  const name = (id: string) => flow.nodes.find(one => one.id === id)?.text ?? id;

  if (node) return (
    <div className="mmde-form" key={`node:${node.id}`}>
      <h3>Node</h3>
      <label>Label<input className="mmde-input" autoFocus value={node.text} onChange={event => apply(f.setNodeText(text, node.id, event.target.value), `node:${node.id}`)} /></label>
      <label>Shape
        <select className="mmde-input" value={node.shape ?? 'rect'} onChange={event => apply(f.setNodeShape(text, node.id, event.target.value as Shape))}>
          {f.FLOW_SHAPES.map(shape => <option key={shape} value={shape}>{SHAPE_NAMES[shape]}</option>)}
        </select>
      </label>
      <label>Group
        <select className="mmde-input" value={node.group ?? ''} onChange={event => apply(f.moveNode(text, node.id, event.target.value || null))}>
          <option value="">None</option>
          {flow.groups.map(one => <option key={one.id} value={one.id}>{one.title}</option>)}
        </select>
      </label>
      <label>Connect to
        <select className="mmde-input" value="" onChange={event => { apply(f.addEdge(text, node.id, event.target.value)); select({ kind: 'edge', index: flow.edges.length }); }}>
          <option value="">Choose a node…</option>
          {flow.nodes.filter(one => one.id !== node.id).map(one => <option key={one.id} value={one.id}>{one.text}</option>)}
        </select>
      </label>
      <button type="button" className="mmde-btn mmde-danger" onClick={() => { apply(f.removeNode(text, node.id)); select(null); }}>Delete node</button>
    </div>
  );
  if (edge) return (
    <div className="mmde-form" key={`edge:${edge.index}`}>
      <h3>Arrow</h3>
      <p className="mmde-hint">{name(edge.from)} to {name(edge.to)}</p>
      <label>Label<input className="mmde-input" autoFocus value={edge.link.text} onChange={event => apply(f.setEdge(text, edge.index, { text: event.target.value }), `edge:${edge.index}`)} /></label>
      <label>Line
        <select className="mmde-input" value={edge.link.stroke} onChange={event => apply(f.setEdge(text, edge.index, { stroke: event.target.value as Stroke }))}>
          {STROKES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Start
        <select className="mmde-input" value={edge.link.left} onChange={event => apply(f.setEdge(text, edge.index, { left: event.target.value as Head }))}>
          {HEADS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>End
        <select className="mmde-input" value={edge.link.right} onChange={event => apply(f.setEdge(text, edge.index, { right: event.target.value as Head }))}>
          {HEADS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="button" className="mmde-btn" onClick={() => apply(f.reverseEdge(text, edge.index))}>Reverse</button>
      <button type="button" className="mmde-btn mmde-danger" onClick={() => { apply(f.removeEdge(text, edge.index)); select(null); }}>Delete arrow</button>
    </div>
  );
  if (group) return (
    <div className="mmde-form" key={`group:${group.id}`}>
      <h3>Group</h3>
      <label>Title<input className="mmde-input" autoFocus value={group.title} onChange={event => apply(f.setGroupTitle(text, group.id, event.target.value), `group:${group.id}`)} /></label>
      <p className="mmde-hint">To put a node in this group, select the node and choose the group.</p>
      <button type="button" className="mmde-btn" onClick={() => { const added = f.addNode(text, { group: group.id }); apply(added.text); select({ kind: 'node', id: added.id }); }}>+ Node in this group</button>
      <button type="button" className="mmde-btn mmde-danger" onClick={() => { apply(f.ungroup(text, group.id)); select(null); }}>Ungroup</button>
    </div>
  );
  return (
    <div className="mmde-form">
      <h3>Flowchart</h3>
      <p className="mmde-hint">Click a node, an arrow or a group to change it.</p>
      <p className="mmde-hint">Drag from one node to another to connect them.</p>
      <p className="mmde-hint">Mermaid arranges the diagram, so nodes cannot be placed by hand.</p>
    </div>
  );
}
