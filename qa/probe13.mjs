import { startServer, launch, openApp } from './harness.mjs';
const srv = await startServer(); const browser = await launch();
for (const width of [1440, 390]) {
  const t = await openApp(browser, { persona: 'np', width, height: width < 600 ? 844 : 900 });
  const p = t.page;
  await p.evaluate(() => go('profile')); await p.waitForTimeout(1000);
  await p.setInputFiles('#pf-file-doc_990', { name: 'form-990-2025.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('pf-upl-doc_990').scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
  await p.screenshot({ path: `out/pfdocs-${width}.png` });
  await t.ctx.close();
}
await browser.close(); srv.close();
