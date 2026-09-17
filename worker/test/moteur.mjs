// Tests du moteur financier et de la banque de prix.
//
// Le worker est un bundle unique qui n'exporte rien : ses fonctions internes ne
// sont pas atteignables depuis un test. On les exerce donc par où elles sont
// réellement utilisées — l'API — contre un `wrangler dev --local`. C'est plus
// lent qu'un test unitaire, mais ça vérifie la chaîne entière, y compris le
// SQL, ce qu'un test unitaire ne ferait pas.
//
//   node worker/test/moteur.mjs            (le serveur doit déjà écouter)
//   BASE=http://127.0.0.1:8787 node worker/test/moteur.mjs

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const COURRIEL = process.env.TEST_EMAIL ?? "test@moteur.local";
const MDP = process.env.TEST_PASSWORD ?? "moteur-de-test-1";

let reussites = 0;
const echecs = [];

function verifier(nom, condition, detail) {
  if (condition) {
    reussites += 1;
    console.log(`  ok   ${nom}`);
  } else {
    echecs.push(`${nom}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ÉCHEC ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

function presque(a, b, tolerance = 0.5) {
  return a != null && b != null && Math.abs(a - b) <= tolerance;
}

let jeton = null;
async function api(chemin, options = {}) {
  const { jeton: jetonAlt, ...reste } = options;
  const entetes = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  const porteur = jetonAlt ?? jeton;
  if (porteur) entetes.Authorization = `Bearer ${porteur}`;
  const res = await fetch(`${BASE}${chemin}`, { ...reste, headers: entetes });
  const texte = await res.text();
  let donnees = null;
  try { donnees = JSON.parse(texte); } catch { donnees = texte; }
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${chemin} → ${res.status} ${texte.slice(0, 200)}`);
  return donnees;
}

async function jetonPour(courriel, motDePasse = MDP) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: courriel, password: motDePasse })
  });
  if (!res.ok) {
    throw new Error(
      `connexion impossible pour ${courriel} (${res.status}). Ces tests attendent des ` +
      `comptes semés. Voir worker/test/semer.sql.`
    );
  }
  return (await res.json()).token;
}

// Le compte du portefeuille appartient à l'entreprise nommée par
// CRM_COMPANY_ID : elle seule voit le CRM. Le compte principal, lui, sert à
// vérifier que la cloison tient.
let jetonPortefeuille = null;
async function connexion() {
  jeton = await jetonPour(COURRIEL);
  jetonPortefeuille = await jetonPour("crm@moteur.local");
}

// Crée un dossier directement par l'API, puis y pose des composantes. On passe
// par l'API plutôt que par SQL pour que le test couvre aussi les routes.
async function dossierAvec(numero, dossier, composantes) {
  const cree = await api("/api/dossiers", { method: "POST", body: JSON.stringify({ dossier_no: numero, ...dossier }) });
  // La création sème un inventaire proposé : on le retire pour ne mesurer que
  // les composantes du test.
  const existantes = await api(`/api/dossiers/${cree.id}/components`);
  for (const c of existantes) await api(`/api/components/${c.id}`, { method: "DELETE" });
  for (const comp of composantes) {
    const { replacement_cost, done, ...creation } = comp;
    const nouvelle = await api(`/api/dossiers/${cree.id}/components`, { method: "POST", body: JSON.stringify(creation) });
    await api(`/api/components/${nouvelle.id}`, {
      method: "PATCH",
      body: JSON.stringify({ replacement_cost, done: done ?? 1 })
    });
  }
  return cree.id;
}

function anneesAvecDebours(projection) {
  return projection.scenarios[0].years
    .map((y, i) => ({ an: i + 1, debours: Math.round(y.debours) }))
    .filter((y) => y.debours > 0);
}

// ---------------------------------------------------------------------------

