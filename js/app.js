import { S, replaceData, resetData } from './store.js';
import { sheet, toast, confirmSheet, iso } from './ui.js';
import * as muscu from './muscu.js';
import * as depenses from './depenses.js';
import * as repas from './repas.js';

const MODULES = [
  { id: 'muscu', title: 'Musculation', label: 'Muscu', icon: '🏋️', mod: muscu },
  { id: 'depenses', title: 'Dépenses', label: 'Dépenses', icon: '💶', mod: depenses },
  { id: 'repas', title: 'Repas & courses', label: 'Repas', icon: '🥗', mod: repas },
];

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');

let current = 'muscu';
try {
  current = localStorage.getItem('quotidien:tab') || 'muscu';
} catch {}

tabs.innerHTML = MODULES.map(
  (m) => `<button data-tab="${m.id}"><span class="ico">${m.icon}</span>${m.label}</button>`
).join('');
tabs.onclick = (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) show(b.dataset.tab);
};

function show(id) {
  const m = MODULES.find((x) => x.id === id) || MODULES[0];
  current = m.id;
  try {
    localStorage.setItem('quotidien:tab', current);
  } catch {}
  document.getElementById('title').textContent = m.title;
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === current));
  view.onclick = view.onchange = view.oninput = view.onsubmit = null;
  m.mod.render(view);
  window.scrollTo(0, 0);
}

// ---------- Réglages : sauvegarde / restauration ----------
document.getElementById('settings').onclick = () => {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  sheet({
    title: 'Réglages',
    body: `
      <div class="stack">
        ${standalone ? '' : `<div class="card"><div class="title">📲 Installer sur l'iPhone</div>
          <div class="sub">Dans Safari, touche le bouton Partager <b>⬆︎</b> puis « Sur l'écran d'accueil ».</div></div>`}
        <div class="card"><div class="title">Sauvegarde</div>
          <div class="sub">Tes données restent sur ce téléphone. Exporte-les de temps en temps pour ne rien perdre.</div></div>
        <button class="btn" data-x="export">⬇︎ Exporter mes données</button>
        <button class="btn" data-x="import">⬆︎ Importer une sauvegarde</button>
        <input type="file" accept="application/json,.json" hidden id="importFile">
        <button class="btn danger" data-x="reset">Tout effacer</button>
      </div>`,
    onMount(b, close) {
      const file = b.querySelector('#importFile');
      b.onclick = async (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'export') exportData();
        if (x === 'import') file.click();
        if (x === 'reset' && (await confirmSheet('Effacer toutes les données (plans, dépenses, recettes) ?', 'Tout effacer'))) {
          resetData();
          close();
          show(current);
          toast('Données effacées');
        }
      };
      file.onchange = async () => {
        try {
          const d = JSON.parse(await file.files[0].text());
          if (!d.muscu && !d.depenses && !d.repas) throw new Error('format');
          replaceData(d);
          close();
          show(current);
          toast('Sauvegarde importée ✓');
        } catch {
          toast('Fichier invalide');
        }
      };
    },
  });
};

async function exportData() {
  const json = JSON.stringify(S(), null, 2);
  const name = `quotidien-${iso()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Quotidien' });
    } catch {}
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Demande au navigateur de ne pas effacer les données
navigator.storage?.persist?.();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

show(current);
