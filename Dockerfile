FROM node:18-slim

# Installer toutes les dépendances système pour Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libglib2.0-0 \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxcb1 \
  libxkbcommon0 \
  libx11-6 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libatspi2.0-0 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Variables pour Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
