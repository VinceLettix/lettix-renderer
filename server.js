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

    // Bloquer les ressources externes (Google Fonts, etc.) pour accélérer
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const blocked = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
      if (blocked.some(b => url.includes(b))) {
        route.abort();
      } else {
        route.continue();
      }
    });
    await page.setContent(GENERATOR_HTML, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.waitForTimeout(1000);

    // Remplir les champs, débloquer le bouton, et appeler directement la fonction
    await page.evaluate(({ prenomClean, compte }) => {
      // Remplir prénom
      const prenomInput = document.getElementById('prenomInput');
      const compteInput = document.getElementById('compteInput');
      if (!prenomInput) throw new Error('prenomInput non trouvé');
      prenomInput.value = prenomClean;
      prenomInput.dispatchEvent(new Event('input'));
      if (compteInput && compte) compteInput.value = compte;
      // Débloquer le bouton au cas où
      const btn = document.getElementById('genBtn');
      if (btn) btn.disabled = false;
    }, { prenomClean, compte: compte || '' });

    // Log timing
    const t1 = Date.now();
    console.log('Appel genererDedicace...');

    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('genererDedicace timeout 20s')), 20000);
        genererDedicace().then(() => { clearTimeout(timeout); resolve(); })
                         .catch(err => { clearTimeout(timeout); reject(err); });
      });
    });

    console.log('genererDedicace terminé en', Date.now()-t1, 'ms');

    // Diagnostic : voir ce que contient generatedSlides immédiatement après
    const diagResult = await page.evaluate(() => {
      return {
        hasSlides: !!window.generatedSlides,
        length: window.generatedSlides ? window.generatedSlides.length : 0,
        exportRowVisible: document.getElementById('exportRow')?.style.display !== 'none',
        captionVisible: document.getElementById('captionCard')?.style.display !== 'none',
        genStatus: document.getElementById('genStatus')?.textContent || '',
      };
    });
    console.log('Diagnostic:', JSON.stringify(diagResult));

    // Attendre que generatedSlides soit peuplé avec un polling plus fréquent
    await page.waitForFunction(
      () => window.generatedSlides && window.generatedSlides.length >= 3,
      { timeout: 15000, polling: 200 }
    );
    console.log('generatedSlides peuplé en', Date.now()-t1, 'ms');

    const result = await page.evaluate(() => {
      const slides = window.generatedSlides.map(c => c.toDataURL('image/png').split(',')[1]);
      const caption = document.getElementById('captionBox')?.textContent || '';
      return { slides, caption };
    });

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
