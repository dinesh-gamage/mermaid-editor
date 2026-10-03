import { readFlowchart } from './flowchart';
import { readSequence } from './sequence';

export * as flowchart from './flowchart';
export * as sequence from './sequence';
export type { Flowchart, FlowNode, FlowEdge, FlowGroup, Link, Shape, Stroke, Head, Direction } from './flowchart';
export type { Sequence, SeqItem, Participant, Arrow, BlockKind, Placement } from './sequence';

export type DiagramKind = 'flowchart' | 'sequence' | 'other' | 'empty';
/** What kind of diagram the text is, from its first line that is not a comment or front matter. */
export function kindOf(text: string): DiagramKind {
  let front = false;
  for (const line of text.split('\n')) {
    if (/^\s*---\s*$/.test(line)) { front = !front; continue; }
    if (front || /^\s*(%%.*)?$/.test(line)) continue;
    return /^\s*(flowchart|graph)\b/.test(line) ? 'flowchart' : /^\s*sequenceDiagram\b/.test(line) ? 'sequence' : 'other';
  }
  return 'empty';
}
export { readFlowchart, readSequence };
