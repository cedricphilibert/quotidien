// Module Repas & courses : planning de la semaine, recettes, liste de courses.
import { S, save, uid } from './store.js';
import { esc, iso, parseISO, addDays, fmtDate, sheet, confirmSheet, toast, empty } from './ui.js';

let root;
let tab = 'semaine';
let weekStart = mondayOf(iso());

const R = () => S().repas;
const rerender = () => render(root);

function mondayOf(s) {
  const d = parseISO(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

// « 200 g de pâtes » → { qty: 200, unit: 'g', name: 'pâtes' }
const UNITS = 'kg|g|mg|cl|ml|l|cs|cc|c\\.à\\.s|c\\.à\\.c|tranches?|boîtes?|sachets?|gousses?|pincées?|bottes?|pots?';
const ING_RE = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})?\\s+(?:de\\s+|d'|d’)?(.+)$`, 'i');
function parseIng(line) {
  const s = line.trim();
  const m = s.match(ING_RE);
  if (!m) return { qty: null, unit: '', name: s };
  return { qty: parseFloat(m[1].replace(',', '.')), unit: (m[2] || '').toLowerCase(), name: m[3].trim() };
}
const fmtQty = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
function fmtIng(i) {
  if (i.qty == null) return i.name;
  return `${fmtQty(i.qty)}${i.unit ? ' ' + i.unit : ''} ${i.name}`;
}

export function render(el) {
  root = el;
  root.onclick = root.onchange = root.onsubmit = null;
  const nCourses = R().courses.filter((c) => !c.checked).length;
  root.innerHTML = `
    <div class="seg" style="margin-bottom:12px">
      <button data-tab="semaine" class="${tab === 'semaine' ? 'on' : ''}">Semaine</button>
      <button data-tab="recettes" class="${tab === 'recettes' ? 'on' : ''}">Recettes</button>
      <button data-tab="courses" class="${tab === 'courses' ? 'on' : ''}">Courses${nCourses ? ` (${nCourses})` : ''}</button>
    </div>
    <div id="sub"></div>`;
  const sub = root.querySelector('#sub');
  if (tab === 'semaine') renderWeek(sub);
  if (tab === 'recettes') renderRecipes(sub);
  if (tab === 'courses') renderCourses(sub);

  const inner = root.onclick;
  root.onclick = (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; rerender(); return; }
    inner?.(e);
  };
}

// ---------- Planning de la semaine ----------
function slotLabel(v) {
  if (!v) return null;
  if (v.r) return R().recipes.find((r) => r.id === v.r)?.name || null;
  return v.t || null;
}

