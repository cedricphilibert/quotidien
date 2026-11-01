// Module Musculation : génération de plans, édition, séances guidées, historique.
import { S, save, uid } from './store.js';
import { esc, num, iso, fmtDate, sheet, confirmSheet, toast, empty } from './ui.js';

// [nom, groupe musculaire, faisable à la maison]
const EX = [
  ['Squat barre', 'jambes', 0], ['Presse à cuisses', 'jambes', 0], ['Fentes haltères', 'jambes', 1],
  ['Soulevé de terre roumain', 'jambes', 1], ['Leg curl', 'jambes', 0], ['Squat goblet', 'jambes', 1],
  ['Hip thrust', 'jambes', 1], ['Mollets debout', 'jambes', 1],
  ['Développé couché', 'pecs', 0], ['Développé incliné haltères', 'pecs', 1], ['Pompes', 'pecs', 1],
  ['Écarté poulie', 'pecs', 0], ['Dips', 'pecs', 1], ['Pompes déclinées', 'pecs', 1],
  ['Tractions', 'dos', 1], ['Rowing barre', 'dos', 0], ['Tirage vertical', 'dos', 0],
  ['Rowing haltère', 'dos', 1], ['Tirage horizontal', 'dos', 0], ['Superman', 'dos', 1],
  ['Développé militaire', 'epaules', 0], ['Élévations latérales', 'epaules', 1], ['Face pull', 'epaules', 0],
  ['Développé haltères assis', 'epaules', 1], ['Oiseau haltères', 'epaules', 1],
  ['Curl barre', 'biceps', 0], ['Curl haltères', 'biceps', 1], ['Curl marteau', 'biceps', 1],
  ['Extension triceps poulie', 'triceps', 0], ['Barre au front', 'triceps', 0],
  ['Extension haltère nuque', 'triceps', 1], ['Pompes diamant', 'triceps', 1],
  ['Gainage', 'abdos', 1], ['Crunch', 'abdos', 1], ['Relevé de jambes', 'abdos', 1],
];

const GOALS = {
  hyper: { label: 'Prise de muscle', sets: 4, reps: '8-12', rest: 90 },
  force: { label: 'Force', sets: 5, reps: '5', rest: 180 },
  endu: { label: 'Endurance / sèche', sets: 3, reps: '15', rest: 60 },
};

const FB = [
  ['Full body A', ['jambes', 'pecs', 'dos', 'epaules', 'biceps', 'abdos']],
  ['Full body B', ['jambes', 'dos', 'pecs', 'epaules', 'triceps', 'abdos']],
  ['Full body C', ['jambes', 'pecs', 'dos', 'jambes', 'epaules', 'abdos']],
];
const PUSH = ['pecs', 'pecs', 'epaules', 'epaules', 'triceps', 'triceps'];
const PULL = ['dos', 'dos', 'dos', 'epaules', 'biceps', 'biceps'];
const LEGS = ['jambes', 'jambes', 'jambes', 'jambes', 'jambes', 'abdos'];
const UPPER = ['pecs', 'dos', 'epaules', 'pecs', 'dos', 'biceps', 'triceps'];
const LOWER = ['jambes', 'jambes', 'jambes', 'jambes', 'abdos'];

function splitFor(n) {
  if (n <= 3) return FB.slice(0, n);
  if (n === 4) return [['Haut A', UPPER], ['Bas A', LOWER], ['Haut B', UPPER], ['Bas B', LOWER]];
  if (n === 5) return [['Push', PUSH], ['Pull', PULL], ['Legs', LEGS], ['Haut', UPPER], ['Bas', LOWER]];
  return [['Push A', PUSH], ['Pull A', PULL], ['Legs A', LEGS], ['Push B', PUSH], ['Pull B', PULL], ['Legs B', LEGS]];
}

function generate({ name, goal, days, level, place }) {
  const g = GOALS[goal];
  const counters = {}; // fait tourner les exercices d'une séance à l'autre
  const pool = (grp) => EX.filter((e) => e[1] === grp && (place === 'salle' || e[2])).map((e) => e[0]);
  return {
    id: uid(),
    name,
    goal,
    created: iso(),
    days: splitFor(days).map(([dayName, groups]) => {
      const used = new Set();
      const gs = level === 'deb' ? groups.slice(0, 5) : groups;
      return {
        id: uid(),
        name: dayName,
        exercises: gs.map((grp, k) => {
          const p = pool(grp);
          let c = counters[grp] || 0;
          let pick = p[c % p.length];
          for (let t = 0; t < p.length && used.has(pick); t++) pick = p[++c % p.length];
          counters[grp] = c + 1;
          used.add(pick);
          const abs = grp === 'abdos';
          let sets = g.sets + (level === 'deb' ? -1 : 0) + (level === 'conf' && k < 2 ? 1 : 0);
          return {
            id: uid(),
            name: pick,
            sets: abs ? 3 : Math.max(3, sets),
            reps: pick === 'Gainage' ? '45 s' : abs ? '15' : goal === 'force' && k >= 2 ? '8-10' : g.reps,
            weight: 0,
            rest: abs ? 60 : g.rest,
          };
        }),
      };
    }),
  };
}