async function testAnneeAncreeSurInstallation() {
  console.log("\nAnnée de remplacement ancrée sur l'année d'installation");
  const anneeCourante = new Date().getUTCFullYear();
  const id = await dossierAvec(`T-INST-${Date.now()}`, { name: "Ancrage installation", units: 20, built_year: 1990 }, [
    { name: "Toiture", cat: "enveloppe", useful_life_years: 30, install_year: anneeCourante - 10, replacement_cost: 100000 }
  ]);
  const proj = await api(`/api/dossiers/${id}/projection`);
  const annees = anneesAvecDebours(proj);
  // Posée il y a 10 ans, 30 ans de vie utile → remplacement dans 20 ans.
  verifier("le remplacement tombe 20 ans plus tard", annees.some((a) => a.an === 20), JSON.stringify(annees));
  verifier("aucune exclusion", proj.excludedComponents.length === 0);
}

async function testRepliSurAnneeConstruction() {
  console.log("\nSans année d'installation, repli sur l'année de construction");
  const anneeCourante = new Date().getUTCFullYear();
  const id = await dossierAvec(`T-CONS-${Date.now()}`, { name: "Repli construction", units: 20, built_year: anneeCourante - 5 }, [
    { name: "Parement", cat: "enveloppe", useful_life_years: 40, replacement_cost: 200000 }
  ]);
  const proj = await api(`/api/dossiers/${id}/projection`);
  const annees = anneesAvecDebours(proj);
  // Construit il y a 5 ans, 40 ans de vie utile → dans 35 ans. Hors horizon de
  // 30 ans : aucun débours, mais la composante n'est PAS exclue et surtout
  // elle n'est pas plantée en année 1 comme le faisait l'ancien repli.
  verifier("rien ne tombe en année 1", !annees.some((a) => a.an === 1), JSON.stringify(annees));
  verifier("la composante n'est pas exclue", proj.excludedComponents.length === 0,
    JSON.stringify(proj.excludedComponents));
}

async function testExclusionSansAucuneAnnee() {
  console.log("\nAucune année connue : exclusion motivée plutôt qu'année 1");
  const id = await dossierAvec(`T-SANS-${Date.now()}`, { name: "Sans repère", units: 20 }, [
    { name: "Toiture sans repère", cat: "enveloppe", useful_life_years: 25, replacement_cost: 150000 }
  ]);
  const proj = await api(`/api/dossiers/${id}/projection`);
  const total = proj.scenarios[0].years.reduce((s, y) => s + y.debours, 0);
  verifier("aucun débours", Math.round(total) === 0, String(Math.round(total)));
  verifier("exclue avec un motif", proj.excludedComponents.length === 1
    && /indéterminable/.test(proj.excludedComponents[0].reason),
    JSON.stringify(proj.excludedComponents));
}

async function testAnneeNonNumerique() {
  console.log("\nAnnée non numérique : ignorée, jamais NaN");
  const anneeCourante = new Date().getUTCFullYear();
  const id = await dossierAvec(`T-TEXTE-${Date.now()}`, { name: "Année floue", units: 20, built_year: anneeCourante - 10 }, [
    { name: "Fenêtres", cat: "ouvertures", useful_life_years: 30, install_year: "vers 1998", replacement_cost: 80000 }
  ]);
  const proj = await api(`/api/dossiers/${id}/projection`);
  const annees = anneesAvecDebours(proj);
  // « vers 1998 » n'est pas une année : on retombe sur la construction, donc
  // dans 20 ans. Un NaN aurait produit zéro débours en silence.
  verifier("le repli sur la construction s'applique", annees.some((a) => a.an === 20), JSON.stringify(annees));
  verifier("les débours ne sont pas nuls", annees.length > 0);
}

