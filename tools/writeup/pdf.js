// Render a write-up HTML file to an A4 PDF and report the page count.
// Usage: node tools/writeup/pdf.js <in.html> <out.pdf>
const { chromium } = require('playwright');

(async () => {
  const [, , input, output] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + require('path').resolve(input), { waitUntil: 'load' });
  await page.pdf({ path: output, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = await page.evaluate(() => Math.ceil(document.body.scrollHeight / (297 * 96 / 25.4)));
  console.log(`PDF written: ${output} (~${pages} page(s) of content)`);
  await browser.close();
})();