// ---------- état de l'écran ----------
let root;
let ui = { view: 'list', planId: null };
let restEnd = 0;
let tick = null;

const M = () => S().muscu;
const rerender = () => render(root);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const targetReps = (r) => (String(r).match(/\d+/g) || ['']).pop();

export function render(el) {
  root = el;
  root.onclick = root.onchange = root.oninput = null;
  const m = M();
  if (m.active) return renderWorkout();
  if (ui.view === 'plan') {
    const plan = m.plans.find((p) => p.id === ui.planId);
    if (plan) return renderPlan(plan);
    ui.view = 'list';
  }
  renderList();
}

// ---------- Liste des plans + historique ----------
function renderList() {
  const m = M();
  const month = iso().slice(0, 7);
  const thisMonth = m.sessions.filter((s) => s.date.startsWith(month));
  const volume = thisMonth.reduce((t, s) => t + sessionVolume(s), 0);
  root.innerHTML = `
    <div class="stack">
      <div class="row">
        <button class="btn primary grow" data-a="gen">✨ Générer un plan</button>
        <button class="btn grow" data-a="new">＋ Plan vide</button>
      </div>
      <div class="card grid3">
        <div class="stat"><b>${thisMonth.length}</b><span class="sub">séances ce mois</span></div>
        <div class="stat"><b>${volume >= 1000 ? `${(volume / 1000).toFixed(1).replace('.', ',')} t` : `${Math.round(volume)} kg`}</b><span class="sub">soulevées</span></div>
        <div class="stat"><b>${m.sessions.length}</b><span class="sub">au total</span></div>
      </div>
    </div>
    <h2 class="section">Mes plans</h2>
    <div class="stack">
      ${m.plans.length
        ? m.plans.map((p) => `
          <button class="card" data-a="open" data-id="${p.id}">
            <div><div class="title">${esc(p.name)}</div>
            <div class="sub">${p.days.length} séance${p.days.length > 1 ? 's' : ''} · ${GOALS[p.goal]?.label || 'Personnalisé'}</div></div>
            <span class="chev">›</span>
          </button>`).join('')
        : empty("Aucun plan pour l'instant. Génère-en un en quelques secondes ✨")}
    </div>
    <h2 class="section">Historique</h2>
    ${m.sessions.length
      ? `<div class="list">${m.sessions.slice().reverse().slice(0, 30).map((s) => `
          <button class="li" data-a="session" data-id="${s.id}">
            <span class="emoji">💪</span>
            <span class="main"><div class="t">${esc(s.dayName)}</div>
            <div class="sub">${fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(s.planName)} · ${s.duration} min</div></span>
            <span class="sub">${Math.round(sessionVolume(s))} kg</span>
          </button>`).join('')}</div>`
      : empty('Tes séances terminées apparaîtront ici.')}
  `;
  root.onclick = (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'gen') genSheet();
    if (a === 'new') {
      const p = { id: uid(), name: 'Mon plan', goal: 'custom', created: iso(), days: [{ id: uid(), name: 'Séance 1', exercises: [] }] };
      M().plans.push(p);
      save();
      openPlan(p.id);
    }
    if (a === 'open') openPlan(t.dataset.id);
    if (a === 'session') sessionSheet(M().sessions.find((s) => s.id === t.dataset.id));
  };
}

function openPlan(id) {
  ui = { view: 'plan', planId: id };
  rerender();
  window.scrollTo(0, 0);
}

const sessionVolume = (s) => s.exercises.reduce((t, e) => t + e.sets.reduce((u, x) => u + x.weight * x.reps, 0), 0);

