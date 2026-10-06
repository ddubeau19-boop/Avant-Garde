// ============================================================
// Tri des photos — console bureau
// ------------------------------------------------------------
// L'ingénieur dépose toutes les photos d'un dossier d'un coup. Chacune est
// réduite dans le navigateur (1600 px, JPEG), envoyée, puis montrée à l'IA
// avec la liste des composantes : elle propose une composante et une
// confiance. Les propositions sûres s'approuvent en lot ; les autres se
// classent une à une. Rien n'est rattaché sans l'approbation de l'ingénieur.
// Les doublons (rafales, photos reprises) sont écartés avant l'envoi, sur
// leur empreinte visuelle : ils ne coûtent ni stockage ni analyse.
// ============================================================

const COTE_MAX = 1600;
const ENVOIS_SIMULTANES = 3;
// Deux photos dont les empreintes diffèrent d'au plus 5 bits sur 64 sont la
// même prise de vue (rafale, photo reprise, même fichier déposé deux fois).
const SEUIL_DOUBLON = 5;
// Seuils proposés pour les « propositions sûres ». L'IA est prudente : sur un
// vrai dossier, la plupart de ses propositions justes tombent entre 60 et 80 %.
const SEUILS = [90, 80, 70, 60, 50];
const CLE_SEUIL = 'cs_tri_seuil';
function seuilMemorise() {
  try { const v = Number(localStorage.getItem(CLE_SEUIL)); return SEUILS.includes(v) ? v : null; } catch (e) { return null; }
}

// Empreinte visuelle (dHash) : l'image réduite à 9 × 8 en niveaux de gris,
// chaque bit dit si un pixel est plus clair que son voisin de droite. Robuste
// à la compression, à la taille et aux petits écarts d'exposition ; deux
// cadrages différents donnent des empreintes éloignées.
function empreinteDe(source) {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gris = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let octet = 0;
    for (let x = 0; x < 8; x++) octet = (octet << 1) | (gris(x, y) > gris(x + 1, y) ? 1 : 0);
    hex += octet.toString(16).padStart(2, '0');
  }
  return hex;
}

