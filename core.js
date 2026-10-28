/* ============================================================
   core.js — couche metier du carnet.
   Module pur, sans DOM ni reseau : utilise par l'app, par le
   serveur MCP et par le backend du coach. Toute lecture ou
   modification des donnees passe par ces fonctions.
   ============================================================ */

export const VERSION = 4;

/* fourchettes et repos par type d'exercice (modifiables par exercice) */
export const TYPES = {
  compound:  { r:[6, 10],  s:3, rest:150 },
  isolation: { r:[10, 15], s:3, rest:90 },
  lateral:   { r:[12, 20], s:3, rest:90 },
  core:      { r:[30, 60], s:3, rest:60, time:true, pdc:true },
};

export const SETTINGS = {
  deloadAfter: 2,     /* seances sans progres (avec une serie sous le min) avant -10 % */
  rustyAfter: 21,     /* jours sans l'exercice -> reprise a -10 % */
  longRustyAfter: 42, /* jours -> reprise a -20 % */
  timeStep: 5,        /* secondes ajoutees sur les exercices chronometres */
};

/* charges reellement disponibles : l'arrondi tombe toujours dessus */
export const PLATES = {
  dumbbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17.5, 20, 22.5],
  bar: 2.5,          /* barres, Smith, presse : pas de 2,5 kg */
  machine_lb: 10,    /* colonnes de poids des machines : pas de 10 lb */
};

const E = (type, unit, inc, gear, extra = {}) => ({ type, unit, inc, gear, ...extra });

