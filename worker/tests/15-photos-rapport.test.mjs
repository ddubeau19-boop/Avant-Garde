// Photos de la fiche du rapport : l'ingénieur en choisit au plus quatre ;
// sans choix, le rapport prend les premières, comme avant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync, inflateRawSync } from 'node:zlib';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);

// PNG 1×1 d'une couleur donnée : des octets distincts par photo.
function png(r, g, b) {
  const bloc = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([lg, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.from([0, r, g, b]))), bloc('IEND', Buffer.alloc(0))
  ]);
}
// Les images d'un .docx (word/media/*), en octets.
function mediasDocx(octets) {
  const buf = Buffer.from(octets);
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  const nombre = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const medias = [];
  for (let i = 0; i < nombre; i++) {
    const methode = buf.readUInt16LE(p + 10), taille = buf.readUInt32LE(p + 20);
    const lgNom = buf.readUInt16LE(p + 28), lgExtra = buf.readUInt16LE(p + 30), lgComm = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + lgNom);
    if (nom.startsWith('word/media/')) {
      const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const d = buf.subarray(debut, debut + taille);
      medias.push(methode === 8 ? inflateRawSync(d) : Buffer.from(d));
    }
    p += 46 + lgNom + lgExtra + lgComm;
  }
  return medias;
}

test('photos du rapport : au plus quatre choisies, et ce sont elles qui sortent', async () => {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-PHR-${Date.now()}`, name: 'Photos au rapport', units: 8 } });
  assert.equal(r.statut, 201);
  const id = r.json.id;
  const comps = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.filter((c) => c.actif !== 0);
  // Une seule composante active, pour lire le rapport sans ambiguïté.
  const [comp, ...autres] = comps;
  await api(`/api/dossiers/${id}/components/lot`, { methode: 'POST', session: ingA, corps: { ids: autres.map((c) => c.id), actif: 0 } });

  const images = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [0, 200, 200], [200, 0, 200]].map((c) => png(...c));
  const ids = [];
  for (const [i, im] of images.entries()) {
    const f = new FormData();
    f.append('file', new Blob([im], { type: 'image/png' }), `p${i}.png`);
    const e = await api(`/api/components/${comp.id}/photos`, { methode: 'POST', session: ingA, formulaire: f });
    assert.equal(e.statut, 201, e.texte.slice(0, 200));
    ids.push(e.json.id);
  }
  const rapport = async () => mediasDocx(await (await api(`/api/dossiers/${id}/report.docx`, { session: ingA, brut: true })).arrayBuffer());
  const contient = (medias, im) => medias.some((m) => m.equals(im));

  // Sans choix : les quatre premières.
  let medias = await rapport();
  assert.ok(contient(medias, images[0]) && contient(medias, images[3]));
  assert.ok(!contient(medias, images[4]) && !contient(medias, images[5]));

  const choisir = (pid, v, session = ingA) => api(`/api/photos/${pid}`, { methode: 'PATCH', session, corps: { au_rapport: v } });
  assert.equal((await choisir(ids[0], 'oui')).statut, 400);
  assert.equal((await choisir(ids[0], 1, ingB)).statut, 404, 'une autre firme ne touche pas aux photos');
  assert.equal((await choisir(ids[4], 1)).statut, 200);
  assert.equal((await choisir(ids[5], 1)).statut, 200);
  medias = await rapport();
  assert.ok(contient(medias, images[4]) && contient(medias, images[5]), 'les photos choisies sortent');
  assert.ok(!contient(medias, images[0]), 'les autres non');

  for (const pid of ids.slice(0, 2)) assert.equal((await choisir(pid, 1)).statut, 200);
  assert.equal((await choisir(ids[2], 1)).statut, 409, 'pas plus de quatre');
  assert.equal((await choisir(ids[4], 1)).statut, 200, 'rechoisir une photo déjà choisie reste permis');
  assert.equal((await choisir(ids[4], 0)).statut, 200);
  assert.equal((await choisir(ids[2], 1)).statut, 200);
  const detail = (await api(`/api/components/${comp.id}`, { session: ingA })).json;
  assert.deepEqual(detail.photos.filter((p) => p.au_rapport === 1).map((p) => p.id).sort(), [ids[0], ids[1], ids[2], ids[5]].sort());
});
