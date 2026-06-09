#!/bin/bash
set -e

echo "============================================"
echo "  Kiedy Michał idzie na obiad? — Instalacja"
echo "============================================"

# Sprawdź Node.js >= 18
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "BŁĄD: Wymagane Node.js >= 18. Zainstaluj z: https://nodejs.org"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# Zainstaluj zależności
echo "→ Instaluję zależności npm..."
npm install --production

# Utwórz .env jeśli nie istnieje
if [ ! -f ".env" ]; then
  RANDOM_PASS=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 16 2>/dev/null || echo "michal$(date +%s)")
  echo "ADMIN_PASSWORD=${RANDOM_PASS}" > .env
  echo "PORT=3000" >> .env
  echo "✓ Plik .env utworzony (hasło admina: ${RANDOM_PASS})"
else
  echo "✓ Plik .env już istnieje"
fi

# Utwórz katalog db
mkdir -p db
echo "✓ Katalog db/ gotowy"

# Zainstaluj PM2 globalnie jeśli nie ma
if ! command -v pm2 &> /dev/null; then
  echo "→ Instaluję PM2 globalnie..."
  npm install -g pm2
fi
echo "✓ PM2 $(pm2 -v)"

# Zatrzymaj poprzednią instancję jeśli działa
pm2 stop michal-obiad 2>/dev/null || true
pm2 delete michal-obiad 2>/dev/null || true

# Uruchom aplikację
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "============================================"
echo "  ✓ Aplikacja działa na http://localhost:3000"
echo "  ✓ Panel admina: http://localhost:3000/admin"
echo "============================================"
echo ""
echo "Aby aplikacja startowała po restarcie serwera, uruchom:"
pm2 startup | tail -1
echo ""