export const DEFAULT_PROGRAM = {
  rotation: ["ha", "ba", "hb", "bb"],
  sessions: [
    { id:"ha", name:"Haut du corps A", min:60,
      warm:"5 min rameur ou velo + rotations d'epaules + 2 series legeres de developpe incline.",
      blocks:[
        { code:"A", ex:["Developpe incline haltere", "Tirage vertical prise large"] },
        { code:"B", ex:["Developpe epaules poulie", "Rowing haltere unilateral"] },
        { code:"C", ex:["Elevations laterales poulie basse", "Curl poulie pupitre", "Extension triceps corde"] },
      ] },
    { id:"ba", name:"Bas du corps A", min:60,
      warm:"5 min velo + cat-cow x 10 + bird dog 2 x 8 + 20 squats a vide + 2 series montantes a la presse.",
      blocks:[
        { code:"A", ex:["Presse a cuisses"] },
        { code:"B", ex:["Souleve de terre roumain", "Planche"] },
        { code:"C", ex:["Leg extension", "Leg curl allonge"] },
        { code:"D", ex:["Mollets a la presse"] },
      ] },
    { id:"hb", name:"Haut du corps B", min:60,
      warm:"4 min rameur + face pull leger 2 x 15 + 1 serie legere de developpe couche.",
      blocks:[
        { code:"A", ex:["Developpe couche haltere", "Tirage horizontal poulie"] },
        { code:"B", ex:["Ecarte haltere banc incline", "Tirage vertical supination"] },
        { code:"C", ex:["Elevations laterales haltere assis", "Face pull"] },
        { code:"D", ex:["Curl marteau a la corde", "Extension triceps overhead"] },
      ] },
    { id:"bb", name:"Bas du corps B", min:60,
      warm:"5 min velo + cat-cow x 10 + bird dog 2 x 8 + hip hinge a vide + 2 series montantes de squat.",
      blocks:[
        { code:"A", ex:["Squat a la Smith machine"] },
        { code:"B", ex:["Hip thrust", "Planche laterale"] },
        { code:"C", ex:["Fentes fendues haltere", "Leg curl assis"] },
        { code:"D", ex:["Mollets assis"] },
      ] },
  ],
  exercises: {
    "Developpe incline haltere":        E("compound",  "kg", 2.5, "dumbbell", { cue:"Banc a 30 deg, descente lente. Coudes a 45 deg du torse." }),
    "Tirage vertical prise large":      E("compound",  "lb", 10,  "machine",  { cue:"Buste legerement en arriere, tu tires vers le haut des pectoraux." }),
    "Developpe epaules poulie":         E("compound",  "lb", 10,  "machine",  { cue:"Poulie basse. Abdos gaines, pas de cambrure." }),
    "Rowing haltere unilateral":        E("compound",  "kg", 2.5, "dumbbell", { cue:"Un genou et une main sur le banc, dos plat, tu tires vers la hanche." }),
    "Elevations laterales poulie basse":E("lateral",   "lb", 10,  "machine",  { cue:"Poulie derriere le dos, tension constante. Leger." }),
    "Curl poulie pupitre":              E("isolation", "kg", 2.5, "bar",      { cue:"Barre au pupitre, coudes bloques, aucune triche possible." }),
    "Extension triceps corde":          E("isolation", "lb", 10,  "machine",  { cue:"Coudes colles au corps, tu ecartes la corde en fin de mouvement." }),
    "Presse a cuisses":                 E("compound",  "kg", 5,   "bar",      { cue:"Bas du dos et bassin colles au dossier : tu descends jusqu'au point ou le bassin resterait plaque." }),
    "Souleve de terre roumain":         E("compound",  "kg", 5,   "bar",      { cue:"Jambes quasi tendues, fesses en arriere, dos plat. Tu t'arretes ou le dos reste plat." }),
    "Planche":                          E("core",      "kg", 0,   "body",     { u:"s", cue:"Coudes sous les epaules, fesses serrees, bassin rentre : dos plat. Tu arretes des que la position se degrade." }),
    "Leg extension":                    E("isolation", "lb", 10,  "machine",  { cue:"Pause 1 s en haut, contraction maximale." }),
    "Leg curl allonge":                 E("isolation", "lb", 10,  "machine",  { cue:"Pas de decollement du bassin." }),
    "Mollets a la presse":              E("isolation", "kg", 5,   "bar",      { cue:"Jambes tendues, pause 1 s en haut." }),
    "Developpe couche haltere":         E("compound",  "kg", 2.5, "bar",      { label:"Developpe couche barre", cue:"Barre, charge notee = disques (sans la barre). Tu ne verrouilles pas les coudes en haut." }),
    "Tirage horizontal poulie":         E("compound",  "lb", 10,  "machine",  { cue:"Buste immobile, tu serres les omoplates en fin de tirage." }),
    "Ecarte haltere banc incline":      E("isolation", "kg", 2.5, "dumbbell", { cue:"Coudes flechis et FIXES. Leger : exercice d'etirement, pas de force." }),
    "Tirage vertical supination":       E("compound",  "lb", 10,  "machine",  { cue:"Prise supination, coudes serres." }),
    "Elevations laterales haltere assis":E("lateral",  "kg", 1,   "dumbbell", { cue:"Banc dossier vertical : impossible de tricher avec l'elan." }),
    "Face pull":                        E("isolation", "lb", 10,  "machine",  { cue:"Poulie hauteur visage, coudes hauts, tu ouvres vers les oreilles." }),
    "Curl marteau a la corde":          E("isolation", "lb", 10,  "machine",  { cue:"Prise neutre, coudes fixes. Cible le brachial." }),
    "Extension triceps overhead":       E("isolation", "lb", 10,  "machine",  { cue:"Bras au-dessus de la tete, etirement complet en bas." }),
    "Squat a la Smith machine":         E("compound",  "kg", 5,   "bar",      { cue:"Pieds legerement avances, descente controlee, dos plat." }),
    "Hip thrust":                       E("compound",  "kg", 5,   "bar",      { cue:"Haut du dos sur le banc, menton rentre, tu pousses par les talons et serres les fesses 1 s en haut. Pas de cambrure." }),
    "Planche laterale":                 E("core",      "kg", 0,   "body",     { r:[20, 40], u:"s / cote", cue:"Coude sous l'epaule, corps aligne, hanche haute. Commence par le cote gauche." }),
    "Fentes fendues haltere":           E("compound",  "kg", 2.5, "dumbbell", { pdc:true, r:[8, 12], u:"/ jambe", cue:"Descente verticale. Commence par ta jambe faible. Pied arriere sur le banc = version bulgare." }),
    "Leg curl assis":                   E("isolation", "lb", 10,  "machine",  { cue:"Etirement plus fort des ischios qu'allonge." }),
    "Mollets assis":                    E("isolation", "lb", 10,  "machine",  { cue:"Amplitude complete, tempo lent." }),
  },
};

