# carnet-mcp

Serveur MCP distant du carnet de musculation : expose la logique de l'app
(`core.js`) a Claude comme connecteur personnalise. Un seul endpoint
`POST /mcp` (Streamable HTTP, spec 2026-07-28, compatible avec les clients
plus anciens), protege par un jeton Bearer.

- `server.js` : HTTP, authentification, protection Origin
- `tools.js` : les 14 outils (lecture et ecriture), tous via `core.js`
- `store.js` : lecture/ecriture par l'API PHP du carnet, avec `base_rev` (409 en cas de conflit, rejoue)
- `core.js` : copie de la couche metier de l'app (source de verite : le depot de l'app)

## Lancer

```
npm install --omit=dev
MCP_TOKEN=un-long-secret node server.js      # PORT fourni par la plateforme, 3000 sinon
```

Variables : `MCP_TOKEN` (obligatoire), `PORT`, `CARNET_API` (defaut : l'API de production).

## Tester

```
npm install
npm test
```

Le test demarre une fausse API en memoire et le serveur, puis appelle chaque
outil avec le client officiel. Aucune donnee reelle n'est touchee.
