const express = require('express');
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const GENERATOR_HTML = fs.readFileSync(path.join(__dirname, 'generator.html'), 'utf-8');

// Chromium installé via apt dans le Dockerfile
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LETTIX Renderer v1', chromium: CHROMIUM_PATH });
});

app.post('/generate', async (req, res) => {
  const { prenom, compte } = req.body;
  if (!prenom) return res.status(400).json({ error: 'Prénom manquant' });

  const prenomClean = prenom
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');

  if (prenomClean.length < 3 || prenomClean.length > 12) {
    return res.status(400).json({ error: 'Prénom invalide (3-12 lettres)' });
  }

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      chromiumSandbox: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(GENERATOR_HTML, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => document.fonts.ready);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async (prenomClean, compte) => {
      const prenomInput = document.getElementById('prenomInput');
      const compteInput = document.getElementById('compteInput');
      if (!prenomInput) throw new Error('prenomInput non trouvé');
      prenomInput.value = prenomClean;
      prenomInput.dispatchEvent(new Event('input'));
      if (compteInput && compte) compteInput.value = compte;
      await genererDedicace();
      await new Promise(r => setTimeout(r, 2500));
      if (!window.generatedSlides || window.generatedSlides.length < 3)
        throw new Error('Slides non générées');
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`LETTIX Renderer sur port ${PORT}`));
