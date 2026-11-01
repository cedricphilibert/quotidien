// Stockage local de toutes les données (sur le téléphone, dans le navigateur).
const KEY = 'quotidien:data:v1';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const SAMPLE_RECIPES = [
  { name: 'Pâtes bolognaise', servings: 2, ingredients: ['250 g pâtes', '300 g bœuf haché', '400 g sauce tomate', '1 oignon', "1 gousse d'ail", '50 g parmesan'], notes: '' },
  { name: 'Poulet, riz & brocoli', servings: 2, ingredients: ['300 g blanc de poulet', '150 g riz basmati', '300 g brocoli', "1 cs huile d'olive"], notes: '' },
  { name: 'Omelette & salade', servings: 2, ingredients: ['6 œufs', '100 g emmental râpé', '1 salade', '2 tomates'], notes: '' },
  { name: 'Chili con carne', servings: 3, ingredients: ['400 g bœuf haché', '400 g haricots rouges', '400 g tomates concassées', '1 oignon', '1 poivron', '200 g riz'], notes: '' },
  { name: 'Saumon & patate douce', servings: 2, ingredients: ['2 pavés de saumon', '500 g patate douce', '200 g haricots verts'], notes: '' },
  { name: 'Bowl quinoa feta', servings: 2, ingredients: ['150 g quinoa', '1 avocat', '200 g pois chiches', '1 concombre', '100 g feta'], notes: '' },
];

function defaults() {
  return {
    version: 1,
    muscu: { plans: [], sessions: [], active: null },
    depenses: { items: [], budget: 0 },
    repas: { recipes: SAMPLE_RECIPES.map((r) => ({ id: uid(), ...r })), week: {}, courses: [] },
  };
}

function merge(d) {
  const base = defaults();
  for (const k of ['muscu', 'depenses', 'repas']) base[k] = { ...base[k], ...(d?.[k] || {}) };
  return base;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(JSON.parse(raw));
  } catch (e) {
    console.warn('Lecture des données impossible', e);
  }
  return defaults();
}

let data = load();

export const S = () => data;

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Sauvegarde impossible', e);
  }
}

export function replaceData(d) {
  data = merge(d);
  save();
}

export function resetData() {
  data = defaults();
  save();
}
