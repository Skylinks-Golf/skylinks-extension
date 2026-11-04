// Repo checks. Runs on every pull request, and locally with: node scripts/check-repo.js
// Needs only Node and git. Findings name the file and line, never the matched value,
// because CI logs on this public repo are public too.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const problems = [];
const fail = msg => problems.push(msg);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const tracked = git('ls-files').split('\n').filter(Boolean);
const isVendored = f => f.startsWith('extension/content/vendor/');

// ---- Whole-repo checks ----

// Every JS file parses.
for (const f of tracked.filter(f => f.endsWith('.js') && !isVendored(f))) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${f}: JavaScript syntax error`);
}

// Every file the extension references exists.
const manifest = JSON.parse(read('extension/manifest.json'));
if (manifest.content_scripts) fail('extension/manifest.json: content scripts are registered in popup.js, not the manifest');
const refs = new Set([manifest.action && manifest.action.default_popup, ...Object.values((manifest.action && manifest.action.default_icon) || {}), ...Object.values(manifest.icons || {})].filter(Boolean));
const popup = read('extension/popup.js');
for (const m of popup.matchAll(/'(content\/[^']+\.js)'/g)) refs.add(m[1]);
for (const m of popup.matchAll(/page: '([^'#]+)/g)) refs.add(m[1]);
for (const r of refs) if (!exists(`extension/${r}`)) fail(`extension/${r}: referenced by popup.js or manifest.json but missing`);
for (const f of tracked.filter(f => f.startsWith('extension/') && f.endsWith('.html'))) {
  for (const m of read(f).matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (/^https?:/.test(m[1])) { fail(`${f}: loads a remote script, MV3 extension pages can't`); continue; }
    if (!exists(path.posix.join(path.posix.dirname(f), m[1]))) fail(`${f}: script ${m[1]} is missing`);
  }
}

// Conventions from PROTOCOLS.md section 4.
const LOGGER_FILES = ['extension/content/utils.js', 'extension/content/core/log.js'];
for (const f of tracked.filter(f => f.startsWith('extension/') && f.endsWith('.js') && !isVendored(f))) {
  read(f).split('\n').forEach((line, i) => {
    if (/getTimezoneOffset/.test(line)) fail(`${f}:${i + 1}: use Intl with America/Los_Angeles, not getTimezoneOffset()`);
    if (/console\.log/.test(line) && !LOGGER_FILES.includes(f)) fail(`${f}:${i + 1}: log through makeLogger, not console.log`);
  });
}

