cd ~/webcode.host/vscode/build/vite
npm run build
cp -r "dist copy"/extensions dist/extensions
cp -r "dist copy"/node_modules dist/node_modules
cp -r "dist copy"/server.js dist/server.js
cp -r "dist copy"/marketplace.json dist/marketplace.json
cp -r "dist copy"/build.sh dist/build.sh

cd ~/webcode.host/vscode
npm run compile
cp -r out ~/webcode.host/vscode/build/vite/dist/out
mkdir -p ~/webcode.host/vscode/build/vite/dist/static
mkdir -p ~/webcode.host/vscode/build/vite/dist/static/sources
cp -r out ~/webcode.host/vscode/build/vite/dist/static/sources

cd ~/webcode.host/vscode/build/vite/dist
node server.js
