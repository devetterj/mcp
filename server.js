/* Serveur MCP distant du carnet. Un seul endpoint POST /mcp, protege par un
   jeton Bearer (variable MCP_TOKEN). Le port vient de la plateforme (PORT). */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { register } from "./tools.js";

const TOKEN = process.env.MCP_TOKEN;
if (!TOKEN || TOKEN.length < 16) { console.error("MCP_TOKEN manquant ou trop court (variable d'environnement)"); process.exit(1); }
const PORT = Number(process.env.PORT) || 3000;

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: "carnet-muscu", version: "1.0.0" });
  register(server);
  return server;
}, { onerror: e => console.error("mcp:", e && e.message ? e.message : e) });
const mcp = toNodeHandler(handler);

const sameToken = (given, expected) => {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/" || path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, name: "carnet-mcp", endpoint: "/mcp" }));
  }
  if (path !== "/mcp") { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }
  /* aucun navigateur n'est attendu ici : un Origin present est refuse (DNS rebinding) */
  if (req.headers.origin) { res.writeHead(403, { "Content-Type": "text/plain" }); return res.end("forbidden"); }
  const auth = req.headers.authorization || "";
  if (!sameToken(auth, "Bearer " + TOKEN)) {
    res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="carnet"', "Content-Type": "text/plain" });
    return res.end("unauthorized");
  }
  mcp(req, res);
}).listen(PORT, () => console.log("carnet-mcp a l'ecoute sur le port " + PORT));