// The changelog's newest entry matches the manifest version.
const newest = (read('extension/CHANGELOG.md').match(/^## (\S+)/m) || [])[1];
if (newest !== manifest.version) fail(`extension/CHANGELOG.md: newest entry is ${newest} but manifest.json says ${manifest.version}`);

// Script tests pass.
for (const f of tracked.filter(f => /^scripts\/test-.*\.js$/.test(f))) {
  const r = spawnSync(process.execPath, [path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${f}: failed. ${(r.stderr.match(/AssertionError[^\n]*/) || ['see output'])[0]}`);
}

// ---- Checks on what this branch changes ----

const baseName = process.env.GITHUB_BASE_REF || 'main';
const headName = process.env.GITHUB_HEAD_REF || git('rev-parse', '--abbrev-ref', 'HEAD').trim();
if (process.env.GITHUB_BASE_REF && baseName !== 'main') {
  fail(`This pull request targets "${baseName}". Every pull request must target main (see PROTOCOLS.md section 1).`);
}
if (headName !== 'HEAD' && headName !== 'main' && !/^[a-z0-9-]+\/[A-Za-z0-9._-]+$/.test(headName) && !/^dev-[a-z0-9-]+$/.test(headName)) {
  fail(`Branch "${headName}" should be named <initials>/<topic> or dev-<initials>.`);
}

const base = process.env.CHECK_BASE || `origin/${baseName === 'main' ? 'main' : baseName}`;
let mergeBase = null;
try { mergeBase = git('merge-base', base, 'HEAD').trim(); } catch (_) { console.log(`Skipping change checks: ${base} not found.`); }

if (mergeBase) {
  // Line-ending-only changes don't count as changes.
  const changed = git('diff', '--numstat', '--ignore-space-at-eol', mergeBase, 'HEAD').split('\n').filter(Boolean)
    .map(l => l.split('\t')).filter(([a, d]) => a !== '0' || d !== '0').map(p => p[2]);

  // Extension code changes need a version bump and a changelog line. Pushes to a dev
  // branch are work in progress, so this waits for the pull request to main.
  const shipped = changed.filter(f => f.startsWith('extension/') && !f.startsWith('extension/docs/') && !f.endsWith('.md'));
  if (process.env.GITHUB_EVENT_NAME !== 'push' && shipped.some(f => f !== 'extension/manifest.json')) {
    const oldVersion = JSON.parse(git('show', `${mergeBase}:extension/manifest.json`)).version;
    if (oldVersion === manifest.version) fail(`Extension code changed but manifest.json is still ${manifest.version}. Bump the version.`);
    if (!changed.includes('extension/CHANGELOG.md')) fail('Extension code changed but extension/CHANGELOG.md has no new line.');
  }

  // Data files only as synthetic examples.
  const added = git('diff', '--name-only', '--diff-filter=A', mergeBase, 'HEAD').split('\n').filter(Boolean);
  for (const f of added) {
    if (/\.(csv|tsv|xlsx?|numbers)$/i.test(f) && !f.startsWith('extension/docs/examples/')) {
      fail(`${f}: data files don't belong in this public repo. Synthetic examples go in extension/docs/examples/.`);
    }
  }

  // Scan added lines for things that must never be committed.
  const CONTACTS_ALLOWED = ['extension/orders/config.js', 'artifacts/order-run/']; // Ian's recorded decision, PROTOCOLS.md section 2
  const SYNTHETIC_ALLOWED = ['scripts/test-'];
  const SECRET = /gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[sr]k_live_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{20,}/;
  const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
  const OK_EMAIL = /@(example\.(com|org|net)|skylinksgolf\.com|anthropic\.com|users\.noreply\.github\.com)$/i;
  const PHONE = /(?<![\d.-])\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\d.-])/g;
  const CARD = /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g;
  const luhn = s => {
    const d = s.replace(/\D/g, '');
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      let n = +d[d.length - 1 - i];
      if (i % 2) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  };

  const diff = git('diff', '--unified=0', '--no-color', '--no-ext-diff', mergeBase, 'HEAD', '--', '.', ':!extension/content/vendor');
  let file = null, lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, ''); continue; }
    const hunk = raw.match(/^@@ -\S+ \+(\d+)/);
    if (hunk) { lineNo = +hunk[1]; continue; }
    if (!raw.startsWith('+') || !file) continue;
    const line = raw.slice(1);
    const at = `${file}:${lineNo}`;
    lineNo++;
    if (SECRET.test(line)) fail(`${at}: looks like a password, key or token`);
    if (SYNTHETIC_ALLOWED.some(p => file.startsWith(p))) continue;
    for (const m of line.matchAll(CARD)) if (luhn(m[0])) fail(`${at}: looks like a card number`);
    if (CONTACTS_ALLOWED.some(p => file.startsWith(p))) continue;
    for (const m of line.matchAll(EMAIL)) if (!OK_EMAIL.test(m[0])) fail(`${at}: email address that isn't Skylinks or example.com. Use jane@example.com in samples, and ask Ian about real contacts.`);
    for (const m of line.matchAll(PHONE)) if (!/555/.test(m[0])) fail(`${at}: looks like a real phone number. Use 555-0100 in samples, and ask Ian about real contacts.`);
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s) to fix:\n`);
  problems.forEach(p => console.error(`  - ${p}`));
  console.error('\nIf a finding is wrong or you are stuck, ask Ian. Do not change this script to get past it.\n');
  process.exit(1);
}
console.log('All repo checks passed.');
