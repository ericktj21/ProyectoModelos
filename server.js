/**
 * server.js
 * ---------------------------------------------------------------------------
 * Servidor HTTP estático mínimo, sin dependencias externas.
 *
 * ¿Por qué hace falta? La aplicación usa módulos ES (import/export) y un
 * Web Worker. Por seguridad, los navegadores bloquean ambos cuando la página
 * se abre directamente con doble clic (protocolo file://). Servir los
 * archivos por http://localhost resuelve el problema.
 *
 * Uso:   node server.js            (puerto 8080 por defecto)
 *        node server.js 3000       (puerto personalizado)
 * ---------------------------------------------------------------------------
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = normalize(join(ROOT, urlPath));

    // Evita salir de la carpeta del proyecto (path traversal).
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Acceso denegado');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (info && info.isDirectory()) filePath = join(filePath, 'index.html');

    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 - Archivo no encontrado');
  }
});

server.listen(PORT, () => {
  console.log('==============================================================');
  console.log('  Simulador del patrón de espera de aterrizaje');
  console.log(`  Abra en su navegador:  http://localhost:${PORT}`);
  console.log('  Presione Ctrl + C para detener el servidor.');
  console.log('==============================================================');
});
