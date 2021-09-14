# OpenVSCode Server

[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-908a85?logo=gitpod)](https://gitpod.io/from-referrer/)

## What is this?

This project provides a version of VS Code that runs a server on a remote machine and allows access through a modern web browser. It's based on the very same architecture used by [Gitpod](https://www.gitpod.io) or [GitHub Codespaces](https://github.com) at scale.

<img width="1624" alt="Screenshot 2021-09-02 at 08 39 26" src="https://user-images.githubusercontent.com/372735/131794918-d6602646-4d67-435b-88fe-620a3cc0a3aa.png">

## Why?

VS Code has traditionally been a desktop IDE built with web technology. A few years back people started patching it, in order to run it in a remote context and to make it accessible through web browsers. [These efforts have been complex and error prone](https://github.com/cdr/code-server/issues/3835), because many changes had to be made across the large code base of VS Code.

Luckily in 2019 the VS Code team started to refactor its architecture to support a browser-based working mode. While this architecture has been adopted by Gitpod and GitHub, the important bits have not been open-sources, yet. As a result many people in the community are still using the old hard to maintain and error-prone approach.

At Gitpod we've been asked a lot about how we do it. So we thought we might just share the minimal set of changes needed, so people can rely on the latest version of VS Code, have a straightforward upgrade path and low maintenance effort.

## Getting started

### Docker

- Start the server:
```bash
docker run -it --init -p 3000:3000 -v "$(pwd):/home/workspace:cached" gitpod/openvscode-server
```
- after this, visit [localhost:3000](http://localhost:3000).

### Linux

- [Download the latest release](https://github.com/gitpod-io/openvscode-server/releases/latest)
- untar and run the server:
```bash
tar -xzf code-web-server-v${OPENVSCODE_SERVER_VERSION}.tar.gz
cd code-web-server-v${OPENVSCODE_SERVER_VERSION}
./server.sh
```
- after this, visit [localhost:3000](http://localhost:3000).

## The scope of this project

This project really only adds the minimal bits required to run VS Code in a server scenario. We have no intention of changing VS Code in any way or adding additional features through this. Feature requests, bug fixes, etc. should go to the upstream repository.

> **For any feature requests, bug reports, or contributions that are not specific to running VS Code in a server context,**
>
> **please go to [Visual Studio Code - Open Source "OSS"](https://github.com/microsoft/vscode)**

## Contributing

### Starting from sources

- [Start a Gitpod workspace](https://gitpod.io/#https://github.com/gitpod-io/openvscode-server)
- Dev version of the server should be already up and running. Notice that the dev version is slower to load since it is not bundled (around 2000 files).

### Updating VS Code

- Update your local VS Code, open the About dialog and remember the release commit and Node.js version.
- Fetch latest upstream changes and rebase the branch based on the local VS Code's commit. Drop all commits before `code web server initial commit`.
- Check that [.gitpod.Dockerfile](./.gitpod.Dockerfile) and [remote/.yarnrc](./remote/.yarnrc) has latest major Node.js version of local VS Code's Node.js version.
- Recompile everything: `git clean -dfx && yarn && yarn server:init`
- Run smoke tests: `yarn server:smoketest`.
- Start the dev server and play:
  - filesystem (open some project)
  - extension host process: check language smartness
  - extension management (installing/uninstalling)
  - install VIM extension to test web extensions
  - terminals
  - code cli should open files and manage extensions: `alias code='export VSCODE_DEV=1 && node out/server-cli.js'`
- Check server/browser logs for any warnings/errors about missing capabilities and fix them.
- Build the production server with all changes: `yarn gulp server-min`.
- Run it and play as with the dev server: `/workspace/server-pkg/server.sh`
- Open a PR with your changes and ask for help if needed. It should be agaist `gitpod-io/openvscode-server` repo and `web-server` branch!
