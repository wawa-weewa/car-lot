'use strict';

const STORAGE_KEY = 'carlot.v1';
const PREFS_KEY = 'carlot.prefs';
const CURRENCY = '₪';
const PRICE_PRESETS = [30000, 50000, 80000, 120000, 200000];
const SORTS = {
  price: { label: 'Цена', hint: 'сначала дешевле' },
  name: { label: 'Название', hint: 'от А до Я' },
  mileage: { label: 'Пробег', hint: 'сначала меньше' },
};

const $ = (sel) => document.querySelector(sel);

let cars = load();
let prefs = loadPrefs();
let query = '';
let editingId = null;

/* ---------- Хранение ---------- */

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data.map(normalize).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
  } catch {
    toast('Не удалось сохранить данные');
  }
}

function loadPrefs() {
  const defaults = { sort: 'price', maxPrice: null };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    return {
      sort: p.sort in SORTS ? p.sort : defaults.sort,
      maxPrice: toInt(p.maxPrice),
    };
  } catch {
    return defaults;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function normalize(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  return {
    id: String(raw.id || uid()),
    name: raw.name.trim(),
    price: toInt(raw.price),
    mileage: toInt(raw.mileage),
    hand: toInt(raw.hand),
    engine: typeof raw.engine === 'string' ? raw.engine.trim() : '',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** «85 000», «85000», 85000 → 85000; пусто или не число → null. */
function toInt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\s ₪]/g, '');
  if (!s || !/^\d+$/.test(s)) return null;
  return Number(s);
}

function isBad(input) {
  return input.value.trim() !== '' && toInt(input.value) === null;
}

/* ---------- Форматирование ---------- */

const numberFmt = new Intl.NumberFormat('ru-RU');

function fmtNum(n) {
  return numberFmt.format(n);
}

