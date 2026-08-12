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
 *   FTP_INTERFACE=auto                     # необязательно, см. «VPN» ниже
 *
 * Заливается только то, что реально нужно сайту: HTML, ассеты, robots, sitemap
 * и .htaccess. Исходники сборки (tools/) на хостинг не уезжают — там же лежат
 * ключи и внутренние заметки.
 *
 * Флаг --dry показывает список файлов, ничего не отправляя.
 *
 * ---------- VPN ломает выкладку ----------
 * FTP держит два соединения: командное и отдельное для самих данных. Сервер Beget
 * проверяет, что оба пришли с одного адреса, и отвечает «425 Security: Bad IP
 * connecting», если адреса разные.
 *
 * VPN с несколькими выходными узлами (happ / sing-box и подобные) даёт каждому
 * соединению свой адрес — файлы не уезжают. Хуже того, обрыв случается посреди
 * выкладки: часть страниц обновится, часть исчезнет с хостинга, и сайт отдаёт
 * 404 на половине адресов. Так уже было 12.08.2026.
 *
 * Поэтому выкладка по умолчанию (FTP_INTERFACE=auto) сама находит физический
 * адаптер с выходом в интернет и отправляет файлы через него, минуя туннель.
 * VPN при этом выключать не нужно.
 *
 * Если понадобится вмешаться:
 *   FTP_INTERFACE=192.168.0.127   задать адрес адаптера вручную
 *   FTP_INTERFACE=off             выключить обход и отправлять как обычно
 * Посмотреть адреса: PowerShell → Get-NetIPConfiguration.
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

/* ---------- обход VPN ---------- */
// Адрес выдаётся роутером и меняется при смене сети, поэтому по умолчанию
// не задаём его руками, а спрашиваем систему: берём адаптер с выходом в интернет,
// пропуская туннели VPN и виртуальные адаптеры Hyper-V.
function detectInterface() {
  if (process.platform !== 'win32') return '';
  try {
    const ps = [
      'Get-NetIPConfiguration',
      "Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.InterfaceDescription -notmatch 'tun|tap|virtual|hyper-v|sing|vpn|wireguard' }",
      'Select-Object -First 1 -ExpandProperty IPv4Address',
      'Select-Object -ExpandProperty IPAddress',
    ].join(' | ');
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
    return /^\d+\.\d+\.\d+\.\d+$/.test(out) ? out : '';
  } catch {
    return '';
  }
}

