/**
 * widgets.js
 * ---------------------------------------------------------------------------
 * Pequeños componentes de interfaz compartidos por varias vistas:
 * tarjetas de métricas, barra de progreso y campos condicionales.
 * ---------------------------------------------------------------------------
 */

import { $, $$ } from './dom.js';

/**
 * HTML de una tarjeta de métrica.
 * @param {{label:string, value:string, unit?:string, sub?:string, tone?:'ok'|'warn'|'danger'|'info'}} m
 */
export function metricCard({ label, value, unit = '', sub = '', tone = 'info' }) {
  return `<div class="metric metric--${tone}">
    <div class="metric__label">${label}</div>
    <div class="metric__value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
    ${sub ? `<div class="metric__sub">${sub}</div>` : ''}
  </div>`;
}

/** Controla una barra de progreso `.progress`. */
export class ProgressBar {
  constructor(element) {
    this.el = element;
    this.bar = $('.progress__bar', element);
    this.label = $('.progress__label', element);
    this.startTime = 0;
  }

  start(text = 'Iniciando…') {
    this.startTime = performance.now();
    this.el.hidden = false;
    this.bar.style.width = '0%';
    this.label.textContent = text;
  }

  set(done, total) {
    const fraction = total > 0 ? done / total : 0;
    const elapsed = (performance.now() - this.startTime) / 1000;
    const remaining = fraction > 0 ? elapsed * (1 / fraction - 1) : NaN;
    this.bar.style.width = `${(fraction * 100).toFixed(1)}%`;
    this.label.textContent = `Réplica ${done} de ${total} · ${(fraction * 100).toFixed(0)} %` +
      (Number.isFinite(remaining) && done < total ? ` · faltan ≈ ${Math.ceil(remaining)} s` : '');
  }

  finish() {
    const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
    this.bar.style.width = '100%';
    this.label.textContent = `Completado en ${elapsed} s`;
    setTimeout(() => (this.el.hidden = true), 1800);
  }

  hide() {
    this.el.hidden = true;
  }
}

/** Muestra el campo "fases k" sólo cuando la distribución elegida es Erlang. */
export function bindErlangToggle(form) {
  const select = form.elements.namedItem('serviceType');
  if (!select) return;
  const update = () => $$('.erlang-only', form).forEach((el) => (el.hidden = select.value !== 'erlang'));
  select.addEventListener('change', update);
  update();
}

/** Construye el objeto `service` del simulador a partir de los campos del formulario. */
export function serviceFromForm(values) {
  return { type: values.serviceType || 'exponential', k: values.erlangK || 2 };
}
