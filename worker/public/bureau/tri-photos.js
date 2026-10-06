// ============================================================
// Tri des photos — console bureau
// ------------------------------------------------------------
// L'ingénieur dépose toutes les photos d'un dossier d'un coup. Chacune est
// réduite dans le navigateur (1600 px, JPEG), envoyée, puis montrée à l'IA
// avec la liste des composantes : elle propose une composante et une
// confiance. Les propositions sûres s'approuvent en lot ; les autres se
// classent une à une. Rien n'est rattaché sans l'approbation de l'ingénieur.
// ============================================================

const COTE_MAX = 1600;
const ENVOIS_SIMULTANES = 3;

// opts : { apiJson, apiRaw, render, escapeHtml, spinnerBlock, errorBanner,
//          dossierId: () => id, composantes: () => [...], categories: { cle: { label } },
//          ordreCategories: [...], apresClassement: (classees) => void }
export function creerTriPhotos(opts) {
  const { apiJson, apiRaw, render, escapeHtml, spinnerBlock, errorBanner } = opts;
  const t = {
    dossierId: null,
    photos: [],
    seuil: 80,
    charge: false,
    chargement: false,
    erreur: null,
    vignettes: {},          // id -> URL d'objet
    choix: {},              // id -> composante choisie par l'ingénieur
    envoi: null,            // { total, faits, echecs: [noms] }
    classement: false,
    survol: false,
  };

  function reinitialiser(dossierId) {
    Object.values(t.vignettes).forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* déjà libérée */ } });
    Object.assign(t, { dossierId, photos: [], charge: false, chargement: false, erreur: null, vignettes: {}, choix: {}, envoi: null, classement: false, survol: false });
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
      if (r && r.seuil) t.seuil = r.seuil;
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
  // navigateur ne sait pas décoder (HEIC hors Safari) part tel quel.
  async function reduire(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const echelle = Math.min(1, COTE_MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * echelle);
      canvas.height = Math.round(bmp.height * echelle);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (bmp.close) bmp.close();
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
      if (!blob) return file;
      const nom = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], nom, { type: 'image/jpeg' });
    } catch (e) {
      return file;
    }
  }

  async function deposer(fichiers) {
    const id = t.dossierId;
    const images = Array.from(fichiers || []).filter((f) => !f.type || f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name || ''));
    if (!id || images.length === 0) return;
    if (t.envoi && t.envoi.faits < t.envoi.total) {
      t.envoi.total += images.length;
    } else {
      t.envoi = { total: images.length, faits: 0, echecs: [] };
    }
    render();
    const attente = images.slice();
    async function suivant() {
      while (attente.length) {
        const f = attente.shift();
        try {
          const reduite = await reduire(f);
          const fd = new FormData();
          fd.append('file', reduite);
          const p = await apiJson(`/api/dossiers/${id}/photos-a-classer`, { method: 'POST', body: fd });
          if (t.dossierId !== id) return;
          t.photos.push(p);
          t.vignettes[p.id] = URL.createObjectURL(reduite);
        } catch (e) {
          if (t.envoi) t.envoi.echecs.push(f.name || 'photo');
        }
        if (t.dossierId !== id) return;
        if (t.envoi) t.envoi.faits += 1;
        render();
      }
    }
    await Promise.all(Array.from({ length: Math.min(ENVOIS_SIMULTANES, images.length) }, suivant));
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
    return p.sure && t.choix[p.id] === undefined && composanteExiste(p.suggestion_id);
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

      <label class="tp-drop ${t.survol ? 'survol' : ''}" data-role="tp-drop">
        <input type="file" accept="image/*,.heic,.heif" multiple data-role="tp-fichiers" style="display:none">
        <i data-lucide="upload-cloud"></i>
        <div class="tp-drop-titre">Glissez les photos ici, ou cliquez pour les choisir</div>
        <div class="tp-drop-sub">JPEG, PNG ou HEIC · autant que vous voulez · réduites à ${COTE_MAX} px avant l'envoi</div>
      </label>

      ${envoi ? `
      <div class="tp-progress">
        <div class="tp-progress-txt">${enCours ? `<i data-lucide="loader-2" class="spin" style="width:14px;height:14px"></i>Envoi et analyse : ${envoi.faits}/${envoi.total}` : `<i data-lucide="check-circle-2" style="width:14px;height:14px"></i>${envoi.total - envoi.echecs.length} photo(s) analysée(s)`}${envoi.echecs.length ? ` · <span class="err">${envoi.echecs.length} échec(s) : ${escapeHtml(envoi.echecs.slice(0, 3).join(', '))}${envoi.echecs.length > 3 ? '…' : ''}</span>` : ''}</div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:var(--orange)"></div></div>
      </div>` : ''}

      ${t.erreur ? errorBanner(t.erreur) : ''}
      ${t.chargement && !t.charge ? spinnerBlock('Chargement des photos…') : ''}

      ${t.charge && t.photos.length === 0 && !enCours ? `<div class="empty-state">Aucune photo en attente de classement.</div>` : ''}

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

  function click(action, btn) {
    switch (action) {
      case 'tp-classer': classer([btn.getAttribute('data-id')]); return true;
      case 'tp-supprimer': supprimer(btn.getAttribute('data-id')); return true;
      case 'tp-approuver-sures': classer(t.photos.filter(estSure).map((p) => p.id)); return true;
      case 'tp-classer-choisies': classer(t.photos.filter((p) => !estSure(p) && choixPropre(p)).map((p) => p.id)); return true;
      default: return false;
    }
  }

  function change(el) {
    if (el.matches('[data-role="tp-fichiers"]')) {
      const files = el.files ? Array.from(el.files) : [];
      el.value = '';
      deposer(files);
      return true;
    }
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

  return { charger, ouvrir, reinitialiser, nombreAClasser, html, click, change, brancher, nomComposante };
}
