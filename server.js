const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Charger le HTML du générateur une seule fois au démarrage
const GENERATOR_HTML = fs.readFileSync(
  path.join(__dirname, 'generator.html'),
  'utf-8'
);

// ── Health check ────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LETTIX Renderer v1' });
});

// ── Endpoint principal ───────────────────────────────────────
// POST /generate
// Body: { prenom: "SARAH", compte: "@pseudo" }
// Retourne: { slides: [base64png, base64png, base64png], caption: "..." }
app.post('/generate', async (req, res) => {
  const { prenom, compte } = req.body;

  if (!prenom || prenom.length < 3 || prenom.length > 12) {
    return res.status(400).json({
      error: 'Prénom invalide — doit contenir entre 3 et 12 lettres'
    });
  }

  // Nettoyer : majuscules, sans accents, lettres uniquement
  const prenomClean = prenom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  if (prenomClean.length < 3 || prenomClean.length > 12) {
    return res.status(400).json({ error: 'Prénom invalide après nettoyage' });
  }

  let browser;
  try {
    // Lancer Chrome headless
    browser = await puppeteer.launch({
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

    // Charger le générateur HTML directement depuis la chaîne
    await page.setContent(GENERATOR_HTML, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Attendre que les polices Google soient chargées
    await page.waitForFunction(() => document.fonts.ready, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));

    // Injecter le prénom et déclencher la génération
    const result = await page.evaluate(async (prenomClean, compte) => {
      // Remplir les champs
      const prenomInput = document.getElementById('prenomInput');
      const compteInput = document.getElementById('compteInput');
      if (!prenomInput) throw new Error('prenomInput non trouvé');

      prenomInput.value = prenomClean;
      prenomInput.dispatchEvent(new Event('input'));
      if (compteInput && compte) compteInput.value = compte;

      // Déclencher la génération
      await genererDedicace();

      // Attendre que les slides soient générées
      await new Promise(r => setTimeout(r, 2000));

      // Récupérer les slides en base64
      if (!window.generatedSlides || window.generatedSlides.length < 3) {
        throw new Error('Slides non générées — generatedSlides vide');
      }

      const slides = window.generatedSlides.map(canvas =>
        canvas.toDataURL('image/png').split(',')[1]
      );

      // Récupérer la caption
      const captionEl = document.getElementById('captionBox');
      const caption = captionEl ? captionEl.textContent : '';

      return { slides, caption };
    }, prenomClean, compte || '');

    await browser.close();

    res.json({
      success: true,
      prenom: prenomClean,
      slides: result.slides,   // 3 strings base64 PNG
      caption: result.caption
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error('Erreur génération:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Démarrage ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LETTIX Renderer démarré sur le port ${PORT}`);
});
