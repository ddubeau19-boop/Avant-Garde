// ============================================================
// Bibliothèque de composantes — page partagée par l'administration
// (super admin) et la console bureau (ingénieurs et administrateurs de
// la firme). La liste de départ des visites et les tâches du carnet
// d'entretien rattachées à chaque composante ; un administrateur peut
// importer la liste de sa firme depuis un classeur Excel.
// ============================================================

// Recherche sans accents ni casse, dans le nom, le code et le texte des tâches.
function cleRecherche(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// opts : { apiJson, apiRaw, render, escapeHtml, fmtDate, spinnerBlock, companyId: () => id }
export function creerBibliotheque(opts) {
  const { apiJson, apiRaw, render, escapeHtml, fmtDate, spinnerBlock } = opts;
  const s = {
    biblio: null,       // { source, filename, composantes:[…], stats, peutModifier, … }
    error: null,
    note: null,
    erreurs: [],        // lignes refusées au dernier import
    uploading: false,
    downloading: false,
    cat: '',
    recherche: '',
    ouvertes: {},       // nom de composante -> tâches dépliées
  };
  const url = (suffixe) => `/api/companies/${opts.companyId()}/bibliotheque${suffixe || ''}`;

  function reset() {
    Object.assign(s, { biblio: null, error: null, note: null, erreurs: [], uploading: false, downloading: false, cat: '', recherche: '', ouvertes: {} });
  }

  async function charger() {
    try {
      s.biblio = await apiJson(url());
      s.error = null;
    } catch (e) {
      s.error = e.message || 'Impossible de charger la bibliothèque.';
    }
    render();
  }

  async function importer(file) {
    if (!file || s.uploading) return;
    s.uploading = true;
    s.error = null;
    s.note = null;
    s.erreurs = [];
    render();
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiRaw(url(), { method: 'POST', body: fd });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (res.ok) {
        s.biblio = data;
        s.ouvertes = {};
        s.note = `Liste importée : ${data.stats.composantes} composantes et ${data.stats.taches} tâches. Elle sert de départ aux nouvelles visites de l'entreprise.`;
      } else {
        s.error = (data && data.error) || `Erreur ${res.status}`;
        s.erreurs = (data && data.erreurs) || [];
      }
    } catch (e) {
      s.error = e.message || "L'import a échoué.";
    }
    s.uploading = false;
    render();
  }

  async function revenirAuDefaut() {
    if (!confirm("Revenir à la liste Condo Stratégis ? La liste importée par l'entreprise sera retirée. Les dossiers existants ne changent pas.")) return;
    try {
      s.biblio = await apiJson(url(), { method: 'DELETE' });
      s.ouvertes = {};
      s.erreurs = [];
      s.error = null;
      s.note = 'Les nouvelles visites repartent de la liste Condo Stratégis.';
    } catch (e) {
      s.error = e.message || "L'opération a échoué.";
    }
    render();
  }

  async function telecharger() {
    if (s.downloading) return;
    s.downloading = true;
    render();
    try {
      const res = await apiRaw(url('.xlsx'));
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const nom = ((res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'bibliotheque.xlsx';
      const lien = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = lien;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(lien), 2000);
    } catch (e) {
      s.error = e.message || 'Le téléchargement a échoué.';
    }
    s.downloading = false;
    render();
  }

  function visible(c) {
    if (s.cat && c.cat !== s.cat) return false;
    const q = cleRecherche(s.recherche).trim();
    if (!q) return true;
    const texte = cleRecherche([c.name, c.code, c.condition].concat(c.taches.map(t => t.texte + ' ' + t.element)).join(' '));
    return q.split(/\s+/).every(mot => texte.includes(mot));
  }

  function compteTexte(n, total) {
    return n === total ? `${n} composantes` : `${n} sur ${total} composantes`;
  }

  // Filtre appliqué au DOM pendant la frappe : un render() ferait perdre le
  // curseur du champ de recherche.
  function filtrerDom() {
    const b = s.biblio;
    if (!b) return;
    document.querySelectorAll('[data-bib-idx]').forEach(el => {
      el.hidden = !visible(b.composantes[Number(el.getAttribute('data-bib-idx'))]);
    });
    document.querySelectorAll('[data-bib-cat]').forEach(g => {
      g.hidden = !g.querySelector('[data-bib-idx]:not([hidden])');
    });
    const n = b.composantes.filter(visible).length;
    const compte = document.querySelector('[data-role="bib-compte"]');
    if (compte) compte.textContent = compteTexte(n, b.composantes.length);
    const vide = document.querySelector('[data-role="bib-vide"]');
    if (vide) vide.hidden = n > 0;
  }

  function sourceHtml(b) {
    return b.source === 'firme'
      ? `<span class="bib-badge bib-badge-firme">Liste de l'entreprise</span> <span>importée de <code>${escapeHtml(b.filename || '')}</code> le ${fmtDate(b.imported_at)}${b.tachesPropres ? '' : ' · tâches du carnet Condo Stratégis'}</span>`
      : `<span class="bib-badge">Liste Condo Stratégis</span> <span>utilisée par défaut</span>`;
  }

  // Résumé d'une ligne, pour une carte qui mène à la page.
  function resumeHtml() {
    const b = s.biblio;
    if (!b) return s.error ? `<div class="login-error">${escapeHtml(s.error)}</div>` : spinnerBlock('Chargement…');
    return `<div class="bib-resume">${sourceHtml(b)}<span class="bib-chiffres">${b.stats.composantes} composantes · ${b.stats.taches} tâches</span></div>`;
  }

  function html({ retour = '', eyebrow = '' } = {}) {
    const b = s.biblio;
    const cats = (b && b.categories) || [];
    const modifiable = !!(b && b.peutModifier);
    const visibles = b ? b.composantes.filter(visible).length : 0;
    return `
    <div class="bib-page">
      ${retour}
      <div class="bib-head">
        <div>
          ${eyebrow ? `<div class="eyebrow-orange">${escapeHtml(eyebrow)}</div>` : ''}
          <h1 class="page-title">Bibliothèque</h1>
          <p class="bib-lead">Les composantes créées à chaque nouvelle visite et les tâches du carnet d'entretien rattachées à chacune. L'IA désactive ensuite celles qui ne conviennent pas à l'immeuble, et l'inspecteur peut les réactiver.</p>
        </div>
        <div class="bib-actions">
          <button class="btn-secondary" data-action="bib-download" ${s.downloading || !b ? 'disabled' : ''}><i data-lucide="${s.downloading ? 'loader-2' : 'download'}"></i>${s.downloading ? 'Préparation…' : 'Télécharger la liste (.xlsx)'}</button>
          ${modifiable ? `<label class="btn-primary ${s.uploading ? 'bib-inactif' : ''}"><i data-lucide="${s.uploading ? 'loader-2' : 'upload'}"></i>${s.uploading ? 'Vérification…' : 'Importer une liste (.xlsx)'}<input type="file" accept=".xlsx" data-role="bib-file" hidden ${s.uploading ? 'disabled' : ''}></label>` : ''}
        </div>
      </div>

      <div class="bib-aide">
        <i data-lucide="info"></i>
        <div>${modifiable
          ? `Pour importer la liste de l'entreprise : téléchargez la liste actuelle, modifiez les onglets <strong>Composantes</strong> et <strong>Tâches</strong> dans Excel (l'onglet <strong>Lisez-moi</strong> explique chaque colonne), puis importez le fichier. L'onglet Tâches est facultatif. La nouvelle liste s'applique aux nouvelles visites; les dossiers existants ne changent pas.`
          : `Seul un administrateur de la firme peut importer une liste. Vous pouvez télécharger la liste actuelle pour la réviser et la lui transmettre.`}</div>
      </div>

      ${s.error ? `<div class="bib-alerte">${escapeHtml(s.error)}</div>` : ''}
      ${s.erreurs.length ? `
      <div class="bib-erreurs">
        <div class="bib-erreurs-titre">${s.erreurs.length} ligne${s.erreurs.length > 1 ? 's' : ''} à corriger — rien n'a été importé, la liste en vigueur reste en place</div>
        <ul>${s.erreurs.map(e => `<li><span class="bib-mono">${escapeHtml(e.feuille || 'Classeur')}${e.ligne ? `, ligne ${e.ligne}` : ''}</span> — ${escapeHtml(e.message)}</li>`).join('')}</ul>
      </div>` : ''}
      ${s.note ? `<div class="bib-note"><i data-lucide="check"></i><span>${escapeHtml(s.note)}</span></div>` : ''}

      ${!b ? spinnerBlock('Chargement de la bibliothèque…') : `
      <div class="bib-resume" style="margin:18px 0 6px">
        ${sourceHtml(b)}
        ${b.source === 'firme' && modifiable ? `<button class="btn-row-action" data-action="bib-reset">Revenir à la liste Condo Stratégis</button>` : ''}
      </div>
      ${b.avertissements && b.avertissements.length ? `<div class="bib-note bib-note-avert"><i data-lucide="alert-triangle"></i><span>${b.avertissements.map(escapeHtml).join('<br>')}</span></div>` : ''}

      <div class="bib-stats">
        <div><strong>${b.stats.composantes}</strong><span>composantes</span></div>
        <div><strong>${b.stats.taches}</strong><span>tâches du carnet</span></div>
        <div><strong>${b.stats.sansTache}</strong><span>composante${b.stats.sansTache > 1 ? 's' : ''} sans tâche</span></div>
      </div>

      <div class="bib-toolbar">
        <div class="bib-recherche"><i data-lucide="search"></i><input type="search" data-role="bib-search" placeholder="Rechercher une composante ou une tâche…" value="${escapeHtml(s.recherche)}"></div>
        <select class="bib-select" data-role="bib-cat">
          <option value="">Toutes les catégories</option>
          ${cats.map(k => `<option value="${k.cle}" ${s.cat === k.cle ? 'selected' : ''}>${escapeHtml(k.label)}</option>`).join('')}
        </select>
        <span class="bib-mono" data-role="bib-compte">${compteTexte(visibles, b.composantes.length)}</span>
      </div>

      ${cats.map(k => {
        const items = b.composantes.map((comp, i) => [comp, i]).filter(([comp]) => comp.cat === k.cle);
        if (!items.length) return '';
        return `
        <div class="bib-groupe" data-bib-cat="${k.cle}" ${items.some(([comp]) => visible(comp)) ? '' : 'hidden'}>
          <div class="bib-cat-head"><span>${escapeHtml(k.label)}</span><div class="bib-rule"></div><span class="bib-mono">${items.length}</span></div>
          <div class="bib-table">
            ${items.map(([comp, i]) => {
              const ouvert = !!s.ouvertes[comp.name];
              const infos = [comp.code, comp.type, comp.unite, comp.vu ? `${comp.vu} ans` : 'durée de vie non indiquée'].filter(Boolean).map(escapeHtml).join(' · ');
              return `
              <div class="bib-comp" data-bib-idx="${i}" ${visible(comp) ? '' : 'hidden'}>
                <div class="bib-row">
                  <div>
                    <div class="bib-nom">${escapeHtml(comp.name)}</div>
                    <div class="bib-mono">${infos}</div>
                  </div>
                  <div>${comp.condition ? `<span class="bib-badge bib-badge-condition" title="S'active ou se désactive selon la fiche d'immeuble">Si : ${escapeHtml(comp.condition)}</span>` : ''}</div>
                  <div><button class="btn-row-action" data-action="bib-toggle" data-idx="${i}" ${comp.taches.length ? '' : 'disabled'}>${comp.taches.length ? `${comp.taches.length} tâche${comp.taches.length > 1 ? 's' : ''}` : 'Aucune tâche'}<i data-lucide="${ouvert ? 'chevron-up' : 'chevron-down'}" class="bib-chevron"></i></button></div>
                </div>
                ${ouvert ? `
                <div class="bib-taches">
                  <div class="bib-tache bib-tache-head"><div>Tâche</div><div>Rythme</div><div>Quand</div><div>Responsable</div></div>
                  ${comp.taches.map(t => `
                  <div class="bib-tache">
                    <div>${escapeHtml(t.texte)}${t.element && t.element !== comp.name ? `<div class="bib-mono">${escapeHtml(t.element)}</div>` : ''}</div>
                    <div>${escapeHtml(t.frequence)}</div>
                    <div>${escapeHtml(t.quand)}</div>
                    <div>${escapeHtml(t.responsable)}</div>
                  </div>`).join('')}
                </div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
      <div class="bib-vide" data-role="bib-vide" ${visibles === 0 ? '' : 'hidden'}>Aucune composante ne correspond à la recherche.</div>`}
    </div>`;
  }

  // Délégation d'événements : chaque méthode rend true si elle a traité l'événement.
  function click(action, btn) {
    if (action === 'bib-download') { telecharger(); return true; }
    if (action === 'bib-reset') { revenirAuDefaut(); return true; }
    if (action === 'bib-toggle') {
      const comp = s.biblio && s.biblio.composantes[Number(btn.getAttribute('data-idx'))];
      if (comp) {
        s.ouvertes[comp.name] = !s.ouvertes[comp.name];
        render();
      }
      return true;
    }
    return false;
  }
  function input(t) {
    if (!t.matches('[data-role="bib-search"]')) return false;
    s.recherche = t.value;
    filtrerDom();
    return true;
  }
  function change(t) {
    if (t.matches('[data-role="bib-file"]')) {
      const f = t.files && t.files[0];
      t.value = '';
      if (f) importer(f);
      return true;
    }
    if (t.matches('[data-role="bib-cat"]')) {
      s.cat = t.value;
      render();
      return true;
    }
    return false;
  }

  return { s, reset, charger, html, resumeHtml, click, input, change };
}