async function testIndexationBanqueDePrix() {
  console.log("\nBanque de prix : prix unitaire, indexation, quantiles");
  const anneeCourante = new Date().getUTCFullYear();
  const lignes = [
    { montant: 40000, quantite: 1000, annee: anneeCourante },      // 40 $/pi², non indexé
    { montant: 60000, quantite: 1000, annee: anneeCourante },      // 60 $/pi²
    { montant: 100000, quantite: 1000, annee: anneeCourante }      // 100 $/pi²
  ];
  const code = `TEST-${Date.now()}`;
  for (const l of lignes) {
    await api("/api/prix", {
      method: "POST",
      body: JSON.stringify({
        description: "Ligne de test", uniformat_code: code, unite: "pi2",
        montant: l.montant, quantite: l.quantite, annee: l.annee, valide: 1
      })
    });
  }
  const resume = await api("/api/prix/resume");
  const groupe = resume.lignes.find((x) => x.uniformat_code === code);
  verifier("le groupe existe", !!groupe);
  if (groupe) {
    verifier("n = 3", groupe.n === 3, String(groupe.n));
    verifier("médiane = 60 $", presque(groupe.mediane, 60), String(groupe.mediane));
    verifier("P25 = 50 $", presque(groupe.p25, 50), String(groupe.p25));
    verifier("P75 = 80 $", presque(groupe.p75, 80), String(groupe.p75));
    verifier("marqué indicatif sous 5 observations", groupe.mince === true);
  }

  // Une ligne de l'an dernier doit être indexée vers le haut.
  await api("/api/prix", {
    method: "POST",
    body: JSON.stringify({
      description: "Ligne indexée", uniformat_code: `${code}-IDX`, unite: "forfait",
      montant: 100000, annee: anneeCourante - 1, valide: 1
    })
  });
  const resume2 = await api("/api/prix/resume");
  const indexe = resume2.lignes.find((x) => x.uniformat_code === `${code}-IDX`);
  const attendu = 100000 * (1 + resume2.taux_indexation);
  verifier("un prix d'un an est indexé d'exactement un taux",
    indexe && presque(indexe.mediane, attendu, 1),
    indexe ? `${Math.round(indexe.mediane)} attendu ${Math.round(attendu)}` : "groupe absent");
}

