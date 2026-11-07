/**
 * router.js
 * ---------------------------------------------------------------------------
 * Navegación entre secciones con el hash de la URL (#teoria, #simulacion…).
 * Permite usar los botones atrás/adelante del navegador y compartir enlaces
 * a una sección concreta. Notifica a las vistas cuando se muestran para que
 * puedan redibujar sus gráficas con el tamaño correcto.
 * ---------------------------------------------------------------------------
 */

import { $$ } from './dom.js';

export class Router {
  /** @param {string} defaultRoute */
  constructor(defaultRoute = 'inicio') {
    this.defaultRoute = defaultRoute;
    this.listeners = new Map();
    window.addEventListener('hashchange', () => this.navigate());
  }

  /** Registra una función que se ejecuta cada vez que se muestra la sección `route`. */
  onShow(route, callback) {
    if (!this.listeners.has(route)) this.listeners.set(route, []);
    this.listeners.get(route).push(callback);
  }

  /** Ruta actual (o la de por defecto si el hash no es válido). */
  current() {
    const route = location.hash.replace('#', '');
    return document.getElementById(route)?.classList.contains('view') ? route : this.defaultRoute;
  }

  navigate() {
    const route = this.current();
    for (const view of $$('.view')) view.hidden = view.id !== route;
    for (const link of $$('[data-route]')) link.classList.toggle('is-active', link.dataset.route === route);
    document.body.classList.remove('nav-open');
    window.scrollTo({ top: 0 });
    (this.listeners.get(route) || []).forEach((cb) => cb());
  }

  start() {
    this.navigate();
  }
}
