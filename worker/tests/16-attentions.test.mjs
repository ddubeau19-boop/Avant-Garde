// Attentions spéciales saisies au bureau : plusieurs situations par
// composante, chacune son texte et au plus deux photos, au rapport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync, inflateRawSync } from 'node:zlib';
import { api, jeton, IDS, texteDocx } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);

function png(r, g, b) {
  const bloc = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([lg, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.from([0, r, g, b]))), bloc('IEND', Buffer.alloc(0))]);
}
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

test('attentions spéciales : validées, deux photos chacune, au rapport avec leurs photos', async () => {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-ATT-${Date.now()}`, name: 'Attentions', units: 8 } });
  const id = r.json.id;
  const [comp, autre, ...reste] = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.filter((c) => c.actif !== 0);
  await api(`/api/dossiers/${id}/components/lot`, { methode: 'POST', session: ingA, corps: { ids: reste.map((c) => c.id), actif: 0 } });
  const images = [[220, 10, 10], [10, 220, 10], [10, 10, 220], [220, 220, 10]].map((c) => png(...c));
  const ids = [];
  for (const [i, im] of images.entries()) {
    const f = new FormData();
    f.append('file', new Blob([im], { type: 'image/png' }), `a${i}.png`);
    ids.push((await api(`/api/components/${comp.id}/photos`, { methode: 'POST', session: ingA, formulaire: f })).json.id);
  }
  const f = new FormData();
  f.append('file', new Blob([png(1, 2, 3)], { type: 'image/png' }), 'x.png');
  const etrangere = (await api(`/api/components/${autre.id}/photos`, { methode: 'POST', session: ingA, formulaire: f })).json.id;

  const mettre = (attentions, session = ingA) => api(`/api/components/${comp.id}/attentions`, { methode: 'PUT', session, corps: { attentions } });
  assert.equal((await mettre('non')).statut, 400);
  assert.equal((await mettre([], ingB)).statut, 404, 'une autre firme ne touche pas aux attentions');
  const ok = await mettre([
    { titre: 'Solin décollé – façade nord', texte: 'Nous avons observé un solin décollé sur environ deux mètres.', photos: [ids[2], ids[3], ids[0], etrangere] },
    { titre: 'Drain obstrué', notes: 'Drain plein de feuilles au-dessus de l\'unité 4.', photos: [etrangere] },
    { titre: '', notes: '', texte: '', photos: [] }
  ]);
  assert.equal(ok.statut, 200);
  assert.equal(ok.json.attentions.length, 2, 'une attention vide est écartée');
  assert.deepEqual(ok.json.attentions[0].photos, [ids[2], ids[3]], 'deux photos au plus, de la composante seulement');
  assert.deepEqual(ok.json.attentions[1].photos, []);
  assert.match(ok.json.attentions[0].id, /^att_/);
  assert.equal((await mettre(Array.from({ length: 12 }, (_, i) => ({ titre: `S${i}` })))).json.attentions.length, 8, 'huit au plus');
  await mettre(ok.json.attentions);

  // La rédaction par l'IA demande quelque chose à rédiger.
  assert.equal((await api(`/api/components/${comp.id}/attentions/rediger`, { methode: 'POST', session: ingA, corps: {} })).statut, 400);
  assert.equal((await api(`/api/components/${comp.id}/attentions/rediger`, { methode: 'POST', session: ingB, corps: { notes: 'x' } })).statut, 404);

  // La fiche : section active, une entrée par attention, même sans cote.
  const fiche = (await api(`/api/components/${comp.id}/redaction`, { methode: 'POST', session: ingA, corps: {} })).json;
  const sec = fiche.sections.find((x) => x.cle === 'attention');
  assert.equal(sec.actif, true);
  assert.deepEqual(sec.elements.map((e) => e.titre), ['Solin décollé – façade nord', 'Drain obstrué']);
  assert.match(sec.elements[1].texte, /Drain plein de feuilles/, 'sans texte rédigé, les notes vont au rapport');

  const octets = await (await api(`/api/dossiers/${id}/report.docx`, { session: ingA, brut: true })).arrayBuffer();
  const texte = texteDocx(octets);
  assert.ok(texte.some((t) => t === 'Solin décollé – façade nord'));
  assert.ok(texte.some((t) => t.includes('solin décollé sur environ deux mètres')));
  assert.ok(texte.some((t) => t.includes('visites de services')), 'la recommandation commune, une fois');
  assert.equal(texte.filter((t) => t.includes('visites de services')).length, 1);
  const medias = mediasDocx(octets);
  const n = (im) => medias.filter((m) => m.equals(im)).length;
  assert.equal(n(images[2]), 1, "photo d'attention : dans l'attention seulement");
  assert.equal(n(images[3]), 1);
  assert.equal(n(images[0]), 1, "les autres photos restent à l'état de l'actif");

  const journal = (await api(`/api/dossiers/${id}/journal`, { session: ingA })).json;
  assert.ok(journal.some((e) => e.composante?.id === comp.id && e.champs.some((ch) => ch.champ === 'attentions')));
});
