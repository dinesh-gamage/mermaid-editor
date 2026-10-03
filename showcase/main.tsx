import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MermaidEditor } from '../src';
import { selfTest } from './selftest';

const SAMPLES: Record<string, string> = {
  Flowchart: `%% the order path
flowchart LR
  web[Web site] -->|calls| api{{API}}
  api --> db[(Orders DB)]
  api -.-> q([Queue])
  subgraph billing [Billing]
    inv[Invoices] ==> pay((Pay))
  end
  q --> inv
  classDef hot fill:#f96,stroke:#333;
  class api hot`,
  Sequence: `sequenceDiagram
  actor U as User
  participant W as Web
  U->>W: open page
  W->>+API: POST /order
  Note over W,API: retried up to 3 times
  alt paid
    API-->>-W: 201
  else declined
    API--xW: 402
  end`,
  State: `stateDiagram-v2
  [*] --> Open
  Open --> Closed: close
  Closed --> [*]`,
  Empty: '',
};

function App() {
  const [name, setName] = useState('Flowchart');
  const [value, setValue] = useState(SAMPLES.Flowchart);
  const [dark, setDark] = useState(false);
  return (
    <div style={{ maxWidth: 1180, margin: '24px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
      <h1 style={{ fontSize: 20 }}>mermaid-editor</h1>
      <p>
        {Object.keys(SAMPLES).map(sample => (
          <button key={sample} id={`sample-${sample}`} style={{ marginRight: 8, fontWeight: sample === name ? 700 : 400 }}
            onClick={() => { setName(sample); setValue(SAMPLES[sample]); }}>{sample}</button>
        ))}
        <label style={{ marginLeft: 12 }}><input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)} /> Dark host</label>
      </p>
      <div className={dark ? 'dark-host' : undefined}>
        <MermaidEditor key={name} value={value} onChange={setValue} mermaidConfig={{ theme: 'neutral' }} />
      </div>
      <h2 style={{ fontSize: 15 }}>The value</h2>
      <pre id="value" style={{ padding: 12, background: '#f4f4f6', overflow: 'auto' }}>{value}</pre>
      <pre id="selftest" />
      <style>{`.dark-host { padding: 16px; background: #101014; }
.dark-host .mmde { --mermaid-editor-bg: #17171c; --mermaid-editor-surface: #1e1e24; --mermaid-editor-border: #34343e; --mermaid-editor-text: #e8e8ec; --mermaid-editor-muted: #a0a0ac; --mermaid-editor-accent: #4d9fdc; --mermaid-editor-danger: #d96a6a; }`}</style>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
if (new URLSearchParams(location.search).has('selftest')) void selfTest();