async function testCoutParPorte() {
  console.log("\nCoût par porte et tranches de taille");
  const anneeCourante = new Date().getUTCFullYear();
  const code = `PORTE-${Date.now()}`;
  const cas = [
    { unites: 9, montant: 90000 },    // 10 000 $/porte — moins de 12
    { unites: 40, montant: 120000 },  // 3 000 $/porte — 12 à 49
    { unites: 100, montant: 200000 }  // 2 000 $/porte — 50 et plus
  ];
  for (const c of cas) {
    await api("/api/prix", {
      method: "POST",
      body: JSON.stringify({
        description: "Par porte", uniformat_code: code, unite: "forfait",
        montant: c.montant, unites: c.unites, annee: anneeCourante, valide: 1
      })
    });
  }
  const resume = await api("/api/prix/resume");
  const groupes = resume.portes.filter((x) => x.uniformat_code === code);
  verifier("trois tranches distinctes", groupes.length === 3, String(groupes.length));
  const parTranche = Object.fromEntries(groupes.map((g) => [g.tranche, Math.round(g.mediane)]));
  verifier("moins de 12 portes → 10 000 $", parTranche.petit === 10000, String(parTranche.petit));
  verifier("12 à 49 portes → 3 000 $", parTranche.moyen === 3000, String(parTranche.moyen));
  verifier("50 portes et plus → 2 000 $", parTranche.grand === 2000, String(parTranche.grand));
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Portefeuille — le calendrier des révisions

async function testCloisonDuPortefeuille() {
  console.log("\nLe portefeuille reste fermé aux autres entreprises");
  const res = await fetch(`${BASE}/api/portefeuille`, { headers: { Authorization: `Bearer ${jeton}` } });
  verifier("une entreprise sans lien CRM reçoit un refus", res.status === 403, `statut ${res.status}`);
}

async function testStatutsDuCalendrier() {
  console.log("\nChaque statut du calendrier vient d'un cas réel");
  const p = await api("/api/portefeuille", { jeton: jetonPortefeuille });
  const par = Object.fromEntries(p.lignes.map((l) => [l.syndicat_id, l]));

  // Les deux copropriétés que la firme ne gère plus ne doivent pas y être :
  // un contrat terminé et une entité remplacée par une autre.
  verifier("le syndicat inactif est absent", !par.syn_inactif);
  verifier("le syndicat remplacé est absent", !par.syn_remplace);

  verifier("une étude de sept ans est en retard", par.syn_retard?.statut === "en_retard", par.syn_retard?.statut);
  verifier("l'échéance tombe cinq ans après l'étude",
    par.syn_retard?.echeance === `${Number(par.syn_retard.derniere_etude.slice(0, 4)) + 5}${par.syn_retard.derniere_etude.slice(4)}`,
    `${par.syn_retard?.derniere_etude} → ${par.syn_retard?.echeance}`);
  verifier("une étude d'un an est à jour", par.syn_a_jour?.statut === "a_jour", par.syn_a_jour?.statut);
  verifier("une étude de quatre ans et demi est à prévoir", par.syn_a_prevoir?.statut === "a_prevoir", par.syn_a_prevoir?.statut);
  verifier("un immeuble sans étude connue le dit", par.syn_inconnu?.statut === "inconnue", par.syn_inconnu?.statut);
  verifier("le résumé compte les mêmes lignes",
    p.resume.en_retard + p.resume.inconnue + p.resume.a_prevoir + p.resume.en_cours + p.resume.a_jour === p.total,
    JSON.stringify(p.resume));
}

async function testEtudeConnueChangeLEcheance() {
  console.log("\nConsigner une étude antérieure corrige l'échéance");
  const avant = await api("/api/portefeuille", { jeton: jetonPortefeuille });
  const cible = avant.lignes.find((l) => l.statut === "inconnue");
  verifier("un immeuble sans étude existe pour ce test", !!cible);
  if (!cible) return;

  const etude = await api("/api/portefeuille/etudes", {
    method: "POST",
    jeton: jetonPortefeuille,
    body: JSON.stringify({ crm_syndicat_id: cible.syndicat_id, date_etude: "2024-05-12", auteur: "Groupe Leblanc" })
  });
  const apres = await api("/api/portefeuille", { jeton: jetonPortefeuille });
  const ligne = apres.lignes.find((l) => l.syndicat_id === cible.syndicat_id);
  verifier("l'échéance est désormais connue", ligne?.echeance === "2029-05-12", ligne?.echeance);
  verifier("la source est l'étude consignée", ligne?.derniere_auteur === "Groupe Leblanc", ligne?.derniere_auteur);

  // Une date dans le futur n'est pas une étude passée : la route doit refuser.
  const futur = await fetch(`${BASE}/api/portefeuille/etudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jetonPortefeuille}` },
    body: JSON.stringify({ crm_syndicat_id: cible.syndicat_id, date_etude: "2099-01-01" })
  });
  verifier("une étude datée du futur est refusée", futur.status === 400, `statut ${futur.status}`);

  await api(`/api/portefeuille/etudes/${etude.id}`, { method: "DELETE", jeton: jetonPortefeuille });
  const retour = await api("/api/portefeuille", { jeton: jetonPortefeuille });
  verifier("retirer l'étude ramène l'immeuble à « aucune étude »",
    retour.lignes.find((l) => l.syndicat_id === cible.syndicat_id)?.statut === "inconnue");
}

async function testDossierRattacheAuSyndicat() {
  console.log("\nUn dossier rattaché nourrit le calendrier");
  const cree = await api("/api/dossiers", {
    method: "POST",
    jeton: jetonPortefeuille,
    body: JSON.stringify({
      dossier_no: `T-PF-${Date.now()}`, name: "Syndicat Du Moulin", units: 12,
      crm_syndicat_id: "syn_nouveau", crm_syndicat_nom: "Syndicat Du Moulin"
    })
  });
  verifier("le rattachement est conservé", cree.crm_syndicat_id === "syn_nouveau", cree.crm_syndicat_id);

  const enCours = await api("/api/portefeuille", { jeton: jetonPortefeuille });
  const avant = enCours.lignes.find((l) => l.syndicat_id === "syn_nouveau");
  // Un dossier non publié n'est pas une étude : l'échéance reste inconnue.
  verifier("un dossier non publié compte comme étude en cours", avant?.statut === "en_cours", avant?.statut);
  verifier("il ne fabrique pas d'échéance", avant?.echeance == null, avant?.echeance);

  await api(`/api/dossiers/${cree.id}`, {
    method: "PATCH", jeton: jetonPortefeuille,
    body: JSON.stringify({ published_at: "2026-09-01T12:00:00.000Z" })
  });
  const apres = await api("/api/portefeuille", { jeton: jetonPortefeuille });
  const ligne = apres.lignes.find((l) => l.syndicat_id === "syn_nouveau");
  verifier("publier fait de ce dossier la dernière étude", ligne?.derniere_source === "interne", ligne?.derniere_source);
  verifier("l'échéance court à partir de la publication", ligne?.echeance === "2031-09-01", ligne?.echeance);

  // Le CRM est en lecture seule et il n'existe pas de route pour supprimer un
  // dossier : sans dépublication, ce test laisserait derrière lui une étude
  // publiée qui ferait échouer sa propre exécution suivante sur la même base.
  await api(`/api/dossiers/${cree.id}`, {
    method: "PATCH", jeton: jetonPortefeuille, body: JSON.stringify({ published_at: null })
  });
}

