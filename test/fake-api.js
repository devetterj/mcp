/* Imitation locale d'api-k7m2.php pour les tests : etat en memoire, rev, base_rev -> 409 */
import { createServer } from "node:http";
export function startFakeApi(initialData) {
  let rev = 1, data = initialData;
  const srv = createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "GET") return send(200, { rev, updated: new Date().toISOString(), data });
    let body = ""; req.on("data", c => body += c); req.on("end", () => {
      const j = JSON.parse(body || "{}");
      if (j.base_rev != null && Number(j.base_rev) !== rev) return send(409, { error: "conflit_version", rev });
      rev++; data = j.data; send(200, { rev, updated: new Date().toISOString() });
    });
  });
  return new Promise(resolve => srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/api`, get: () => ({ rev, data }) })));
}
