/* ============================================================
   core.js — couche metier du carnet.
   Module pur, sans DOM ni reseau : utilise par l'app, par le
   serveur MCP et par le backend du coach. Toute lecture ou
   modification des donnees passe par ces fonctions.
   ============================================================ */

export const VERSION = 7;

/* fourchettes et repos par type d'exercice (modifiables par exercice) */
export const TYPES = {
  compound:  { r:[6, 10],  s:3, rest:150 },
  isolation: { r:[10, 15], s:3, rest:90 },
  lateral:   { r:[12, 20], s:3, rest:90 },
  core:      { r:[30, 60], s:3, rest:60, time:true, pdc:true },
};

/* trajectoire de poids cible par defaut (brief du 6 novembre 2026) */
export const DEFAULT_WEIGHT_TARGET = [
  { date: "2026-11-04", kg: 86.5 }, { date: "2026-12-01", kg: 85.0 }, { date: "2027-01-01", kg: 83.0 }, { date: "2027-02-01", kg: 81.0 },
  { date: "2027-03-01", kg: 79.5 }, { date: "2027-04-01", kg: 78.0 }, { date: "2027-05-01", kg: 76.5 }, { date: "2027-06-01", kg: 75.5 },
];
export const WEIGH_CONDITIONS = ["matin", "salle"];   /* a jeun le matin / a la salle avant la seance */
export const CHECKIN_VIEWS = ["face", "profil", "dos"];
export const LIGHT_WEEK = { factor: 0.85, days: 7, minFatigued: 3 };

export const SETTINGS = {
  deloadAfter: 2,     /* seances sans progres (avec une serie sous le min) avant -10 % */
  rustyAfter: 21,     /* jours sans l'exercice -> reprise a -10 % */
  longRustyAfter: 42, /* jours -> reprise a -20 % */
  timeStep: 5,        /* secondes ajoutees sur les exercices chronometres */
};

/* materiel par profil : l'arrondi tombe toujours sur une charge qui existe.
   Halteres en kg, barres/presse par pas, machines par pas (lb), elastiques
   en kg par combinaison (30 + 20 = 50). */
export const DEFAULT_PROFILES = {
  salle:  { label: "Salle",  dumbbell: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17.5, 20, 22.5], bar: 2.5, machine_lb: 10, bands: [] },
  maison: { label: "Maison", dumbbell: [2, 4.5, 7, 9.5, 12, 14.5, 17, 19.5], bar: 2.5, machine_lb: 10, bands: [10, 20, 30, 40, 50, 60] },
};
export const PLATES = DEFAULT_PROFILES.salle;
/* variantes proposees quand la charge est au plafond, dans cet ordre */
export const VARIANTS = ["tempo 4s", "pause 2s", "unilateral", "serie+"];
export const MAX_SETS = 5;
/* banque d'images autorisee pour les illustrations (Free Exercise DB, domaine public) :
   chaque exercice de la banque a une photo de depart (0.jpg) et d'arrivee (1.jpg) */
export const IMAGE_DB = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

const E = (type, unit, inc, gear, extra = {}) => ({ type, unit, inc, gear, ...extra });

/* seance Bas unique de la Salle (3 seances par semaine) : le meilleur de
   Bas A et Bas B, avec les noms d'exercices existants pour garder l'historique */
const BAS_SALLE = () => [
  { code:"A", ex:["Presse a cuisses"] },
  { code:"B", ex:["Hip thrust", "Souleve de terre roumain"] },
  { code:"C", ex:["Leg extension", "Leg curl allonge"] },
  { code:"D", ex:["Mollets a la presse", "Planche"] },
];

