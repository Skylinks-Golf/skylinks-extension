// Repo checks. Runs on every pull request, and locally with: node scripts/check-repo.js
// Needs only Node and git. Findings name the file and line, never the matched value,
// because CI logs on this public repo are public too.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const problems = [];
const fail = msg => problems.push(msg);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));
// Skip files deleted in the working tree but not committed yet, so removing a module doesn't crash the check.
const tracked = git('ls-files').split('\n').filter(Boolean).filter(f => fs.existsSync(path.join(ROOT, f)));
const isVendored = f => f.startsWith('extension/content/vendor/');

// ---- Whole-repo checks ----

// Every JS file parses.
for (const f of tracked.filter(f => f.endsWith('.js') && !isVendored(f))) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${f}: JavaScript syntax error`);
}

// Every file the extension references exists.
const manifest = JSON.parse(read('extension/manifest.json'));
// Permissions ledger (scripts/approved-permissions.json). Builders may add what their module needs
// under "pending" (with a module and a reason) and keep working. Ian approves at the merge to main:
// a pull request fails while anything is pending, and he clears it by moving the entries into the
// approved lists. Anything in the manifest that is in neither list fails everywhere.
{
  const ledger = JSON.parse(read('scripts/approved-permissions.json'));
  const pending = ledger.pending || [];
  const KEYS = ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions'];
  for (const e of pending) {
    if (!KEYS.includes(e.type) || !e.value || !e.module || !e.reason) fail(`scripts/approved-permissions.json: a pending entry needs type (${KEYS.join(' | ')}), value, module and reason`);
  }
  const isPending = (key, p) => pending.some(e => e.type === key && e.value === p);
  for (const key of KEYS) {
    for (const p of manifest[key] || []) {
      if (!(ledger[key] || []).includes(p) && !isPending(key, p)) fail(`extension/manifest.json: ${key} "${p}" is not in scripts/approved-permissions.json. Add it under "pending" with your module and the reason; Ian approves it when the work merges to main.`);
    }
  }
  for (const e of pending) {
    if (!(manifest[e.type] || []).includes(e.value)) fail(`scripts/approved-permissions.json: pending "${e.value}" is not in manifest.json any more. Remove the pending entry.`);
  }
  if (pending.length) {
    const list = pending.map(e => `${e.value} (${e.module}: ${e.reason})`).join('; ');
    if (process.env.GITHUB_BASE_REF) fail(`${pending.length} permission(s) await Ian's approval before this can merge to main: ${list}. Ian clears them by moving each into the approved lists in scripts/approved-permissions.json.`);
    else console.log(`Note: ${pending.length} permission(s) will need Ian's approval at the merge to main: ${list}`);
  }
}
if (manifest.content_scripts) fail('extension/manifest.json: content scripts are registered in popup.js, not the manifest');
const refs = new Set([manifest.action && manifest.action.default_popup, ...Object.values((manifest.action && manifest.action.default_icon) || {}), ...Object.values(manifest.icons || {})].filter(Boolean));
for (const r of refs) if (!exists(`extension/${r}`)) fail(`extension/${r}: referenced by the manifest but missing`);
for (const f of tracked.filter(f => f.startsWith('extension/') && f.endsWith('.html'))) {
  for (const m of read(f).matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (/^https?:/.test(m[1])) { fail(`${f}: loads a remote script, MV3 extension pages can't`); continue; }
    if (!exists(path.posix.join(path.posix.dirname(f), m[1]))) fail(`${f}: script ${m[1]} is missing`);
  }
}

