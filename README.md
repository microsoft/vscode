# OpenVSCode Web Server

[![GitHub](https://img.shields.io/github/license/runcode-io/openvscode-web-server)](https://github.com/runcode-io/openvscode-web-server/blob/main/LICENSE.txt)

## What is this?

This project provides a version of VS Code that runs as a server on a remote machine, accessible through a modern web browser. It utilizes the same architecture used by [RunCode](https://runcode.io) to deliver scalable remote development environments.

## Why?

VS Code was originally developed as a desktop IDE using web technologies. As remote development gained popularity, the community began adapting it for remote access via web browsers. However, these adaptations were often complex and error-prone due to the extensive changes required across VS Code's large codebase.

In 2019, the VS Code team began restructuring its architecture to natively support a browser-based environment. While platforms like Gitpod and GitHub adopted this architecture, the key components remained closed-source until recently. Consequently, many developers continued to use the older, more difficult methods.

At RunCode, we've frequently been asked about our approach. To support the community, we're sharing the minimal set of changes required to utilize the latest version of VS Code, ensuring easier upgrades and reduced maintenance.

## Getting started

### Docker

- Start the server:
```bash
docker run -it --init -p 8000:8000 -v "$(pwd):/home/runcode/workspace:cached" runcode/runcode-server
```
- Visit the URL printed in your terminal.



#### Custom Environment
- For additional possibilities, please consult the `Dockerfile` for OpenVSCode Web Server at https://github.com/runcode-io/runcode-releases/


### Web Server

- [Download the latest release](https://github.com/runcode-io/openvscode-web-server/releases/latest)
- Untar and run the server
	```bash
	unzip openvscode-web-server-v${OPENVSCODE_SERVER_VERSION}.zip
	cd vscode-reh-web-linux-x64
	./bin/runcode-server # you can add arguments here, use --help to list all of the possible options
	```

  From the possible entrypoint arguments, the most notable ones are
	- `--port` - the port number to start the server on, this is 8000 by default
	- `--without-connection-token` - used by default in the docker image
	- `--connection-token` & `--connection-token-file` for securing access to the IDE, you can read more about it in [Securing access to your IDE](#securing-access-to-your-ide).
	-  `--host` - determines the host the server is listening on. It defaults to `localhost`, so for accessing remotely it's a good idea to add `--host 0.0.0.0` to your launch arguments.

- Visit the URL printed in your terminal.

### Securing access to your IDE

You can access the Web UI without authentication (anyone can access the IDE using just the hostname and port), if you need some kind of basic authentication then you can start the server with `--connection-token YOUR_TOKEN`, the provided `YOUR_TOKEN` will be used and the authenticated URL will be displayed in your terminal once you start the server. You can also create a plaintext file with the desired token as its contents and provide it to the server with `--connection-token-file YOUR_SECRET_TOKEN_FILE`.

If you want to use a connection token and are working with OpenVSCode Web Server via [the Docker image](https://hub.docker.com/r/runcode/runcode-server), you will have to edit the `ENTRYPOINT` in [the Dockerfile](https://github.com/runcode-io/runcode-releases/blob/main/Dockerfile) or modify it with the [`entrypoint` option](https://docs.docker.com/compose/compose-file/compose-file-v3/#entrypoint) when working with `docker-compose`.

## The scope of this project

This project only adds minimal bits required to run VS Code in a server scenario. We have no intention of changing VS Code in any way or to add additional features to VS Code itself. Please report feature requests, bug fixes, etc. in the upstream repository.

> **For any feature requests, bug reports, or contributions that are not specific to running VS Code in a server context, please go to [Visual Studio Code - Open Source "OSS"](https://github.com/microsoft/vscode)**

## Bundled Extensions

VS Code includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (code completion, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a Visual Studio Code Dev Containers / GitHub Codespaces development container.

- For [Dev Containers](https://aka.ms/vscode-remote/download/containers), use the **Dev Containers: Clone Repository in Container Volume...** command which creates a Docker volume for better disk I/O on macOS and Windows.
     - If you already have VS Code and Docker installed, you can also click [here](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode) to get started. This will cause VS Code to automatically install the Dev Containers extension if needed, clone the source code into a container volume, and spin up a dev container for use.
- For Codespaces, install the [GitHub Codespaces](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces) extension in VS Code, and use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 Cores and 6 GB of RAM (8 GB recommended)** to run full build. See the [development container README](.devcontainer/README.md) for more information.

## Legal
This project is not affiliated with Microsoft Corporation.















docker run -it --network=host -v "$(pwd):/home/" ubuntu:22.04


apt update && apt install sudo git wget build-essential

sudo apt update && sudo apt upgrade -y
sudo apt-get install -y libkrb5-dev libx11-dev libxkbfile-dev pkg-config libsecret-1-dev

wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

source /root/.bashrc

nvm install 20.14.0

corepack enable

git config --global --add safe.directory /home




docker run -itd -p 8000:8000 -v "$(pwd):/home" ubuntu:22.04
apt update && apt upgrade -y && apt install unzip sudo -y

./vscode-reh-web-linux-x64/bin/runcode-server --default-folder=/home/ --host=0.0.0.0


apt-get update && apt-get install -y software-properties-common
add-apt-repository ppa:ubuntu-toolchain-r/test
apt-get update && apt-get install -y libstdc++6