export const DEFAULT_PROGRAM = {
  rotation: ["ha", "ba", "hb"],
  rotations: { salle: ["ha", "ba", "hb"], maison: ["mha", "mb", "mhb"] },
  sessions: [
    { id:"mha", name:"Maison — Haut A (poussee)", min:60, profile:"maison",
      warm:"3 min corde a sauter ou montees de genoux + rotations d'epaules + face pull elastique 10 kg x 15 + 1 serie legere de developpe incline.",
      blocks:[
        { code:"A", ex:["Developpe incline halteres (maison)", "Rowing haltere un bras appui banc (maison)"] },
        { code:"B", ex:["Extension triceps overhead haltere (maison)", "Tirage vertical elastique a genoux (maison)"] },
        { code:"C", ex:["Developpe epaules assis halteres (maison)", "Elevations laterales halteres (maison)"] },
        { code:"D", ex:["Planche (maison)"] },
      ] },
    { id:"mb", name:"Maison — Bas", min:60, profile:"maison",
      warm:"3 min marche rapide ou montees de genoux + cat-cow x 10 + bird dog x 8 par cote + 15 squats a vide + 10 fentes a vide par jambe. Apres la planche laterale : bird dog 2 x 10 par cote, non logue.",
      blocks:[
        { code:"A", ex:["Fentes bulgares (maison)"] },
        { code:"B", ex:["Hip thrust au banc (maison)", "Goblet squat (maison)", "Mollets debout une jambe (maison)"] },
        { code:"C", ex:["Leg curl aux sangles (maison)", "Planche laterale (maison)"] },
      ] },
    { id:"mhb", name:"Maison — Haut B (tirage)", min:60, profile:"maison",
      warm:"3 min corde a sauter ou montees de genoux + rotations d'epaules + face pull elastique 10 kg x 15 + 1 serie legere de developpe couche.",
      blocks:[
        { code:"A", ex:["Developpe couche halteres (maison)", "Rowing inverse aux sangles (maison)"] },
        { code:"B", ex:["Ecarte incline halteres (maison)", "Curl marteau halteres (maison)"] },
        { code:"C", ex:["Tirage horizontal elastique assis (maison)", "Face pull elastique (maison)"] },
        { code:"D", ex:["Pompes pieds sureleves (maison)"] },
      ] },
    { id:"ha", name:"Haut du corps A", min:60,
      warm:"5 min rameur ou velo + rotations d'epaules + 2 series legeres de developpe incline.",
      blocks:[
        { code:"A", ex:["Developpe incline haltere", "Tirage vertical prise large"] },
        { code:"B", ex:["Developpe epaules poulie", "Rowing haltere unilateral"] },
        { code:"C", ex:["Elevations laterales poulie basse", "Curl poulie pupitre", "Extension triceps corde"] },
      ] },
    { id:"ba", name:"Bas du corps", min:60,
      warm:"5 min velo + cat-cow x 10 + bird dog 2 x 8 + 20 squats a vide + 2 series montantes a la presse.",
      blocks: BAS_SALLE() },
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

    /* ---- profil Maison : halteres reglables 2 x 20 kg, banc, elastiques, sangles ---- */
    "Developpe incline halteres (maison)":        E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Developpe incline halteres", img:"developpe-incline-haltere", s:4, r:[8,15], rest:120, start:20, cue:"Banc a 30 deg, descente 3 s, coudes a 45 deg. Deja au plafond de charge : vise 15 reps, puis les variantes." }),
    "Developpe epaules assis halteres (maison)":  E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Developpe epaules assis halteres", s:3, r:[8,12], rest:120, start:12, cue:"Dossier vertical, dos plaque, ne cambre pas." }),
    "Tirage vertical elastique a genoux (maison)":E("compound",  "kg", 10,  "band",     { profile:"maison", label:"Tirage vertical elastique a genoux", anchor:"haut", s:3, r:[10,15], rest:120, start:50, cue:"A genoux, elastique a l'ancrage haut. Tire vers le haut de la poitrine, coudes vers les hanches." }),
    "Rowing haltere un bras appui banc (maison)": E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Rowing haltere un bras, appui banc", img:"rowing-haltere-unilateral", s:3, r:[10,15], rest:120, start:20, cue:"Genou et main sur le banc, dos plat : l'appui protege les lombaires. Tire vers la hanche." }),
    "Elevations laterales halteres (maison)":     E("lateral",   "kg", 1,   "dumbbell", { profile:"maison", label:"Elevations laterales halteres", img:"elevations-laterales-haltere-assis", s:3, r:[12,20], rest:90, start:8, cue:"Sans elan. Variante : elastique 10 kg sous les pieds." }),
    "Extension triceps overhead haltere (maison)":E("isolation", "kg", 2.5, "dumbbell", { profile:"maison", label:"Extension triceps overhead haltere", s:3, r:[10,15], rest:90, start:17, single:true, cue:"Assis, un haltere tenu a deux mains, coudes serres, dos contre le dossier." }),
    "Planche (maison)":                           E("core",      "kg", 0,   "body",     { profile:"maison", label:"Planche", img:"planche", r:[45,60], u:"s", rest:60, cue:"Coudes sous les epaules, bassin rentre, dos plat. +5 s quand les 3 series sont tenues." }),
    "Fentes bulgares (maison)":                   E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Fentes bulgares", s:4, r:[8,12], rest:120, start:12, u:"/ jambe", cue:"Pied arriere sur le banc, un haltere par main, buste droit, descente lente. L'exercice principal des jambes." }),
    "Hip thrust au banc (maison)":                E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Hip thrust au banc", img:"hip-thrust", s:4, r:[12,20], rest:120, start:20, single:true, cue:"Epaules sur le banc, haltere sur le bassin. Serre les fessiers 1 s en haut, menton rentre, pas de cambrure." }),
    "Goblet squat (maison)":                      E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Goblet squat", s:3, r:[12,20], rest:120, start:20, single:true, cue:"Un haltere contre la poitrine, talons au sol, buste droit. Variante : pause 2 s en bas." }),
    "Leg curl aux sangles (maison)":              E("isolation", "kg", 0,   "straps",   { profile:"maison", label:"Leg curl aux sangles", s:3, r:[10,15], rest:90, pdc:true, free:true, cue:"Allonge sur le dos, talons dans les poignees, bassin decolle pendant tout l'exercice." }),
    "Mollets debout une jambe (maison)":          E("isolation", "kg", 2.5, "dumbbell", { profile:"maison", label:"Mollets debout une jambe", s:3, r:[15,20], rest:90, start:20, u:"/ jambe", single:true, cue:"Sur une marche, l'haltere dans la main du cote travaille. Pause 1 s en haut, descente complete." }),
    "Planche laterale (maison)":                  E("core",      "kg", 0,   "body",     { profile:"maison", label:"Planche laterale", img:"planche-laterale", r:[30,45], u:"s / cote", rest:60, cue:"Coude sous l'epaule, hanche haute, corps aligne. Puis bird dog 2 x 10 par cote." }),
    "Developpe couche halteres (maison)":         E("compound",  "kg", 2.5, "dumbbell", { profile:"maison", label:"Developpe couche halteres", img:"developpe-couche-haltere", s:4, r:[10,15], rest:120, start:20, cue:"Banc plat. Au plafond des le depart : descente 3 s, pause 1 s en bas." }),
    "Rowing inverse aux sangles (maison)":        E("compound",  "kg", 0,   "straps",   { profile:"maison", label:"Rowing inverse aux sangles", s:4, r:[8,15], rest:120, pdc:true, free:true, cue:"Corps tendu a 45 deg, tire la poitrine vers les poignees. Progression : angle plus bas, puis pieds sur le banc, puis sac leste." }),
    "Ecarte incline halteres (maison)":           E("isolation", "kg", 2.5, "dumbbell", { profile:"maison", label:"Ecarte incline halteres", img:"ecarte-haltere-banc-incline", s:3, r:[12,15], rest:90, start:14.5, cue:"Coudes legerement flechis et fixes, etirement controle." }),
    "Tirage horizontal elastique assis (maison)": E("compound",  "kg", 10,  "band",     { profile:"maison", label:"Tirage horizontal elastique assis", anchor:"bas", s:3, r:[12,15], rest:120, start:30, cue:"Assis au sol, elastique a l'ancrage bas. Omoplates serrees, buste immobile." }),
    "Face pull elastique (maison)":               E("isolation", "kg", 10,  "band",     { profile:"maison", label:"Face pull elastique", img:"face-pull", anchor:"visage", s:3, r:[15,20], rest:90, start:20, cue:"Elastique a hauteur du visage, tire vers le front, coudes hauts." }),
    "Curl marteau halteres (maison)":             E("isolation", "kg", 2.5, "dumbbell", { profile:"maison", label:"Curl marteau halteres", s:3, r:[10,15], rest:90, start:12, cue:"Sans elan, dos contre un mur si besoin." }),
    "Pompes pieds sureleves (maison)":            E("compound",  "kg", 0,   "body",     { profile:"maison", label:"Pompes pieds sureleves", s:2, r:[8,30], rest:120, pdc:true, free:true, cue:"Pieds sur le banc, corps gaine. Note le maximum de reps propres ; variante lestee plus tard." }),
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
  /* v5 : profils de materiel, rotations multiples, programme Maison ajoute sans toucher au reste */
  if (!s.profiles || typeof s.profiles !== "object") {
    s.profiles = clone(DEFAULT_PROFILES);
    if (s.plates) s.profiles.salle = { ...s.profiles.salle, ...clone(s.plates) };
  }
  for (const k of Object.keys(DEFAULT_PROFILES)) s.profiles[k] = { ...clone(DEFAULT_PROFILES[k]), ...(s.profiles[k] || {}) };
  /* la liste provisoire des halteres Maison (avant reception du colis) est remplacee par la liste reelle */
  if (JSON.stringify(s.profiles.maison.dumbbell) === JSON.stringify([2, 4.5, 7, 9.5, 12, 14.5, 17, 20])) s.profiles.maison.dumbbell = clone(DEFAULT_PROFILES.maison.dumbbell);
  if (!s.activeProfile || !s.profiles[s.activeProfile]) s.activeProfile = "salle";
  if (!s.program.rotations || typeof s.program.rotations !== "object") s.program.rotations = { salle: s.program.rotation.slice(), maison: clone(DEFAULT_PROGRAM.rotations.maison) };
  for (const k of Object.keys(DEFAULT_PROGRAM.rotations)) if (!Array.isArray(s.program.rotations[k]) || !s.program.rotations[k].length) s.program.rotations[k] = clone(DEFAULT_PROGRAM.rotations[k]);
  for (const sess of DEFAULT_PROGRAM.sessions) if (!s.program.sessions.some(x => x.id === sess.id)) s.program.sessions.push(clone(sess));
  /* v6 : la Salle passe de 4 a 3 seances (Haut A, Bas, Haut B). Bas B reste
     dans le programme pour son historique, mais sort de la rotation. */
  if ((Number(raw && raw.v) || 0) < 6 && JSON.stringify(s.program.rotations.salle) === JSON.stringify(["ha", "ba", "hb", "bb"])) {
    s.program.rotations.salle = ["ha", "ba", "hb"];
    s.program.rotation = ["ha", "ba", "hb"];
    const ba = s.program.sessions.find(x => x.id === "ba");
    if (ba) { ba.name = "Bas du corps"; ba.blocks = BAS_SALLE(); }
  }
  for (const [n, e] of Object.entries(DEFAULT_PROGRAM.exercises)) if (!s.program.exercises[n]) s.program.exercises[n] = clone(e);
  s.plates = s.profiles[s.activeProfile];
  if (!Array.isArray(s.notes)) s.notes = [];
  if (!s.next_targets || typeof s.next_targets !== "object") s.next_targets = {};
  s.plates = { ...PLATES, ...(s.plates || {}) };
  s.settings = { ...SETTINGS, variantOrder: VARIANTS.slice(), ...(s.settings || {}) };
  /* v7 : trajectoire de poids, pesees hors seance, photos de bilan, RIR, semaine allegee */
  if (!Array.isArray(s.weightTarget) || !s.weightTarget.length) s.weightTarget = clone(DEFAULT_WEIGHT_TARGET);
  if (!Array.isArray(s.weighins)) s.weighins = [];
  if (s.lightWeek === undefined) s.lightWeek = null;
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
           time: !!(e.time ?? t.time), pdc: !!(e.pdc ?? t.pdc), disabled: e.disabled || null,
           profile: e.profile || "salle", gear: e.gear || "machine", variant: e.variant || null, free: !!e.free,
           img: e.img || null, images: e.images || null, anchor: e.anchor || null, start: e.start ?? null, single: !!e.single };
}
export const exercises = (state, profileId = null) => Object.keys(state.program.exercises).map(n => exercise(state, n)).filter(e => !profileId || e.profile === profileId);
export const profile  = state => state.profiles[state.activeProfile] || state.profiles.salle;
export const rotation = state => state.program.rotations[state.activeProfile] || state.program.rotation;
export function setActiveProfile(state, id) {
  if (!state.profiles[id]) throw new Error("profil inconnu : " + id);
  state.activeProfile = id; state.plates = state.profiles[id];
  return id;
}
export function updateProfile(state, id, patch) {
  if (!state.profiles[id]) throw new Error("profil inconnu : " + id);
  const p = state.profiles[id];
  if (patch.dumbbell) p.dumbbell = patch.dumbbell.map(Number).filter(v => v > 0).sort((a, b) => a - b);
  if (patch.bands) p.bands = patch.bands.map(Number).filter(v => v > 0).sort((a, b) => a - b);
  if (patch.bar > 0) p.bar = Number(patch.bar);
  if (patch.machine_lb > 0) p.machine_lb = Number(patch.machine_lb);
  if (state.activeProfile === id) state.plates = p;
  return p;
}
/* illustration en deux photos (depart, arrivee) prises dans la banque d'images ;
   null retire l'illustration et l'app revient a l'image du dossier img/ */
