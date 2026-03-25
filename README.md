# LETTIX Renderer

Micro-service Express + Puppeteer pour générer les 3 slides PNG
d'une dédicace LETTIX personnalisée.

## Structure
```
lettix-renderer/
├── server.js        ← le service Express
├── generator.html   ← ton fichier LETTIX_Dedicace_Generator_v3.html (à copier ici)
├── package.json
└── .gitignore
```

## Setup local (test avant déploiement)
```bash
npm install
node server.js
# Test : curl -X POST http://localhost:3000/generate \
#   -H "Content-Type: application/json" \
#   -d '{"prenom":"SARAH","compte":"@pseudo_test"}'
```

## Déploiement Railway
1. Crée un repo GitHub "lettix-renderer"
2. Push ce dossier (avec generator.html dedans)
3. Dans Railway : New Project → Deploy from GitHub → sélectionne le repo
4. Railway détecte Node.js automatiquement et lance `npm start`
5. Récupère l'URL publique (ex: lettix-renderer.up.railway.app)

## Appel depuis Make
- Module HTTP → POST vers https://lettix-renderer.up.railway.app/generate
- Body JSON : {"prenom": "{{prenom}}", "compte": "@{{pseudo}}"}
- Réponse : { slides: [base64, base64, base64], caption: "..." }
- Chaque base64 → module Dropbox (upload fichier binaire)
