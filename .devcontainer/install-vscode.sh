#!/bin/sh

# Update package lists
apt update

# Install required packages
apt install -y wget gpg

# Download and import Microsoft GPG key
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg

# Install the GPG key to the keyring
install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg

# Add the Visual Studio Code repository to the sources list
sh -c 'echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'

# Clean up the downloaded GPG key file
rm -f packages.microsoft.gpg

# Update package lists again to include the new repository
apt update

# Install Visual Studio Code Insiders and its dependencies
apt install -y code-insiders libsecret-1-dev libxkbfile-dev
