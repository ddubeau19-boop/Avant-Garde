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
  const entetes = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const res = await fetch(`${BASE}${chemin}`, { ...options, headers: entetes });
  const texte = await res.text();
  let donnees = null;
  try { donnees = JSON.parse(texte); } catch { donnees = texte; }
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${chemin} → ${res.status} ${texte.slice(0, 200)}`);
  return donnees;
}

async function connexion() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: COURRIEL, password: MDP })
  });
  if (!res.ok) {
    throw new Error(
      `connexion impossible (${res.status}). Ces tests attendent un compte semé : ` +
      `${COURRIEL}. Voir worker/test/semer.sql.`
    );
  }
  jeton = (await res.json()).token;
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

const suites = [
  testAnneeAncreeSurInstallation,
  testRepliSurAnneeConstruction,
  testExclusionSansAucuneAnnee,
  testAnneeNonNumerique,
  testIndexationBanqueDePrix,
  testCoutParPorte
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
