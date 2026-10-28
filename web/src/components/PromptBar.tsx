import { ArrowUp, Loader2, Undo2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { aiAvailable, askAI } from '../lib/ai';
import { quickIntent } from '../lib/commands';
import { useStore } from '../store';

export function PromptBar() {
  const dataset = useStore((s) => s.dataset)!;
  const busy = useStore((s) => s.aiBusy);
  const chat = useStore((s) => s.chat);
  const set = useStore((s) => s.set);
  const undo = useStore((s) => s.undo);
  const [text, setText] = useState('');
  const [hasAI, setHasAI] = useState<boolean | null>(null);
  const [showReply, setShowReply] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const settingsOpen = useStore((s) => s.settingsOpen);

  useEffect(() => { aiAvailable().then(setHasAI); }, [settingsOpen]);

  const examples = useMemo(() => {
    const num = dataset.columns.filter((c) => c.type === 'number' && c.unique > 8);
    const cat = dataset.columns.filter((c) => c.type === 'category' && c.unique <= 12);
    const ex: string[] = [];
    if (num[0] && cat[0]) ex.push(`compare ${num[num.length > 1 ? 1 : 0].name} across ${cat[0].name} with 95% CI and p-values`);
    if (num.length >= 2) ex.push(`${num[1].name} vs ${num[0].name} with a regression line`);
    ex.push('make it Nature single column, colour-blind safe');
    if (cat[1]) ex.push(`split into panels by ${cat[1].name}`);
    ex.push('log scale y, title: My results');
    return ex;
  }, [dataset]);
  const [exIndex, setExIndex] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setExIndex((i) => (i + 1) % examples.length), 4500);
    return () => window.clearInterval(t);
  }, [examples]);

  const last = chat[chat.length - 1];

  async function submit(prompt = text) {
    const p = prompt.trim();
    if (!p || busy) return;
    const { spec, replace } = useStore.getState();
    setText('');
    setShowReply(true);
    const history = useStore.getState().chat;
    set({ chat: [...history, { role: 'user', text: p }] });

    if (!hasAI) {
      const hit = quickIntent(p, spec, dataset);
      if (hit) {
        replace(hit.spec);
        set({ chat: [...useStore.getState().chat, { role: 'assistant', text: `Done: ${hit.understood.join(', ')}.` }] });
      } else {
        set({ chat: [...useStore.getState().chat, { role: 'assistant', text: 'I could not map that to a change without AI. Try short phrases like “log y”, “color by group”, “95% CI”, “Nature” — or press ⌘K. Add an API key in Settings for free-form requests.', error: true }] });
      }
      return;
    }

    set({ aiBusy: true });
    try {
      const answer = await askAI(p, spec, dataset, history);
      replace(answer.spec);
      set({ chat: [...useStore.getState().chat, { role: 'assistant', text: answer.reply }] });
    } catch (e) {
      // fall back to the offline parser so the request isn't simply lost
      const hit = quickIntent(p, useStore.getState().spec, dataset);
      if (hit) {
        replace(hit.spec);
        set({ chat: [...useStore.getState().chat, { role: 'assistant', text: `AI unavailable (${(e as Error).message}). Applied what I understood: ${hit.understood.join(', ')}.` }] });
      } else {
        set({ chat: [...useStore.getState().chat, { role: 'assistant', text: (e as Error).message, error: true }] });
      }
    } finally {
      set({ aiBusy: false });
    }
  }

  return (
    <div className="prompt-dock">
      {showReply && last?.role === 'assistant' && (
        <div className={`reply ${last.error ? 'error' : ''}`}>
          <Wand2 size={14} />
          <span>{last.text}</span>
          {!last.error && <button type="button" className="link-btn" onClick={() => { undo(); setShowReply(false); }}><Undo2 size={12} /> Undo</button>}
          <button type="button" className="icon-btn" onClick={() => setShowReply(false)} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}
      <form className={`prompt ${busy ? 'busy' : ''}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Wand2 size={17} className="prompt-icon" />
        <textarea
          ref={input}
          id="prompt-input"
          rows={1}
          value={text}
          placeholder={busy ? 'Harry is thinking…' : `Ask Harry — “${examples[exIndex % examples.length]}”`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Tab' && !text) { e.preventDefault(); setText(examples[exIndex % examples.length]); }
          }}
          disabled={busy}
        />
        <span className={`ai-badge ${hasAI ? 'on' : ''}`} title={hasAI ? 'AI connected' : 'Offline mode: understands short commands. Add a key in Settings for full AI.'}>{hasAI ? 'AI' : 'offline'}</span>
        <button type="submit" className="send" disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} />}
        </button>
      </form>
    </div>
  );
}
