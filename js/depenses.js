// Module Dépenses : saisie, budget mensuel, répartition par catégorie.
import { S, save, uid } from './store.js';
import { esc, num, eur, iso, parseISO, fmtDate, sheet, confirmSheet, toast, empty } from './ui.js';

const CATS_OUT = [
  ['courses', 'Courses', '🛒'], ['logement', 'Logement', '🏠'], ['transport', 'Transport', '🚗'],
  ['resto', 'Restaurants', '🍽️'], ['loisirs', 'Loisirs', '🎉'], ['sante', 'Santé', '💊'],
  ['shopping', 'Shopping', '🛍️'], ['abos', 'Abonnements', '📱'], ['sport', 'Sport', '🏋️'], ['autre', 'Autre', '📦'],
];
const CATS_IN = [['salaire', 'Salaire', '💼'], ['remb', 'Remboursement', '↩️'], ['autre_in', 'Autre revenu', '💰']];
const cat = (id) => [...CATS_OUT, ...CATS_IN].find((c) => c[0] === id) || ['autre', 'Autre', '📦'];

let root;
let month = iso().slice(0, 7);

const D = () => S().depenses;
const rerender = () => render(root);

function shiftMonth(n) {
  const d = parseISO(month + '-01');
  d.setMonth(d.getMonth() + n);
  month = iso(d).slice(0, 7);
}

export function render(el) {
  root = el;
  const d = D();
  const items = d.items.filter((x) => x.date.startsWith(month));
  const out = items.filter((x) => x.type === 'out').reduce((t, x) => t + x.amount, 0);
  const inc = items.filter((x) => x.type === 'in').reduce((t, x) => t + x.amount, 0);
  const solde = inc - out;

  // Répartition par catégorie
  const byCat = {};
  items.filter((x) => x.type === 'out').forEach((x) => (byCat[x.cat] = (byCat[x.cat] || 0) + x.amount));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;

  // Budget
  const isCurrent = month === iso().slice(0, 7);
  const daysInMonth = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  const daysLeft = isCurrent ? daysInMonth - new Date().getDate() + 1 : 0;
  const pct = d.budget ? Math.min(100, (out / d.budget) * 100) : 0;

  // Opérations groupées par jour
  const byDay = {};
  items.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)
    .forEach((x) => (byDay[x.date] ||= []).push(x));

  root.innerHTML = `
    <div class="month-nav">
      <button data-a="prev" aria-label="Mois précédent">‹</button>
      <b>${parseISO(month + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b>
      <button data-a="next" aria-label="Mois suivant">›</button>
    </div>
    <div class="stack">
      <div class="card grid3 summary">
        <div><span class="sub">Dépenses</span><b>${eur(out)}</b></div>
        <div><span class="sub">Revenus</span><b class="pos">${eur(inc)}</b></div>
        <div><span class="sub">Solde</span><b class="${solde < 0 ? 'neg' : ''}">${eur(solde)}</b></div>
      </div>
      ${d.budget
        ? `<button class="card" data-a="budget" style="display:block">
            <div class="row between"><span class="title">Budget du mois</span><span class="sub">${eur(out)} / ${eur(d.budget)}</span></div>
            <div class="bar" style="margin:10px 0 6px"><i class="${out > d.budget ? 'over' : ''}" style="width:${pct}%"></i></div>
            <div class="sub">${out > d.budget
              ? `Dépassé de ${eur(out - d.budget)}`
              : `Reste ${eur(d.budget - out)}${daysLeft ? ` · environ ${eur((d.budget - out) / daysLeft)} / jour` : ''}`}</div>
          </button>`
        : `<button class="btn" data-a="budget">🎯 Définir un budget mensuel</button>`}
    </div>

    ${cats.length ? `
      <h2 class="section">Par catégorie</h2>
      <div class="list">${cats.map(([c, v]) => `
        <div class="li">
          <span class="emoji">${cat(c)[2]}</span>
          <span class="main">
            <div class="row between"><span>${cat(c)[1]}</span><span class="amount">${eur(v)}</span></div>
            <div class="bar" style="margin-top:6px"><i style="width:${(v / maxCat) * 100}%"></i></div>
          </span>
        </div>`).join('')}</div>` : ''}

    <h2 class="section">Opérations</h2>
    ${items.length
      ? Object.entries(byDay).map(([day, xs]) => `
          <div class="day-label">${fmtDate(day)}</div>
          <div class="list">${xs.map((x) => `
            <button class="li" data-a="edit" data-id="${x.id}">
              <span class="emoji">${cat(x.cat)[2]}</span>
              <span class="main"><div class="t">${esc(x.note || cat(x.cat)[1])}</div>
                ${x.note ? `<div class="sub">${cat(x.cat)[1]}</div>` : ''}</span>
              <span class="amount ${x.type === 'in' ? 'pos' : ''}">${x.type === 'in' ? '+' : '−'}${eur(x.amount)}</span>
            </button>`).join('')}</div>`).join('')
      : empty('Aucune opération ce mois-ci. Touche ＋ pour en ajouter une.')}

    <button class="fab" data-a="add" aria-label="Ajouter">＋</button>`;

  root.onclick = (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'prev') { shiftMonth(-1); rerender(); }
    if (a === 'next') { shiftMonth(1); rerender(); }
    if (a === 'add') itemSheet();
    if (a === 'edit') itemSheet(D().items.find((x) => x.id === t.dataset.id));
    if (a === 'budget') budgetSheet();
  };
}

