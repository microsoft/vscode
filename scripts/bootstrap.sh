#!/usr/bin/env bash
set -e

echo "🔥 Bootstrapping Spark..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install Node 20+ first."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node 20+ required. Found: $(node -v)"
  exit 1
fi

echo "✅ Node $(node -v)"

if [ ! -f "apps/www/.env" ]; then
  echo "📝 Creating apps/www/.env from .env.example"
  cp apps/www/.env.example apps/www/.env
fi

echo "📦 Installing landing page dependencies..."
cd apps/www
npm install
cd ../..

echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  cd apps/www"
echo "  npm run dev"
echo ""
