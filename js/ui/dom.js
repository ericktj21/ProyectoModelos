/**
 * dom.js
 * ---------------------------------------------------------------------------
 * Utilidades de interfaz reutilizables: selección de elementos, lectura de
 * formularios, formateo numérico en español y construcción de tablas.
 * ---------------------------------------------------------------------------
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const numberFormatters = new Map();
function formatter(decimals) {
  if (!numberFormatters.has(decimals)) {
    numberFormatters.set(
      decimals,
      new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    );
  }
  return numberFormatters.get(decimals);
}

/** Número con `decimals` decimales en formato es-CO (coma decimal). */
export function fmt(value, decimals = 3) {
  if (value === Infinity) return '∞';
  if (!Number.isFinite(value)) return '—';
  return formatter(decimals).format(value);
}

/** Proporción (0..1) como porcentaje. */
export const pct = (value, decimals = 1) => (Number.isFinite(value) ? `${fmt(value * 100, decimals)} %` : value === Infinity ? '∞' : '—');

/** Horas a minutos con formato. */
export const minutes = (hours, decimals = 2) => (hours === Infinity ? '∞' : fmt(hours * 60, decimals));

/** Reloj de simulación (horas) como hh:mm:ss. */
export function clockLabel(hours) {
  const totalSeconds = Math.floor(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Lee los campos de un formulario. Los inputs numéricos se convierten a número.
 * Los campos con data-scale multiplican el valor (p. ej. porcentajes → fracción).
 */
export function readForm(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'number' || el.type === 'range') {
      const scale = Number(el.dataset.scale || 1);
      values[el.name] = Number(el.value) * scale;
    } else if (el.type === 'checkbox') {
      values[el.name] = el.checked;
    } else {
      values[el.name] = el.value;
    }
  }
  return values;
}

/** Escribe valores en un formulario (inverso de readForm). */
export function writeForm(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const el = form.elements.namedItem(name);
    if (!el) continue;
    const scale = Number(el.dataset.scale || 1);
    el.value = typeof value === 'number' ? +(value / scale).toFixed(6) : value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Escapa texto para insertarlo como HTML. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Renderiza una tabla en un contenedor.
 * @param {HTMLElement} container
 * @param {string[]} headers encabezados (pueden contener HTML)
 * @param {Array<Array<string|number>>} rows celdas (pueden contener HTML)
 * @param {{caption?:string, rowClass?:(row:any[], i:number)=>string}} options
 */
export function renderTable(container, headers, rows, options = {}) {
  const caption = options.caption ? `<caption>${options.caption}</caption>` : '';
  const head = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body = rows
    .map((row, i) => {
      const cls = options.rowClass ? options.rowClass(row, i) : '';
      return `<tr class="${cls}">${row.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .join('');
  container.innerHTML = `<div class="table-wrap"><table class="data-table">${caption}${head}<tbody>${body}</tbody></table></div>`;
}

/** Muestra un mensaje temporal en la esquina inferior. */
export function toast(message, type = 'info') {
  let host = $('#toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.classList.add('toast--hide'), 3200);
  setTimeout(() => el.remove(), 3800);
}

/** Sincroniza un <output> con el valor de un input range/number. */
export function bindOutputs(root) {
  for (const input of $$('input[data-output]', root)) {
    const output = $(`#${input.dataset.output}`);
    const update = () => {
      const decimals = Number(input.dataset.decimals || 0);
      output.textContent = fmt(Number(input.value), decimals) + (input.dataset.suffix || '');
    };
    input.addEventListener('input', update);
    update();
  }
}
