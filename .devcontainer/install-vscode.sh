#!/bin/sh
set -e

if command -v apt >/dev/null 2>&1
then
	apt update
	apt install -y wget gpg

	wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
	install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
	sh -c 'echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
	rm -f packages.microsoft.gpg

	apt update
	apt install -y code-insiders libsecret-1-dev libxkbfile-dev

elif command -v dnf >/dev/null 2>&1
then
	rpm --import https://packages.microsoft.com/keys/microsoft.asc
	sh -c 'echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" > /etc/yum.repos.d/vscode.repo'

	dnf check-update || [ "$?" = "100" ] # 100 means there are updates available
	dnf install -y code-insiders wget git

else
	echo "Unknown package manager"
fi
