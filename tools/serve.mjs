/**
 * Локальный просмотр сайта.
 *
 *   node tools/serve.mjs          → http://localhost:4173
 *   node tools/serve.mjs 8080     → другой порт
 *
 * Зачем он появился: с тех пор как адреса страниц лишились расширения
 * (`/oferta` вместо `/oferta.html`), открыть index.html двойным щелчком мало —
 * ссылки будут вести в никуда. Этот сервер делает ровно то же, что `.htaccess`
 * на хостинге: не нашёл файл — попробовал добавить `.html`.
 *
 * Без зависимостей: только встроенный http-модуль.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Файл на диске, соответствующий адресу. null — если ничего не подошло. */
async function resolveFile(urlPath) {
  // normalize отсекает попытки выйти за пределы папки сайта через ../
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\.]+)/, '');
  const candidates = rel === '' ? ['index.html'] : [rel, `${rel}.html`, join(rel, 'index.html')];
  for (const c of candidates) {
    const full = join(ROOT, c);
    try {
      if ((await stat(full)).isFile()) return full;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const path = req.url.split('?')[0].replace(/\/+$/, '');
  const file = await resolveFile(path);

  if (!file) {
    const notFound = await resolveFile('/404');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(notFound ? await readFile(notFound) : 'Не найдено');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    // локальный просмотр всегда показывает свежую сборку
    'Cache-Control': 'no-store',
  });
  res.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`Сайт открыт: http://localhost:${PORT}`);
  console.log('Остановить — Ctrl+C');
});