const clone = x => JSON.parse(JSON.stringify(x));
const round1 = n => Math.round(n * 10) / 10;
const DAY = 86400000;

/* ------------------------------------------------------------ migration */
/* Accepte un export v3 (HIST, MEAS, ovr) ou un etat v4. Idempotente, ne
   perd rien : l'historique est copie tel quel. */
export function migrate(raw) {
  const s = clone(raw && typeof raw === "object" ? raw : {});
  if (!Array.isArray(s.HIST)) s.HIST = [];
  if (!Array.isArray(s.MEAS)) s.MEAS = [];
  if (s.OVR !== undefined) { if (!s.ovr) s.ovr = s.OVR; delete s.OVR; }
  if (s.DRAFT !== undefined) { if (s.draft === undefined) s.draft = s.DRAFT; delete s.DRAFT; }
  if (!s.ovr || typeof s.ovr !== "object" || Array.isArray(s.ovr)) s.ovr = {};
  if (s.draft === undefined || (s.draft && typeof s.draft !== "object")) s.draft = null;
  if (!s.program || !s.program.exercises) s.program = clone(DEFAULT_PROGRAM);
  if (!Array.isArray(s.program.rotation) || !s.program.rotation.length) s.program.rotation = clone(DEFAULT_PROGRAM.rotation);
  if (!Array.isArray(s.notes)) s.notes = [];
  if (!s.next_targets || typeof s.next_targets !== "object") s.next_targets = {};
  s.plates = { ...PLATES, ...(s.plates || {}) };
  s.settings = { ...SETTINGS, ...(s.settings || {}) };
  s.v = VERSION;
  return s;
}

/* ------------------------------------------------------------ programme */
/* exercice resolu : les valeurs du type comblent ce que l'exercice ne fixe pas */
export function exercise(state, name) {
  const e = state.program.exercises[name];
  if (!e) return null;
  const t = TYPES[e.type] || TYPES.isolation;
  const unit = state.ovr[name] || e.unit || "kg";
  return { ...t, ...e, n:name, label: e.label || name, unit, r: e.r || t.r, s: e.s || t.s, rest: e.rest || t.rest,
           time: !!(e.time ?? t.time), pdc: !!(e.pdc ?? t.pdc), disabled: e.disabled || null };
}
export const exercises = state => Object.keys(state.program.exercises).map(n => exercise(state, n));
export const session   = (state, id) => state.program.sessions.find(s => s.id === id) || null;
export const rMin = ex => ex.r[0];
export const rMax = ex => ex.r[1];
export const isBW = ex => !!(ex.pdc || ex.time);

/* exercices d'une seance, actifs seulement, dans l'ordre des blocs */
export function sessionExercises(state, id, { includeDisabled = false } = {}) {
  const s = session(state, id);
  if (!s) return [];
  return s.blocks.flatMap(b => b.ex.map(n => ({ block:b.code, ex: exercise(state, n) })))
    .filter(x => x.ex && (includeDisabled || !x.ex.disabled));
}

export function updateExercise(state, name, patch) {
  const e = state.program.exercises[name];
  if (!e) throw new Error("exercice inconnu : " + name);
  const allowed = ["type", "unit", "inc", "gear", "r", "s", "rest", "time", "pdc", "u", "cue", "label"];
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) throw new Error("champ non modifiable : " + k);
    if (k === "r" && !(Array.isArray(patch.r) && patch.r.length === 2 && patch.r[0] > 0 && patch.r[1] >= patch.r[0])) throw new Error("fourchette invalide");
    if (k === "type" && !TYPES[patch.type]) throw new Error("type inconnu : " + patch.type);
    e[k] = patch[k];
  }
  return exercise(state, name);
}