function genSheet() {
  sheet({
    title: 'Générer un plan',
    body: `
      <form class="stack">
        <label class="field"><span>Nom du plan</span><input name="name" value="Mon programme"></label>
        <label class="field"><span>Objectif</span><select name="goal">
          ${Object.entries(GOALS).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('')}
        </select></label>
        <div class="grid2">
          <label class="field"><span>Séances / semaine</span><select name="days">
            ${[2, 3, 4, 5, 6].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}
          </select></label>
          <label class="field"><span>Niveau</span><select name="level">
            <option value="deb">Débutant</option><option value="inter" selected>Intermédiaire</option><option value="conf">Confirmé</option>
          </select></label>
        </div>
        <label class="field"><span>Lieu</span><select name="place">
          <option value="salle">Salle de sport</option><option value="maison">Maison (haltères / poids du corps)</option>
        </select></label>
        <p class="sub">2–3 séances → Full body · 4 → Haut/Bas · 5–6 → Push/Pull/Legs. Tu pourras tout modifier ensuite.</p>
        <button class="btn primary">Créer le plan</button>
      </form>`,
    onMount(b, close) {
      const f = b.querySelector('form');
      f.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        const plan = generate({
          name: fd.get('name').trim() || 'Mon programme',
          goal: fd.get('goal'),
          days: Number(fd.get('days')),
          level: fd.get('level'),
          place: fd.get('place'),
        });
        M().plans.push(plan);
        save();
        close();
        openPlan(plan.id);
        toast('Plan créé ✓ Indique tes charges en touchant un exercice');
      };
    },
  });
}

function sessionSheet(s) {
  if (!s) return;
  sheet({
    title: s.dayName,
    body: `
      <p class="sub" style="margin-top:0">${fmtDate(s.date)} · ${esc(s.planName)} · ${s.duration} min</p>
      <div class="stack">
        ${s.exercises.map((e) => `<div class="card"><div class="title">${esc(e.name)}</div>
          <div class="sub">${e.sets.map((x) => `${x.weight} kg × ${x.reps}`).join(' · ')}</div></div>`).join('')}
        <button class="btn danger" data-del>Supprimer cette séance</button>
      </div>`,
    onMount(b, close) {
      b.querySelector('[data-del]').onclick = async () => {
        if (!(await confirmSheet('Supprimer cette séance de l\'historique ?'))) return;
        M().sessions = M().sessions.filter((x) => x.id !== s.id);
        save();
        close();
        rerender();
      };
    },
  });
}

// ---------- Détail d'un plan ----------
function renderPlan(plan) {
  root.innerHTML = `
    <button class="back" data-a="back">‹ Plans</button>
    <div class="stack">
      <div class="card">
        <input class="name-input" data-f="plan" value="${esc(plan.name)}" aria-label="Nom du plan">
        <div class="sub">${GOALS[plan.goal]?.label || 'Personnalisé'} · touche un exercice pour le modifier</div>
      </div>
      ${plan.days.map((d) => `
        <div class="card">
          <div class="row">
            <input class="day-input grow" data-f="day" data-day="${d.id}" value="${esc(d.name)}" aria-label="Nom de la séance">
            <button class="btn small primary" data-a="start" data-day="${d.id}">▶ Démarrer</button>
          </div>
          <div style="margin-top:6px">
            ${d.exercises.map((x) => `
              <button class="ex-row" data-a="ex" data-day="${d.id}" data-ex="${x.id}">
                <span>${esc(x.name)}</span>
                <span class="sub right">${x.sets} × ${esc(x.reps)}${x.weight ? ` · ${x.weight} kg` : ''}</span>
              </button>`).join('')}
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn small" data-a="addEx" data-day="${d.id}">＋ Exercice</button>
            <span class="grow"></span>
            <button class="btn small" style="color:var(--danger)" data-a="delDay" data-day="${d.id}">Supprimer</button>
          </div>
        </div>`).join('')}
      <button class="btn" data-a="addDay">＋ Ajouter une séance</button>
      <button class="btn danger" data-a="delPlan">Supprimer le plan</button>
    </div>`;

  const day = (id) => plan.days.find((d) => d.id === id);
  root.onchange = (e) => {
    const t = e.target;
    if (t.dataset.f === 'plan') plan.name = t.value.trim() || 'Mon plan';
    if (t.dataset.f === 'day') day(t.dataset.day).name = t.value.trim() || 'Séance';
    save();
  };
  root.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'back') { ui = { view: 'list' }; rerender(); }
    if (a === 'ex') { const d = day(t.dataset.day); exSheet(d, d.exercises.find((x) => x.id === t.dataset.ex)); }
    if (a === 'addEx') exSheet(day(t.dataset.day));
    if (a === 'addDay') {
      plan.days.push({ id: uid(), name: `Séance ${plan.days.length + 1}`, exercises: [] });
      save(); rerender();
    }
    if (a === 'delDay' && (await confirmSheet(`Supprimer « ${day(t.dataset.day).name} » ?`))) {
      plan.days = plan.days.filter((d) => d.id !== t.dataset.day);
      save(); rerender();
    }
    if (a === 'delPlan' && (await confirmSheet(`Supprimer le plan « ${plan.name} » ?`))) {
      M().plans = M().plans.filter((p) => p.id !== plan.id);
      ui = { view: 'list' };
      save(); rerender();
    }
    if (a === 'start') startWorkout(plan, day(t.dataset.day));
  };
}

