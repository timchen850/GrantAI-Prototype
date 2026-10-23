import { startServer, launch, openApp } from './harness.mjs';
const [persona='visitor', width='1440', code] = process.argv.slice(2);
const srv = await startServer(); const browser = await launch();
const t = await openApp(browser, { persona, width: +width, height: +width < 600 ? 844 : 900 });
const out = await t.page.evaluate(code);
console.log(JSON.stringify(out, null, 1));
console.log('errors:', t.errors);
await browser.close(); srv.close();