function renderWeek(sub) {
  const today = iso();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const short = { day: 'numeric', month: 'short' };
  sub.innerHTML = `
    <div class="month-nav">
      <button data-a="prev" aria-label="Semaine précédente">‹</button>
      <b>${fmtDate(days[0], short)} – ${fmtDate(days[6], short)}</b>
      <button data-a="next" aria-label="Semaine suivante">›</button>
    </div>
    <div class="stack">
      ${days.map((d) => {
        const w = R().week[d] || {};
        return `
        <div class="card dayplan ${d === today ? 'today' : ''}">
          <div class="dname">${fmtDate(d, { weekday: 'long', day: 'numeric' })}</div>
          <div class="slots">
            ${['midi', 'soir'].map((meal) => {
              const label = slotLabel(w[meal]);
              return `<button class="slot ${label ? '' : 'vide'}" data-a="slot" data-d="${d}" data-m="${meal}">
                <span class="lbl">${meal === 'midi' ? '☀️ Midi' : '🌙 Soir'}</span><span>${label ? esc(label) : '＋ Choisir'}</span></button>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
      <button class="btn primary" data-a="gen">🛒 Générer la liste de courses de la semaine</button>
    </div>`;

  root.onclick = (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'prev') { weekStart = addDays(weekStart, -7); rerender(); }
    if (a === 'next') { weekStart = addDays(weekStart, 7); rerender(); }
    if (a === 'slot') slotSheet(t.dataset.d, t.dataset.m);
    if (a === 'gen') genCourses(days);
  };
}

function slotSheet(date, meal) {
  const r = R();
  const cur = (r.week[date] || {})[meal];
  const set = (v) => {
    r.week[date] ||= {};
    if (v) r.week[date][meal] = v;
    else delete r.week[date][meal];
    save();
    rerender();
  };
  sheet({
    title: `${fmtDate(date, { weekday: 'long', day: 'numeric' })} · ${meal}`,
    body: `
      <div class="stack">
        <input id="q" type="search" placeholder="Rechercher une recette…">
        <div class="list" id="rl">
          ${r.recipes.map((x) => `<button class="li" data-r="${x.id}"><span class="main t">${esc(x.name)}</span>${cur?.r === x.id ? '✓' : ''}</button>`).join('')
            || '<div class="li muted">Aucune recette — ajoute-en dans l\'onglet Recettes.</div>'}
        </div>
        <div class="row"><input id="free" placeholder="Ou texte libre (ex : resto, restes…)" value="${esc(cur?.t || '')}">
          <button class="btn small primary" id="okfree">OK</button></div>
        <div class="row">
          <button class="btn" id="rand">🎲 Au hasard</button>
          ${cur ? '<button class="btn danger" id="clr">Vider</button>' : ''}
        </div>
      </div>`,
    onMount(b, close) {
      b.querySelector('#q').oninput = (e) => {
        const q = e.target.value.toLowerCase();
        b.querySelectorAll('[data-r]').forEach((li) => (li.hidden = !li.textContent.toLowerCase().includes(q)));
      };
      b.querySelector('#rl').onclick = (e) => {
        const li = e.target.closest('[data-r]');
        if (li) { set({ r: li.dataset.r }); close(); }
      };
      b.querySelector('#okfree').onclick = () => {
        const t = b.querySelector('#free').value.trim();
        set(t ? { t } : null);
        close();
      };
      b.querySelector('#rand').onclick = () => {
        if (!r.recipes.length) return;
        set({ r: r.recipes[Math.floor(Math.random() * r.recipes.length)].id });
        close();
      };
      const clr = b.querySelector('#clr');
      if (clr) clr.onclick = () => { set(null); close(); };
    },
  });
}

// Additionne les ingrédients des recettes et les ajoute à la liste
function addIngredients(lines, { auto }) {
  const agg = new Map();
  lines.map(parseIng).forEach((i) => {
    const key = `${i.name.toLowerCase()}|${i.unit}`;
    const prev = agg.get(key);
    if (!prev) agg.set(key, { ...i });
    else if (prev.qty != null && i.qty != null) prev.qty += i.qty;
  });
  const items = [...agg.values()].map((i) => ({ id: uid(), ...i, checked: false, auto }));
  R().courses.push(...items);
  return items.length;
}

function genCourses(days) {
  const r = R();
  const lines = [];
  days.forEach((d) => ['midi', 'soir'].forEach((m) => {
    const id = r.week[d]?.[m]?.r;
    const rec = id && r.recipes.find((x) => x.id === id);
    if (rec) lines.push(...rec.ingredients);
  }));
  if (!lines.length) return toast('Aucune recette planifiée cette semaine');
  // On remplace les articles générés précédemment, on garde ceux ajoutés à la main
  r.courses = r.courses.filter((c) => !c.auto || c.checked);
  const n = addIngredients(lines, { auto: true });
  save();
  tab = 'courses';
  rerender();
  toast(`${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à la liste`);
}

// ---------- Recettes ----------
function renderRecipes(sub) {
  const recipes = R().recipes.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  sub.innerHTML = `
    <div class="stack">
      <button class="btn primary" data-a="new">＋ Nouvelle recette</button>
      ${recipes.length
        ? `<div class="list">${recipes.map((x) => `
            <button class="li" data-a="edit" data-id="${x.id}">
              <span class="emoji">🍽️</span>
              <span class="main"><div class="t">${esc(x.name)}</div>
                <div class="sub t">${x.servings} pers. · ${esc(x.ingredients.map((l) => parseIng(l).name).join(', '))}</div></span>
              <span class="chev">›</span>
            </button>`).join('')}</div>`
        : empty('Aucune recette pour le moment.')}
    </div>`;
  root.onclick = (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'new') recipeSheet();
    if (t.dataset.a === 'edit') recipeSheet(R().recipes.find((x) => x.id === t.dataset.id));
  };
}

function recipeSheet(rec) {
  const isNew = !rec;
  const v = rec || { name: '', servings: 2, ingredients: [], notes: '' };
  sheet({
    title: isNew ? 'Nouvelle recette' : v.name,
    body: `
      <form class="stack">
        <div class="grid2" style="grid-template-columns:1fr 90px">
          <label class="field"><span>Nom</span><input name="name" required value="${esc(v.name)}" placeholder="ex : Curry de pois chiches"></label>
          <label class="field"><span>Portions</span><input name="servings" inputmode="numeric" value="${v.servings}"></label>
        </div>
        <label class="field"><span>Ingrédients (un par ligne : « 200 g pâtes », « 2 œufs »)</span>
          <textarea name="ingredients" placeholder="200 g pâtes&#10;2 œufs&#10;1 oignon">${esc(v.ingredients.join('\n'))}</textarea></label>
        <label class="field"><span>Préparation (facultatif)</span>
          <textarea name="notes" style="min-height:80px">${esc(v.notes)}</textarea></label>
        <button class="btn primary">Enregistrer</button>
        ${isNew ? '' : `
          <button type="button" class="btn" data-x="cart">🛒 Ajouter les ingrédients aux courses</button>
          <button type="button" class="btn danger" data-x="del">Supprimer la recette</button>`}
      </form>`,
    onMount(b, close) {
      const f = b.querySelector('form');
      f.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const data = {
          name: fd.get('name').trim(),
          servings: parseInt(fd.get('servings')) || 1,
          ingredients: fd.get('ingredients').split('\n').map((l) => l.trim()).filter(Boolean),
          notes: fd.get('notes').trim(),
        };
        if (isNew) R().recipes.push({ id: uid(), ...data });
        else Object.assign(rec, data);
        save(); close(); rerender();
      };
      f.onclick = async (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x;
        if (x === 'cart') {
          const n = addIngredients(rec.ingredients, { auto: false });
          save(); close(); rerender();
          toast(`${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} aux courses`);
        }
        if (x === 'del' && (await confirmSheet(`Supprimer « ${rec.name} » ?`))) {
          R().recipes = R().recipes.filter((r) => r.id !== rec.id);
          save(); close(); rerender();
        }
      };
    },
  });
}