function itemSheet(item) {
  const isNew = !item;
  const v = item ? { ...item } : { type: 'out', amount: '', cat: 'courses', date: month === iso().slice(0, 7) ? iso() : month + '-01', note: '' };
  sheet({
    title: isNew ? 'Nouvelle opération' : 'Modifier',
    body: `
      <form class="stack">
        <div class="seg">
          <button type="button" data-type="out" class="${v.type === 'out' ? 'on' : ''}">Dépense</button>
          <button type="button" data-type="in" class="${v.type === 'in' ? 'on' : ''}">Revenu</button>
        </div>
        <input class="big-amount" name="amount" inputmode="decimal" placeholder="0,00 €" value="${v.amount ? String(v.amount).replace('.', ',') : ''}" required>
        <div class="chips" id="chips"></div>
        <div class="grid2">
          <label class="field"><span>Date</span><input type="date" name="date" value="${v.date}"></label>
          <label class="field"><span>Note</span><input name="note" value="${esc(v.note)}" placeholder="ex : Carrefour"></label>
        </div>
        <button class="btn primary">Enregistrer</button>
        ${isNew ? '' : '<button type="button" class="btn danger" data-del>Supprimer</button>'}
      </form>`,
    onMount(b, close) {
      const f = b.querySelector('form');
      const chips = b.querySelector('#chips');
      const drawChips = () => {
        const list = v.type === 'out' ? CATS_OUT : CATS_IN;
        if (!list.some((c) => c[0] === v.cat)) v.cat = list[0][0];
        chips.innerHTML = list.map((c) => `
          <button type="button" class="chip ${c[0] === v.cat ? 'on' : ''}" data-cat="${c[0]}"><span>${c[2]}</span><span>${c[1]}</span></button>`).join('');
      };
      drawChips();
      if (isNew) setTimeout(() => f.amount.focus(), 300);

      b.querySelectorAll('[data-type]').forEach((btn) => (btn.onclick = () => {
        v.type = btn.dataset.type;
        b.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x === btn));
        drawChips();
      }));
      chips.onclick = (e) => {
        const c = e.target.closest('[data-cat]');
        if (c) { v.cat = c.dataset.cat; drawChips(); }
      };
      f.onsubmit = (e) => {
        e.preventDefault();
        const amount = Math.abs(num(f.amount.value));
        if (!amount) return toast('Indique un montant');
        const data = { type: v.type, amount: Math.round(amount * 100) / 100, cat: v.cat, date: f.date.value || iso(), note: f.note.value.trim() };
        if (isNew) D().items.push({ id: uid(), created: Date.now(), ...data });
        else Object.assign(item, data);
        month = data.date.slice(0, 7);
        save(); close(); rerender();
      };
      const del = b.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        if (!(await confirmSheet('Supprimer cette opération ?'))) return;
        D().items = D().items.filter((x) => x.id !== item.id);
        save(); close(); rerender();
      };
    },
  });
}

function budgetSheet() {
  sheet({
    title: 'Budget mensuel',
    body: `
      <form class="stack">
        <p class="sub" style="margin:0">Montant maximum de dépenses que tu veux t'autoriser chaque mois.</p>
        <input class="big-amount" name="budget" inputmode="decimal" placeholder="0 €" value="${D().budget || ''}">
        <button class="btn primary">Enregistrer</button>
        ${D().budget ? '<button type="button" class="btn danger" data-del>Retirer le budget</button>' : ''}
      </form>`,
    onMount(b, close) {
      const f = b.querySelector('form');
      f.onsubmit = (e) => {
        e.preventDefault();
        D().budget = Math.abs(num(f.budget.value));
        save(); close(); rerender();
      };
      const del = b.querySelector('[data-del]');
      if (del) del.onclick = () => { D().budget = 0; save(); close(); rerender(); };
    },
  });
}