function fmtPrice(n) {
  return `${fmtNum(n)} ${CURRENCY}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Отрисовка ---------- */

function cardElement(car) {
  const li = document.createElement('li');
  li.className = 'card';
  li.dataset.id = car.id;

  const specs = [];
  if (car.mileage !== null) specs.push(`<span class="spec"><b>${fmtNum(car.mileage)}</b> км</span>`);
  if (car.hand !== null) specs.push(`<span class="spec">Рука <b>${car.hand}</b></span>`);
  if (car.engine) specs.push(`<span class="spec"><b>${escapeHtml(car.engine)}</b></span>`);

  li.innerHTML = `
    <div class="card-top">
      <p class="card-name">${escapeHtml(car.name)}</p>
      <span class="card-price">${car.price !== null ? fmtPrice(car.price) : '—'}</span>
    </div>
    ${specs.length ? `<div class="specs">${specs.join('')}</div>` : ''}`;
  return li;
}

/** Пустые значения всегда в конце списка. */
function byNumber(key) {
  return (a, b) => {
    if (a[key] === null || b[key] === null) return (a[key] === null) - (b[key] === null);
    return a[key] - b[key] || a.name.localeCompare(b.name, 'ru');
  };
}

const comparators = {
  price: byNumber('price'),
  name: (a, b) => a.name.localeCompare(b.name, 'ru'),
  mileage: byNumber('mileage'),
};

function render() {
  const q = query.trim().toLocaleLowerCase('ru');
  const max = prefs.maxPrice;

  const visible = cars
    .filter((c) => !q || c.name.toLocaleLowerCase('ru').includes(q))
    .filter((c) => max === null || (c.price !== null && c.price <= max))
    .sort(comparators[prefs.sort]);

  $('#list').replaceChildren(...visible.map(cardElement));
  $('#empty').hidden = cars.length > 0;
  $('#noResults').hidden = cars.length === 0 || visible.length > 0;

  const n = cars.length;
  $('#kicker').textContent = n ? `Площадка · ${n} авто` : 'Площадка';

  const shown = visible.length < n ? visible : cars;
  const total = shown.reduce((sum, c) => sum + (c.price || 0), 0);
  let sub = 'Учёт автомобилей на площадке';
  if (n && visible.length < n) sub = `Показано ${visible.length} из ${n} · ${fmtPrice(total)}`;
  else if (n && total) sub = `На сумму ${fmtPrice(total)}`;
  $('#heroSub').textContent = sub;

  $('#sortValue').textContent = SORTS[prefs.sort].label;
  $('#priceValue').textContent = max === null ? 'Любая цена' : `До ${fmtPrice(max)}`;
  $('#priceBtn').classList.toggle('active', max !== null);
}

/* ---------- Список и поиск ---------- */

function find(id) {
  return cars.find((c) => c.id === id);
}

$('#list').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  const car = card && find(card.dataset.id);
  if (car) openCar(car);
});

$('#search').addEventListener('input', (e) => {
  query = e.target.value;
  render();
});

$('#addBtn').addEventListener('click', () => openCar(null));
$('#emptyAdd').addEventListener('click', () => openCar(null));
$('#settingsBtn').addEventListener('click', () => openSheet($('#settingsSheet')));

/* ---------- Нижние листы ---------- */

function openSheet(el) {
  el.hidden = false;
  el.classList.remove('closing');
}

function closeSheet(el) {
  if (el.hidden || el.classList.contains('closing')) return;
  document.activeElement?.blur();
  el.classList.add('closing');
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove('closing');
  }, 190);
}

document.querySelectorAll('.sheet-backdrop').forEach((backdrop) => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) closeSheet(backdrop);
  });
});

/* ---------- Добавление / редактирование ---------- */

const carForm = $('#carForm');

function openCar(car) {
  editingId = car ? car.id : null;
  $('#carTitle').textContent = car ? 'Автомобиль' : 'Новое авто';
  $('#deleteBtn').hidden = !car;
  carForm.name.value = car ? car.name : '';
  carForm.price.value = car && car.price !== null ? fmtNum(car.price) : '';
  carForm.mileage.value = car && car.mileage !== null ? fmtNum(car.mileage) : '';
  carForm.hand.value = car && car.hand !== null ? car.hand : '';
  carForm.engine.value = car ? car.engine : '';
  openSheet($('#carSheet'));
  if (!car) setTimeout(() => carForm.name.focus(), 50);
}

carForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = carForm.name.value.trim();
  if (!name) {
    toast('Введите название авто');
    carForm.name.focus();
    return;
  }
  const bad = [carForm.price, carForm.mileage, carForm.hand].find(isBad);
  if (bad) {
    toast('Введите целое число, например 85 000');
    bad.focus();
    return;
  }

  const data = {
    name,
    price: toInt(carForm.price.value),
    mileage: toInt(carForm.mileage.value),
    hand: toInt(carForm.hand.value),
    engine: carForm.engine.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  const existing = editingId && find(editingId);
  if (existing) {
    Object.assign(existing, data);
    toast('Сохранено');
  } else {
    cars.push({ id: uid(), createdAt: data.updatedAt, ...data });
    toast('Авто добавлено');
  }
  save();
  render();
  closeSheet($('#carSheet'));
});

$('#deleteBtn').addEventListener('click', () => {
  const car = find(editingId);
  if (!car || !confirm(`Удалить «${car.name}»?`)) return;
  cars = cars.filter((c) => c.id !== car.id);
  save();
  render();
  closeSheet($('#carSheet'));
  toast('Авто удалено');
});

/* ---------- Сортировка ---------- */

const sortMenu = $('#sortMenu');
sortMenu.innerHTML = Object.entries(SORTS)
  .map(([key, s]) => `<button type="button" class="menu-item" data-sort="${key}"><span>${s.label}<small>${s.hint}</small></span><span class="check">✓</span></button>`)
  .join('');

$('#sortBtn').addEventListener('click', () => {
  sortMenu.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('selected', b.dataset.sort === prefs.sort));
  openSheet($('#sortSheet'));
});

sortMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sort]');
  if (!btn) return;
  prefs.sort = btn.dataset.sort;
  savePrefs();
  render();
  closeSheet($('#sortSheet'));
});

/* ---------- Фильтр по цене ---------- */

const priceForm = $('#priceForm');
$('#presets').innerHTML = PRICE_PRESETS
  .map((p) => `<button type="button" class="preset" data-price="${p}">до ${fmtPrice(p)}</button>`)
  .join('');

function applyMaxPrice(value) {
  prefs.maxPrice = value;
  savePrefs();
  render();
  closeSheet($('#priceSheet'));
}

$('#priceBtn').addEventListener('click', () => {
  priceForm.max.value = prefs.maxPrice !== null ? fmtNum(prefs.maxPrice) : '';
  openSheet($('#priceSheet'));
});

priceForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isBad(priceForm.max)) {
    toast('Введите сумму, например 80 000');
    priceForm.max.focus();
    return;
  }
  applyMaxPrice(toInt(priceForm.max.value));
});

$('#presets').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-price]');
  if (btn) applyMaxPrice(Number(btn.dataset.price));
});

$('#priceReset').addEventListener('click', () => applyMaxPrice(null));

/* ---------- Выгрузка в файл ---------- */

const CSV_COLUMNS = [
  { key: 'name', title: 'Название', aliases: ['название', 'name', 'модель', 'авто', 'машина', 'שם', 'דגם'] },
  { key: 'price', title: 'Цена', aliases: ['цена', 'price', 'стоимость', 'מחיר'] },
  { key: 'mileage', title: 'Пробег', aliases: ['пробег', 'mileage', 'км', 'km', 'קילומטר', 'ק"מ'] },
  { key: 'hand', title: 'Рука', aliases: ['рука', 'hand', 'владел', 'יד'] },
  { key: 'engine', title: 'Двигатель', aliases: ['двигатель', 'engine', 'мотор', 'מנוע'] },
];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** На iPhone открывает меню «Поделиться» (сохранить в «Файлы», отправить), иначе скачивает файл. */
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$('#exportCsvBtn').addEventListener('click', () => {
  if (!cars.length) return toast('Нет авто для выгрузки');
  const rows = [CSV_COLUMNS.map((c) => c.title), ...cars.map((car) => CSV_COLUMNS.map((c) => car[c.key]))];
  // BOM нужен, чтобы Excel правильно показал русские буквы
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  shareFile(new File([csv], `ploshchadka-${stamp()}.csv`, { type: 'text/csv' }));
});

$('#exportJsonBtn').addEventListener('click', () => {
  const json = JSON.stringify({ app: 'car-lot', version: 1, exportedAt: new Date().toISOString(), cars }, null, 2);
  shareFile(new File([json], `ploshchadka-${stamp()}.json`, { type: 'application/json' }));
});

/* ---------- Загрузка из файла ---------- */

let pending = []; // авто из выбранного файла, ждут выбора «добавить» или «заменить»

function detectSeparator(line) {
  const counts = [',', ';', '\t'].map((sep) => [sep, line.split(sep).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const sep = detectSeparator(text.split(/\r?\n/, 1)[0]);
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Числа из таблиц бывают «85 000», «85,000», «85000.00 ₪». */
function csvInt(v) {
  const s = String(v).replace(/[\s ₪]|км|km/gi, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+([.,]\d+)?$/.test(s)) return Math.round(Number(s.replace(',', '.')));
  return null;
}

function carsFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLocaleLowerCase('ru'));
  const index = {};
  CSV_COLUMNS.forEach((col) => {
    const i = head.findIndex((h) => col.aliases.some((a) => h.startsWith(a)));
    if (i !== -1) index[col.key] = i;
  });
  // Без узнаваемой шапки считаем, что колонки идут в нашем порядке
  const hasHeader = 'name' in index;
  if (!hasHeader) CSV_COLUMNS.forEach((col, i) => (index[col.key] = i));

  return rows.slice(hasHeader ? 1 : 0).map((r) => {
    const get = (key) => (index[key] !== undefined ? (r[index[key]] || '').trim() : '');
    return normalize({
      name: get('name'),
      price: csvInt(get('price')),
      mileage: csvInt(get('mileage')),
      hand: csvInt(get('hand')),
      engine: get('engine'),
    });
  }).filter(Boolean);
}

function carsFromJson(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.cars;
  if (!Array.isArray(list)) throw new Error('bad format');
  return list.map(normalize).filter(Boolean);
}

$('#importBtn').addEventListener('click', () => $('#importFile').click());

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const isJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(text);
    pending = isJson ? carsFromJson(text) : carsFromCsv(text);
  } catch {
    pending = [];
  }
  if (!pending.length) return toast('В файле не найдено авто');

  const n = cars.length;
  $('#importSummary').textContent = `В файле «${file.name}» найдено ${pending.length} авто.`;
  $('#importAddHint').textContent = n ? `Сейчас ${n} авто, станет ${n + pending.length}` : 'Площадка сейчас пуста';
  $('#importReplaceHint').textContent = n ? `Текущие ${n} авто будут удалены` : 'Площадка сейчас пуста';
  closeSheet($('#settingsSheet'));
  openSheet($('#importSheet'));
});

$('#importSheet').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn || !pending.length) return;
  const now = new Date().toISOString();
  // Новые id, чтобы повторная загрузка того же файла не путала записи
  const incoming = pending.map((c) => ({ ...c, id: uid(), createdAt: c.createdAt || now }));
  if (btn.dataset.mode === 'replace') {
    if (cars.length && !confirm(`Удалить текущие ${cars.length} авто и загрузить ${incoming.length} из файла?`)) return;
    cars = incoming;
  } else {
    cars = cars.concat(incoming);
  }
  pending = [];
  save();
  render();
  closeSheet($('#importSheet'));
  toast(`Загружено авто: ${incoming.length}`);
});

/* ---------- Уведомление ---------- */

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ---------- Запуск ---------- */

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
