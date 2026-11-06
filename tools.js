/* Les outils exposes a Claude. Chacun passe par core.js : les memes fonctions
   que l'app et que le futur coach, jamais un chemin parallele. */
import { z } from "zod";
import * as C from "./core.js";
import { load, modify } from "./store.js";

const DAY = 86400000;
/* banque d'images (Free Exercise DB, domaine public) : index des exercices et
   deux photos par exercice, exercises/<id>/0.jpg (depart) et 1.jpg (arrivee) */
const DB_ROOT = process.env.EXERCISE_DB_ROOT || "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/";
const DB_IMAGES = DB_ROOT + "exercises/";
let dbIndex = null;
async function exerciseDb() {
  if (dbIndex) return dbIndex;
  const r = await fetch(DB_ROOT + "dist/exercises.json");
  if (!r.ok) throw new Error("banque d'images injoignable (" + r.status + ")");
  dbIndex = await r.json();
  return dbIndex;
}
async function isImage(url) {
  const r = await fetch(url, { method: "HEAD" });
  return r.ok && /^image\//.test(r.headers.get("content-type") || "");
}
const ok = data => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const fail = e => { console.error("outil:", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); return { content: [{ type: "text", text: "Erreur : " + (e && e.message ? e.message : String(e)) }], isError: true }; };
const run = fn => async args => { try { return ok(await fn(args || {})); } catch (e) { return fail(e); } };
const d10 = iso => iso ? iso.slice(0, 10) : null;
const r1 = n => Math.round(n * 10) / 10;

/* resume compact d'une seance : par exercice, charge max, meilleure serie, total de reps */
function summarize(state, h) {
  const exercises = {};
  for (const [name, sets] of Object.entries(h.log || {})) {
    const ex = C.exercise(state, name);
    const valid = ex ? C.validSets(ex, sets) : sets.filter(x => x.r > 0);
    if (!valid.length) continue;
    const top = C.topW(valid), work = ex ? C.workSets(ex, valid) : valid;
    const best = work.reduce((a, x) => (x.r > (a ? a.r : -1) ? x : a), null);
    exercises[name] = { top: ex && ex.time ? null : top, best: best ? (ex && ex.time ? best.r + " s" : top + "x" + best.r) : null,
      total_reps: work.reduce((a, x) => a + Number(x.r), 0), sets: valid.length, work_reps: work.map(x => Number(x.r)) };
  }
  return { date: h.date, session: h.id, bodyweight: h.bw ?? null, exercises };
}

function exerciseView(state, ex, block) {
  return { name: ex.n, label: ex.label, block: block || null, type: ex.type, range: ex.r, sets: ex.s, increment: ex.inc,
    unit: ex.time ? "s" : ex.unit, gear: ex.gear, rest_s: ex.rest, timed: !!ex.time, bodyweight_ok: !!ex.pdc,
    disabled: ex.disabled ? { since: d10(ex.disabled.since), reason: ex.disabled.reason } : null,
    profile: ex.profile, variant: ex.variant, free_variant: ex.free, anchor: ex.anchor, max_load: C.maxLoad(state, ex), images: ex.images,
    next_target: state.next_targets[ex.n] || null };
}

function reason(ex, g) {
  const mn = C.rMin(ex), mx = C.rMax(ex);
  switch (g.kind) {
    case "target": return `cible imposee${g.author ? " par " + g.author : ""}`;
    case "first": return "jamais fait : charge de depart a choisir";
    case "rusty": return `${g.days} jours sans cet exercice : reprise en douceur (${g.from} -> ${g.w})`;
    case "up": return `${ex.s}x${mx} reussi a ${g.from} : charge suivante`;
    case "reps": return `toutes les series au moins a ${mn} : meme charge, +1 rep par serie non au max`;
    case "hold": return `${g.miss} serie(s) sous ${mn} : meme charge, viser ${mn} partout (${g.n} seance(s) sans progres)`;
    case "stall": return `${g.n} seances sans progres avec une serie sous ${mn} : charge reduite de 10 %`;
    case "short": return `seulement ${g.n} serie(s) de travail la derniere fois : on complete`;
    case "time": return "exercice chronometre : +5 s par serie non au max";
    case "timemax": return `${mx} s partout : passer a une variante plus dure`;
    case "variant": return `plafond du materiel a ${g.from} : passer en variante "${g.next}" et repartir a ${mn} reps`;
    case "setplus": return `toutes les variantes passees a ${g.from} : ajouter une ${g.sets}e serie`;
    case "variantfree": return `haut de la fourchette atteint au poids du corps : durcir la variante (angle, pieds sureleves, lest)`;
    case "maxed": return `au bout des variantes a ${g.from} : ajouter des reps ou changer d'exercice`;
  }
  return g.kind;
}