export function disableExercise(state, name, reason, date = new Date().toISOString()) {
  const e = state.program.exercises[name];
  if (!e) throw new Error("exercice inconnu : " + name);
  e.disabled = { since: date, reason: reason || "" };
  return exercise(state, name);
}
export function enableExercise(state, name) {
  const e = state.program.exercises[name];
  if (!e) throw new Error("exercice inconnu : " + name);
  delete e.disabled;
  return exercise(state, name);
}

/* ajoute un exercice (nouveau ou existant) a une seance, dans un bloc */
export function addExerciseToSession(state, sessionId, name, { block = null, after = null, def = null } = {}) {
  const s = session(state, sessionId);
  if (!s) throw new Error("seance inconnue : " + sessionId);
  if (!state.program.exercises[name]) {
    if (!def || !TYPES[def.type]) throw new Error("exercice inconnu, definition requise avec un type valide : " + name);
    state.program.exercises[name] = { gear:"machine", unit:"kg", inc:2.5, ...def };
  }
  if (s.blocks.some(b => b.ex.includes(name))) return s;
  let b = block ? s.blocks.find(x => x.code === block) : null;
  if (after) { b = s.blocks.find(x => x.ex.includes(after)); if (b) { b.ex.splice(b.ex.indexOf(after) + 1, 0, name); return s; } }
  if (!b) { b = s.blocks[s.blocks.length - 1]; }
  b.ex.push(name);
  return s;
}
export function removeExerciseFromSession(state, sessionId, name) {
  const s = session(state, sessionId);
  if (!s) throw new Error("seance inconnue : " + sessionId);
  s.blocks.forEach(b => { b.ex = b.ex.filter(n => n !== name); });
  return s;
}
/* remplace un exercice par un autre dans une seance : l'ancien garde son
   historique sous son nom, le nouveau demarre le sien */
export function replaceExercise(state, sessionId, oldName, newName, def = null) {
  const s = session(state, sessionId);
  if (!s) throw new Error("seance inconnue : " + sessionId);
  const b = s.blocks.find(x => x.ex.includes(oldName));
  if (!b) throw new Error(oldName + " n'est pas dans la seance " + sessionId);
  if (!state.program.exercises[newName]) {
    if (!def || !TYPES[def.type]) throw new Error("definition requise pour " + newName);
    state.program.exercises[newName] = { gear:"machine", unit:"kg", inc:2.5, ...def };
  }
  b.ex[b.ex.indexOf(oldName)] = newName;
  return s;
}
export function setRotation(state, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !session(state, id))) throw new Error("rotation invalide");
  state.program.rotation = ids.slice();
  return state.program.rotation;
}

/* ------------------------------------------------------------ charges */
/* arrondit a une charge qui existe vraiment a la salle */
export function roundLoad(state, ex, w) {
  if (ex.time) return 0;
  if (ex.gear === "dumbbell" && state.plates.dumbbell?.length) {
    const list = state.plates.dumbbell;
    if (w <= 0) return 0;
    return list.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a);
  }
  const step = ex.unit === "lb" ? (state.plates.machine_lb || 10) : (state.plates.bar || ex.inc || 2.5);
  return round1(Math.max(0, Math.round(w / step) * step));
}
/* premiere charge strictement superieure / inferieure disponible */
export function higherLoad(state, ex, w) {
  let v = roundLoad(state, ex, w + (ex.inc || 2.5));
  if (v > w) return v;
  if (ex.gear === "dumbbell" && state.plates.dumbbell?.length) {
    const up = state.plates.dumbbell.filter(x => x > w);
    return up.length ? up[0] : w;
  }
  const step = ex.unit === "lb" ? (state.plates.machine_lb || 10) : (state.plates.bar || ex.inc || 2.5);
  return round1(w + step);
}
export function lowerLoad(state, ex, w, factor = 0.9) {
  let v = roundLoad(state, ex, w * factor);
  if (v < w) return v;
  if (ex.gear === "dumbbell" && state.plates.dumbbell?.length) {
    const dn = state.plates.dumbbell.filter(x => x < w);
    return dn.length ? dn[dn.length - 1] : 0;
  }
  const step = ex.unit === "lb" ? (state.plates.machine_lb || 10) : (state.plates.bar || ex.inc || 2.5);
  return round1(Math.max(0, w - step));
}

