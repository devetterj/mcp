/* Acces aux donnees du carnet par l'API PHP existante (api-k7m2.php).
   Lecture : GET -> { rev, data }. Ecriture : POST { data, base_rev } ;
   409 si quelqu'un a ecrit entre-temps, auquel cas on relit et on rejoue. */
import * as C from "./core.js";

const API = process.env.CARNET_API || "https://muscu.genius-strategy.com/api-k7m2.php";

export async function load() {
  const r = await fetch(API + "?t=" + Date.now(), { headers: { Accept: "application/json" } });
  const j = await r.json();
  if (j.error) throw new Error(j.message || j.error);
  return { rev: Number(j.rev) || 0, state: C.migrate(j.data || {}) };
}

export async function save(state, baseRev) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: C.exportAll(state), base_rev: baseRev }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409) { const e = new Error("conflit de version"); e.conflict = true; throw e; }
  if (!r.ok || j.error) throw new Error(j.message || j.error || ("http " + r.status));
  return Number(j.rev);
}

/* applique fn(state) puis enregistre ; rejoue jusqu'a 3 fois en cas de conflit */
export async function modify(fn) {
  let last;
  for (let i = 0; i < 3; i++) {
    const { rev, state } = await load();
    const result = fn(state);
    try { return { rev: await save(state, rev), result }; }
    catch (e) { last = e; if (!e.conflict) throw e; }
  }
  throw last;
}