// ---------- Liste de courses ----------
function renderCourses(sub) {
  const c = R().courses;
  const todo = c.filter((x) => !x.checked);
  const done = c.filter((x) => x.checked);
  const row = (x) => `
    <label class="check-row ${x.checked ? 'checked' : ''}">
      <input type="checkbox" data-id="${x.id}" ${x.checked ? 'checked' : ''}>
      <span class="t">${esc(fmtIng(x))}</span>
      ${x.auto ? '<span class="tag">menu</span>' : ''}
      <button class="x" data-del="${x.id}" aria-label="Retirer">×</button>
    </label>`;
  sub.innerHTML = `
    <form class="add-row" id="add">
      <input name="item" placeholder="Ajouter (ex : 1 kg pommes)" autocomplete="off">
      <button class="btn primary" aria-label="Ajouter">＋</button>
    </form>
    <div class="stack" style="margin-top:12px">
      ${todo.length ? `<div class="list">${todo.map(row).join('')}</div>`
        : empty(done.length ? 'Tout est dans le panier ✓' : 'Liste vide. Ajoute des articles ou génère-la depuis le menu de la semaine.')}
    </div>
    ${done.length ? `
      <h2 class="section">Dans le panier (${done.length})</h2>
      <div class="stack">
        <div class="list">${done.map(row).join('')}</div>
        <button class="btn" data-a="clear">Retirer les articles cochés</button>
      </div>` : ''}
    ${c.length ? '<div style="margin-top:12px"><button class="btn danger" data-a="all">Vider toute la liste</button></div>' : ''}`;

  const form = sub.querySelector('#add');
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = form.item.value.trim();
    if (!v) return;
    R().courses.push({ id: uid(), ...parseIng(v), checked: false, auto: false });
    save();
    rerender();
    root.querySelector('#add input').focus();
  };
  root.onchange = (e) => {
    const id = e.target.dataset.id;
    const it = id && R().courses.find((x) => x.id === id);
    if (!it) return;
    it.checked = e.target.checked;
    save();
    setTimeout(rerender, 150);
  };
  root.onclick = async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.preventDefault();
      R().courses = R().courses.filter((x) => x.id !== del.dataset.del);
      save(); rerender();
      return;
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'clear') { R().courses = R().courses.filter((x) => !x.checked); save(); rerender(); }
    if (a === 'all' && (await confirmSheet('Vider toute la liste de courses ?', 'Vider'))) {
      R().courses = [];
      save(); rerender();
    }
  };
}
