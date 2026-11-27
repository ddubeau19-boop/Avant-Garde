// L'app Android embarque l'app terrain : ses pages viennent de
// https://localhost et appellent l'API de ce domaine. Seule cette origine
// est ouverte ; un site quelconque n'obtient aucune autorisation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, jeton, IDS } from './outils.mjs';

const APP = 'https://localhost';

test("l'app Android passe la vérification préalable (preflight) du navigateur", async () => {
  const r = await fetch(`${BASE}/api/dossiers`, {
    method: 'OPTIONS',
    headers: { Origin: APP, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
  assert.match(r.headers.get('access-control-allow-headers'), /authorization/i);
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
});

test("l'app Android lit l'API avec son jeton, refus compris", async () => {
  const ok = await fetch(`${BASE}/api/dossiers`, { headers: { Origin: APP, Authorization: `Bearer ${jeton(IDS.ingA)}` } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), APP);
  // Un 401 doit aussi être lisible : sinon l'app ne saurait pas que la session a expiré.
  const refus = await fetch(`${BASE}/api/dossiers`, { headers: { Origin: APP } });
  assert.equal(refus.status, 401);
  assert.equal(refus.headers.get('access-control-allow-origin'), APP);
});

test('une autre origine ne reçoit aucune autorisation', async () => {
  const pre = await fetch(`${BASE}/api/dossiers`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://exemple.com', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const r = await fetch(`${BASE}/api/dossiers`, { headers: { Origin: 'https://exemple.com', Authorization: `Bearer ${jeton(IDS.ingA)}` } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
