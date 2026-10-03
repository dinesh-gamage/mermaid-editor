import { useEffect, useState } from 'react';

let count = 0;
/**
 * The text drawn by the host's Mermaid. The last good drawing stays up while the text is wrong, so
 * a half-typed line does not blank the canvas; `error` says why it is not current.
 */
export function useMermaid(text: string, config?: Record<string, unknown>) {
  // By value: a host passing a new object each render must not redraw each render.
  const settings = JSON.stringify(config ?? {});
  const [drawn, setDrawn] = useState<{ svg: string; of: string; error?: string }>({ svg: '', of: '' });
  useEffect(() => {
    if (!text.trim()) { setDrawn({ svg: '', of: text }); return; }
    let current = true;
    const id = `mmde${++count}`;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...JSON.parse(settings) });
      const { svg } = await mermaid.render(id, text);
      if (current) setDrawn({ svg, of: text });
    }).catch(error => {
      // Mermaid leaves its error drawing in the page when a render fails.
      document.getElementById(id)?.remove(); document.getElementById(`d${id}`)?.remove();
      if (current) setDrawn(before => ({ ...before, error: String((error as Error).message ?? error).split('\n')[0] }));
    });
    return () => { current = false; };
  }, [text, settings]);
  return drawn;
}