export function setExerciseImages(state, name, images, base = IMAGE_DB) {
  const e = state.program.exercises[name];
  if (!e) throw new Error("exercice inconnu : " + name);
  if (images == null) { delete e.images; return exercise(state, name); }
  const ok = u => typeof u === "string" && u.startsWith(base) && /^[A-Za-z0-9_()'.,\/-]+\.(jpg|jpeg|png)$/.test(u.slice(base.length));
  if (!ok(images.start) || !ok(images.end)) throw new Error("images refusees : seules les photos de la banque " + base + " sont acceptees");
  e.images = { start: images.start, end: images.end, source: images.source ? String(images.source).slice(0, 120) : null };
  return exercise(state, name);
}
/* combinaison d'elastiques a monter pour une charge donnee (30 + 20 = 50) */
export function bandCombo(state, w) {
  const parts = []; let rest = w;
  for (const b of [30, 20, 10]) if (rest >= b) { parts.push(b); rest -= b; }
  return rest === 0 && parts.length ? parts.join(" + ") : String(w);
}
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
  const allowed = ["type", "unit", "inc", "gear", "r", "s", "rest", "time", "pdc", "u", "cue", "label", "variant", "anchor", "free", "start", "img"];
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) throw new Error("champ non modifiable : " + k);
    if (k === "r" && !(Array.isArray(patch.r) && patch.r.length === 2 && patch.r[0] > 0 && patch.r[1] >= patch.r[0])) throw new Error("fourchette invalide");
    if (k === "type" && !TYPES[patch.type]) throw new Error("type inconnu : " + patch.type);
    if (k === "s" && !(patch.s >= 1 && patch.s <= MAX_SETS)) throw new Error("series : entre 1 et " + MAX_SETS);
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
export function setRotation(state, ids, profileId = state.activeProfile) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !session(state, id))) throw new Error("rotation invalide");
  state.program.rotations[profileId] = ids.slice();
  if (profileId === "salle") state.program.rotation = ids.slice();
  return state.program.rotations[profileId];
}

