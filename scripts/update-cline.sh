#!/bin/bash

echo "[*] Updating Cline extension..."
cd extensions/cline || exit
git checkout main
git pull origin main
cd ../../

echo "[*] Rebuilding VS Code extensions..."
yarn gulp compile-extensions

echo "[*] Done. Cline updated and extensions rebuilt."
