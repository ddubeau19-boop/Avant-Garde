// ============================================================
// Modèles de rapport — page partagée par l'administration (super admin)
// et la console bureau (administrateurs de la firme) : identité du rapport
// (couleurs, polices, coordonnées), gabarit Word de mise en page et texte
// de fond des sections. Un ingénieur les consulte sans les modifier.
// ============================================================

// opts : { apiJson, render, escapeHtml, fmtDate, spinnerBlock, companyId: () => id }
export function creerModeles(opts) {
  const { apiJson, render, escapeHtml, fmtDate, spinnerBlock } = opts;
  const m = {
    theme: null, themeDraft: {}, themeSaving: false, themeError: null, themeNote: null,
    miseEnPage: null, miseEnPageUploading: false, miseEnPageError: null,
    template: null, templateLoading: false, templateError: null, templateNote: null,
    templateUploading: false, templateOpenCle: null, templateEdits: {}, templateSaving: false,
  };

  function reset() {
    Object.assign(m, {
      theme: null, themeDraft: {}, themeSaving: false, themeError: null, themeNote: null,
      miseEnPage: null, miseEnPageUploading: false, miseEnPageError: null,
      template: null, templateLoading: false, templateError: null, templateNote: null,
      templateUploading: false, templateOpenCle: null, templateEdits: {}, templateSaving: false,
    });
  }

  function charger() {
    const id = opts.companyId();
    loadTemplate(id);
    loadTheme(id);
    loadMiseEnPage(id);
  }

  const THEME_CHAMPS = [
    { k: 'accent', label: "Couleur d'accent", type: 'couleur', aide: 'Titres de section, filets, cote « Mauvais ».' },
    { k: 'encre', label: 'Couleur du texte', type: 'couleur' },
    { k: 'gris', label: 'Couleur secondaire', type: 'couleur', aide: 'Étiquettes, légendes, pied de page.' },
    { k: 'police', label: 'Police du texte', type: 'texte' },
    { k: 'policeTitres', label: 'Police des titres', type: 'texte' },
    { k: 'policeMono', label: 'Police des étiquettes', type: 'texte' },
    { k: 'adresse', label: 'Adresse', type: 'texte' },
    { k: 'telephone', label: 'Téléphone', type: 'texte' },
    { k: 'courriel', label: 'Courriel', type: 'texte' },
    { k: 'site', label: 'Site Web', type: 'texte' },
  ];

  function themeCardHtml() {
    const t = m.theme;
    const d = m.themeDraft || {};
    const eff = (t && t.effectif) || {};
    const val = (k) => d[k] != null && d[k] !== '' ? d[k] : '';
    const couleur = (k) => '#' + String(val(k) || eff[k] || '000000').replace(/^#/, '');
    return `
    <div>
      <div class="eng-section-head">
        <span class="lbl">Identité du rapport</span>
        <div class="rule"></div>
      </div>
      <div class="tpl-lead">Couleurs, polices et coordonnées du rapport Word de cette entreprise. Un champ laissé vide garde la valeur par défaut. Les polices doivent être installées sur les postes qui ouvrent le document; sinon Word les remplace.</div>
      ${m.themeError ? `<div class="login-error" style="margin:10px 0">${escapeHtml(m.themeError)}</div>` : ''}
      ${m.themeNote ? `<div class="temp-pass-warn" style="margin:10px 0"><i data-lucide="check"></i><span>${escapeHtml(m.themeNote)}</span></div>` : ''}
      ${!t ? spinnerBlock('Chargement…') : `
      <div class="theme-grid">
        ${THEME_CHAMPS.map(c => `
        <label class="theme-field">
          <span class="field-label">${escapeHtml(c.label)}</span>
          ${c.type === 'couleur' ? `
          <span class="theme-color-row">
            <input type="color" data-role="theme-color" data-key="${c.k}" value="${escapeHtml(couleur(c.k))}">
            <input type="text" data-role="theme-field" data-key="${c.k}" value="${escapeHtml(val(c.k))}" placeholder="${escapeHtml((t.defauts || {})[c.k] || '')}" maxlength="7">
          </span>` : `
          <input type="text" data-role="theme-field" data-key="${c.k}" value="${escapeHtml(val(c.k))}" placeholder="${escapeHtml(eff[c.k] || (t.defauts || {})[c.k] || '')}">`}
          ${c.aide ? `<span class="theme-help">${escapeHtml(c.aide)}</span>` : ''}
        </label>`).join('')}
      </div>
      <div class="theme-apercu" style="--acc:${couleur('accent')};--enc:${couleur('encre')};--gri:${couleur('gris')}">
        <div class="ta-eyebrow">Enveloppe du bâtiment · B20.10</div>
        <div class="ta-title">4.3.12 Parement – Maçonnerie</div>
        <div class="ta-rule"></div>
        <div class="ta-label">État de l'actif</div>
        <div class="ta-text">Aperçu des couleurs d'une fiche composante.</div>
      </div>
      <div class="tpl-actions">
        <button class="btn-primary" data-action="theme-save" ${m.themeSaving ? 'disabled' : ''}>${m.themeSaving ? 'Enregistrement…' : "Enregistrer l'identité"}</button>
      </div>`}
    </div>`;
  }

  function miseEnPageCardHtml() {
    const mp = m.miseEnPage;
    const a = (mp && mp.analyse) || null;
    const champs = (mp && mp.champs) || [];
    const blocs = (mp && mp.blocs) || [];
    const puces = (liste) => liste.map(k => `<code class="champ-chip">{{${escapeHtml(k)}}}</code>`).join(' ');
    return `
    <div>
      <div class="eng-section-head">
        <span class="lbl">Gabarit Word de mise en page</span>
        <div class="rule"></div>
        <label class="btn-pill-sm">${m.miseEnPageUploading ? 'Analyse du document…' : 'Importer un .docx'}<input type="file" accept=".docx" data-role="mise-en-page-file" style="display:none" ${m.miseEnPageUploading ? 'disabled' : ''}></label>
      </div>
      <div class="tpl-lead">Les pages que l'entreprise place avant le rapport (page de garde, présentation de la firme, explications de la Loi 16…), avec son en-tête, son pied de page et ses styles. Écrivez les champs entre accolades là où les données du dossier doivent apparaître, et placez <code>{{RAPPORT}}</code> à l'endroit où le rapport de la plateforme commence.</div>
      ${m.miseEnPageError ? `<div class="login-error" style="margin:10px 0">${escapeHtml(m.miseEnPageError)}</div>` : ''}
      ${!mp ? spinnerBlock('Chargement…') : `
      ${mp.importe ? `
      <div class="tpl-lead" style="margin:10px 0">Importé depuis <code>${escapeHtml(mp.filename || '')}</code> le ${fmtDate(mp.imported_at)} · <button class="btn-row-action" data-action="mise-en-page-delete">Retirer ce gabarit</button></div>
      ${a && !a.repere ? `<div class="temp-pass-warn" style="margin:8px 0"><i data-lucide="info"></i><span>Aucun repère <code>{{RAPPORT}}</code> : le rapport sera ajouté à la fin du document, sur une nouvelle page.</span></div>` : ''}
      ${a && a.inconnus && a.inconnus.length ? `<div class="temp-pass-warn" style="margin:8px 0"><i data-lucide="alert-triangle"></i><span>Champs inconnus, laissés tels quels dans le rapport : ${puces(a.inconnus)}</span></div>` : ''}
      ${a && a.notes && a.notes.length ? `<div class="temp-pass-warn" style="margin:8px 0"><i data-lucide="alert-triangle"></i><span>Notes de rédaction internes trouvées dans les pages liminaires — elles seraient reprises telles quelles dans chaque rapport livré :<br>${a.notes.map(n => `« ${escapeHtml(n)} »`).join('<br>')}</span></div>` : ''}
      ${a ? `<div class="tpl-lead" style="margin:8px 0">Champs reconnus : ${a.champs && a.champs.length ? puces(a.champs) : 'aucun'}${a.blocs && a.blocs.length ? ` · Blocs : ${puces(a.blocs.map(b => b.toUpperCase()))}` : ''}</div>` : ''}` : `
      <div class="tpl-lead" style="margin:10px 0">Aucun gabarit importé : les rapports utilisent la mise en page intégrée, aux couleurs de l'entreprise.</div>`}
      <details class="champs-details">
      <summary>Voir les champs disponibles (${champs.length + blocs.length})</summary>
      <div class="dossiers-table" style="margin-top:12px">
        <div class="dt-row champ-row dt-head"><div>Champ</div><div>Remplacé par</div></div>
        ${blocs.map(([k, d]) => `<div class="dt-row champ-row"><div><code class="champ-chip">{{${escapeHtml(k.toUpperCase())}}}</code></div><div class="dt-sub">${escapeHtml(d)}</div></div>`).join('')}
        ${champs.map(([k, d]) => `<div class="dt-row champ-row"><div><code class="champ-chip">{{${escapeHtml(k)}}}</code></div><div class="dt-sub">${escapeHtml(d)}</div></div>`).join('')}
      </div>
      </details>`}
    </div>`;
  }

  // Aperçu d'une section : ce que la firme a fourni, ou le texte intégré.
  function apercuSection(val) {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) {
      if (val.length && Array.isArray(val[0])) return val.map(pr => pr.join(' : ')).join('\n');
      return val.join('\n');
    }
    if (typeof val === 'object') return Object.entries(val).map(([k, v]) => k + '\n' + apercuSection(v)).join('\n\n');
    return String(val);
  }

  function templateCardHtml() {
    const t = m.template;
    const importe = t && t.sections ? Object.keys(t.sections) : [];
    return `
    <div>
      <div class="eng-section-head">
        <span class="lbl">Gabarit de rapport</span>
        <div class="rule"></div>
        <label class="btn-pill-sm">${m.templateUploading ? 'Lecture du document…' : 'Importer un .docx'}<input type="file" accept=".docx" data-role="template-file" style="display:none" ${m.templateUploading ? 'disabled' : ''}></label>
      </div>
      <div class="tpl-lead">Le texte de fond des rapports de cette entreprise — méthodologie, limitations légales, déclaration, lexique. Les sections non fournies gardent le gabarit intégré.</div>

      ${m.templateError ? `<div class="login-error" style="margin:10px 0">${escapeHtml(m.templateError)}</div>` : ''}
      ${m.templateNote ? `<div class="temp-pass-warn" style="margin:10px 0"><i data-lucide="info"></i><span>${escapeHtml(m.templateNote)}</span></div>` : ''}

      ${m.templateLoading ? spinnerBlock('Chargement du gabarit…') : !t ? '' : `
        <div class="tpl-lead" style="margin:10px 0 14px">
          ${t.source_filename ? `Importé depuis <code>${escapeHtml(t.source_filename)}</code> le ${fmtDate(t.imported_at)} · ` : ''}
          <strong>${importe.length}</strong> section${importe.length > 1 ? 's' : ''} sur ${t.catalogue.length} proviennent de cette entreprise.
          ${importe.length ? `<button class="btn-row-action" style="margin-left:10px" data-action="template-reset">Tout remettre au gabarit intégré</button>` : ''}
        </div>

        <div class="dossiers-table">
          ${t.catalogue.map(sec => {
            const propre = t.sections && t.sections[sec.cle] != null;
            const ouvert = m.templateOpenCle === sec.cle;
            const valeur = m.templateEdits[sec.cle] != null
              ? m.templateEdits[sec.cle]
              : apercuSection(propre ? t.sections[sec.cle] : (t.defauts || {})[sec.cle]);
            return `
            <div class="dt-row tpl-row">
              <div class="dt-name">${escapeHtml(sec.label)}</div>
              <div>${propre
                ? `<span class="status-badge" style="background:#E8F5E9;color:#1B5E20">Gabarit de l'entreprise</span>`
                : `<span class="status-badge" style="background:var(--ink-100);color:var(--ink-600)">Gabarit intégré</span>`}</div>
              <div><button class="btn-row-action" data-action="template-toggle" data-cle="${escapeHtml(sec.cle)}">${ouvert ? 'Fermer' : 'Voir / corriger'}</button></div>
            </div>
            ${ouvert ? `
            <div class="tpl-edit">
              <div class="tpl-lead" style="margin-bottom:8px">${sec.forme === 'paires' ? 'Une ligne par entrée, au format « terme : définition ».' : sec.forme === 'texte' ? 'Un seul bloc de texte.' : 'Une ligne par paragraphe ou par puce.'}${sec.sous ? ' Cette section contient plusieurs sous-parties : la modifier à la main est déconseillé, préférez réimporter le .docx.' : ''}</div>
              <textarea data-role="template-text" data-cle="${escapeHtml(sec.cle)}" rows="10" ${sec.sous ? 'readonly' : ''}>${escapeHtml(valeur)}</textarea>
              ${sec.sous ? '' : `<div class="tpl-actions">
                <button class="btn-primary" data-action="template-save" data-cle="${escapeHtml(sec.cle)}" ${m.templateSaving ? 'disabled' : ''}>${m.templateSaving ? 'Enregistrement…' : 'Enregistrer cette section'}</button>
                ${propre ? `<button class="btn-secondary" data-action="template-clear" data-cle="${escapeHtml(sec.cle)}">Revenir au gabarit intégré</button>` : ''}
              </div>`}
            </div>` : ''}`;
          }).join('')}
        </div>`}
    </div>`;
  }

  async function loadTheme(id) {
    try {
      m.theme = await apiJson(`/api/companies/${id}/theme`);
      m.themeDraft = Object.assign({}, m.theme.theme || {});
      m.themeError = null;
    } catch (e) {
      m.themeError = e.message || "Impossible de charger l'identité du rapport.";
    }
    render();
  }

  async function saveTheme() {
    if (m.themeSaving) return;
    m.themeSaving = true;
    m.themeError = null;
    m.themeNote = null;
    render();
    try {
      m.theme = await apiJson(`/api/companies/${opts.companyId()}/theme`, { method: 'PATCH', body: JSON.stringify(m.themeDraft) });
      m.themeDraft = Object.assign({}, m.theme.theme || {});
      m.themeNote = 'Identité enregistrée. Les prochains rapports Word la reprendront.';
    } catch (e) {
      m.themeError = e.message || "L'enregistrement a échoué.";
    }
    m.themeSaving = false;
    render();
  }

  async function loadMiseEnPage(id) {
    try {
      m.miseEnPage = await apiJson(`/api/companies/${id}/mise-en-page`);
      m.miseEnPageError = null;
    } catch (e) {
      m.miseEnPageError = e.message || 'Impossible de charger le gabarit de mise en page.';
    }
    render();
  }

  async function uploadMiseEnPage(file) {
    if (!file || m.miseEnPageUploading) return;
    m.miseEnPageUploading = true;
    m.miseEnPageError = null;
    render();
    try {
      const fd = new FormData();
      fd.append('file', file);
      m.miseEnPage = await apiJson(`/api/companies/${opts.companyId()}/mise-en-page`, { method: 'POST', body: fd });
    } catch (e) {
      m.miseEnPageError = e.message || "L'import du gabarit a échoué.";
    }
    m.miseEnPageUploading = false;
    render();
  }

  async function deleteMiseEnPage() {
    if (!confirm("Retirer le gabarit de mise en page ? Les rapports reprendront la mise en page intégrée, aux couleurs de l'entreprise.")) return;
    try {
      m.miseEnPage = await apiJson(`/api/companies/${opts.companyId()}/mise-en-page`, { method: 'DELETE' });
    } catch (e) {
      m.miseEnPageError = e.message || "L'opération a échoué.";
    }
    render();
  }

  async function loadTemplate(id) {
    m.templateLoading = true;
    m.templateError = null;
    render();
    try {
      m.template = await apiJson(`/api/companies/${id}/template`);
      m.templateEdits = {};
    } catch (e) {
      m.templateError = e.message || 'Impossible de charger le gabarit.';
    }
    m.templateLoading = false;
    render();
  }

  async function uploadTemplate(file) {
    if (!file || m.templateUploading) return;
    m.templateUploading = true;
    m.templateError = null;
    m.templateNote = null;
    render();
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiJson(`/api/companies/${opts.companyId()}/template`, { method: 'POST', body: fd });
      const n = (res.sections_remplies || []).length;
      const reste = (res.sections_par_defaut || []).length;
      m.templateNote = res.note
        || `${res.paragraphes} paragraphes lus. ${n} section${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''} du document${reste ? `, ${reste} conservée${reste > 1 ? 's' : ''} au gabarit intégré faute de correspondance claire` : ''}. Relisez-les avant de produire un rapport.`;
      await loadTemplate(opts.companyId());
    } catch (e) {
      m.templateError = e.message || "L'import du gabarit a échoué.";
    }
    m.templateUploading = false;
    render();
  }

  // Enregistre une section. Le texte saisi est renvoyé dans la forme attendue par
  // la section : une chaîne, une liste de lignes, ou des paires « terme : définition ».
  async function saveTemplateSection(cle) {
    const sec = (m.template && m.template.catalogue || []).find(x => x.cle === cle);
    if (!sec || m.templateSaving) return;
    const brut = m.templateEdits[cle];
    if (brut == null) { m.templateOpenCle = null; render(); return; }
    let valeur;
    const lignes = brut.split('\n').map(l => l.trim()).filter(Boolean);
    if (sec.forme === 'texte') valeur = brut.trim();
    else if (sec.forme === 'paires') valeur = lignes.map(l => { const i = l.indexOf(' : '); return i < 0 ? null : [l.slice(0, i).trim(), l.slice(i + 3).trim()]; }).filter(Boolean);
    else valeur = lignes;

    const sections = Object.assign({}, m.template.sections || {});
    if ((Array.isArray(valeur) && valeur.length === 0) || (typeof valeur === 'string' && !valeur)) delete sections[cle];
    else sections[cle] = valeur;

    m.templateSaving = true;
    render();
    try {
      await apiJson(`/api/companies/${opts.companyId()}/template`, { method: 'PATCH', body: JSON.stringify({ sections }) });
      m.templateOpenCle = null;
      m.templateNote = null;
      await loadTemplate(opts.companyId());
    } catch (e) {
      m.templateError = e.message || "L'enregistrement a échoué.";
    }
    m.templateSaving = false;
    render();
  }

  async function clearTemplateSection(cle) {
    const sections = Object.assign({}, m.template && m.template.sections || {});
    delete sections[cle];
    m.templateSaving = true;
    render();
    try {
      await apiJson(`/api/companies/${opts.companyId()}/template`, { method: 'PATCH', body: JSON.stringify({ sections }) });
      delete m.templateEdits[cle];
      m.templateOpenCle = null;
      await loadTemplate(opts.companyId());
    } catch (e) {
      m.templateError = e.message || "L'opération a échoué.";
    }
    m.templateSaving = false;
    render();
  }

  async function resetTemplate() {
    if (!confirm("Remettre toutes les sections au gabarit intégré ? Le document importé reste conservé, mais son texte ne sera plus utilisé dans les rapports.")) return;
    try {
      await apiJson(`/api/companies/${opts.companyId()}/template`, { method: 'DELETE' });
      m.templateNote = null;
      m.templateEdits = {};
      await loadTemplate(opts.companyId());
    } catch (e) {
      m.templateError = e.message || "L'opération a échoué.";
      render();
    }
  }

  // Les rôles et actions de la page : true quand l'événement lui appartenait.
  function input(t) {
    if (t.matches('[data-role="template-text"]')) { m.templateEdits[t.getAttribute('data-cle')] = t.value; return true; }
    if (t.matches('[data-role="theme-field"]')) { m.themeDraft[t.getAttribute('data-key')] = t.value; return true; }
    if (t.matches('[data-role="theme-color"]')) {
      const k = t.getAttribute('data-key');
      m.themeDraft[k] = t.value.replace('#', '').toUpperCase();
      const champ = t.parentElement && t.parentElement.querySelector('[data-role="theme-field"]');
      if (champ) champ.value = m.themeDraft[k];
      return true;
    }
    return false;
  }
  function change(t) {
    if (t.matches('[data-role="template-file"]')) { const f = t.files && t.files[0]; t.value = ''; if (f) uploadTemplate(f); return true; }
    if (t.matches('[data-role="mise-en-page-file"]')) { const f = t.files && t.files[0]; t.value = ''; if (f) uploadMiseEnPage(f); return true; }
    return false;
  }
  function click(action, btn) {
    switch (action) {
      case 'theme-save': saveTheme(); return true;
      case 'mise-en-page-delete': deleteMiseEnPage(); return true;
      case 'template-toggle': {
        const cle = btn.getAttribute('data-cle');
        m.templateOpenCle = m.templateOpenCle === cle ? null : cle;
        render();
        return true;
      }
      case 'template-save': saveTemplateSection(btn.getAttribute('data-cle')); return true;
      case 'template-clear': clearTemplateSection(btn.getAttribute('data-cle')); return true;
      case 'template-reset': resetTemplate(); return true;
    }
    return false;
  }

  return { m, reset, charger, themeCardHtml, miseEnPageCardHtml, templateCardHtml, input, change, click };
}