function distance(a, b) {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// opts : { apiJson, apiRaw, render, escapeHtml, spinnerBlock, errorBanner,
//          dossierId: () => id, composantes: () => [...], categories: { cle: { label } },
//          ordreCategories: [...], apresClassement: (classees) => void }
export function creerTriPhotos(opts) {
  const { apiJson, apiRaw, render, escapeHtml, spinnerBlock, errorBanner } = opts;
  const t = {
    dossierId: null,
    photos: [],
    seuil: seuilMemorise() ?? 80,
    charge: false,
    chargement: false,
    erreur: null,
    vignettes: {},          // id -> URL d'objet
    choix: {},              // id -> composante choisie par l'ingénieur
    envoi: null,            // { total, faits, echecs: [noms], doublons }
    classement: false,
    survol: false,
    empreintes: [],         // empreintes des photos du dossier (classées ou non)
    doublons: [],           // photos écartées : { cle, fichier, empreinte, url }
    file: [],               // photos à envoyer : { f, forcer, dossier }
    ouvriers: 0,            // envois en route
    pause: false,
  };

  function liberer(url) { try { URL.revokeObjectURL(url); } catch (e) { /* déjà libérée */ } }

  function reinitialiser(dossierId) {
    Object.values(t.vignettes).forEach(liberer);
    t.doublons.forEach((d) => liberer(d.url));
    Object.assign(t, { dossierId, photos: [], charge: false, chargement: false, erreur: null, vignettes: {}, choix: {}, envoi: null, classement: false, survol: false, empreintes: [], doublons: [], file: [], pause: false });
  }

  // 'deja' : la même image est déjà au dossier (photo redéposée, reprise d'un
  // envoi interrompu) ; 'proche' : presque la même (rafale, photo reprise).
  function doublonDe(empreinte) {
    if (!empreinte) return null;
    let proche = false;
    for (const e of t.empreintes) {
      const d = distance(e, empreinte);
      if (d === 0) return 'deja';
      if (d <= SEUIL_DOUBLON) proche = true;
    }
    return proche ? 'proche' : null;
  }

  function nombreAClasser() { return t.photos.length; }

  // Liste seule, sans les images : sert au compteur de l'écran de révision.
  async function charger(dossierId) {
    if (t.dossierId !== dossierId) reinitialiser(dossierId);
    t.chargement = true;
    t.erreur = null;
    try {
      const r = await apiJson(`/api/dossiers/${dossierId}/photos-a-classer`);
      if (t.dossierId !== dossierId) return;
      t.photos = Array.isArray(r && r.photos) ? r.photos : [];
      if (r && r.seuil && seuilMemorise() == null) t.seuil = r.seuil;
      // Les empreintes déjà connues du serveur, plus celles d'envois encore en
      // route dans cet onglet.
      const serveur = Array.isArray(r && r.empreintes) ? r.empreintes : [];
      t.empreintes = Array.from(new Set(serveur.concat(t.empreintes)));
      t.charge = true;
    } catch (e) {
      if (t.dossierId === dossierId) t.erreur = e.message || 'Impossible de charger les photos à classer.';
    }
    t.chargement = false;
    render();
  }

  async function ouvrir(dossierId) {
    await charger(dossierId);
    chargerVignettes();
  }

  async function chargerVignettes() {
    const id = t.dossierId;
    for (const p of t.photos.slice()) {
      if (t.vignettes[p.id] || t.dossierId !== id) continue;
      try {
        const res = await apiRaw(`/api/dossiers/${id}/photos-a-classer/${p.id}/fichier`);
        if (!res.ok) continue;
        t.vignettes[p.id] = URL.createObjectURL(await res.blob());
        render();
      } catch (e) { /* la carte reste sans vignette */ }
    }
  }

  // Les photos de téléphone font 3 à 8 Mo : on les ramène à 1600 px, assez
  // pour le rapport et pour l'analyse, et on gagne l'envoi. Un format que le
  // navigateur ne sait pas décoder (HEIC hors Safari) part tel quel, sans
  // empreinte : il ne sera pas comparé aux autres.
  async function reduire(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const echelle = Math.min(1, COTE_MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * echelle);
      canvas.height = Math.round(bmp.height * echelle);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (bmp.close) bmp.close();
      const empreinte = empreinteDe(canvas);
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
      if (!blob) return { fichier: file, empreinte };
      const nom = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
      return { fichier: new File([blob], nom, { type: 'image/jpeg' }), empreinte };
    } catch (e) {
      return { fichier: file, empreinte: null };
    }
  }

  // forcer : l'ingénieur a demandé d'envoyer une photo écartée comme doublon.
  // File d'envoi partagée : déposer y ajoute, la pause arrête d'y puiser (les
  // photos déjà parties finissent), reprendre relance les envois.
  // forcer : l'ingénieur a demandé d'envoyer une photo écartée comme doublon.
  function deposer(fichiers, { forcer = false } = {}) {
    const id = t.dossierId;
    const images = Array.from(fichiers || []).filter((f) => !f.type || f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name || ''));
    if (!id || images.length === 0) return;
    if (t.envoi && t.envoi.faits < t.envoi.total) {
      t.envoi.total += images.length;
    } else {
      t.envoi = { total: images.length, faits: 0, echecs: [], doublons: 0, deja: 0, abandonnees: 0 };
    }
    images.forEach((f) => t.file.push({ f, forcer, dossier: id }));
    lancer();
    render();
  }

  function lancer() {
    while (!t.pause && t.file.length && t.ouvriers < ENVOIS_SIMULTANES) {
      t.ouvriers += 1;
      ouvrier().finally(() => { t.ouvriers -= 1; render(); });
    }
  }

  async function ouvrier() {
    while (!t.pause && t.file.length) {
      const { f, forcer, dossier: id } = t.file.shift();
      if (t.dossierId !== id) return;
      try {
        const { fichier, empreinte } = await reduire(f);
        if (t.dossierId !== id) return;
        // Vérifier et retenir l'empreinte sans attendre entre les deux : les
        // envois parallèles d'une même rafale se voient ainsi l'un l'autre.
        const doublon = forcer ? null : doublonDe(empreinte);
        if (doublon === 'deja') {
          // Déjà au dossier : rien à montrer, seulement à compter.
          if (t.envoi) t.envoi.deja += 1;
        } else if (doublon) {
          t.doublons.push({ cle: `d${Date.now()}${Math.random().toString(16).slice(2, 8)}`, fichier, empreinte, url: URL.createObjectURL(fichier) });
          if (t.envoi) t.envoi.doublons += 1;
        } else {
          if (empreinte) t.empreintes.push(empreinte);
          const fd = new FormData();
          fd.append('file', fichier);
          if (empreinte) fd.append('empreinte', empreinte);
          const p = await apiJson(`/api/dossiers/${id}/photos-a-classer`, { method: 'POST', body: fd });
          if (t.dossierId !== id) return;
          t.photos.push(p);
          t.vignettes[p.id] = URL.createObjectURL(fichier);
        }
      } catch (e) {
        if (t.envoi) t.envoi.echecs.push(f.name || 'photo');
      }
      if (t.dossierId !== id) return;
      if (t.envoi) t.envoi.faits += 1;
      render();
    }
  }

  function pause() { t.pause = true; render(); }
  function reprendre() { t.pause = false; lancer(); render(); }
  // Abandonner ce qui n'est pas parti ; les envois déjà en route se terminent.
  function abandonner() {
    const n = t.file.length;
    t.file = [];
    t.pause = false;
    if (t.envoi) { t.envoi.total -= n; t.envoi.abandonnees += n; }
    render();
  }

  function envoyerDoublons(cles) {
    const choisis = t.doublons.filter((d) => cles.includes(d.cle));
    if (!choisis.length) return;
    t.doublons = t.doublons.filter((d) => !cles.includes(d.cle));
    choisis.forEach((d) => liberer(d.url));
    deposer(choisis.map((d) => d.fichier), { forcer: true });
  }

  function oublierDoublons() {
    t.doublons.forEach((d) => liberer(d.url));
    t.doublons = [];
    render();
  }

  function choixDe(p) {
    return t.choix[p.id] !== undefined ? t.choix[p.id] : (p.suggestion_id || '');
  }

  function choixPropre(p) {
    return !!t.choix[p.id] && composanteExiste(t.choix[p.id]);
  }

  function composanteExiste(id) {
    return opts.composantes().some((c) => String(c.id) === String(id));
  }

  async function classer(ids) {
    const affectations = ids
      .map((id) => t.photos.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({ id: p.id, component_id: choixDe(p) }))
      .filter((a) => a.component_id && composanteExiste(a.component_id));
    if (!affectations.length || t.classement) return;
    t.classement = true;
    t.erreur = null;
    render();
    try {
      const r = await apiJson(`/api/dossiers/${t.dossierId}/photos-a-classer/classer`, { method: 'POST', body: JSON.stringify({ affectations }) });
      const faites = new Set((r.classees || []).map((x) => x.id));
      t.photos = t.photos.filter((p) => !faites.has(p.id));
      faites.forEach((id) => { delete t.choix[id]; });
      if (r.refusees && r.refusees.length) t.erreur = `${r.refusees.length} photo(s) n'ont pas pu être classées.`;
      opts.apresClassement(r.classees || []);
    } catch (e) {
      t.erreur = e.message || 'Le classement a échoué.';
    }
    t.classement = false;
    render();
  }

  async function supprimer(id) {
    if (!confirm('Retirer cette photo ? Elle ne sera rattachée à aucune composante.')) return;
    try {
      await apiJson(`/api/dossiers/${t.dossierId}/photos-a-classer/${id}`, { method: 'DELETE' });
      const retiree = t.photos.find((p) => p.id === id);
      if (retiree && retiree.empreinte) {
        const i = t.empreintes.indexOf(retiree.empreinte);
        if (i >= 0) t.empreintes.splice(i, 1);
      }
      t.photos = t.photos.filter((p) => p.id !== id);
      if (t.vignettes[id]) { try { URL.revokeObjectURL(t.vignettes[id]); } catch (e) { /* rien */ } delete t.vignettes[id]; }
      delete t.choix[id];
    } catch (e) {
      t.erreur = e.message || 'Impossible de retirer la photo.';
    }
    render();
  }

  // Une photo est « sûre » quand l'IA dépasse le seuil et que l'ingénieur n'a
  // pas changé sa proposition ; dès qu'il choisit lui-même, c'est son choix.
  function estSure(p) {
    return !!p.suggestion_id && (p.confiance ?? 0) >= t.seuil && t.choix[p.id] === undefined && composanteExiste(p.suggestion_id);
  }

  function changerSeuil(v) {
    if (!SEUILS.includes(v)) return;
    t.seuil = v;
    try { localStorage.setItem(CLE_SEUIL, String(v)); } catch (e) { /* mémoire facultative */ }
    render();
  }

  function seuilHtml() {
    const avecProposition = t.photos.filter((p) => p.suggestion_id && t.choix[p.id] === undefined && composanteExiste(p.suggestion_id));
    if (!avecProposition.length) return '';
    return `
      <div class="tp-seuil">
        <span class="tp-seuil-lbl">Propositions sûres à partir de</span>
        <div class="seg">${SEUILS.map((v) => {
          const n = avecProposition.filter((p) => (p.confiance ?? 0) >= v).length;
          return `<button class="seg-btn ${t.seuil === v ? 'on' : ''}" data-action="tp-seuil" data-val="${v}" title="${n} photo(s)">${v} %<small>${n}</small></button>`;
        }).join('')}</div>
        <span class="tp-seuil-aide">Plus bas : plus de photos à approuver d'un coup, à vérifier d'un œil sur les vignettes.</span>
      </div>`;
  }

  // ---------------- Rendu ----------------

  function nomComposante(id) {
    const c = opts.composantes().find((x) => String(x.id) === String(id));
    return c ? c.name : null;
  }

  function selectHtml(p) {
    const courant = choixDe(p);
    const comps = opts.composantes();
    const proposees = [p.suggestion_id, ...(p.autres || [])].filter((id, i, a) => id && a.indexOf(id) === i && composanteExiste(id));
    const option = (c) => `<option value="${escapeHtml(c.id)}" ${String(courant) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}${c.uniformat_code ? ' · ' + escapeHtml(c.uniformat_code) : ''}</option>`;
    const groupes = opts.ordreCategories
      .map((cat) => ({ cat, rows: comps.filter((c) => c.cat === cat) }))
      .filter((g) => g.rows.length);
    const autres = comps.filter((c) => !opts.ordreCategories.includes(c.cat));
    if (autres.length) groupes.push({ cat: null, rows: autres });
    return `<select class="detail-input tp-select" data-role="tp-choix" data-id="${escapeHtml(p.id)}" aria-label="Composante pour ${escapeHtml(p.nom_fichier || 'cette photo')}">
      <option value="" ${courant ? '' : 'selected'}>— Choisir la composante —</option>
      ${proposees.length ? `<optgroup label="Proposées par l'IA">${proposees.map((id) => option(comps.find((c) => String(c.id) === String(id)))).join('')}</optgroup>` : ''}
      ${groupes.map((g) => `<optgroup label="${escapeHtml(g.cat ? (opts.categories[g.cat] || {}).label || g.cat : 'Autres')}">${g.rows.map(option).join('')}</optgroup>`).join('')}
    </select>`;
  }

  function carteHtml(p) {
    const sure = estSure(p);
    const choix = choixDe(p);
    const img = t.vignettes[p.id]
      ? `<img src="${t.vignettes[p.id]}" alt="${escapeHtml(p.nom_fichier || '')}" loading="lazy">`
      : `<div class="tp-img-vide"><i data-lucide="image"></i></div>`;
    let badge;
    if (t.choix[p.id] !== undefined && t.choix[p.id]) badge = `<span class="tp-badge choix">Votre choix</span>`;
    else if (p.suggestion_id && composanteExiste(p.suggestion_id)) badge = `<span class="tp-badge ${sure ? 'sure' : 'doute'}">IA · ${p.confiance ?? 0} %</span>`;
    else badge = `<span class="tp-badge aucun">Aucune proposition</span>`;
    const libelleBouton = sure ? 'Approuver' : 'Classer';
    return `
    <div class="tp-card ${sure ? 'sure' : ''}">
      <div class="tp-img">${img}${badge}</div>
      <div class="tp-body">
        <div class="tp-nom" title="${escapeHtml(p.nom_fichier || '')}">${escapeHtml(p.nom_fichier || 'Photo')}</div>
        ${p.description ? `<div class="tp-desc">${escapeHtml(p.description)}</div>` : ''}
        ${!p.suggestion_id && p.erreur ? `<div class="tp-desc muted">${escapeHtml(p.erreur.startsWith('format') ? 'Format non analysable : classez-la vous-même.' : "L'IA n'a pas pu analyser cette photo.")}</div>` : ''}
        ${selectHtml(p)}
        <div class="tp-actions">
          <button class="btn-pill-sm tp-del" data-action="tp-supprimer" data-id="${escapeHtml(p.id)}" title="Retirer la photo" aria-label="Retirer la photo"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
          <button class="btn-pill-sm tp-ok" data-action="tp-classer" data-id="${escapeHtml(p.id)}" ${choix && !t.classement ? '' : 'disabled'}><i data-lucide="check" style="width:14px;height:14px"></i>${libelleBouton}</button>
        </div>
      </div>
    </div>`;
  }

  function html() {
    const sures = t.photos.filter(estSure);
    const aClasser = t.photos.filter((p) => !estSure(p));
    // Le lot ne prend que les choix faits par l'ingénieur : une proposition
    // douteuse de l'IA se valide une à une, en regardant la photo.
    const choisies = aClasser.filter(choixPropre);
    const envoi = t.envoi;
    const enCours = envoi && envoi.faits < envoi.total;
    const pct = envoi && envoi.total ? Math.round(envoi.faits / envoi.total * 100) : 0;
    return `
    <div class="page-pad cscr tp-page">
      <button class="back-link" data-action="go-revision"><i data-lucide="chevron-left"></i>Retour au dossier</button>
      <div class="eyebrow-orange" style="margin-top:14px">Photos du dossier</div>
      <h1 class="page-title">Déposer et classer</h1>
      <p class="page-lead">Déposez toutes les photos de la visite d'un coup. L'IA propose une composante pour chacune ; vous approuvez les propositions sûres et classez les autres.</p>

      <button type="button" class="tp-drop ${t.survol ? 'survol' : ''}" data-role="tp-drop" data-action="tp-choisir">
        <i data-lucide="upload-cloud"></i>
        <div class="tp-drop-titre">Glissez les photos ici, ou cliquez pour les choisir</div>
        <div class="tp-drop-sub">JPEG, PNG ou HEIC · autant que vous voulez · réduites à ${COTE_MAX} px avant l'envoi · doublons écartés</div>
      </button>

      ${envoi ? `
      <div class="tp-progress">
        <div class="tp-progress-txt">${enCours
          ? (t.pause
            ? `<i data-lucide="pause-circle" style="width:14px;height:14px"></i>En pause : ${envoi.faits}/${envoi.total}${t.ouvriers ? ` · ${t.ouvriers} envoi(s) en train de se terminer` : ''}`
            : `<i data-lucide="loader-2" class="spin" style="width:14px;height:14px"></i>Envoi et analyse : ${envoi.faits}/${envoi.total}`)
          : `<i data-lucide="check-circle-2" style="width:14px;height:14px"></i>${envoi.total - envoi.echecs.length - (envoi.doublons || 0) - (envoi.deja || 0)} photo(s) analysée(s)`}${envoi.deja ? ` · ${envoi.deja} déjà envoyée(s)` : ''}${envoi.doublons ? ` · ${envoi.doublons} doublon(s) écarté(s)` : ''}${envoi.abandonnees ? ` · ${envoi.abandonnees} non envoyée(s)` : ''}${envoi.echecs.length ? ` · <span class="err">${envoi.echecs.length} échec(s) : ${escapeHtml(envoi.echecs.slice(0, 3).join(', '))}${envoi.echecs.length > 3 ? '…' : ''}</span>` : ''}
          ${enCours ? `<span class="tp-progress-actions">${t.pause
            ? `<button class="btn-pill-sm" data-action="tp-reprendre"><i data-lucide="play" style="width:13px;height:13px"></i>Reprendre</button><button class="btn-pill-sm" data-action="tp-abandonner">Abandonner le reste</button>`
            : `<button class="btn-pill-sm" data-action="tp-pause"><i data-lucide="pause" style="width:13px;height:13px"></i>Mettre en pause</button>`}</span>` : ''}</div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${t.pause ? 'var(--ink-400)' : 'var(--orange)'}"></div></div>
        ${enCours ? `<div class="tp-progress-aide">Pour continuer un autre jour : redéposez le même dossier de photos. Celles déjà envoyées seront reconnues et écartées.</div>` : ''}
      </div>` : ''}

      ${t.erreur ? errorBanner(t.erreur) : ''}
      ${t.chargement && !t.charge ? spinnerBlock('Chargement des photos…') : ''}

      ${t.charge && t.photos.length === 0 && !enCours && !t.doublons.length ? `<div class="empty-state">Aucune photo en attente de classement.</div>` : ''}

      ${t.doublons.length ? `
      <div class="tp-section-head">
        <span class="lbl"><i data-lucide="copy" style="width:14px;height:14px"></i>Doublons écartés · ${t.doublons.length}</span>
        <div class="rule"></div>
        <span class="hint">Pas envoyés ni analysés : presque identiques à une photo déjà au dossier</span>
        <button class="btn-pill-sm" data-action="tp-oublier-doublons">Les ignorer</button>
        <button class="btn-pill-sm" data-action="tp-envoyer-doublons">Tout envoyer quand même</button>
      </div>
      <div class="tp-doublons">${t.doublons.map((d) => `
        <div class="tp-doublon">
          <img src="${d.url}" alt="${escapeHtml(d.fichier.name || '')}" loading="lazy">
          <div class="tp-doublon-nom" title="${escapeHtml(d.fichier.name || '')}">${escapeHtml(d.fichier.name || 'Photo')}</div>
          <button class="btn-pill-sm" data-action="tp-envoyer-doublon" data-cle="${d.cle}">Envoyer</button>
        </div>`).join('')}</div>` : ''}

      ${seuilHtml()}

      ${sures.length ? `
      <div class="tp-section-head">
        <span class="lbl"><i data-lucide="sparkles" style="width:14px;height:14px"></i>Propositions sûres · ${sures.length}</span>
        <div class="rule"></div>
        <span class="hint">Confiance de ${t.seuil} % et plus</span>
        <button class="btn-primary tp-bulk" data-action="tp-approuver-sures" ${t.classement ? 'disabled' : ''}>Approuver les ${sures.length}</button>
      </div>
      <div class="tp-grid">${sures.map(carteHtml).join('')}</div>` : ''}

      ${aClasser.length ? `
      <div class="tp-section-head">
        <span class="lbl"><i data-lucide="help-circle" style="width:14px;height:14px"></i>À classer · ${aClasser.length}</span>
        <div class="rule"></div>
        <span class="hint">L'IA n'est pas sûre : choisissez la composante</span>
        ${choisies.length ? `<button class="btn-primary tp-bulk" data-action="tp-classer-choisies" ${t.classement ? 'disabled' : ''}>Classer vos ${choisies.length} choix</button>` : ''}
      </div>
      <div class="tp-grid">${aClasser.map(carteHtml).join('')}</div>` : ''}
    </div>`;
  }

  // ---------------- Événements ----------------

  // Le sélecteur vit hors de l'écran redessiné : un rendu pendant que la
  // fenêtre de choix est ouverte (vignettes qui arrivent, envoi en cours)
  // remplaçait l'ancien <input>, et la sélection se perdait.
  function choisirFichiers() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.heic,.heif';
    input.addEventListener('change', () => deposer(Array.from(input.files || [])));
    input.click();
  }

  function click(action, btn) {
    switch (action) {
      case 'tp-choisir': choisirFichiers(); return true;
      case 'tp-pause': pause(); return true;
      case 'tp-seuil': changerSeuil(Number(btn.getAttribute('data-val'))); return true;
      case 'tp-reprendre': reprendre(); return true;
      case 'tp-abandonner':
        if (confirm(`Abandonner les ${t.file.length} photo(s) pas encore envoyée(s) ? Vous pourrez les redéposer plus tard.`)) abandonner();
        return true;
      case 'tp-classer': classer([btn.getAttribute('data-id')]); return true;
      case 'tp-supprimer': supprimer(btn.getAttribute('data-id')); return true;
      case 'tp-envoyer-doublon': envoyerDoublons([btn.getAttribute('data-cle')]); return true;
      case 'tp-envoyer-doublons': envoyerDoublons(t.doublons.map((d) => d.cle)); return true;
      case 'tp-oublier-doublons': oublierDoublons(); return true;
      case 'tp-approuver-sures': classer(t.photos.filter(estSure).map((p) => p.id)); return true;
      case 'tp-classer-choisies': classer(t.photos.filter((p) => !estSure(p) && choixPropre(p)).map((p) => p.id)); return true;
      default: return false;
    }
  }

  function change(el) {
    if (el.matches('[data-role="tp-choix"]')) {
      const id = el.getAttribute('data-id');
      const p = t.photos.find((x) => x.id === id);
      // Revenir à la proposition de l'IA, c'est ne plus avoir de choix propre.
      if (p && el.value === (p.suggestion_id || '')) delete t.choix[id];
      else t.choix[id] = el.value;
      render();
      return true;
    }
    return false;
  }

  // Glisser-déposer : écouteurs posés une fois sur le conteneur de l'app.
  function brancher(app, actif) {
    // L'envoi vit dans l'onglet : le fermer ou le recharger l'arrête. Le
    // navigateur demande confirmation tant qu'il reste des photos à envoyer
    // (il affiche son propre message, pas le nôtre).
    window.addEventListener('beforeunload', (e) => {
      if (!envoiEnCours()) return;
      e.preventDefault();
      e.returnValue = '';
    });
    const zone = (e) => actif() && e.target && e.target.closest && e.target.closest('[data-role="tp-drop"]');
    app.addEventListener('dragover', (e) => {
      if (!zone(e)) return;
      e.preventDefault();
      if (!t.survol) { t.survol = true; e.target.closest('[data-role="tp-drop"]').classList.add('survol'); }
    });
    app.addEventListener('dragleave', (e) => {
      if (!zone(e)) return;
      t.survol = false;
      e.target.closest('[data-role="tp-drop"]').classList.remove('survol');
    });
    app.addEventListener('drop', (e) => {
      if (!zone(e)) return;
      e.preventDefault();
      t.survol = false;
      deposer(e.dataTransfer && e.dataTransfer.files);
    });
    // Une photo lâchée à côté de la zone ne doit pas faire quitter la page.
    window.addEventListener('dragover', (e) => { if (actif()) e.preventDefault(); });
    window.addEventListener('drop', (e) => { if (actif()) e.preventDefault(); });
  }

  // Photos encore à envoyer : fermer l'onglet ou changer de dossier les perdrait.
  function envoiEnCours() {
    return !!(t.envoi && t.envoi.faits < t.envoi.total);
  }

  return { charger, ouvrir, reinitialiser, nombreAClasser, html, click, change, brancher, nomComposante, envoiEnCours };
}