/* ------------------------------------------------------------ historique */
/* une serie compte si elle est validee, a des reps, et une charge sauf au poids du corps */
export const validSets = (ex, sets) => sets.filter(x => x.ok !== false && Number(x.r) > 0 && (isBW(ex) || Number(x.w) > 0));
export const topW = sets => sets.length ? Math.max(...sets.map(x => Number(x.w) || 0)) : 0;
/* series de travail = celles a la charge la plus lourde de la seance ; les
   plus legeres sont de l'echauffement et ne comptent ni pour ni contre */
export const workSets = (ex, sets) => { if (ex.time) return sets; const t = topW(sets); return sets.filter(x => Number(x.w) === t); };

/* seances valides d'un exercice, la plus recente d'abord */
export function perfs(state, name) {
  const ex = exercise(state, name);
  if (!ex) return [];
  const out = [];
  for (let i = state.HIST.length - 1; i >= 0; i--) {
    const all = state.HIST[i].log?.[name];
    if (!all || !all.length) continue;
    const sets = validSets(ex, all);
    if (!sets.length) continue;
    const work = workSets(ex, sets).map(x => Number(x.r));
    out.push({ date: state.HIST[i].date, session: state.HIST[i].id, top: ex.time ? 0 : topW(sets), work, all,
               vol: work.reduce((a, b) => a + b, 0) });
  }
  return out;
}
export const lastPerf = (state, name) => perfs(state, name)[0] || null;

/* plan de reps : reps de la derniere fois +1 sur chaque serie qui n'est pas
   encore au max (+5 s en chronometre), jamais en dessous du min */
export function nextPlan(state, ex, work) {
  const mn = rMin(ex), mx = rMax(ex), s = ex.s, step = ex.time ? state.settings.timeStep : 1;
  const plan = Array.from({ length: s }, () => mn);
  if (!work || !work.length) return plan;
  const w = work.slice(-s).map(r => Math.max(mn, Math.min(mx, r + step)));
  const off = s - w.length;
  w.forEach((r, i) => plan[off + i] = r);
  return plan;
}

/* ------------------------------------------------------------ suggestion */
/* La regle de progression. Resultat : { kind, w, plan, ... }
   target  : cible imposee (next_targets), utilisee telle quelle
   first   : jamais fait, demander la charge de depart
   rusty   : plus de rustyAfter jours sans l'exercice, reprise en douceur
   time / timemax : exercice chronometre, +5 s / variante plus dure
   up      : toutes les series de travail au max -> charge suivante
   stall   : deloadAfter seances sans progres avec une serie sous le min -> -10 %
   short   : pas assez de series de travail la derniere fois
   reps    : toutes les series au moins au min -> meme charge, +1 rep
   hold    : une serie sous le min -> meme charge, le min partout */
export function suggest(state, name, now = Date.now()) {
  const ex = exercise(state, name);
  if (!ex) throw new Error("exercice inconnu : " + name);
  const t = state.next_targets[name];
  if (t) return { kind:"target", w: ex.time ? 0 : Number(t.w), plan: t.reps ? t.reps.slice(0, ex.s) : Array.from({ length: ex.s }, () => rMin(ex)), author: t.author || null, date: t.date || null };

  const hist = perfs(state, name);
  if (!hist.length) return { kind:"first", w: isBW(ex) ? 0 : null, plan: nextPlan(state, ex, []) };
  const last = hist[0];
  const days = Math.floor((now - new Date(last.date).getTime()) / DAY);
  const s = ex.s, mn = rMin(ex), mx = rMax(ex);
  const complete = last.work.length >= s - 1;
  const allMax = complete && last.work.every(r => r >= mx);
  const allMin = complete && last.work.every(r => r >= mn);
  const base = { from: last.top, date: last.date, last: last.work, days };

  if (ex.time) return { ...base, w:0, kind: allMax ? "timemax" : "time", plan: nextPlan(state, ex, last.work) };

  const w = last.top;
  if (days > state.settings.rustyAfter) {
    const f = days > state.settings.longRustyAfter ? 0.8 : 0.9;
    return { ...base, w: lowerLoad(state, ex, w, f), kind:"rusty", plan: nextPlan(state, ex, []) };
  }
  if (allMax) return { ...base, w: higherLoad(state, ex, w), kind:"up", plan: nextPlan(state, ex, []) };

  /* seances consecutives a cette charge sans progres du total de reps */
  let st = 0;
  for (let i = 0; i < hist.length && hist[i].top === w; i++) {
    const older = hist[i + 1] && hist[i + 1].top === w ? hist[i + 1] : null;
    if (older && hist[i].vol > older.vol) break;
    st++;
  }
  if (!complete) return { ...base, w, kind:"short", n: last.work.length, plan: nextPlan(state, ex, last.work) };
  if (allMin)    return { ...base, w, kind:"reps", n: st, plan: nextPlan(state, ex, last.work) };
  if (st >= state.settings.deloadAfter) return { ...base, w: lowerLoad(state, ex, w, 0.9), kind:"stall", n: st, plan: Array.from({ length: s }, () => mx) };
  return { ...base, w, kind:"hold", n: st, miss: last.work.filter(r => r < mn).length, plan: nextPlan(state, ex, last.work) };
}

