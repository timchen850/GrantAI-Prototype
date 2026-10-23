// Static + live audit of index.html:
//  1. every identifier called from an inline handler (onclick="foo(...)") must exist in the running page
//  2. every literal getElementById('x') / querySelector('#x') must have a matching id somewhere in the file
//  3. no duplicate ids in the static markup
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openApp, ROOT } from './harness.mjs';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const JS_WORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'function', 'typeof', 'new', 'catch', 'await', 'async', 'void', 'delete', 'in', 'of', 'do', 'else', 'try']);

// 1. handler identifiers (handles both markup and handlers built inside JS strings)
const handlers = [...html.matchAll(/\bon(?:click|change|input|submit|keydown|keyup|keypress|blur|focus|mouseenter|mouseleave|load|error)\s*=\s*(\\?["'])([\s\S]*?)\1/g)].map((m) => m[2]);
const called = new Map();
for (const h of handlers) {
  const code = h.replace(/\\'/g, "'").replace(/'[^']*'|"[^"]*"/g, '""');
  for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const id = m[1]; if (JS_WORDS.has(id)) continue;
    if (!called.has(id)) called.set(id, h.slice(0, 90));
  }
}

// 2. ids referenced vs ids that exist anywhere in the file (markup, templates, .id =)
const defined = new Set([
  ...[...html.matchAll(/\bid\s*=\s*\\?["']([\w-]+)\\?["']/g)].map((m) => m[1]),
  ...[...html.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)].map((m) => m[1]),
  ...[...html.matchAll(/\bid\s*:\s*['"]([\w-]+)['"]/g)].map((m) => m[1]),
]);
const prefixIds = [...html.matchAll(/\bid\s*=\s*\\?["']([\w-]+)['"]\s*\+/g)].map((m) => m[1]);   // id="x-' + n + '"
const referenced = new Map();
for (const m of html.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)|querySelector(?:All)?\(\s*['"]#([\w-]+)['"]\s*\)/g)) {
  const id = m[1] || m[2]; const line = html.slice(0, m.index).split('\n').length;
  if (!referenced.has(id)) referenced.set(id, line);
}
const missingIds = [...referenced].filter(([id]) => !defined.has(id) && !prefixIds.some((p) => id.startsWith(p)));

// 3. duplicate ids in static markup (scripts stripped)
const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
const counts = {};
for (const m of markup.matchAll(/\sid="([^"]+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
const dupes = Object.entries(counts).filter(([, n]) => n > 1);

// live check of handler identifiers
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona: 'np' });
const names = [...called.keys()];
const types = await t.page.evaluate((ns) => ns.map((n) => { try { return (0, eval)('typeof ' + n); } catch (e) { return 'error:' + e.message; } }), names);
const undefinedHandlers = names.map((n, i) => [n, types[i]]).filter(([, ty]) => ty !== 'function');
await browser.close(); srv.close();

console.log(`handlers scanned: ${handlers.length}, distinct functions called: ${names.length}`);
console.log('\n## handler functions NOT defined at runtime:');
for (const [n, ty] of undefinedHandlers) console.log(`  ${n} (${ty})  e.g. ${called.get(n)}`);
console.log(`\n## ids looked up but never defined (${missingIds.length}):`);
for (const [id, line] of missingIds) console.log(`  #${id}  (first lookup line ${line})`);
console.log(`\n## duplicate static ids (${dupes.length}):`);
for (const [id, n] of dupes) console.log(`  #${id} x${n}`);