// Module registry: modules/index.js lists the enabled modules, each modules/<id>/module.js
// describes one. Load them the way the popup does and validate the descriptors.
{
  const sandbox = {};
  sandbox.window = sandbox; // popup.html loads these as <script>s where window is the global
  vm.createContext(sandbox);
  const run = rel => { try { vm.runInContext(read(rel), sandbox, { filename: rel }); return true; } catch (e) { fail(`${rel}: could not load (${e.message})`); return false; } };
  if (run('extension/modules/registry.js') && run('extension/modules/index.js')) {
    const Mods = sandbox.SkylinksModules;
    const hostPerms = (manifest.host_permissions || []).map(p => (p.match(/^https:\/\/([^/]+)\//) || [])[1]).filter(Boolean);
    const covered = h => hostPerms.some(p => p === h || (p.startsWith('*.') && (h === p.slice(2) || h.endsWith(p.slice(1)))));
    for (const f of Mods.coreFiles) if (!exists(`extension/${f}`)) fail(`extension/${f}: listed in modules/registry.js coreFiles but missing`);
    const seen = new Set();
    const claimed = new Set(); // every host some module says it uses
    for (const id of Mods.enabled) {
      const rel = `extension/modules/${id}/module.js`;
      if (seen.has(id)) fail(`modules/index.js: "${id}" is listed twice`);
      seen.add(id);
      if (!exists(rel)) { fail(`${rel}: listed in modules/index.js but missing`); continue; }
      const before = Mods.list.length;
      if (!run(rel)) continue;
      const added = Mods.list.slice(before);
      if (added.length !== 1) { fail(`${rel}: must call SkylinksModules.register exactly once`); continue; }
      const m = added[0];
      if (m.id !== id) fail(`${rel}: id "${m.id}" must match the folder name "${id}"`);
      if (!/^[a-z0-9-]+$/.test(id)) fail(`${rel}: id must be lowercase letters, digits and dashes`);
      if (!m.name) fail(`${rel}: needs a name`);
      if (!m.owner) fail(`${rel}: needs an owner`);
      if ((m.tools || []).length && !(m.hosts || []).length) fail(`${rel}: has tools but no hosts`);
      if (!(m.tools || []).length && !(m.pages || []).length) fail(`${rel}: needs tools or pages`);
      for (const h of [...(m.hosts || []), ...(m.extraHosts || [])]) {
        claimed.add(h);
        if (!covered(h)) fail(`${rel}: host ${h} has no https://${h}/* entry in manifest.json host_permissions`);
      }
      for (const t of m.tools || []) {
        if (!t.label) fail(`${rel}: a tool has no label`);
        if (!Mods.colors.includes(t.color)) fail(`${rel}: tool "${t.label}" color must be one of ${Mods.colors.join(', ')}`);
        if (!(t.files || []).length) fail(`${rel}: tool "${t.label}" has no files`);
        for (const f of t.files || []) if (!exists(`extension/${f}`)) fail(`extension/${f}: used by tool "${t.label}" in ${rel} but missing`);
      }
      for (const p of m.pages || []) {
        if (!p.label) fail(`${rel}: a page has no label`);
        if (!exists(`extension/${String(p.page).split('#')[0]}`)) fail(`extension/${p.page}: used by page "${p.label}" in ${rel} but missing`);
      }
    }
    // A manifest host that no module claims is a leftover (for example after a module was removed).
    for (const p of hostPerms) {
      const used = [...claimed].some(h => h === p || (p.startsWith('*.') && (h === p.slice(2) || h.endsWith(p.slice(1)))));
      if (!used) fail(`extension/manifest.json: host_permissions has ${p} but no module lists it in hosts or extraHosts. Remove it from the manifest (and ask Ian to drop it from scripts/approved-permissions.json), or add it to the module that needs it.`);
    }
    // A module folder that isn't listed would silently never load.
    const dirs = fs.readdirSync(path.join(ROOT, 'extension/modules'), { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_'));
    for (const d of dirs) if (!Mods.enabled.includes(d.name)) fail(`extension/modules/${d.name}: folder is not listed in modules/index.js (rename it with a leading _ if it is a draft)`);
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
  fail(`Branch "${headName}" should be named <name>/<topic> or dev-<name>.`);
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
