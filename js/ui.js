// Petits outils d'interface partagés par les trois modules.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export const eur = (n) => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// Dates au format AAAA-MM-JJ, en heure locale
export function iso(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}
export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function fmtDate(s, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return parseISO(s).toLocaleDateString('fr-FR', opts);
}

// Feuille modale qui monte du bas de l'écran
export function sheet({ title, body, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheet-head"><button class="link" data-close>Fermer</button><h3>${esc(title)}</h3><span></span></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 280);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  onMount?.(wrap.querySelector('.sheet-body'), close);
  return close;
}

export function confirmSheet(message, okLabel = 'Supprimer') {
  return new Promise((resolve) => {
    let answered = false;
    sheet({
      title: 'Confirmer',
      body: `<p style="margin-top:0">${esc(message)}</p>
        <div class="stack">
          <button class="btn primary" data-ok style="background:var(--danger)">${esc(okLabel)}</button>
          <button class="btn" data-close>Annuler</button>
        </div>`,
      onMount(b, close) {
        b.querySelector('[data-ok]').onclick = () => {
          answered = true;
          resolve(true);
          close();
        };
      },
      onClose: () => !answered && resolve(false),
    });
  });
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;
