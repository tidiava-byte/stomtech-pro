/**
 * Выкладка сайта на виртуальный хостинг Beget по FTP.
 *
 * Запуск:
 *   node tools/build.mjs            # сначала пересобрать
 *   node tools/deploy-beget.mjs     # затем выложить
 *
 * Доступы берутся из tools/.deploy.env (файл в .gitignore, в репозиторий не попадает):
 *   FTP_HOST=xxxxx.beget.tech
 *   FTP_USER=login_stomtech
 *   FTP_PASS=пароль
 *   FTP_DIR=/stomtech.pro/public_html      # куда класть, без слеша на конце
 *
 * Заливается только то, что реально нужно сайту: HTML, ассеты, robots, sitemap
 * и .htaccess. Исходники сборки (tools/) на хостинг не уезжают — там же лежат
 * ключи и внутренние заметки.
 *
 * Флаг --dry показывает список файлов, ничего не отправляя.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/* ---------- доступы ---------- */
const envFile = join(ROOT, 'tools', '.deploy.env');
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const { FTP_HOST, FTP_USER, FTP_PASS } = env;
const FTP_DIR = (env.FTP_DIR || '').replace(/\/+$/, '');

if (!DRY && !(FTP_HOST && FTP_USER && FTP_PASS)) {
  console.error('Нет доступов. Создайте tools/.deploy.env с FTP_HOST, FTP_USER, FTP_PASS, FTP_DIR');
  console.error('Посмотреть список файлов без отправки: node tools/deploy-beget.mjs --dry');
  process.exit(1);
}

/* ---------- что выкладываем ---------- */
// Папки и файлы, которых на хостинге быть не должно.
const SKIP_DIRS = new Set(['tools', '.git', 'node_modules']);
const SKIP_FILES = new Set(['README.md', '.gitignore', '.deploy.env']);

function collect(dir = ROOT, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).split('\\').join('/');
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      collect(full, acc);
    } else {
      if (SKIP_FILES.has(name)) continue;
      if (name.startsWith('_')) continue;            // временные тестовые страницы
      acc.push(rel);
    }
  }
  return acc;
}

const files = collect().sort();
const totalBytes = files.reduce((n, f) => n + statSync(join(ROOT, f)).size, 0);

console.log(`Файлов к выкладке: ${files.length}, объём ${(totalBytes / 1024 / 1024).toFixed(2)} МБ`);
if (DRY) {
  files.forEach((f) => console.log('  ' + f));
  console.log('\nПробный прогон: ничего не отправлено.');
  process.exit(0);
}

/* ---------- отправка ---------- */
// curl умеет FTP и сам создаёт недостающие каталоги. Отдельный клиент не нужен —
// на Windows его пришлось бы ставить, а curl есть в системе.
let done = 0, failed = [];
for (const rel of files) {
  const url = `ftp://${FTP_HOST}${FTP_DIR}/${posix.normalize(rel)}`;
  try {
    execFileSync('curl', [
      '--silent', '--show-error', '--fail',
      '--ftp-create-dirs',
      '--user', `${FTP_USER}:${FTP_PASS}`,
      '--upload-file', join(ROOT, rel),
      url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    done++;
    process.stdout.write(`\rОтправлено ${done} из ${files.length}   `);
  } catch (e) {
    failed.push(rel);
  }
}

console.log();
if (failed.length) {
  console.log(`Не удалось отправить ${failed.length} файлов:`);
  failed.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
console.log('Готово. Проверьте сайт и не забудьте, что HTML кэшируется у посетителя 0 секунд, а ассеты — год.');
