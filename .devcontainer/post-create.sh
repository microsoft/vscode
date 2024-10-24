#!/bin/sh

npm i
npm run electron

# Open VSCode in the devcontainer
code-insiders .

# Use the `./.devcontainer/post-create.sh` script
chmod +x ./.devcontainer/post-create.sh
