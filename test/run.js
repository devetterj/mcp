/* Test de bout en bout : fausse API + serveur MCP + client officiel.
   Verifie l'authentification, la liste des outils et chaque outil en lecture et en ecriture. */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import * as C from "../core.js";
import { startFakeApi, startFakeImageDb } from "./fake-api.js";

const TOKEN = "test-token-0123456789abcdef";
const day = n => new Date(Date.now() - n * 86400000).toISOString();
const sets = (w, reps) => reps.map(r => ({ w, r, ok: true }));

/* jeu de donnees synthetique (aucune donnee personnelle dans le depot) */
const state = C.migrate({});
C.recordSession(state, { id: "ha", date: day(9), bw: 87.5, log: { "Developpe incline haltere": sets(20, [8, 8, 8]), "Tirage vertical prise large": sets(130, [10, 10, 10]), "Curl poulie pupitre": sets(25, [10, 9, 8]) } });
C.recordSession(state, { id: "ba", date: day(7), bw: 87.2, log: { "Presse a cuisses": sets(120, [8, 8, 8]), "Planche": sets(0, [40, 40, 35]), "Leg extension": sets(120, [12, 12, 12]) } });
C.recordSession(state, { id: "hb", date: day(4), bw: 87.0, log: { "Developpe couche haltere": sets(40, [10, 10, 7]), "Face pull": sets(50, [15, 15, 15]), "Curl marteau a la corde": sets(80, [12, 12, 12]) } });
C.recordSession(state, { id: "ha", date: day(2), bw: 86.9, log: { "Developpe incline haltere": sets(20, [10, 10, 10]), "Tirage vertical prise large": sets(140, [8, 8, 7]), "Curl poulie pupitre": sets(25, [10, 10, 9]) } });
state.MEAS.push({ date: day(40), bw: "88", waist: "97" });

