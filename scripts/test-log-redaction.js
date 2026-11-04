// Checks that content/core/log.js keeps personal data out of the stored log.
// Run with: node scripts/test-log-redaction.js   (no install needed). All sample data is made up.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const store = {};
const local = {
  get: async k => ({ [k]: store[k] }),
  set: async o => { Object.assign(store, o); },
  remove: async k => { delete store[k]; },
};
const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  chrome: { storage: { local }, runtime: { getManifest: () => ({ version: 'test' }) } },
  location: { protocol: 'https:', hostname: 'vendor.example' },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/content/core/log.js'), 'utf8'), sandbox);
const { redact, sanitize } = sandbox.SkylinksUtils.diag;

const removed = {
  'email': 'not found: jane@example.com',
  'phone with dashes': 'call 555-555-0100',
  'phone with parentheses': 'call (555) 555-0100',
  'phone with dots': 'call 555.555.0100',
  'seven digit phone': 'call 555-0100',
  'card number': 'card 4242 4242 4242 4242',
  'bearer token': 'Bearer abc.def-123',
  'query on absolute URL': 'GET https://vendor.example/a?first_name=Jane',
  'query on relative URL': 'GET /a?first_name=Jane&last_name=Example',
};
for (const [label, input] of Object.entries(removed)) {
  const out = redact(input);
  for (const secret of ['jane@', '555-0100', '0100', '4242', 'abc.def', 'Jane', 'Example']) {
    assert(!out.includes(secret), `${label}: "${secret}" survived in "${out}"`);
  }
}

// Diagnostics stay useful: dates, status codes and paths are not redacted.
assert.strictEqual(redact('week 2026-11-03 → 2026-11-09'), 'week 2026-11-03 → 2026-11-09');
assert.strictEqual(redact('GET /Customer/123.json -> 422'), 'GET /Customer/123.json -> 422');

const record = sanitize({ name: 'Jane Example', fullName: 'Jane Example', player_name: 'Jane Example', email: 'jane@example.com', rows: 3 });
assert.strictEqual(record.name, '[omitted]');
assert.strictEqual(record.fullName, '[omitted]');
assert.strictEqual(record.player_name, '[omitted]');
assert.strictEqual(record.email, '[omitted]');
assert.strictEqual(record.rows, 3);

// Tools must not put personal fields into log lines at all: the filter cannot recognize a bare name.
const contentDir = path.join(__dirname, '../extension/content');
const personal = /\blog(?:\.warn|\.error)?\([^\n]*(?:\(\$\{name\}\)|\$\{(?:displayName|row\.(?:email|phone|first_name|last_name|date_of_birth))\})/;
for (const file of fs.readdirSync(contentDir).filter(f => f.endsWith('.js'))) {
  fs.readFileSync(path.join(contentDir, file), 'utf8').split('\n').forEach((line, i) => {
    assert(!personal.test(line), `${file}:${i + 1} logs a personal field`);
  });
}

console.log('log redaction checks passed');