async function testRechercheDeSyndicat() {
  console.log("\nLa recherche de syndicat ignore les accents");
  const avecAccent = await api("/api/portefeuille/syndicats?q=C%C3%A8dres", { jeton: jetonPortefeuille });
  const sansAccent = await api("/api/portefeuille/syndicats?q=cedres", { jeton: jetonPortefeuille });
  verifier("« Cèdres » trouve la copropriété", avecAccent.length === 1, JSON.stringify(avecAccent.map((s) => s.nom)));
  verifier("« cedres » la trouve aussi", sansAccent.length === 1, JSON.stringify(sansAccent.map((s) => s.nom)));
}

// ---------------------------------------------------------------------------
// Réconciliation avec l'étude précédente

// Même patron que dossierAvec, mais du côté du portefeuille et avec un
// rattachement à un syndicat du CRM — c'est lui qui relie les deux études.
async function etudePour(numero, syndicatId, composantes, publieeLe) {
  const cree = await api("/api/dossiers", {
    method: "POST", jeton: jetonPortefeuille,
    body: JSON.stringify({
      dossier_no: numero, name: "Syndicat Le Belvédère", units: 60, built_year: 1996,
      crm_syndicat_id: syndicatId, crm_syndicat_nom: "Syndicat Le Belvédère"
    })
  });
  for (const c of await api(`/api/dossiers/${cree.id}/components`, { jeton: jetonPortefeuille })) {
    await api(`/api/components/${c.id}`, { method: "DELETE", jeton: jetonPortefeuille });
  }
  for (const comp of composantes) {
    const { replacement_cost, ...creation } = comp;
    const n = await api(`/api/dossiers/${cree.id}/components`, { method: "POST", jeton: jetonPortefeuille, body: JSON.stringify(creation) });
    await api(`/api/components/${n.id}`, { method: "PATCH", jeton: jetonPortefeuille, body: JSON.stringify({ replacement_cost, done: 1 }) });
  }
  if (publieeLe) {
    await api(`/api/dossiers/${cree.id}`, { method: "PATCH", jeton: jetonPortefeuille, body: JSON.stringify({ published_at: publieeLe }) });
  }
  return cree.id;
}

