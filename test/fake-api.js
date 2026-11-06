/* Imitation locale de l'API PHP du carnet pour les tests : etat en memoire,
   jeton Bearer obligatoire, rev, base_rev -> 409 */
import { createServer } from "node:http";
export function startFakeApi(initialData, token) {
  let rev = 1, data = initialData;
  const srv = createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== "Bearer " + token) return send(401, { error: "auth_requise" });
    if (req.method === "GET") return send(200, { rev, updated: new Date().toISOString(), data });
    let body = ""; req.on("data", c => body += c); req.on("end", () => {
      const j = JSON.parse(body || "{}");
      if (j.base_rev != null && Number(j.base_rev) !== rev) return send(409, { error: "conflit_version", rev });
      rev++; data = j.data; send(200, { rev, updated: new Date().toISOString() });
    });
  });
  return new Promise(resolve => srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/api`, get: () => ({ rev, data }) })));
}

/* Imitation locale de la banque d'images : index + photos de deux exercices */
export function startFakeImageDb() {
  const index = [
    { id: "Split_Squat_with_Dumbbells", name: "Split Squat with Dumbbells", equipment: "dumbbell", primaryMuscles: ["quadriceps"], images: ["Split_Squat_with_Dumbbells/0.jpg", "Split_Squat_with_Dumbbells/1.jpg"] },
    { id: "Barbell_Hip_Thrust", name: "Barbell Hip Thrust", equipment: "barbell", primaryMuscles: ["glutes"], images: ["Barbell_Hip_Thrust/0.jpg", "Barbell_Hip_Thrust/1.jpg"] },
  ];
  const srv = createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/dist/exercises.json") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(index)); }
    if (/^\/exercises\/(Split_Squat_with_Dumbbells|Barbell_Hip_Thrust)\/[01]\.jpg$/.test(path)) { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(req.method === "HEAD" ? undefined : "jpg"); }
    res.writeHead(404); res.end();
  });
  return new Promise(resolve => srv.listen(0, "127.0.0.1", () => resolve({ srv, root: `http://127.0.0.1:${srv.address().port}/` })));
}
