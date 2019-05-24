#!/usr/bin/env bash
set -e

cat << EOF > ~/.netrc
machine monacotools.visualstudio.com
password $VSO_PAT
machine github.com
login vscode
password $VSCODE_MIXIN_PASSWORD
EOF

git config user.email "vscode@microsoft.com"
git config user.name "VSCode"
git remote add distro "https://github.com/$VSCODE_MIXIN_REPO.git"
git fetch distro
git merge $(node -p "require('./package.json').distro")

CHILD_CONCURRENCY=1 yarn