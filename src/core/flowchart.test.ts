import * as f from './flowchart';
import { kindOf } from './index';

const ORDER = `%% the order path
flowchart LR
  web[Web site] -->|calls| api{{API}}
  api --> db[(Orders DB)]
  %% async path
  api -.-> q([Queue])
  subgraph billing [Billing]
    direction TB
    inv[Invoices] ==> pay((Pay))
  end
  q --> inv
  a1["Label with (parens) and: colon"] --o b1
  b1 <--> c1 & d1
  classDef hot fill:#f96,stroke:#333;
  class api,db hot
  style db fill:#bbf
  click web "https://example.com" "Open"
  linkStyle 0 stroke:#f00
  linkStyle 3,5 stroke:#0f0`;
const read = (text: string) => { const flow = f.readFlowchart(text); if (!f.isFlowchart(flow)) throw new Error(flow.unsupported); return flow; };
/** Lines of `after` that are not in `before`, and the other way round: what an edit touched. */
const changed = (before: string, after: string) => ({
  added: after.split('\n').filter(line => !before.split('\n').includes(line)),
  removed: before.split('\n').filter(line => !after.split('\n').includes(line)),
});

describe('reading a flowchart', () => {
  it('finds nodes, edges and groups, and keeps every other line as it is', () => {
    const flow = read(ORDER);
    expect(kindOf(ORDER)).toBe('flowchart');
    expect(flow.direction).toBe('LR');
    expect(flow.nodes.map(node => [node.id, node.shape, node.text, node.group])).toEqual([
      ['web', 'rect', 'Web site', null], ['api', 'hexagon', 'API', null], ['db', 'cylinder', 'Orders DB', null], ['q', 'stadium', 'Queue', null],
      ['inv', 'rect', 'Invoices', 'billing'], ['pay', 'circle', 'Pay', 'billing'], ['a1', 'rect', 'Label with (parens) and: colon', null],
      ['b1', null, 'b1', null], ['c1', null, 'c1', null], ['d1', null, 'd1', null]]);
    expect(flow.edges.map(edge => `${edge.from} ${f.writeLink(edge.link)} ${edge.to}`)).toEqual([
      'web -->|calls| api', 'api --> db', 'api -.-> q', 'inv ==> pay', 'q --> inv', 'a1 --o b1', 'b1 <--> c1', 'b1 <--> d1']);
    expect(flow.groups).toMatchObject([{ id: 'billing', title: 'Billing', parent: null }]);
  });
  it('reads text written inside a link, and long links', () => {
    const flow = read('flowchart TD\n  A -- yes --> B\n  B == no ==> C\n  C -. maybe .-> D\n  D ----> E\n  E --- F\n  F x--x G');
    expect(flow.edges.map(edge => edge.link)).toEqual([
      { stroke: 'solid', left: '', right: 'arrow', text: 'yes', extra: 0 }, { stroke: 'thick', left: '', right: 'arrow', text: 'no', extra: 0 },
      { stroke: 'dotted', left: '', right: 'arrow', text: 'maybe', extra: 0 }, { stroke: 'solid', left: '', right: 'arrow', text: '', extra: 2 },
      { stroke: 'solid', left: '', right: '', text: '', extra: 0 }, { stroke: 'solid', left: 'cross', right: 'cross', text: '', extra: 0 }]);
  });
  it('says which line it cannot follow instead of guessing', () => {
    expect(f.readFlowchart('flowchart LR\n  A --> B\n  A@{ shape: cyl, label: "x" }')).toEqual({ unsupported: 'The visual editor cannot follow this line yet.', line: 3 });
    expect(f.readFlowchart('graph TD; A-->B;')).toMatchObject({ line: 1 });
    expect(f.readFlowchart('flowchart LR\n  subgraph a\n  A')).toMatchObject({ unsupported: 'A subgraph is not closed with end.' });
  });
});