const API_TOKEN = "api-token-0123456789abcdef";
const api = await startFakeApi(C.exportAll(state), API_TOKEN);
const imgdb = await startFakeImageDb();
const PORT = 18765 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), MCP_TOKEN: TOKEN, CARNET_API: api.url, CARNET_API_TOKEN: API_TOKEN, EXERCISE_DB_ROOT: imgdb.root }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((res, rej) => { child.stdout.on("data", d => { if (String(d).includes("ecoute")) res(); }); child.on("exit", c => rej(new Error("serveur termine " + c))); });
const base = `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log("  ok  " + name); } catch (e) { failures++; console.log("  KO  " + name + " : " + e.message); } };

try {
  await check("sante", async () => { const j = await (await fetch(base + "/health")).json(); assert.equal(j.ok, true); });
  await check("sans jeton -> 401", async () => { const r = await fetch(base + "/mcp", { method: "POST", body: "{}" }); assert.equal(r.status, 401); });
  await check("mauvais jeton -> 401", async () => { const r = await fetch(base + "/mcp", { method: "POST", headers: { Authorization: "Bearer nope" }, body: "{}" }); assert.equal(r.status, 401); });
  await check("Origin present -> 403", async () => { const r = await fetch(base + "/mcp", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, Origin: "https://evil.example" }, body: "{}" }); assert.equal(r.status, 403); });

  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { Authorization: "Bearer " + TOKEN } } }));
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const text = r.content[0].text; if (r.isError) throw new Error(text); return JSON.parse(text); };

  await check("liste des 16 outils", async () => {
    const names = (await client.listTools()).tools.map(t => t.name).sort();
    assert.deepEqual(names, ["add_note", "clear_next_targets", "disable_exercise", "enable_exercise", "get_bodyweight", "get_history", "get_last_session", "get_measurements", "get_next_plan", "get_notes", "get_program", "get_stagnation_report", "search_exercise_images", "set_exercise_image", "set_next_targets", "update_program"]);
  });
  await check("get_program", async () => { const p = await call("get_program"); assert.equal(p.sessions.length, 4); assert.ok(["ba", "ha"].includes(p.next_session)); assert.ok(p.sessions[0].exercises[0].range); });
  await check("get_history resume + filtres", async () => {
    const h = await call("get_history", { limit: 10 }); assert.equal(h.total, 4); assert.equal(h.sessions[0].session, "ha");
    assert.equal(h.sessions[0].exercises["Developpe incline haltere"].top, 20); assert.equal(h.sessions[0].exercises["Developpe incline haltere"].total_reps, 30);
    const f = await call("get_history", { exercise: "Presse a cuisses", granularity: "sets" }); assert.equal(f.total, 1); assert.equal(f.sessions[0].log["Presse a cuisses"].length, 3);
  });
  await check("get_last_session avec comparaison", async () => { const l = await call("get_last_session", { session: "ha" }); assert.equal(l.comparison["Tirage vertical prise large"].top_delta, 10); assert.equal(l.comparison["Developpe incline haltere"].reps_delta, 6); });
  await check("get_next_plan", async () => { const n = await call("get_next_plan", { session: "ha" }); const inc = n.exercises.find(e => e.name === "Developpe incline haltere"); assert.equal(inc.kind, "up"); assert.equal(inc.weight, 22.5); });
  await check("get_bodyweight", async () => { const b = await call("get_bodyweight", { weeks: 4 }); assert.equal(b.points.length, 4); assert.equal(b.latest, 86.9); });
  await check("get_measurements", async () => { const m = await call("get_measurements"); assert.equal(m.measurements.length, 1); assert.equal(m.reminder.due, true); });
  await check("get_stagnation_report", async () => { const r = await call("get_stagnation_report", { min_sessions: 1 }); assert.ok(r.attendance.length === 8); assert.ok(r.exercises.length >= 7); });
  await check("add_note puis get_notes", async () => {
    const n = await call("add_note", { text: "Dos plat", exercise: "Presse a cuisses" }); assert.equal(n.note.author, "claude");
    const g = await call("get_notes", { exercise: "Presse a cuisses" }); assert.equal(g.notes.length, 1); assert.equal(api.get().data.notes.length, 1, "ecrit sur l'API");
  });
  await check("set_next_targets visible dans le plan, puis clear", async () => {
    await call("set_next_targets", { exercise: "Presse a cuisses", weight: 110, reps: [10, 10, 10] });
    const n = await call("get_next_plan", { session: "ba" }); const p = n.exercises.find(e => e.name === "Presse a cuisses"); assert.equal(p.kind, "target"); assert.equal(p.weight, 110);
    await call("clear_next_targets", { exercise: "Presse a cuisses" });
    assert.notEqual((await call("get_next_plan", { session: "ba" })).exercises.find(e => e.name === "Presse a cuisses").kind, "target");
  });
  await check("disable / enable", async () => {
    const d = await call("disable_exercise", { exercise: "Souleve de terre roumain", reason: "test" }); assert.equal(d.disabled.reason, "test");
    assert.ok(!(await call("get_next_plan", { session: "ba" })).exercises.some(e => e.name === "Souleve de terre roumain"));
    await call("enable_exercise", { exercise: "Souleve de terre roumain" });
    assert.ok((await call("get_next_plan", { session: "ba" })).exercises.some(e => e.name === "Souleve de terre roumain"));
  });
  await check("update_program : update, replace, rotation, erreurs", async () => {
    const u = await call("update_program", { action: "update_exercise", exercise: "Face pull", patch: { range: [15, 20], sets: 4 } }); assert.deepEqual(u.range, [15, 20]); assert.equal(u.sets, 4);
    const r = await call("update_program", { action: "replace_exercise", session: "ha", exercise: "Rowing haltere unilateral", new_exercise: "Tirage poitrine appuyee", definition: { type: "compound", unit: "lb", inc: 10, gear: "machine" } });
    assert.ok(r.exercises.includes("Tirage poitrine appuyee") && !r.exercises.includes("Rowing haltere unilateral"));
    const s = await call("update_program", { action: "set_rotation", rotation: ["ha", "ba", "hb"] }); assert.deepEqual(s.rotation, ["ha", "ba", "hb"]);
    await assert.rejects(call("update_program", { action: "set_rotation", rotation: ["zz"] }), /invalide/);
    await assert.rejects(call("disable_exercise", { exercise: "Inconnu", reason: "x" }), /inconnu/);
  });
  await check("profil Maison : bascule, plan avec materiel, retour Salle", async () => {
    const r = await call("update_program", { action: "set_profile", profile: "maison" }); assert.equal(r.active_profile, "maison"); assert.equal(r.next_session, "mha");
    const p = await call("get_program"); assert.equal(p.active_profile, "maison"); assert.equal(p.sessions.length, 3); assert.equal(p.sessions[0].exercises[0].max_load, 19.5);
    const n = await call("get_next_plan"); assert.equal(n.session, "mha"); assert.deepEqual(n.gear.dumbbells, [19.5, 17, 12, 7]); assert.equal(n.exercises[0].weight, 19.5);
    const u = await call("update_program", { action: "update_profile", profile: "maison", plates: { dumbbell: [2, 3.25, 4.5, 8, 20] } }); assert.deepEqual(u.plates.dumbbell, [2, 3.25, 4.5, 8, 20]);
    const back = await call("update_program", { action: "set_profile", profile: "salle" }); assert.equal(back.next_session, "ba");
  });
  await check("illustrations : recherche, association, refus d'une source etrangere, retrait", async () => {
    const f = await call("search_exercise_images", { query: "split squat dumbbell" });
    assert.equal(f.results[0].db_id, "Split_Squat_with_Dumbbells"); assert.ok(f.results[0].start_url.endsWith("/0.jpg"));
    const a = await call("set_exercise_image", { exercise: "Fentes fendues haltere", db_id: "Split_Squat_with_Dumbbells" });
    assert.ok(a.images.end.endsWith("Split_Squat_with_Dumbbells/1.jpg")); assert.equal(api.get().data.program.exercises["Fentes fendues haltere"].images.source, "Split_Squat_with_Dumbbells");
    await assert.rejects(call("set_exercise_image", { exercise: "Fentes fendues haltere", start_url: "https://evil.example/a.jpg", end_url: "https://evil.example/b.jpg" }), /acceptees/);
    await assert.rejects(call("set_exercise_image", { exercise: "Fentes fendues haltere", db_id: "N_existe_pas" }), /introuvable/);
    const p = await call("get_program"); const fx = p.sessions.flatMap(s => s.exercises).find(e => e.name === "Fentes fendues haltere");
    assert.ok(!fx || fx.images, "visible dans get_program quand l'exercice est au programme");
    const c = await call("set_exercise_image", { exercise: "Fentes fendues haltere", clear: true }); assert.equal(c.images, null);
  });
  await check("sans CARNET_API_TOKEN le serveur refuse de demarrer", async () => {
    const bad = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT + 1), MCP_TOKEN: TOKEN, CARNET_API: api.url, CARNET_API_TOKEN: "" }, stdio: "ignore" });
    const code = await new Promise(r => bad.on("exit", r)); assert.equal(code, 1);
  });
  await check("aucune adresse d'API ni jeton dans le code source", async () => {
    for (const f of ["store.js", "server.js", "tools.js", "README.md"]) {
      const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
      assert.ok(!/genius-strategy\.com\/api|api-k7m2|api-[0-9a-f]{10}\.php/.test(src), f + " contient une adresse d'API");
    }
  });
  await check("core.js identique a celui de l'app", async () => {
    const twin = new URL("../../core/core.js", import.meta.url);
    if (!existsSync(twin)) return;
    assert.equal(readFileSync(twin, "utf8"), readFileSync(new URL("../core.js", import.meta.url), "utf8"));
  });
  await client.close();
} finally { child.kill(); api.srv.close(); imgdb.srv.close(); }
console.log(failures ? `\n${failures} test(s) en echec` : "\ntous les tests passent");
process.exit(failures ? 1 : 0);