/* ------------------------------------------------------------ charges */
/* liste des charges possibles pour un exercice, ou null si pas de pas fixe */
function loadList(state, ex) {
  const p = profile(state);
  if (ex.gear === "dumbbell" && p.dumbbell?.length) return p.dumbbell;
  if (ex.gear === "band" && p.bands?.length) return p.bands;
  return null;
}
const stepOf = (state, ex) => ex.unit === "lb" ? (profile(state).machine_lb || 10) : (profile(state).bar || ex.inc || 2.5);
/* arrondit a une charge qui existe vraiment avec le materiel du profil */
export function roundLoad(state, ex, w) {
  if (ex.time || ex.gear === "straps" || ex.gear === "body") return 0;
  const list = loadList(state, ex);
  if (list) { if (w <= 0) return 0; return list.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a); }
  const st = stepOf(state, ex);
  return round1(Math.max(0, Math.round(w / st) * st));
}
/* charge maximale disponible pour cet exercice (null = pas de plafond connu) */
export function maxLoad(state, ex) {
  const list = loadList(state, ex);
  return list ? list[list.length - 1] : null;
}
/* premiere charge strictement superieure / inferieure disponible */
export function higherLoad(state, ex, w) {
  const list = loadList(state, ex);
  if (list) { const up = list.filter(x => x > w); return up.length ? up[0] : w; }
  const v = roundLoad(state, ex, w + (ex.inc || 2.5));
  return v > w ? v : round1(w + stepOf(state, ex));
}
export function lowerLoad(state, ex, w, factor = 0.9) {
  let v = roundLoad(state, ex, w * factor);
  if (v < w) return v;
  const list = loadList(state, ex);
  if (list) { const dn = list.filter(x => x < w); return dn.length ? dn[dn.length - 1] : 0; }
  return round1(Math.max(0, w - stepOf(state, ex)));
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
    const ws = workSets(ex, sets), work = ws.map(x => Number(x.r));
    const rir = ws.map(x => (x.rir == null || x.rir === "") ? null : Number(x.rir));
    out.push({ date: state.HIST[i].date, session: state.HIST[i].id, top: ex.time ? 0 : topW(sets), work, all, rir,
               avgRir: rir.length && rir.every(r => r != null) ? rir.reduce((a, b) => a + b, 0) / rir.length : null,
               variant: (ws.find(x => x.v) || {}).v || "", vol: work.reduce((a, b) => a + b, 0) });
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
export function suggest(state, name, now = Date.now(), { raw = false } = {}) {
  const g = suggestRaw(state, name, now);
  if (raw || g.kind === "target" || g.kind === "first" || !lightWeekActive(state, now)) return g;
  const ex = exercise(state, name);
  const sets = Math.max(1, g.plan.length - 1);
  return { ...g, light: true, w: ex.time || !(g.w > 0) ? g.w : roundLoad(state, ex, g.w * LIGHT_WEEK.factor), plan: g.plan.slice(0, sets) };
}
function suggestRaw(state, name, now) {
  const ex = exercise(state, name);
  if (!ex) throw new Error("exercice inconnu : " + name);
  const variant = ex.variant || "";
  const t = state.next_targets[name];
  if (t) return { kind:"target", w: ex.time ? 0 : Number(t.w), variant, plan: t.reps ? t.reps.slice(0, ex.s) : Array.from({ length: ex.s }, () => rMin(ex)), author: t.author || null, date: t.date || null };

  const hist = perfs(state, name);
  const mn = rMin(ex), mx = rMax(ex), s = ex.s;
  if (!hist.length) return { kind:"first", w: isBW(ex) ? 0 : (ex.start != null ? roundLoad(state, ex, ex.start) : null), variant, plan: nextPlan(state, ex, []) };
  const last = hist[0];
  const days = Math.floor((now - new Date(last.date).getTime()) / DAY);
  const complete = last.work.length >= s - 1;
  const allMax = complete && last.work.every(r => r >= mx);
  const allMin = complete && last.work.every(r => r >= mn);
  const base = { from: last.top, date: last.date, last: last.work, days, variant, rir: last.rir, avgRir: last.avgRir };

  if (ex.time) return { ...base, w:0, kind: allMax ? "timemax" : "time", plan: nextPlan(state, ex, last.work) };

  const w = last.top;
  if (days > state.settings.rustyAfter) return { ...base, w: lowerLoad(state, ex, w, days > state.settings.longRustyAfter ? 0.8 : 0.9), kind:"rusty", plan: nextPlan(state, ex, []) };
  if (allMax) {
    const next = higherLoad(state, ex, w);
    if (!isBW(ex) && next > w) {
      /* reps en reserve >= 2 en moyenne : la charge etait trop legere, deux paliers si le materiel les a */
      if (last.avgRir != null && last.avgRir >= 2) {
        const next2 = higherLoad(state, ex, next);
        if (next2 > next) return { ...base, w: next2, kind:"up2", plan: nextPlan(state, ex, []) };
      }
      return { ...base, w: next, kind:"up", plan: nextPlan(state, ex, []) };
    }
    /* plafond de charge : on progresse par la variante */
    if (ex.free) return { ...base, w, kind:"variantfree", plan: nextPlan(state, ex, []) };
    const order = state.settings.variantOrder || VARIANTS;
    const i = order.indexOf(variant);
    const nextV = i === -1 ? order[0] : order[i + 1];
    if (nextV && nextV !== "serie+") return { ...base, w, kind:"variant", next: nextV, plan: nextPlan(state, ex, []) };
    if (s < MAX_SETS) return { ...base, w, kind:"setplus", sets: s + 1, plan: Array.from({ length: s + 1 }, () => mn) };
    return { ...base, w, kind:"maxed", plan: nextPlan(state, ex, last.work) };
  }

  /* seances consecutives a cette charge et cette variante sans progres du total de reps */
  let st = 0;
  for (let i = 0; i < hist.length && hist[i].top === w && hist[i].variant === last.variant; i++) {
    const older = hist[i + 1] && hist[i + 1].top === w && hist[i + 1].variant === last.variant ? hist[i + 1] : null;
    if (older && hist[i].vol > older.vol) break;
    st++;
  }
  if (!complete) return { ...base, w, kind:"short", n: last.work.length, plan: nextPlan(state, ex, last.work) };
  /* reps en baisse deux seances de suite avec zero reserve des la premiere serie :
     fatigue probable, on garde la charge au lieu de la baisser */
  if (isFatigued(hist)) return { ...base, w, kind:"fatigue", n: st, plan: nextPlan(state, ex, last.work) };
  if (allMin)    return { ...base, w, kind:"reps", n: st, plan: nextPlan(state, ex, last.work) };
  if (st >= state.settings.deloadAfter) return { ...base, w: lowerLoad(state, ex, w, 0.9), kind:"stall", n: st, plan: Array.from({ length: s }, () => mx) };
  return { ...base, w, kind:"hold", n: st, miss: last.work.filter(r => r < mn).length, plan: nextPlan(state, ex, last.work) };
}
function isFatigued(hist) {
  if (hist.length < 2) return false;
  const [a, b] = hist;
  return a.top === b.top && a.variant === b.variant && a.vol < b.vol && a.rir[0] === 0 && b.rir[0] === 0;
}
/* date locale AAAA-MM-JJ (toISOString decalerait d'un jour selon le fuseau) */
export const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/* semaine allegee : proposee quand plusieurs exercices d'une meme seance sont
   en fatigue ; acceptee, elle reduit charges et series pendant LIGHT_WEEK.days */
export function lightWeekActive(state, now = Date.now()) {
  const lw = state.lightWeek;
  return !!(lw && lw.status === "acceptee" && lw.until && now < new Date(lw.until).getTime());
}
export function fatiguedExercises(state, sessionId, now = Date.now()) {
  return sessionExercises(state, sessionId).filter(({ ex }) => suggest(state, ex.n, now, { raw: true }).kind === "fatigue").map(x => x.ex.n);
}
export function maybeProposeLightWeek(state, sessionId, now = Date.now()) {
  const lw = state.lightWeek;
  if (lw && (lw.status === "proposee" || lightWeekActive(state, now))) return null;
  if (lw && lw.respondedAt && now - new Date(lw.respondedAt).getTime() < LIGHT_WEEK.days * DAY) return null;
  const tired = fatiguedExercises(state, sessionId, now);
  if (tired.length < LIGHT_WEEK.minFatigued) return null;
  state.lightWeek = { proposedAt: new Date(now).toISOString(), session: sessionId, exercises: tired, status: "proposee" };
  return state.lightWeek;
}
export function respondLightWeek(state, accept, now = Date.now()) {
  const lw = state.lightWeek;
  if (!lw || lw.status !== "proposee") throw new Error("aucune semaine allegee proposee");
  lw.status = accept ? "acceptee" : "refusee";
  lw.respondedAt = new Date(now).toISOString();
  if (accept) lw.until = new Date(now + LIGHT_WEEK.days * DAY).toISOString();
  return lw;
}

/* plan complet d'une seance : un objet par exercice actif */
export function planSession(state, sessionId, now = Date.now()) {
  return sessionExercises(state, sessionId).map(({ block, ex }) => ({ block, ex, suggestion: suggest(state, ex.n, now), last: lastPerf(state, ex.n), notes: notes(state, { exercise: ex.n, session: sessionId }) }));
}
/* materiel a preparer pour une seance : charges d'halteres dans l'ordre
   d'apparition, et combinaisons d'elastiques avec leur ancrage */
export function sessionGear(state, sessionId, now = Date.now()) {
  const dumbbells = [], bands = [];
  for (const { ex, suggestion: g } of planSession(state, sessionId, now)) {
    if (ex.gear === "dumbbell" && g.w > 0 && !dumbbells.includes(g.w)) dumbbells.push(g.w);
    if (ex.gear === "band" && g.w > 0) bands.push({ exercise: ex.label, load: g.w, combo: bandCombo(state, g.w), anchor: ex.anchor });
  }
  return { dumbbells, bands };
}

/* ------------------------------------------------------------ rotation */
/* Prochaine seance : celle de la rotation faite le moins recemment (jamais
   faite = la plus ancienne). Quand on suit l'ordre, c'est la suivante dans
   le cycle ; apres un changement de rotation ou une seance sautee, c'est la
   seance en retard qui revient. A egalite, l'ordre de la rotation tranche
   (la suivante apres la derniere seance enregistree d'abord). */
export function nextSession(state) {
  const rot = rotation(state);
  if (!state.HIST.length) return rot[0];
  const lastDate = Object.fromEntries(rot.map(id => [id, 0]));
  for (const h of state.HIST) if (Object.prototype.hasOwnProperty.call(lastDate, h.id)) lastDate[h.id] = Math.max(lastDate[h.id], new Date(h.date).getTime());
  const lastId = state.HIST[state.HIST.length - 1].id;
  const start = (rot.indexOf(lastId) + 1) % rot.length;
  let best = null;
  for (let k = 0; k < rot.length; k++) {
    const id = rot[(start + k) % rot.length];
    if (best === null || lastDate[id] < lastDate[best]) best = id;
  }
  return best;
}

/* ------------------------------------------------------------ enregistrement */
/* ajoute une seance a l'historique et consomme les cibles imposees des
   exercices qui y figurent */
export function recordSession(state, { id, date = new Date().toISOString(), bw = null, log = {} }) {
  if (!session(state, id)) throw new Error("seance inconnue : " + id);
  const clean = {};
  for (const [name, sets] of Object.entries(log)) {
    const keep = (sets || []).filter(x => x && x.r !== "" && x.r != null)
      .map(x => { const o = { w: Number(x.w) || 0, r: Number(x.r) || 0, ok: x.ok !== false }; if (x.v) o.v = String(x.v).trim();
                  if (x.rir != null && x.rir !== "") o.rir = Math.min(3, Math.max(0, Math.round(Number(x.rir)) || 0)); return o; });
    if (keep.length) clean[name] = keep;
  }
  if (!Object.keys(clean).length) throw new Error("aucune serie a enregistrer");
  const entry = { id, date, bw: bw == null || bw === "" ? null : Number(bw), log: clean };
  state.HIST.push(entry);
  for (const name of Object.keys(clean)) {
    delete state.next_targets[name];
    /* la variante utilisee devient la variante courante ; une serie de plus reussie s'installe (max 5) */
    const e = state.program.exercises[name]; if (!e) continue;
    const ex = exercise(state, name), valid = validSets(ex, clean[name]), work = workSets(ex, valid);
    if (!work.length) continue;
    const v = (work.find(x => x.v) || {}).v;
    if (v) e.variant = v; else if (e.variant) delete e.variant;
    if (!ex.time && work.length === ex.s + 1 && work.length <= MAX_SETS && work.every(x => Number(x.r) >= rMin(ex))) e.s = work.length;
  }
  maybeProposeLightWeek(state, id, new Date(date).getTime());
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
  const pts = weighins(state).map(p => ({ d: p.date, v: p.kg }));
  return pts.map((p, i) => {
    const t = new Date(p.d).getTime();
    const win = pts.slice(0, i + 1).filter(q => t - new Date(q.d).getTime() < 7 * DAY);
    return { ...p, ma7: round1(win.reduce((a, q) => a + q.v, 0) / win.length) };
  });
}
/* pesee rapide hors seance */
export function addWeighin(state, { kg, cond = "matin", date = new Date().toISOString() }) {
  const v = Number(kg);
  if (!(v > 20 && v < 300)) throw new Error("poids invalide");
  if (!WEIGH_CONDITIONS.includes(cond)) throw new Error("condition inconnue : " + cond);
  const w = { date, kg: round1(v), cond };
  state.weighins.push(w); state.weighins.sort((a, b) => new Date(a.date) - new Date(b.date));
  return w;
}
export function setWeightTarget(state, points) {
  if (!Array.isArray(points) || !points.length) throw new Error("trajectoire vide");
  const out = points.map(p => ({ date: String(p.date).slice(0, 10), kg: round1(Number(p.kg)) }));
  if (out.some(p => !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || isNaN(new Date(p.date).getTime()) || !(p.kg > 20 && p.kg < 300))) throw new Error("point invalide (date AAAA-MM-JJ et poids en kg)");
  out.sort((a, b) => a.date.localeCompare(b.date));
  state.weightTarget = out;
  return out;
}
/* cible interpolee lineairement, plate avant le premier point et apres le dernier */
export function targetAt(state, date) {
  const pts = state.weightTarget || [];
  if (!pts.length) return null;
  const t = new Date(date).getTime();
  const ts = pts.map(p => ({ t: new Date(p.date).getTime(), kg: p.kg }));
  if (t <= ts[0].t) return ts[0].kg;
  if (t >= ts[ts.length - 1].t) return ts[ts.length - 1].kg;
  for (let i = 1; i < ts.length; i++) if (t <= ts[i].t) {
    const a = ts[i - 1], b = ts[i];
    return Math.round((a.kg + (b.kg - a.kg) * (t - a.t) / (b.t - a.t)) * 100) / 100;
  }
  return null;
}
/* toutes les pesees avec leur condition : seances et mesures = a jeun le matin
   (c'est la consigne de l'app), plus les pesees rapides */
export function weighins(state) {
  return [
    ...state.MEAS.filter(m => m.bw).map(m => ({ date: m.date, kg: Number(m.bw), cond: "matin", src: "mesure" })),
    ...state.HIST.filter(h => h.bw).map(h => ({ date: h.date, kg: Number(h.bw), cond: "matin", src: "seance" })),
    ...(state.weighins || []).map(w => ({ date: w.date, kg: Number(w.kg), cond: w.cond || "matin", src: "pesee" })),
  ].filter(p => p.kg > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
}
/* tendance : moyenne 7 jours sur des pesees comparables (le matin si on en a
   assez, sinon toutes), cible a chaque date, ecart du jour, rythme sur 4 semaines */
export function weightTrend(state, weeks = 12, now = Date.now()) {
  const all = weighins(state);
  const recentMorning = all.filter(p => p.cond === "matin" && now - new Date(p.date).getTime() <= 28 * DAY).length;
  const basis = recentMorning >= 3 ? "matin" : "toutes";
  const used = basis === "matin" ? all.filter(p => p.cond === "matin") : all;
  const withMa = used.map((p, i) => {
    const t = new Date(p.date).getTime();
    const win = used.slice(0, i + 1).filter(q => t - new Date(q.date).getTime() < 7 * DAY);
    return { ...p, ma7: round1(win.reduce((a, q) => a + q.kg, 0) / win.length), target: targetAt(state, p.date) };
  });
  const points = withMa.filter(p => now - new Date(p.date).getTime() <= weeks * 7 * DAY);
  const latest = withMa[withMa.length - 1] || null;
  const targetToday = targetAt(state, new Date(now).toISOString());
  const gap = latest && targetToday != null ? round1(latest.ma7 - targetToday) : null;
  /* rythme : pente des pesees des 28 derniers jours (kg par semaine) */
  const r = used.filter(p => now - new Date(p.date).getTime() <= 28 * DAY);
  let rate = null;
  if (r.length >= 2) {
    const xs = r.map(p => new Date(p.date).getTime() / DAY), ys = r.map(p => p.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    rate = den ? round1((xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den) * 7 * 100) / 100 : null;
  }
  /* alerte : plus d'un kilo au-dessus de la cible, sans interruption, depuis 14 jours */
  const last14 = withMa.filter(p => now - new Date(p.date).getTime() <= 14 * DAY);
  const alert = last14.length >= 2 && last14.every(p => p.target != null && p.ma7 - p.target > 1) &&
                now - new Date(last14[0].date).getTime() >= 13 * DAY;
  return { basis, points, current: latest ? latest.ma7 : null, latestDate: latest ? latest.date : null, targetToday, gap,
           status: gap == null ? null : gap <= 0 ? "avance" : "retard", rate4w: rate, alert, target: state.weightTarget };
}

/* ---- bilans mensuels : MEAS + photos ---- */
export function lastSaturday(year, month /* 0-11 */) {
  const d = new Date(year, month + 1, 0);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}
/* rappel a partir du dernier samedi du mois, tant que le bilan du mois n'est pas fait
   (et encore deux semaines apres, si le mois precedent a ete oublie) */
export function checkinDue(state, now = Date.now()) {
  const d = new Date(now);
  const cur = lastSaturday(d.getFullYear(), d.getMonth());
  const prev = lastSaturday(d.getFullYear(), d.getMonth() - 1);
  const since = now >= cur.getTime() ? cur : prev;
  /* aucun bilan enregistre : le premier est du tout de suite, il sert de point de depart */
  if (!state.MEAS.length) return { due: true, first: true, since: ymd(since) };
  if (since === prev && now - prev.getTime() > 14 * DAY) return { due: false, since: null };
  const done = state.MEAS.some(m => new Date(m.date).getTime() >= since.getTime());
  return { due: !done, since: ymd(since) };
}
export function checkins(state) {
  const list = state.MEAS.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const num = v => (v === "" || v == null) ? null : Number(v);
  return list.map((m, i) => {
    const prev = list[i - 1];
    const fields = ["bw", "waist", "arm", "chest", "thigh"];
    const delta = {};
    if (prev) for (const f of fields) { const a = num(m[f]), b = num(prev[f]); delta[f] = a != null && b != null ? round1(a - b) : null; }
    return { date: m.date, bw: num(m.bw), waist: num(m.waist), arm: num(m.arm), chest: num(m.chest), thigh: num(m.thigh),
             photos: m.photos || null, delta: prev ? delta : null };
  });
}
export function addCheckin(state, { date = new Date().toISOString(), bw, waist, arm, chest, thigh, photos = null }) {
  const vals = { bw, waist, arm, chest, thigh };
  const rec = { date };
  for (const [k, v] of Object.entries(vals)) if (v !== "" && v != null && !isNaN(Number(v))) rec[k] = String(round1(Number(v)));
  if (photos) rec.photos = Object.fromEntries(CHECKIN_VIEWS.filter(v => photos[v]).map(v => [v, String(photos[v])]));
  if (Object.keys(rec).length === 1) throw new Error("bilan vide");
  state.MEAS.push(rec);
  state.MEAS.sort((a, b) => new Date(a.date) - new Date(b.date));
  return rec;
}
export function setCheckinPhotos(state, date, photos) {
  const m = state.MEAS.find(x => x.date === date);
  if (!m) throw new Error("bilan introuvable : " + date);
  m.photos = { ...(m.photos || {}), ...Object.fromEntries(CHECKIN_VIEWS.filter(v => photos[v]).map(v => [v, String(photos[v])])) };
  return m;
}
export function compareCheckins(state, dateA, dateB) {
  const all = checkins(state);
  const a = all.find(x => x.date === dateA), b = all.find(x => x.date === dateB);
  if (!a || !b) throw new Error("bilan introuvable");
  const fields = ["bw", "waist", "arm", "chest", "thigh"];
  return { a, b, delta: Object.fromEntries(fields.map(f => [f, a[f] != null && b[f] != null ? round1(b[f] - a[f]) : null])) };
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
export function report(state, now = Date.now(), { stagnantAfter = 4, profileId = state.activeProfile } = {}) {
  const perEx = [];
  const order = state.settings.variantOrder || VARIANTS;
  const rank = v => { const i = order.indexOf(v || ""); return v ? (i === -1 ? 0.5 : i + 1) : 0; };
  for (const ex of exercises(state, profileId)) {
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
      const harder = prev && val(h[i]) === val(prev) && h[i].variant !== prev.variant && (ex.free ? !!h[i].variant : rank(h[i].variant) > rank(prev.variant));
      const better = val(h[i]) > prevBest || harder || (prev && val(h[i]) === val(prev) && h[i].variant === prev.variant && h[i].vol > prev.vol);
      if (better) break;
      noProgress++;
    }
    perEx.push({ exercise: ex.n, label: ex.label, variant: h[0].variant || null, unit: ex.time ? "s" : ex.unit, disabled: !!ex.disabled, sessions: h.length,
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
  return { profile: profileId, exercises: perEx, stagnant: perEx.filter(e => e.stagnant && !e.disabled), attendance: weeks,
           bodyweight: bodyweight(state).slice(-12), measurements: measurementsDue(state, now) };
}

/* export complet, tel qu'il doit etre sauvegarde */
export const exportAll = state => clone({ v: VERSION, ovr: state.ovr, HIST: state.HIST, MEAS: state.MEAS,
  program: state.program, notes: state.notes, next_targets: state.next_targets, profiles: state.profiles, activeProfile: state.activeProfile,
  plates: state.profiles[state.activeProfile], settings: state.settings, draft: state.draft || null,
  weightTarget: state.weightTarget, weighins: state.weighins, lightWeek: state.lightWeek || null });