describe('editing a flowchart changes only the lines it has to', () => {
  it('renames and reshapes a node in place', () => {
    expect(changed(ORDER, f.setNodeText(ORDER, 'api', 'Public API'))).toEqual({ added: ['  web[Web site] -->|calls| api{{Public API}}'], removed: ['  web[Web site] -->|calls| api{{API}}'] });
    expect(changed(ORDER, f.setNodeText(ORDER, 'db', 'Orders (v2)')).added).toEqual(['  api --> db[("Orders (v2)")]']);
    expect(changed(ORDER, f.setNodeShape(ORDER, 'web', 'stadium')).added).toEqual(['  web([Web site]) -->|calls| api{{API}}']);
    // A node that was never given a label gets one where it is first named.
    expect(changed(ORDER, f.setNodeText(ORDER, 'b1', 'Broker')).added).toEqual(['  a1["Label with (parens) and: colon"] --o b1[Broker]']);
    expect(read(f.setNodeText(ORDER, 'a1', 'He said "hi"')).nodes.find(node => node.id === 'a1')!.text).toBe('He said "hi"');
  });
  it('adds a node at the end of the diagram or inside a group, before any styles', () => {
    const top = f.addNode(ORDER, { text: 'Cache', shape: 'cylinder' });
    expect(top.id).toBe('n1');
    expect(changed(ORDER, top.text)).toEqual({ added: ['  n1[(Cache)]'], removed: [] });
    expect(top.text.split('\n').indexOf('  n1[(Cache)]')).toBe(ORDER.split('\n').indexOf('  b1 <--> c1 & d1') + 1);
    const inside = f.addNode(ORDER, { group: 'billing' });
    expect(read(inside.text).nodes.find(node => node.id === inside.id)).toMatchObject({ text: 'New node', group: 'billing' });
  });
  it('adds, changes, reverses and removes an edge', () => {
    expect(changed(ORDER, f.addEdge(ORDER, 'pay', 'db', { text: 'records' }))).toEqual({ added: ['  pay -->|records| db'], removed: [] });
    expect(changed(ORDER, f.setEdge(ORDER, 1, { stroke: 'dotted', text: 'reads & writes' })).added).toEqual(['  api -.->|"reads & writes"| db[(Orders DB)]']);
    expect(changed(ORDER, f.setEdge(ORDER, 0, { text: '' })).added).toEqual(['  web[Web site] --> api{{API}}']);
    expect(changed(ORDER, f.reverseEdge(ORDER, 3)).added).toEqual(['    pay((Pay)) ==> inv[Invoices]']);
    // Removing an edge keeps both nodes, and the edge numbers in linkStyle follow.
    const removed = f.removeEdge(ORDER, 1);
    expect(changed(ORDER, removed)).toEqual({ added: ['  db[(Orders DB)]', '  linkStyle 2,4 stroke:#0f0'], removed: ['  api --> db[(Orders DB)]', '  linkStyle 3,5 stroke:#0f0'] });
    expect(read(removed).nodes).toHaveLength(10);
  });
  it('splits a line that holds several edges only when one of them is edited', () => {
    const next = f.setEdge(ORDER, 7, { text: 'pub' });
    expect(changed(ORDER, next)).toEqual({ added: ['  b1 <--> c1', '  b1 <-->|pub| d1'], removed: ['  b1 <--> c1 & d1'] });
    expect(read(next).edges.map(edge => `${edge.from}>${edge.to}`)).toEqual(read(ORDER).edges.map(edge => `${edge.from}>${edge.to}`));
    const chain = 'flowchart LR\n  A[One] --> B[Two] -.-> C --> A';
    expect(f.removeEdge(chain, 1)).toBe('flowchart LR\n  A[One] --> B[Two]\n  C --> A');
  });
  it('removes a node with its edges, styles and classes, and nothing else', () => {
    const next = f.removeNode(ORDER, 'db');
    expect(changed(ORDER, next)).toEqual({
      added: ['  class api hot', '  linkStyle 2,4 stroke:#0f0'],
      removed: ['  api --> db[(Orders DB)]', '  class api,db hot', '  style db fill:#bbf', '  linkStyle 3,5 stroke:#0f0'] });
    expect(next).toContain('%% async path');
    // A neighbour that only that edge named stays in the diagram.
    expect(f.removeNode('flowchart LR\n  A --> B\n  B --> C', 'A')).toBe('flowchart LR\n  B --> C');
    expect(f.removeNode('flowchart LR\n  A --> B', 'A')).toBe('flowchart LR\n  B');
    expect(f.removeNode(ORDER, 'c1')).toContain('  b1 <--> d1');
  });
  it('changes direction on the header line', () => {
    expect(changed(ORDER, f.setDirection(ORDER, 'TB'))).toEqual({ added: ['flowchart TB'], removed: ['flowchart LR'] });
    expect(f.setDirection('graph\n  A-->B', 'RL')).toBe('graph RL\n  A-->B');
  });
});

describe('groups', () => {
  it('makes a group from nodes, renames it, and removes it keeping what was in it', () => {
    const made = f.addGroup(ORDER, 'Storage', ['db', 'q']);
    expect(read(made.text).nodes.filter(node => node.group === made.id).map(node => node.id).sort()).toEqual(['db', 'q']);
    expect(changed(ORDER, made.text)).toEqual({ added: ['  subgraph g1 [Storage]', '    db', '    q'], removed: [] });
    expect(changed(ORDER, f.setGroupTitle(ORDER, 'billing', 'Billing & tax')).added).toEqual(['  subgraph billing ["Billing & tax"]']);
    const flat = f.ungroup(ORDER, 'billing');
    expect(changed(ORDER, flat)).toEqual({ added: ['  inv[Invoices] ==> pay((Pay))'], removed: ['  subgraph billing [Billing]', '    direction TB', '    inv[Invoices] ==> pay((Pay))', '  end'] });
    expect(read(flat).nodes.every(node => node.group === null)).toBe(true);
  });
  it('moves a node between groups without taking its neighbours along', () => {
    const out = f.moveNode(ORDER, 'pay', null), flow = read(out);
    expect(flow.nodes.find(node => node.id === 'pay')!.group).toBeNull();
    expect(flow.nodes.find(node => node.id === 'inv')!.group).toBe('billing');
    expect(flow.edges.map(edge => `${edge.from}>${edge.to}`).sort()).toEqual(read(ORDER).edges.map(edge => `${edge.from}>${edge.to}`).sort());
    const into = read(f.moveNode(ORDER, 'web', 'billing'));
    expect(into.nodes.find(node => node.id === 'web')).toMatchObject({ group: 'billing', text: 'Web site' });
  });
});
