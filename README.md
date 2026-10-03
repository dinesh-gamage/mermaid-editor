# mermaid-editor

A visual editor for [Mermaid](https://mermaid.js.org) diagrams, as a React component.

You edit on Mermaid's own drawing. The value is plain Mermaid text, and an edit changes only the
lines it has to: comments, styles and anything the editor does not understand stay exactly as
written.

```tsx
import { useState } from 'react';
import { MermaidEditor } from '@dinesh-gamage/mermaid-editor';

function Example() {
  const [text, setText] = useState('flowchart LR\n  web[Web site] --> api{{API}}');
  return <MermaidEditor value={text} onChange={setText} mermaidConfig={{ theme: 'neutral' }} />;
}
```

```bash
npm install @dinesh-gamage/mermaid-editor mermaid
```

`mermaid`, `react` and `react-dom` are peers. Your app supplies them, so there is one copy of each.

## What it edits

| Diagram | On the drawing | As text with a live drawing |
|---|---|---|
| Flowchart | yes | yes |
| Sequence diagram | yes | yes |
| Every other Mermaid kind | no | yes |

**Flowchart**
- Click a node: label, shape, group, delete.
- Drag from one node to another to connect them.
- Click an arrow: label, line, ends, reverse, delete.
- Groups (subgraphs): make one, rename it, move nodes in and out, ungroup.
- Direction, undo and redo.

**Sequence diagram**
- Participants: add, rename, box or person, reorder, delete.
- Messages and notes: add, edit, move up and down, delete.
- Blocks: loop, alt, opt, par, critical, break. Wrap a step, add a branch, remove the block.

**What it does not do**
- Place nodes by hand. Mermaid text holds no positions; Mermaid arranges the diagram.
- Edit a flowchart that has a line it cannot follow, such as the `@{ shape: … }` form or several
  statements on one line. It says which line, and you edit that diagram as text.

## Props

| Prop | Type | |
|---|---|---|
| `value` | `string` | The diagram, as Mermaid text. |
| `onChange` | `(value: string) => void` | Called with the new text after every edit. |
| `mermaidConfig` | `object` | Passed to `mermaid.initialize`. `securityLevel` is `strict` unless you set it. |
| `className` | `string` | Added to the root element. |

## Theming

Every colour and size is a CSS custom property on `.mmde`. Override them on the editor or any
ancestor:

```css
.mmde {
  --mermaid-editor-bg: #17171c;
  --mermaid-editor-surface: #1e1e24;
  --mermaid-editor-border: #34343e;
  --mermaid-editor-text: #e8e8ec;
  --mermaid-editor-muted: #a0a0ac;
  --mermaid-editor-accent: #4d9fdc;
  --mermaid-editor-height: 520px;
}
```

The drawing sits on `--mermaid-editor-canvas`, white by default, because that is what Mermaid's
themes are drawn for and how the diagram looks when printed.

## The text operations on their own

The functions the editor uses are exported without React, for a script or a server:

```ts
import { flowchart, sequence, kindOf } from '@dinesh-gamage/mermaid-editor/core';

const next = flowchart.setNodeText(text, 'api', 'Public API');
const { text: added, id } = flowchart.addNode(next, { text: 'Cache', shape: 'cylinder' });
const withMessage = sequence.addMessage(diagram, { from: 'Web', to: 'API', text: 'GET /orders' }).text;
```

Each takes Mermaid text and returns Mermaid text.

## Development

```bash
npm install
npm run dev            # the showcase, on http://localhost:5198
npm test               # the text operations
npm run test:browser   # the editor in headless Chrome, where Mermaid can draw
npm run typecheck
npm run build
```

A commit whose message starts with `Release` publishes the version in `package.json` to npm.

## License

MIT
