// Visitor notes storage.
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY (see supabase-notes.sql) to share notes with every visitor.
// Until then, notes are only saved in this browser.
const SUPABASE_URL = 'https://pquhrzohsyzhlplxngew.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9CR8SIYmZuKpmrX562UKfQ_S8jISPt-'; // publishable key: safe to ship in the page

window.Notes = (() => {
  const online = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  const LOCAL = 'jungle-notes', LAST = 'jungle-last-note';
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  const welcome = [{ x: -1, y: -1, name: 'begum', text: 'Welcome to my jungle! Leave a note anywhere 🐯', created_at: '2026-11-01T00:00:00Z' }];

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch { return []; } };
  const writeLocal = list => { try { localStorage.setItem(LOCAL, JSON.stringify(list)); } catch {} };

  async function load() {
    if (!online) return [...welcome, ...readLocal()];
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=x,y,name,text,created_at&order=created_at.desc&limit=300`, { headers });
      if (!r.ok) throw new Error(r.status);
      return [...welcome, ...(await r.json())];
    } catch { return welcome; }
  }

  // one note every 30 seconds per visitor, to slow down spam
  function waitSeconds() {
    let last = 0; try { last = +localStorage.getItem(LAST) || 0; } catch {}
    return Math.max(0, Math.ceil((last + 30000 - Date.now()) / 1000));
  }

  async function add({ x, y, name, text }) {
    const note = { x, y, name: name.trim().slice(0, 20), text: text.trim().slice(0, 140) };
    if (!note.name || !note.text) throw new Error('empty');
    if (online) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(note),
      });
      if (!r.ok) throw new Error(r.status);
      Object.assign(note, (await r.json())[0]);
    } else {
      note.created_at = new Date().toISOString();
      writeLocal([note, ...readLocal()]);
    }
    try { localStorage.setItem(LAST, Date.now()); } catch {}
    return note;
  }

  return { online, load, add, waitSeconds };
})();