/* plan complet d'une seance : un objet par exercice actif */
export function planSession(state, sessionId, now = Date.now()) {
  return sessionExercises(state, sessionId).map(({ block, ex }) => ({ block, ex, suggestion: suggest(state, ex.n, now), last: lastPerf(state, ex.n), notes: notes(state, { exercise: ex.n, session: sessionId }) }));
}

/* ------------------------------------------------------------ rotation */
export function nextSession(state) {
  const rot = state.program.rotation;
  if (!state.HIST.length) return rot[0];
  const last = state.HIST[state.HIST.length - 1].id;
  const i = rot.lastIndexOf(last);
  return rot[(i + 1) % rot.length];
}

/* ------------------------------------------------------------ enregistrement */
/* ajoute une seance a l'historique et consomme les cibles imposees des
   exercices qui y figurent */
export function recordSession(state, { id, date = new Date().toISOString(), bw = null, log = {} }) {
  if (!session(state, id)) throw new Error("seance inconnue : " + id);
  const clean = {};
  for (const [name, sets] of Object.entries(log)) {
    const keep = (sets || []).filter(x => x && x.r !== "" && x.r != null)
      .map(x => ({ w: Number(x.w) || 0, r: Number(x.r) || 0, ok: x.ok !== false }));
    if (keep.length) clean[name] = keep;
  }
  if (!Object.keys(clean).length) throw new Error("aucune serie a enregistrer");
  const entry = { id, date, bw: bw == null || bw === "" ? null : Number(bw), log: clean };
  state.HIST.push(entry);
  for (const name of Object.keys(clean)) delete state.next_targets[name];
  return entry;
}

/* ------------------------------------------------------------ cibles imposees */
export function setNextTargets(state, name, { w = null, reps = null, author = "ju", date = new Date().toISOString() }) {
  const ex = exercise(state, name);
  if (!ex) throw new Error("exercice inconnu : " + name);
  if (!ex.time && (w == null || !(Number(w) >= 0))) throw new Error("charge requise");
  if (reps != null && !(Array.isArray(reps) && reps.length && reps.every(r => Number(r) > 0))) throw new Error("reps invalides");
  state.next_targets[name] = { w: ex.time ? 0 : Number(w), reps: reps ? reps.map(Number) : null, author, date };
  return state.next_targets[name];
}
export function clearNextTargets(state, name) { delete state.next_targets[name]; }

/* ------------------------------------------------------------ notes */
export function addNote(state, { text, author = "ju", exercise: exName = null, session: sessionId = null, date = new Date().toISOString() }) {
  if (!text || !String(text).trim()) throw new Error("note vide");
  if (exName && !state.program.exercises[exName]) throw new Error("exercice inconnu : " + exName);
  if (sessionId && !session(state, sessionId)) throw new Error("seance inconnue : " + sessionId);
  const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const note = { id, date, author, text: String(text).trim(), exercise: exName, session: sessionId };
  state.notes.push(note);
  return note;
}
/* filtre : par exercice (+ notes globales), par seance (+ globales), par auteur */
export function notes(state, { exercise: exName, session: sessionId, author, includeGlobal = true } = {}) {
  return state.notes.filter(n =>
    (author ? n.author === author : true) &&
    (exName || sessionId
      ? (exName && n.exercise === exName) || (sessionId && n.session === sessionId && !n.exercise) || (includeGlobal && !n.exercise && !n.session)
      : true));
}
export function removeNote(state, id) { state.notes = state.notes.filter(n => n.id !== id); }

