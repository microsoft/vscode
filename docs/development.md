# Developing OpenVSCode Server

This guide implies that you have a good understanding of [source code organization](https://github.com/microsoft/vscode/wiki/Source-Code-Organization) and [development flow](https://github.com/microsoft/vscode/wiki/How-to-Contribute) of Code-OSS.

## Source Code Organization

We add [server](../src/vs/server) layer glueing everything required to run the server including the [web workbench](../src/vs/server/browser/workbench/workbench.ts), the [remote server](../src/vs/server/node/server.ts)  and the [remote CLI](../src/vs/server/node/cli.ts).

The server consist of 2 applications:
- The web workbench is an entry point to a browser application configuring various services
like how to establish the connection with the backend, resolve remote resources, load webviews, and so on.
- The server is running on a remote machine that serves the web workbench and static resources for webviews, extensions, and so on, as well as provides access to the file system, terminals, extensions, and so on.

The workbench and the server are communicating via RPC calls over web socket connections. There are 2 kinds of connections that we support right now:
- the management connection provides access to the server RPC channels, like filesystem and terminals;
- the extension connection creates the remote extension host process per a browser window to run extensions.

For each window, the server installs the CLI socket server and injects a special env var pointing to the socket file into each terminal. It allows the remote CLI to send commands to a proper window, for instance, to open a file.

Note that the workbench can be also bundled independently to serve from some CDN services. The server can run in headless mode if sources of the web workbench are missing.
## Building

### Starting from sources

- [Start a Gitpod workspace](https://gitpod.io/#https://github.com/gitpod-io/openvscode-server)
- Dev version of the server should be already up and running. Notice that the dev version is slower to load since it is not bundled (around 2000 files).

### Bundling

Run `yarn gulp server-min` to create production-ready distributable from sources. After the build is finished, you will be able to find following folders next to the project directory:
- `server-pkg-web` contains the web workbench static resources,
- `server-pkg-server` contains the headless remote server with the remote CLI,
- `serfver-pkg` contains everything together to be distributed standalone.

You can find gulp bundling tasks [here](../build/gulpfile.server.js).

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
- Open a PR with your changes and ask for help if needed. It should be agaist `gitpod-io/openvscode-server` repo and `main` branch!
