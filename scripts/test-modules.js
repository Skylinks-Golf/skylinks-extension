// Checks the module registry's URL matching and that every enabled module loads.
// Run with: node scripts/test-modules.js   (no install needed). All sample data is made up.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const sandbox = { URL };
sandbox.window = sandbox;
vm.createContext(sandbox);
const load = rel => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });

load('extension/modules/registry.js');
load('extension/modules/index.js');
const Mods = sandbox.SkylinksModules;
for (const id of Mods.enabled) load(`extension/modules/${id}/module.js`);

assert.strictEqual(Mods.list.length, Mods.enabled.length, 'each enabled module registers exactly once');

const fake = { hosts: ['example.com'] };
assert.ok(Mods.matches(fake, 'https://example.com/a'), 'exact host matches');
assert.ok(Mods.matches(fake, 'https://app.example.com/a'), 'subdomain matches');
assert.ok(!Mods.matches(fake, 'https://notexample.com/'), 'a longer name that merely ends in the host must not match');
assert.ok(!Mods.matches(fake, 'https://example.com.evil.net/'), 'a lookalike with the host as a prefix must not match');
assert.ok(!Mods.matches(fake, 'https://evil.net/?next=example.com'), 'host in the query string must not match');
assert.ok(!Mods.matches(fake, 'not a url'), 'a bad URL does not match and does not throw');
assert.ok(!Mods.matches({}, 'https://example.com/'), 'a module with no hosts matches nothing');

assert.ok(!Mods.matches({ hosts: ['a.com'], extraHosts: ['b.com'] }, 'https://b.com/'), 'extraHosts never show tool buttons');

const byId = id => Mods.list.find(m => m.id === id);
assert.ok(Mods.matches(byId('chronogolf'), 'https://www.chronogolf.ca/x'), 'Chronogolf matches .ca');
assert.ok(Mods.matches(byId('chronogolf'), 'https://www.chronogolf.com/x'), 'Chronogolf matches .com');
assert.ok(Mods.matches(byId('merchantos'), 'https://us.merchantos.com/'), 'Lightspeed Retail matches');
assert.ok(!Mods.matches(byId('merchantos'), 'https://us.merchantos.com.evil.net/'), 'Lightspeed lookalike does not match');

console.log('module registry checks passed');
