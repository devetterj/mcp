/* Les outils exposes a Claude. Chacun passe par core.js : les memes fonctions
   que l'app et que le futur coach, jamais un chemin parallele. */
import { z } from "zod";
import * as C from "./core.js";
import { load, modify } from "./store.js";

const DAY = 86400000;
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
  }
  return g.kind;
}

export function register(server) {
  /* ------------------------------------------------------------ lecture */
  server.registerTool("get_program", {
    title: "Programme",
    description: "Le programme d'entrainement : rotation des seances, exercices de chaque seance (type, fourchette de reps, series, increment, unite, repos), exercices desactives avec motif, cibles imposees en attente, materiel disponible et reglages de progression.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  }, run(async () => {
    const { rev, state } = await load();
    return { rev, rotation: state.program.rotation, next_session: C.nextSession(state),
      sessions: state.program.sessions.map(s => ({ id: s.id, name: s.name, warmup: s.warm,
        exercises: C.sessionExercises(state, s.id, { includeDisabled: true }).map(({ block, ex }) => exerciseView(state, ex, block)) })),
      other_exercises: C.exercises(state).filter(e => !state.program.sessions.some(s => s.blocks.some(b => b.ex.includes(e.n)))).map(e => e.n),
      plates: state.plates, settings: state.settings, types: C.TYPES };
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
    return { session: id, name: C.session(state, id).name,
      exercises: C.planSession(state, id).map(({ block, ex, suggestion: g, last }) => ({
        name: ex.n, label: ex.label, block, kind: g.kind, weight: ex.time ? null : g.w, plan_reps: g.plan, unit: ex.time ? "s" : ex.unit,
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
    return { stagnant: r.stagnant.map(e => ({ exercise: e.exercise, no_progress_sessions: e.noProgress, best: e.best, current: e.current, unit: e.unit, trend_4w: e.trend4, trend_8w: e.trend8 })),
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
    description: "Modifie le programme. action = 'update_exercise' (patch : type, range [min,max], sets, inc, unit, gear, rest, label, cue) ; 'add_exercise' (exercise, session, definition si nouveau : {type, unit, inc, gear, cue}, after optionnel) ; 'remove_exercise' (exercise, session) ; 'replace_exercise' (session, exercise = ancien, new_exercise, definition si nouveau) ; 'set_rotation' (rotation = liste d'identifiants de seances). L'historique reste rattache au nom interne de chaque exercice.",
    inputSchema: z.object({
      action: z.enum(["update_exercise", "add_exercise", "remove_exercise", "replace_exercise", "set_rotation"]),
      exercise: z.string().optional().describe("Nom interne de l'exercice concerne"),
      session: z.string().optional().describe("Identifiant de seance : ha, ba, hb, bb"),
      patch: z.object({ type: z.enum(["compound", "isolation", "lateral", "core"]).optional(), range: z.array(z.number().int().positive()).length(2).optional(),
        sets: z.number().int().min(1).max(8).optional(), inc: z.number().min(0).optional(), unit: z.enum(["kg", "lb"]).optional(),
        gear: z.enum(["dumbbell", "bar", "machine", "body"]).optional(), rest: z.number().int().min(0).max(600).optional(),
        label: z.string().optional(), cue: z.string().optional() }).optional(),
      new_exercise: z.string().optional(),
      definition: z.object({ type: z.enum(["compound", "isolation", "lateral", "core"]), unit: z.enum(["kg", "lb"]).optional(), inc: z.number().min(0).optional(),
        gear: z.enum(["dumbbell", "bar", "machine", "body"]).optional(), cue: z.string().optional(), label: z.string().optional() }).optional(),
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
        case "set_rotation": return { rotation: C.setRotation(state, a.rotation || []) };
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
