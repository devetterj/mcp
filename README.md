# carnet-mcp

Serveur MCP distant du carnet de musculation : expose la logique de l'app
(`core.js`) a Claude comme connecteur personnalise. Un seul endpoint
`POST /mcp` (Streamable HTTP, spec 2026-07-28, compatible avec les clients
plus anciens), protege par un jeton Bearer.

- `server.js` : HTTP, authentification, protection Origin
- `tools.js` : les 14 outils (lecture et ecriture), tous via `core.js`
- `store.js` : lecture/ecriture par l'API PHP du carnet (jeton Bearer), avec `base_rev` (409 en cas de conflit, rejoue)
- `core.js` : copie de la couche metier de l'app (source de verite : le depot de l'app)

## Lancer

```
npm install --omit=dev
MCP_TOKEN=... CARNET_API=https://.../api-xxxx.php CARNET_API_TOKEN=... node server.js
```

Variables, toutes obligatoires sauf `PORT` (3000 par defaut) :

- `MCP_TOKEN` : jeton que Claude envoie au serveur MCP (`Authorization: Bearer`)
- `CARNET_API` : URL complete de l'API PHP du carnet
- `CARNET_API_TOKEN` : jeton que le serveur MCP envoie a cette API

Aucune adresse ni aucun secret ne vit dans ce depot.

## Tester

```
npm install
npm test
```

Le test demarre une fausse API en memoire et le serveur, puis appelle chaque
outil avec le client officiel. Aucune donnee reelle n'est touchee.