async function testReconciliation() {
  console.log("\nRéconciliation avec l'étude précédente");
  const t = Date.now();
  // Le CRM semé porte deux factures de toiture (B30.10) pour ce syndicat,
  // datées d'il y a un an. L'étude précédente les précède donc.
  await etudePour(`T-RC-A-${t}`, "syn_a_jour", [
    { name: "Toiture", cat: "enveloppe", uniformat_code: "B30.10", useful_life_years: 25, install_year: 1996, replacement_cost: 55000 },
    { name: "Ascenseur", cat: "equipements", uniformat_code: "D10.10", useful_life_years: 30, install_year: 2000, replacement_cost: 120000 },
    { name: "Balcons", cat: "enveloppe", uniformat_code: "B20.30", useful_life_years: 40, install_year: 1996, replacement_cost: 90000 }
  ], "2021-06-01T12:00:00.000Z");

  const neuf = await etudePour(`T-RC-B-${t}`, "syn_a_jour", [
    { name: "Toiture", cat: "enveloppe", uniformat_code: "B30.10", useful_life_years: 25, install_year: 2025, replacement_cost: 72000 },
    { name: "Ascenseur", cat: "equipements", uniformat_code: "D10.10", useful_life_years: 30, install_year: 2000, replacement_cost: 145000 },
    { name: "Drains", cat: "mecanique", uniformat_code: "D20.40", useful_life_years: 35, install_year: 1996, replacement_cost: 40000 }
  ], null);

  const r = await api(`/api/dossiers/${neuf}/reconciliation`, { jeton: jetonPortefeuille });
  verifier("l'étude précédente est retrouvée par le syndicat", r.disponible === true, r.motif);
  verifier("c'est bien celle de 2021", r.precedente?.annee === 2021, String(r.precedente?.annee));
  const par = Object.fromEntries(r.lignes.map((l) => [l.uniformat_code, l]));

  // Les factures du CRM sont la seule preuve qu'un travail a eu lieu : sans
  // elles, une composante qui sort de l'inventaire est un oubli possible.
  verifier("la toiture facturée est déclarée réalisée", par["B30.10"]?.etat === "realisee", par["B30.10"]?.etat);
  verifier("les balcons disparus ne sont PAS déclarés réalisés", par["B20.30"]?.etat === "disparue", par["B20.30"]?.etat);
  verifier("les drains sont une nouveauté", par["D20.40"]?.etat === "nouvelle", par["D20.40"]?.etat);
  verifier("l'ascenseur, même année, reste stable", par["D10.10"]?.etat === "stable", par["D10.10"]?.etat);

  // L'ancienne estimation doit être lue avec les yeux de son époque : prévue
  // en 1996 + 25 ans, elle tombe en 2021, pas à un nombre d'années compté
  // depuis aujourd'hui.
  verifier("l'année prévue par l'étude de 2021 est une année civile de 2021",
    par["D10.10"]?.precedent?.annee_prevue === 2030, String(par["D10.10"]?.precedent?.annee_prevue));

  // Le cœur de l'affaire : prévu contre facturé, en dollars de l'année du
  // chèque. Les deux factures du CRM totalisent 60 000 $.
  const j = par["B30.10"]?.justesse;
  verifier("la justesse compare le prévu au facturé", j?.facture === 60000, JSON.stringify(j));
  verifier("le prévu est indexé jusqu'à l'année de la facture",
    j != null && presque(j.prevu_indexe, 55000 * Math.pow(1.0176, j.annee_facture - 2021), 1),
    JSON.stringify(j));
  verifier("une composante réalisée n'est pas comptée comme renchérie", r.resume.rencheries === 1, JSON.stringify(r.resume));

  // Une étude sans immeuble ne se compare à rien, et le dit.
  const orphelin = await api("/api/dossiers", {
    method: "POST", jeton: jetonPortefeuille,
    body: JSON.stringify({ dossier_no: `T-RC-O-${t}`, name: "Immeuble hors portefeuille", units: 10 })
  });
  const sans = await api(`/api/dossiers/${orphelin.id}/reconciliation`, { jeton: jetonPortefeuille });
  verifier("un dossier non rattaché n'invente pas de comparaison", sans.disponible === false && !!sans.motif, JSON.stringify(sans));
}

// ---------------------------------------------------------------------------

const suites = [
  testAnneeAncreeSurInstallation,
  testRepliSurAnneeConstruction,
  testExclusionSansAucuneAnnee,
  testAnneeNonNumerique,
  testIndexationBanqueDePrix,
  testCoutParPorte,
  testCloisonDuPortefeuille,
  testStatutsDuCalendrier,
  testEtudeConnueChangeLEcheance,
  testDossierRattacheAuSyndicat,
  testRechercheDeSyndicat,
  testReconciliation
];

try {
  await connexion();
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(2);
}

for (const suite of suites) {
  try {
    await suite();
  } catch (e) {
    echecs.push(`${suite.name} a levé une erreur — ${e.message}`);
    console.log(`  ÉCHEC ${suite.name} — ${e.message}`);
  }
}

console.log(`\n${reussites} vérification(s) passées, ${echecs.length} en échec.`);
if (echecs.length > 0) {
  for (const e of echecs) console.log(`  · ${e}`);
  process.exit(1);
}