const FTP_INTERFACE = (() => {
  const set = (env.FTP_INTERFACE || 'auto').trim();
  if (set === 'off') return '';            // отключить обход, если он мешает
  if (set !== 'auto') return set;          // явный адрес из .deploy.env
  return detectInterface();
})();

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
function upload(rel) {
  const url = `ftp://${FTP_HOST}${FTP_DIR}/${posix.normalize(rel)}`;
  execFileSync('curl', [
    '--silent', '--show-error', '--fail',
    '--ftp-create-dirs',
    // Без таймаутов оборвавшееся соединение висит бесконечно и выкладка замирает
    // молча — на глаз не отличить от медленной сети.
    '--connect-timeout', '15',
    '--max-time', '120',
    ...(FTP_INTERFACE ? ['--interface', FTP_INTERFACE] : []),
    '--user', `${FTP_USER}:${FTP_PASS}`,
    '--upload-file', join(ROOT, rel),
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

let done = 0, failed = [];
let lastError = '';

function tryUpload(rel) {
  try {
    upload(rel);
    done++;
    return true;
  } catch (e) {
    lastError = String(e.stderr || e.message || '').trim();
    failed.push(rel);
    return false;
  }
}

for (const rel of files) {
  tryUpload(rel);
  process.stdout.write(`\rОтправлено ${done} из ${files.length}   `);
}
console.log();

/* Второй заход по неудачным. На виртуальном хостинге FTP изредка рвёт соединение
   на отдельных файлах — из 140 их бывает два-три, и это почти всегда лечится
   повтором. Без повтора выкладка выглядит успешной, а на сайте лежит старая
   версия конкретной страницы или картинки: это хуже, чем явная ошибка. */
if (failed.length) {
  console.log(`Повторная попытка для ${failed.length} файлов...`);
  const retry = failed;
  failed = [];
  for (const rel of retry) tryUpload(rel);
}

/* ---------- сверка размеров ----------
   Оборванная передача не всегда сообщает об ошибке: curl успевает создать файл
   и уйти, а на хостинге остаётся обрезанный кусок. Внешне выкладка успешна,
   на сайте — битая картинка или полстраницы. Поэтому после отправки читаем
   листинг каталогов и сравниваем размеры: одна команда на каталог, не на файл. */
function remoteSizes(dir) {
  const url = `ftp://${FTP_HOST}${FTP_DIR}/${dir ? dir + '/' : ''}`;
  const out = execFileSync('curl', [
    '--silent', '--show-error', '--fail',
    '--connect-timeout', '15', '--max-time', '60',
    ...(FTP_INTERFACE ? ['--interface', FTP_INTERFACE] : []),
    '--user', `${FTP_USER}:${FTP_PASS}`, url,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const sizes = new Map();
  for (const line of out.split(/\r?\n/)) {
    // формат листинга: права ссылки владелец группа размер месяц день время имя
    const m = line.match(/^-\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/);
    if (m) sizes.set(m[2], Number(m[1]));
  }
  return sizes;
}

const byDir = new Map();
for (const rel of files) {
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  if (!byDir.has(dir)) byDir.set(dir, []);
  byDir.get(dir).push(rel);
}

const truncated = [];
let checked = 0;
for (const [dir, list] of byDir) {
  let sizes;
  try {
    sizes = remoteSizes(dir);
  } catch {
    console.log(`\nНе удалось прочитать каталог «${dir || '/'}» — сверка размеров пропущена.`);
    continue;
  }
  for (const rel of list) {
    const name = rel.slice(rel.lastIndexOf('/') + 1);
    // Скрытые файлы (.htaccess) в листинге FTP не показываются, сверить их нечем:
    // иначе они каждый раз попадали бы в «не совпал размер» и переотправлялись зря.
    if (name.startsWith('.')) continue;
    const local = statSync(join(ROOT, rel)).size;
    const remote = sizes.get(name);
    checked++;
    if (remote === undefined || remote !== local) truncated.push({ rel, local, remote });
  }
  process.stdout.write(`\rСверено ${checked} из ${files.length}   `);
}
console.log();

// Обрезанные дозаливаем сразу: это тот же файл, повтор почти всегда проходит.
if (truncated.length) {
  console.log(`Размер не совпал у ${truncated.length} файлов, отправляю заново...`);
  for (const t of truncated) {
    console.log(`  ${t.rel}: на сервере ${t.remote ?? 'нет'}, локально ${t.local}`);
    tryUpload(t.rel);
  }
}

if (failed.length) {
  console.log(`\n❌ Не удалось отправить ${failed.length} файлов даже со второй попытки:`);
  failed.forEach((f) => console.log('  ' + f));
  if (lastError) console.log(`\nОтвет сервера: ${lastError}`);
  // Самая частая причина — включённый VPN: командное соединение и соединение
  // с данными выходят через разные узлы, Beget считает это подменой адреса.
  if (/425|Bad IP/i.test(lastError)) {
    console.log('\nПохоже на включённый VPN. Выключите его или задайте FTP_INTERFACE');
    console.log('в tools/.deploy.env — подробности в шапке этого файла.');
  }
  console.log('\n⚠ На хостинге сейчас неполная версия сайта: часть страниц отдаёт 404.');
  console.log('Повторите выкладку, пока не увидите «Готово».');
  process.exit(1);
}
console.log('Готово. Проверьте сайт и не забудьте, что HTML кэшируется у посетителя 0 секунд, а ассеты — год.');