export function register(server) {
  /* ------------------------------------------------------------ lecture */
  server.registerTool("get_program", {
    title: "Programme",
    description: "Le programme d'entrainement : profil de materiel actif (salle ou maison), rotation active, exercices de chaque seance du profil actif (type, fourchette, series, increment, unite, repos, variante en cours, plafond de charge), exercices desactives avec motif, cibles imposees, materiel de chaque profil et reglages de progression. En profil Maison les charges sont plafonnees (halteres 20 kg) : la progression passe par les variantes.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  }, run(async () => {
    const { rev, state } = await load();
    const pid = state.activeProfile;
    return { rev, active_profile: pid, profiles: state.profiles, rotation: C.rotation(state), rotations: state.program.rotations, next_session: C.nextSession(state),
      variant_order: state.settings.variantOrder,
      sessions: state.program.sessions.filter(s => (s.profile || "salle") === pid).map(s => ({ id: s.id, name: s.name, warmup: s.warm,
        exercises: C.sessionExercises(state, s.id, { includeDisabled: true }).map(({ block, ex }) => exerciseView(state, ex, block)) })),
      other_profile_sessions: state.program.sessions.filter(s => (s.profile || "salle") !== pid).map(s => ({ id: s.id, name: s.name, profile: s.profile || "salle" })),
      settings: state.settings, types: C.TYPES };
  }));

  server.registerTool("get_history", {
    title: "Historique des seances",
    description: "Seances enregistrees, les plus recentes d'abord. Filtres : periode (from/to, dates ISO), exercice, type de seance. granularity 'summary' (defaut) = par exercice charge max, meilleure serie, total de reps ; 'sets' = toutes les series (charge, reps, validee). limit par defaut 20, maximum 100.",
    inputSchema: z.object({
      from: z.string().optional().describe("Date ISO de debut (incluse), ex. 2026-10-01"),
      to: z.string().optional().describe("Date ISO de fin (incluse)"),
      exercise: z.string().optional().describe("Nom interne exact d'un exercice"),
      session: z.string().optional().describe("Identifiant de seance : ha, ba, hb, bb"),
      granularity: z.enum(["summary", "sets"]).optional(),
      limit: z.number().int().min(1).max(100).optional()
    }),
    annotations: { readOnlyHint: true }
  }, run(async ({ from, to, exercise, session, granularity = "summary", limit = 20 }) => {
    const { state } = await load();
    let list = state.HIST.slice().reverse();
    if (from) list = list.filter(h => h.date >= from);
    if (to) list = list.filter(h => h.date.slice(0, 10) <= to.slice(0, 10));
    if (session) list = list.filter(h => h.id === session);
    if (exercise) list = list.filter(h => h.log && h.log[exercise]);
    const total = list.length;
    list = list.slice(0, limit);
    const out = list.map(h => {
      if (granularity === "sets") {
        const log = exercise ? { [exercise]: h.log[exercise] } : h.log;
        return { date: h.date, session: h.id, bodyweight: h.bw ?? null, log };
      }
      const s = summarize(state, h);
      if (exercise) s.exercises = { [exercise]: s.exercises[exercise] };
      return s;
    });
    return { total, returned: out.length, sessions: out };
  }));

  server.registerTool("get_last_session", {
    title: "Derniere seance",
    description: "La derniere seance enregistree (ou la derniere d'un type donne), avec toutes ses series, et la comparaison exercice par exercice avec la seance precedente du meme type (difference de charge max et de total de reps).",
    inputSchema: z.object({ session: z.string().optional().describe("Identifiant de seance : ha, ba, hb, bb. Par defaut la toute derniere.") }),
    annotations: { readOnlyHint: true }
  }, run(async ({ session }) => {
    const { state } = await load();
    const all = state.HIST.filter(h => !session || h.id === session);
    if (!all.length) return { session: null };
    const last = all[all.length - 1], prev = all.filter(h => h.id === last.id).slice(-2)[0];
    const a = summarize(state, last), b = prev && prev !== last ? summarize(state, prev) : null;
    const comparison = {};
    for (const [name, cur] of Object.entries(a.exercises)) {
      const p = b && b.exercises[name];
      comparison[name] = p ? { top_delta: cur.top != null && p.top != null ? r1(cur.top - p.top) : null, reps_delta: cur.total_reps - p.total_reps } : { first_time: true };
    }
    return { session: { date: last.date, id: last.id, bodyweight: last.bw ?? null, log: last.log }, summary: a, previous_date: b ? b.date : null, comparison };
  }));

  server.registerTool("get_next_plan", {
    title: "Plan de la prochaine seance",
    description: "Ce que l'app proposera a la prochaine seance (par defaut la prochaine de la rotation) : pour chaque exercice actif, la charge, le plan de reps serie par serie, la derniere performance et la raison de la proposition. Tient compte des cibles imposees.",
    inputSchema: z.object({ session: z.string().optional().describe("Identifiant de seance : ha, ba, hb, bb") }),
    annotations: { readOnlyHint: true }
  }, run(async ({ session }) => {
    const { state } = await load();
    const id = session || C.nextSession(state);
    if (!C.session(state, id)) throw new Error("seance inconnue : " + id);
    return { session: id, name: C.session(state, id).name, profile: state.activeProfile, gear: C.sessionGear(state, id),
      exercises: C.planSession(state, id).map(({ block, ex, suggestion: g, last }) => ({
        name: ex.n, label: ex.label, block, kind: g.kind, weight: ex.time ? null : g.w, plan_reps: g.plan, unit: ex.time ? "s" : ex.unit,
        variant: g.kind === "variant" ? g.next : (g.variant || null), gear: ex.gear, band_combo: ex.gear === "band" && g.w > 0 ? C.bandCombo(state, g.w) : null, anchor: ex.anchor,
        last: last ? { date: last.date, top: ex.time ? null : last.top, work_reps: last.work, all_sets: last.all.map(x => ({ w: x.w, r: x.r })) } : null,
        reason: reason(ex, g), notes: C.notes(state, { exercise: ex.n, session: id }).map(n => ({ author: n.author, text: n.text })) })) };
  }));

  server.registerTool("get_bodyweight", {
    title: "Poids de corps",
    description: "Pesees (seances et mensurations) avec moyenne glissante sur 7 jours, sur les N dernieres semaines (12 par defaut).",
    inputSchema: z.object({ weeks: z.number().int().min(1).max(104).optional() }),
    annotations: { readOnlyHint: true }
  }, run(async ({ weeks = 12 }) => {
    const { state } = await load();
    const pts = C.bodyweight(state).filter(p => Date.now() - new Date(p.d).getTime() <= weeks * 7 * DAY);
    return { weeks, points: pts.map(p => ({ date: d10(p.d), kg: p.v, avg7: p.ma7 })), latest: pts.length ? pts[pts.length - 1].v : null };
  }));

  server.registerTool("get_measurements", {
    title: "Mensurations",
    description: "Toutes les mensurations enregistrees (poids, tour de taille, bras, poitrine, cuisse) et le nombre de jours depuis la derniere.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  }, run(async () => {
    const { state } = await load();
    return { measurements: state.MEAS.map(m => ({ date: d10(m.date), bw: m.bw || null, waist: m.waist || null, arm: m.arm || null, chest: m.chest || null, thigh: m.thigh || null })),
      reminder: C.measurementsDue(state) };
  }));

  server.registerTool("get_stagnation_report", {
    title: "Bilan de progression",
    description: "Par exercice : meilleure charge, charge actuelle, tendance a 4 et 8 semaines, nombre de seances consecutives sans progres (ni charge, ni reps a charge egale). Liste les exercices stagnants depuis min_sessions seances (4 par defaut) et l'assiduite des 8 dernieres semaines.",
    inputSchema: z.object({ min_sessions: z.number().int().min(1).max(20).optional() }),
    annotations: { readOnlyHint: true }
  }, run(async ({ min_sessions = 4 }) => {
    const { state } = await load();
    const r = C.report(state, Date.now(), { stagnantAfter: min_sessions });
    return { profile: r.profile, stagnant: r.stagnant.map(e => ({ exercise: e.exercise, no_progress_sessions: e.noProgress, best: e.best, current: e.current, unit: e.unit, trend_4w: e.trend4, trend_8w: e.trend8 })),
      exercises: r.exercises.map(e => ({ exercise: e.exercise, sessions: e.sessions, best: e.best, current: e.current, unit: e.unit, last: d10(e.lastDate), trend_4w: e.trend4, trend_8w: e.trend8, no_progress_sessions: e.noProgress, disabled: e.disabled })),
      attendance: r.attendance, measurements_due: r.measurements.due };
  }));

  server.registerTool("get_notes", {
    title: "Notes",
    description: "Notes laissees dans l'app (par l'utilisateur 'ju', par 'claude' via ce connecteur, ou par le 'coach'), filtrables par exercice, seance ou auteur. Sans filtre : toutes.",
    inputSchema: z.object({ exercise: z.string().optional(), session: z.string().optional(), author: z.string().optional() }),
    annotations: { readOnlyHint: true }
  }, run(async ({ exercise, session, author }) => {
    const { state } = await load();
    return { notes: C.notes(state, { exercise, session, author }).map(n => ({ id: n.id, date: n.date, author: n.author, text: n.text, exercise: n.exercise, session: n.session })) };
  }));

  /* ------------------------------------------------------------ ecriture */
  server.registerTool("update_program", {
    title: "Modifier le programme",
    description: "Modifie le programme. action = 'update_exercise' (patch : type, range [min,max], sets (max 5), inc, unit, gear, rest, label, cue, variant, anchor) ; 'add_exercise' (exercise, session, definition si nouveau : {type, unit, inc, gear, cue}, after optionnel) ; 'remove_exercise' (exercise, session) ; 'replace_exercise' (session, exercise = ancien, new_exercise, definition si nouveau) ; 'set_rotation' (rotation = liste d'identifiants de seances du profil actif) ; 'set_profile' (profile = 'salle' ou 'maison' : bascule materiel, rotation et exercices) ; 'update_profile' (profile, plates = {dumbbell:[...], bands:[...], bar, machine_lb}). L'historique reste rattache au nom interne de chaque exercice.",
    inputSchema: z.object({
      action: z.enum(["update_exercise", "add_exercise", "remove_exercise", "replace_exercise", "set_rotation", "set_profile", "update_profile"]),
      exercise: z.string().optional().describe("Nom interne de l'exercice concerne"),
      session: z.string().optional().describe("Identifiant de seance : ha, ba, hb, bb"),
      patch: z.object({ type: z.enum(["compound", "isolation", "lateral", "core"]).optional(), range: z.array(z.number().int().positive()).length(2).optional(),
        sets: z.number().int().min(1).max(5).optional(), inc: z.number().min(0).optional(), unit: z.enum(["kg", "lb"]).optional(),
        gear: z.enum(["dumbbell", "bar", "machine", "band", "straps", "body"]).optional(), rest: z.number().int().min(0).max(600).optional(),
        label: z.string().optional(), cue: z.string().optional(), variant: z.string().nullable().optional(), anchor: z.string().nullable().optional() }).optional(),
      profile: z.enum(["salle", "maison"]).optional(),
      plates: z.object({ dumbbell: z.array(z.number()).optional(), bands: z.array(z.number()).optional(), bar: z.number().optional(), machine_lb: z.number().optional() }).optional(),
      new_exercise: z.string().optional(),
      definition: z.object({ type: z.enum(["compound", "isolation", "lateral", "core"]), unit: z.enum(["kg", "lb"]).optional(), inc: z.number().min(0).optional(),
        gear: z.enum(["dumbbell", "bar", "machine", "band", "straps", "body"]).optional(), cue: z.string().optional(), label: z.string().optional() }).optional(),
      after: z.string().optional().describe("Pour add_exercise : nom de l'exercice apres lequel inserer"),
      rotation: z.array(z.string()).optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, run(async (a) => {
    const { rev, result } = await modify(state => {
      switch (a.action) {
        case "update_exercise": {
          if (!a.exercise || !a.patch) throw new Error("exercise et patch requis");
          const p = { ...a.patch }; if (p.range) { p.r = p.range; delete p.range; } if (p.sets != null) { p.s = p.sets; delete p.sets; }
          return exerciseView(state, C.updateExercise(state, a.exercise, p));
        }
        case "add_exercise": {
          if (!a.exercise || !a.session) throw new Error("exercise et session requis");
          C.addExerciseToSession(state, a.session, a.exercise, { after: a.after, def: a.definition ? { gear: "machine", unit: "kg", inc: 2.5, ...a.definition } : null });
          return { session: a.session, exercises: C.sessionExercises(state, a.session, { includeDisabled: true }).map(x => x.ex.n) };
        }
        case "remove_exercise": {
          if (!a.exercise || !a.session) throw new Error("exercise et session requis");
          C.removeExerciseFromSession(state, a.session, a.exercise);
          return { session: a.session, exercises: C.sessionExercises(state, a.session, { includeDisabled: true }).map(x => x.ex.n) };
        }
        case "replace_exercise": {
          if (!a.exercise || !a.session || !a.new_exercise) throw new Error("session, exercise et new_exercise requis");
          C.replaceExercise(state, a.session, a.exercise, a.new_exercise, a.definition ? { gear: "machine", unit: "kg", inc: 2.5, ...a.definition } : null);
          return { session: a.session, exercises: C.sessionExercises(state, a.session, { includeDisabled: true }).map(x => x.ex.n) };
        }
        case "set_rotation": return { profile: state.activeProfile, rotation: C.setRotation(state, a.rotation || []) };
        case "set_profile": { if (!a.profile) throw new Error("profile requis"); C.setActiveProfile(state, a.profile); return { active_profile: a.profile, rotation: C.rotation(state), next_session: C.nextSession(state) }; }
        case "update_profile": { if (!a.profile || !a.plates) throw new Error("profile et plates requis"); return { profile: a.profile, plates: C.updateProfile(state, a.profile, a.plates) }; }
      }
      throw new Error("action inconnue");
    });
    return { rev, ...result };
  }));

  server.registerTool("disable_exercise", {
    title: "Desactiver un exercice",
    description: "Masque temporairement un exercice des seances et l'exclut des calculs, sans perdre son historique. Un motif est demande (ex. blessure lombaire).",
    inputSchema: z.object({ exercise: z.string(), reason: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, run(async ({ exercise, reason }) => {
    const { rev, result } = await modify(state => exerciseView(state, C.disableExercise(state, exercise, reason)));
    return { rev, ...result };
  }));

  server.registerTool("enable_exercise", {
    title: "Reactiver un exercice",
    description: "Reactive un exercice precedemment desactive.",
    inputSchema: z.object({ exercise: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, run(async ({ exercise }) => {
    const { rev, result } = await modify(state => exerciseView(state, C.enableExercise(state, exercise)));
    return { rev, ...result };
  }));

  server.registerTool("add_note", {
    title: "Laisser une note",
    description: "Ajoute une consigne visible dans l'app : en haut de l'exercice concerne pendant la seance, en tete d'une seance, ou sur l'accueil si elle est generale. author par defaut 'claude'.",
    inputSchema: z.object({ text: z.string().min(1), exercise: z.string().optional(), session: z.string().optional(), author: z.string().optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, run(async ({ text, exercise, session, author = "claude" }) => {
    const { rev, result } = await modify(state => C.addNote(state, { text, exercise, session, author }));
    return { rev, note: result };
  }));

  server.registerTool("set_next_targets", {
    title: "Imposer une cible",
    description: "Impose la charge et/ou les reps par serie de la prochaine seance d'un exercice, a la place du calcul automatique. Consommee des que la seance est enregistree. author par defaut 'claude'.",
    inputSchema: z.object({ exercise: z.string(), weight: z.number().min(0).optional().describe("Charge (inutile pour un exercice chronometre)"),
      reps: z.array(z.number().int().positive()).optional().describe("Reps par serie, ex. [8,8,8]"), author: z.string().optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, run(async ({ exercise, weight, reps, author = "claude" }) => {
    const { rev, result } = await modify(state => C.setNextTargets(state, exercise, { w: weight ?? null, reps: reps || null, author }));
    return { rev, exercise, target: result };
  }));

  server.registerTool("search_exercise_images", {
    title: "Chercher une illustration",
    description: "Cherche dans la banque d'images libre de droits Free Exercise DB (plus de 800 exercices, chacun avec une photo de depart et une photo d'arrivee). La recherche porte sur le nom anglais de l'exercice (ex. 'split squat dumbbell', 'hip thrust', 'face pull'). Renvoie l'identifiant (db_id) a passer a set_exercise_image, le materiel, les muscles et les deux URL de photos. Regarde les photos avant de choisir : le materiel et la position doivent correspondre a l'exercice du carnet.",
    inputSchema: z.object({ query: z.string().min(2).describe("Mots-cles en anglais"), limit: z.number().int().min(1).max(20).optional() }),
    annotations: { readOnlyHint: true }
  }, run(async ({ query, limit = 8 }) => {
    const db = await exerciseDb();
    const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    const scored = db.map(e => {
      const hay = (e.name + " " + e.id + " " + (e.equipment || "") + " " + (e.primaryMuscles || []).join(" ")).toLowerCase();
      const name = e.name.toLowerCase();
      const score = words.reduce((a, w) => a + (name.includes(w) ? 3 : hay.includes(w) ? 1 : 0), 0);
      return { e, score };
    }).filter(x => x.score > 0 && (x.e.images || []).length >= 2).sort((a, b) => b.score - a.score).slice(0, limit);
    return { results: scored.map(({ e }) => ({ db_id: e.id, name: e.name, equipment: e.equipment, muscles: e.primaryMuscles,
      start_url: DB_IMAGES + e.images[0], end_url: DB_IMAGES + e.images[1] })) };
  }));

  server.registerTool("set_exercise_image", {
    title: "Associer une illustration",
    description: "Associe a un exercice du carnet deux photos de la banque Free Exercise DB : position de depart et position d'arrivee, affichees cote a cote dans l'app quand on touche l'icone image de l'exercice. Donne soit db_id (trouve avec search_exercise_images), soit start_url et end_url de cette meme banque ; toute autre source est refusee. Les deux photos sont verifiees avant l'enregistrement. clear = true retire l'illustration (l'app revient a son image par defaut).",
    inputSchema: z.object({
      exercise: z.string().describe("Nom interne exact de l'exercice (voir get_program)"),
      db_id: z.string().optional().describe("Identifiant Free Exercise DB, ex. Split_Squat_with_Dumbbells"),
      start_url: z.string().optional(), end_url: z.string().optional(),
      clear: z.boolean().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, run(async ({ exercise, db_id, start_url, end_url, clear }) => {
    if (clear) { const { rev } = await modify(state => C.setExerciseImages(state, exercise, null, DB_IMAGES)); return { rev, exercise, images: null }; }
    let images;
    if (db_id) {
      if (!/^[A-Za-z0-9_()'.,-]+$/.test(db_id)) throw new Error("db_id invalide");
      images = { start: DB_IMAGES + db_id + "/0.jpg", end: DB_IMAGES + db_id + "/1.jpg", source: db_id };
    } else if (start_url && end_url) images = { start: start_url, end: end_url, source: null };
    else throw new Error("donne db_id, ou start_url et end_url");
    if (!images.start.startsWith(DB_IMAGES) || !images.end.startsWith(DB_IMAGES)) throw new Error("seules les photos de " + DB_IMAGES + " sont acceptees");
    if (!(await isImage(images.start)) || !(await isImage(images.end))) throw new Error("photo introuvable dans la banque : verifie db_id avec search_exercise_images");
    const { rev, result } = await modify(state => C.setExerciseImages(state, exercise, images, DB_IMAGES));
    return { rev, exercise, label: result.label, images: result.images };
  }));

  server.registerTool("clear_next_targets", {
    title: "Retirer une cible imposee",
    description: "Supprime la cible imposee d'un exercice : le calcul automatique reprend.",
    inputSchema: z.object({ exercise: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, run(async ({ exercise }) => {
    const { rev } = await modify(state => { C.clearNextTargets(state, exercise); return null; });
    return { rev, exercise, cleared: true };
  }));
}
