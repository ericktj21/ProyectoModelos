/**
 * aircraftShape.js
 * ---------------------------------------------------------------------------
 * Dibujo vectorial de una aeronave vista desde arriba sobre un canvas 2D.
 * Separado del renderizador del aeropuerto para poder reutilizarlo (por
 * ejemplo, en la leyenda) y mantener cada archivo con una sola responsabilidad.
 * ---------------------------------------------------------------------------
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x centro
 * @param {number} y centro
 * @param {number} angle rumbo en radianes (0 = hacia la derecha)
 * @param {number} size longitud aproximada del fuselaje en píxeles
 * @param {{body:string, accent:string, alpha?:number, halo?:string|null}} style
 */
export function drawAircraft(ctx, x, y, angle, size, style) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = style.alpha ?? 1;
  const s = size / 2;

  if (style.halo) {
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2);
    ctx.fillStyle = style.halo;
    ctx.fill();
  }

  ctx.fillStyle = style.body;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;

  // Alas principales
  ctx.beginPath();
  ctx.moveTo(s * 0.25, 0);
  ctx.lineTo(-s * 0.25, -s * 1.0);
  ctx.lineTo(-s * 0.45, -s * 1.0);
  ctx.lineTo(-s * 0.2, 0);
  ctx.lineTo(-s * 0.45, s * 1.0);
  ctx.lineTo(-s * 0.25, s * 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Estabilizador horizontal
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, 0);
  ctx.lineTo(-s * 0.95, -s * 0.42);
  ctx.lineTo(-s * 1.05, -s * 0.42);
  ctx.lineTo(-s * 0.92, 0);
  ctx.lineTo(-s * 1.05, s * 0.42);
  ctx.lineTo(-s * 0.95, s * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Fuselaje
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cabina
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  ctx.ellipse(s * 0.72, 0, s * 0.16, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