function exSheet(day, ex) {
  const isNew = !ex;
  const v = ex || { name: '', sets: 3, reps: '10', weight: 0, rest: 90 };
  sheet({
    title: isNew ? 'Nouvel exercice' : 'Modifier l\'exercice',
    body: `
      <form class="stack">
        <label class="field"><span>Exercice</span>
          <input name="name" list="exlist" required value="${esc(v.name)}" placeholder="ex : Développé couché"></label>
        <datalist id="exlist">${EX.map((e) => `<option value="${esc(e[0])}">`).join('')}</datalist>
        <div class="grid2">
          <label class="field"><span>Séries</span><input name="sets" inputmode="numeric" value="${v.sets}"></label>
          <label class="field"><span>Répétitions</span><input name="reps" value="${esc(v.reps)}"></label>
          <label class="field"><span>Charge (kg)</span><input name="weight" inputmode="decimal" value="${v.weight || ''}" placeholder="0"></label>
          <label class="field"><span>Repos (s)</span><input name="rest" inputmode="numeric" value="${v.rest}"></label>
        </div>
        <button class="btn primary">Enregistrer</button>
        ${isNew ? '' : `
          <div class="row"><button type="button" class="btn" data-mv="-1">↑ Monter</button><button type="button" class="btn" data-mv="1">↓ Descendre</button></div>
          <button type="button" class="btn danger" data-del>Supprimer l'exercice</button>`}
      </form>`,
    onMount(b, close) {
      const f = b.querySelector('form');
      f.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(f);
        Object.assign(v, {
          name: fd.get('name').trim(),
          sets: Math.max(1, parseInt(fd.get('sets')) || 1),
          reps: fd.get('reps').trim() || '10',
          weight: num(fd.get('weight')),
          rest: parseInt(fd.get('rest')) || 0,
        });
        if (isNew) day.exercises.push({ id: uid(), ...v });
        save(); close(); rerender();
      };
      b.querySelectorAll('[data-mv]').forEach((btn) => (btn.onclick = () => {
        const i = day.exercises.indexOf(ex);
        const j = i + Number(btn.dataset.mv);
        if (j < 0 || j >= day.exercises.length) return;
        [day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]];
        save(); close(); rerender();
      }));
      const del = b.querySelector('[data-del]');
      if (del) del.onclick = () => {
        day.exercises = day.exercises.filter((x) => x !== ex);
        save(); close(); rerender();
      };
    },
  });
}

// ---------- Séance en cours ----------
function startWorkout(plan, day) {
  if (!day.exercises.length) return toast('Ajoute d\'abord des exercices à cette séance');
  M().active = {
    planId: plan.id,
    dayId: day.id,
    planName: plan.name,
    dayName: day.name,
    start: Date.now(),
    exercises: day.exercises.map((e) => ({
      name: e.name,
      reps: e.reps,
      rest: e.rest,
      target: `${e.sets} × ${e.reps}${e.weight ? ` @ ${e.weight} kg` : ''}`,
      sets: Array.from({ length: e.sets }, () => ({ weight: e.weight || '', reps: '', done: false })),
    })),
  };
  restEnd = 0;
  save();
  rerender();
  window.scrollTo(0, 0);
}

function lastPerf(name) {
  const ss = M().sessions;
  for (let i = ss.length - 1; i >= 0; i--) {
    const e = ss[i].exercises.find((x) => x.name === name);
    if (e?.sets.length) {
      const best = e.sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
      return `${best.weight} kg × ${best.reps}`;
    }
  }
  return null;
}

function renderWorkout() {
  const w = M().active;
  root.innerHTML = `
    <div class="stack">
      <div class="card row between">
        <div><div class="title">${esc(w.dayName)}</div><div class="sub">${esc(w.planName)}</div></div>
        <div class="stat"><b id="elapsed">0:00</b><span class="sub">durée</span></div>
      </div>
      <div id="rest" class="rest-banner" hidden><span>⏱ Repos <b>0:00</b></span><button data-a="skipRest">Passer</button></div>
      ${w.exercises.map((e, i) => {
        const prev = lastPerf(e.name);
        return `
        <div class="card">
          <div class="title">${esc(e.name)}</div>
          <div class="sub">Objectif ${esc(e.target)}${prev ? ` · dernière fois ${prev}` : ''}</div>
          <table class="sets">
            <tr><th>Série</th><th>kg</th><th>Reps</th><th></th></tr>
            ${e.sets.map((s, j) => `
              <tr class="${s.done ? 'done' : ''}">
                <td>${j + 1}</td>
                <td><input inputmode="decimal" data-i="${i}" data-s="${j}" data-f="weight" value="${esc(s.weight)}" placeholder="0"></td>
                <td><input inputmode="numeric" data-i="${i}" data-s="${j}" data-f="reps" value="${esc(s.reps)}" placeholder="${esc(targetReps(e.reps))}"></td>
                <td><button class="check" data-a="toggle" data-i="${i}" data-s="${j}">✓</button></td>
              </tr>`).join('')}
          </table>
          <button class="btn small" style="margin-top:8px" data-a="addSet" data-i="${i}">＋ Série</button>
        </div>`;
      }).join('')}
      <button class="btn primary" data-a="finish">Terminer la séance</button>
      <button class="btn danger" data-a="cancel">Abandonner</button>
    </div>`;

  root.oninput = (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    const sets = w.exercises[t.dataset.i].sets;
    sets[t.dataset.s][t.dataset.f] = t.value;
    // La charge saisie est recopiée sur les séries suivantes pas encore faites
    if (t.dataset.f === 'weight') {
      for (let j = +t.dataset.s + 1; j < sets.length; j++) {
        if (sets[j].done) continue;
        sets[j].weight = t.value;
        const inp = root.querySelector(`[data-i="${t.dataset.i}"][data-s="${j}"][data-f=weight]`);
        if (inp) inp.value = t.value;
      }
    }
    save();
  };
  root.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'toggle') {
      const ex = w.exercises[t.dataset.i];
      const s = ex.sets[t.dataset.s];
      s.done = !s.done;
      const row = t.closest('tr');
      if (s.done && !s.reps) {
        s.reps = targetReps(ex.reps);
        row.querySelector('[data-f=reps]').value = s.reps;
      }
      row.classList.toggle('done', s.done);
      if (s.done && ex.rest) restEnd = Date.now() + ex.rest * 1000;
      save();
      updateTimers();
    }
    if (a === 'skipRest') { restEnd = 0; updateTimers(); }
    if (a === 'addSet') {
      const sets = w.exercises[t.dataset.i].sets;
      const last = sets[sets.length - 1];
      sets.push({ weight: last?.weight ?? '', reps: '', done: false });
      save(); rerender();
    }
    if (a === 'finish') finishWorkout();
    if (a === 'cancel' && (await confirmSheet('Abandonner la séance ? Rien ne sera enregistré.', 'Abandonner'))) {
      M().active = null;
      save(); rerender();
    }
  };

  if (!tick) tick = setInterval(updateTimers, 1000);
  updateTimers();
}

function updateTimers() {
  const w = M().active;
  const el = document.getElementById('elapsed');
  if (w && el) el.textContent = mmss((Date.now() - w.start) / 1000);
  const r = document.getElementById('rest');
  if (r) {
    const left = Math.ceil((restEnd - Date.now()) / 1000);
    r.hidden = left <= 0;
    if (left > 0) r.querySelector('b').textContent = mmss(left);
  }
}

async function finishWorkout() {
  const m = M();
  const w = m.active;
  const exercises = w.exercises
    .map((e) => ({ name: e.name, sets: e.sets.filter((s) => s.done).map((s) => ({ weight: num(s.weight), reps: num(s.reps) })) }))
    .filter((e) => e.sets.length);
  if (!exercises.length) {
    if (!(await confirmSheet('Aucune série validée (bouton ✓). Terminer sans enregistrer ?', 'Terminer'))) return;
    m.active = null;
    save(); rerender();
    return;
  }
  m.sessions.push({
    id: uid(),
    date: iso(),
    planName: w.planName,
    dayName: w.dayName,
    duration: Math.max(1, Math.round((Date.now() - w.start) / 60000)),
    exercises,
  });
  // Progression : on reporte la charge max utilisée dans le plan
  const day = m.plans.find((p) => p.id === w.planId)?.days.find((d) => d.id === w.dayId);
  if (day) exercises.forEach((e) => {
    const pe = day.exercises.find((x) => x.name === e.name);
    const max = Math.max(...e.sets.map((s) => s.weight));
    if (pe && max > 0) pe.weight = max;
  });
  m.active = null;
  restEnd = 0;
  save();
  ui = { view: 'list' };
  rerender();
  window.scrollTo(0, 0);
  toast('Séance enregistrée 💪');
}
