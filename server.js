const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const GENERATOR_HTML = fs.readFileSync(
  path.join(__dirname, 'generator.html'),
  'utf-8'
);

// Chemins Chrome selon l'environnement
const CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  process.env.PUPPETEER_EXECUTABLE_PATH,
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome introuvable. Chemins testés : ' + CHROME_PATHS.join(', '));
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LETTIX Renderer v1' });
});

app.post('/generate', async (req, res) => {
  const { prenom, compte } = req.body;

  if (!prenom || prenom.length < 3 || prenom.length > 12) {
    return res.status(400).json({ error: 'Prénom invalide (3–12 lettres)' });
  }

  const prenomClean = prenom
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');

  if (prenomClean.length < 3 || prenomClean.length > 12) {
    return res.status(400).json({ error: 'Prénom invalide après nettoyage' });
  }

  let browser;
  try {
    const executablePath = findChrome();
    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1200,800'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(GENERATOR_HTML, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => document.fonts.ready, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    const result = await page.evaluate(async (prenomClean, compte) => {
      const prenomInput = document.getElementById('prenomInput');
      const compteInput = document.getElementById('compteInput');
      if (!prenomInput) throw new Error('prenomInput non trouvé');
      prenomInput.value = prenomClean;
      prenomInput.dispatchEvent(new Event('input'));
      if (compteInput && compte) compteInput.value = compte;
      await genererDedicace();
      await new Promise(r => setTimeout(r, 2000));
      if (!window.generatedSlides || window.generatedSlides.length < 3) {
        throw new Error('Slides non générées');
      }
      const slides = window.generatedSlides.map(c => c.toDataURL('image/png').split(',')[1]);
      const caption = document.getElementById('captionBox')?.textContent || '';
      return { slides, caption };
    }, prenomClean, compte || '');

    await browser.close();
    res.json({ success: true, prenom: prenomClean, slides: result.slides, caption: result.caption });

  } catch (err) {
    if (browser) await browser.close();
    console.error('Erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LETTIX Renderer sur port ${PORT}`));