/* ------------------------------------------------------------ corps */
export function bodyweight(state) {
  const pts = [
    ...state.MEAS.filter(m => m.bw).map(m => ({ d: m.date, v: Number(m.bw) })),
    ...state.HIST.filter(h => h.bw).map(h => ({ d: h.date, v: Number(h.bw) })),
  ].filter(p => p.v > 0).sort((a, b) => new Date(a.d) - new Date(b.d));
  return pts.map((p, i) => {
    const t = new Date(p.d).getTime();
    const win = pts.slice(0, i + 1).filter(q => t - new Date(q.d).getTime() < 7 * DAY);
    return { ...p, ma7: round1(win.reduce((a, q) => a + q.v, 0) / win.length) };
  });
}
export function measurementsDue(state, now = Date.now(), days = 30) {
  const last = state.MEAS.length ? state.MEAS[state.MEAS.length - 1].date : null;
  if (!last) return { due: true, days: null, last: null };
  const d = Math.floor((now - new Date(last).getTime()) / DAY);
  return { due: d >= days, days: d, last };
}

/* ------------------------------------------------------------ bilan */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + "-W" + String(Math.ceil(((t - y0) / DAY + 1) / 7)).padStart(2, "0");
}
export function report(state, now = Date.now(), { stagnantAfter = 4 } = {}) {
  const perEx = [];
  for (const ex of exercises(state)) {
    const h = perfs(state, ex.n);
    if (!h.length) continue;
    const val = p => ex.time ? Math.min(...p.work) : p.top;
    const cur = val(h[0]), best = Math.max(...h.map(val));
    const at = d => { const p = h.find(q => now - new Date(q.date).getTime() >= d * DAY); return p ? val(p) : null; };
    const t4 = at(28), t8 = at(56);
    /* une seance progresse si elle depasse la meilleure charge precedente, ou
       si elle fait plus de reps que la precedente a charge egale */
    let noProgress = 0;
    for (let i = 0; i < h.length; i++) {
      const prevBest = Math.max(0, ...h.slice(i + 1).map(val));
      const prev = h[i + 1];
      const better = val(h[i]) > prevBest || (prev && val(h[i]) === val(prev) && h[i].vol > prev.vol);
      if (better) break;
      noProgress++;
    }
    perEx.push({ exercise: ex.n, unit: ex.time ? "s" : ex.unit, disabled: !!ex.disabled, sessions: h.length,
      best, current: cur, lastDate: h[0].date,
      trend4: t4 == null ? null : round1(cur - t4), trend8: t8 == null ? null : round1(cur - t8),
      noProgress, stagnant: noProgress >= stagnantAfter });
  }
  const weeks = [];
  for (let k = 7; k >= 0; k--) {
    const d = new Date(now - k * 7 * DAY);
    weeks.push({ week: isoWeek(d), sessions: 0 });
  }
  const idx = Object.fromEntries(weeks.map((w, i) => [w.week, i]));
  for (const h of state.HIST) { const w = isoWeek(new Date(h.date)); if (w in idx) weeks[idx[w]].sessions++; }
  return { exercises: perEx, stagnant: perEx.filter(e => e.stagnant && !e.disabled), attendance: weeks,
           bodyweight: bodyweight(state).slice(-12), measurements: measurementsDue(state, now) };
}

/* export complet, tel qu'il doit etre sauvegarde */
export const exportAll = state => clone({ v: VERSION, ovr: state.ovr, HIST: state.HIST, MEAS: state.MEAS,
  program: state.program, notes: state.notes, next_targets: state.next_targets, plates: state.plates, settings: state.settings,
  draft: state.draft || null });
