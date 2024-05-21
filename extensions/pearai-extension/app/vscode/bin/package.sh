#!/bin/sh

echo "Cleaning dist folder..."
rm -rf dist

echo "Copying assets..."
cp -r asset dist

echo "Copying CHANGELOG..."
cp -r ../../CHANGELOG.md dist

echo "Copying templates..."
cp -r ../../template dist

echo "Copying extension lib files..."
mkdir -p dist/extension/dist
cp dev/extension/dist/extension.js dist/extension/dist/extension.js

echo "Copying webview lib files..."
mkdir -p dist/webview/asset
mkdir -p dist/webview/dist
cp dev/webview/asset/* dist/webview/asset
cp dev/webview/dist/webview.js dist/webview/dist/webview.js

echo "Packaging extension..."
cd dist
yarn vsce package --no-dependencies --no-rewrite-relative-links