# Interactive introduction to the codebase

This is a technical deep dive into how OpenVSCode Server turns VS Code into a web IDE, with interactive code search queries and snippets. This is [best viewed on Sourcegraph](https://sourcegraph.com/github.com/sourcegraph/openvscode-server/-/blob/doc/sourcedive.snb.md).

The code snippets in this file correspond to search queries and can be displayed by clicking the blue "Run search" button to the right of each query. For example, here is a snippet that shows off an instance of dependency injection within VS Code:

```sourcegraph
patterntype:structural repo:^github\.com/gitpod-io/openvscode-server$@5c8a1f file:^src/vs/code/browser/workbench/workbench\.ts create(document.body, {:[1]})
```

## Architectural overview

OpenVSCode Server is a fork of VS Code that extends the editor to be runnable in the browser, speaking to a web server that provides a remote dev environment.

Upstream VS Code consists of [layers](https://github.com/microsoft/vscode/wiki/Source-Code-Organization):

* `base`: Provides general utilities and user interface building blocks.
* `platform`: Defines service injection support and the base services for VS Code.
* `editor`: The "Monaco" editor is available as a separate downloadable component.
* `workbench`: Hosts the "Monaco" editor and provides the framework for "viewlets" like the Explorer, Status Bar, or Menu Bar, leveraging Electron to implement the VS Code desktop application.
* `code`: The entry point to the desktop app that stitches everything together, this includes the Electron main file and the CLI for example.

OpenVSCode Server adds an additional [`server` layer](https://github.com/gitpod-io/openvscode-server/tree/main/src/vs/server). The client side remains largely unchanged, save for the injection of RPC-based handlers for things like filesystem and terminal interactions, in place of local handlers. The `server` layer has 3 main components:

* Web-based workbench
* Remote server
* Remote CLI

The web-based workbench lives on the client side and is the place where the RPC-based dependencies are injected. VS Code's codebase is modular and makes heavy use of dependency injection, which makes it easier to substitute different implementations. The entrypoint into the web-based workbench is in [workbench.ts](https://sourcegraph.com/github.com/gitpod-io/openvscode-server/-/blob/src/vs/code/browser/workbench/workbench.ts). In that file, the `create` function creates the workbench using dependency injection:

```sourcegraph
patterntype:structural repo:/gitpod-io/openvscode-server$@5c8a1f fork:yes file:server/browser/workbench/workbench.ts create(document.body, :[2])
```

The workbench talks to the remote server via RPC. There are 2 RPC channels:

* The management connection handles filesystem and terminal requests
* The extension connection creates the remote extension host process and handles extension-related requests

Let's take a look at how those connections are set up on the server side. The main entrypoint into the server lives in [`server.main.ts`](https://sourcegraph.com/github.com/gitpod-io/openvscode-server@5c8a1f/-/blob/src/vs/server/node/server.main.ts?L11):

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@5c8a1f file:^src/vs/server/node/server\.main\.ts export async function main
```

Of particular note in the `main` function is `channelServer`, which registers different service channels for handling different types of requests received from the client, such as logging, debugging, and filesystem requests.


```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@5c8a1f file:^src/vs/server/node/server\.main\.ts const channelServer = 
```

These channels then relay the requests to the appropriate service implementations. Lower in the `main` function, a `ServiceCollection` instance is used as a dependency injection container that holds all the concrete implementations of the various service types:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts Const services = new ServiceCollection()
```

Then the whole bundle is wrapped by an HTTP server, which is the outermost container that handles requests from the client:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts const server = http.createServer
```

Some of the handler endpoints correspond to static resources:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts if (pathname === '/vscode-remote-resource')
```

Then there are the endpoints that upgrade a HTTP request to a WebSocket connection:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts server.on('upgrade', 
```

The aforementioned management connection and extension connection use these WebSocket connections. The management connection connects `channelServer` with your editor window, including requests for handling terminal and fileystem requests.

On the extension side, there's a special protocol over WebSocket that initiates a handshake to set up the remote extension host process:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts const controlListener = protocol.onControlMessage
```

The extension connection will fork the extension host process and connect the user's editor window. Among other things, keystrokes are sent down this connection, as they may be relevant to extensions in use.


## Startup

Now, let's walk through what happens at startup.

On server startup, first we create the channel server and register channels to handle RPC calls and events from the web workbench:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 const channelServer = new IPCServer
```


Then we create the service collection (effectively the dependency injection container for service implementations, as described earlier) with all services required for the RPC channels:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts services.set(IRawURITransformerFactory, rawURITransformerFactory)
```

Then we instantiate these services and start the HTTP server:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts const clients = new Map<string, Client>()
```

When a user tries to access the server, the web workbench is served by HTTP listener:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 file:^src/vs/server/node/server\.main\.ts return handleRoot(req, res, devMode ? options.mainDev || 
```

The web workbench first loads 3rd party dependencies like xterm:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 xterm': `${window.location.origin} file:workbench-dev.html
```

...and then itself:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 require(['vs/server/browser/workbench/workbench'], 
```

The web workbench uses dependency injection to configure how to establish WebSockets, load static resources, load webviews, and so on:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 create(document.body, { file:src/vs/server/
```

When the web workbench is created, it opens WebSocket connections to the server:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 if (req.headers['upgrade'] !== 'websocket' || !req.url)
```

There is one connection to the RPC channel server to notify about a new client:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 onDidClientConnectEmitter.fire({ protocol, onDidClientDisconnect: onDidClientDisconnectEmitter.event })
```

...and another for the extension host process which is running remote extensions: 

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 const extensionHost = cp.fork(FileAccess.asFileUri
```

When a user creates a new terminal the management connection is used to call the remote terminal channel:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 return this.createProcess(context.remoteAuthority, args);
```

...which delegates to pseudo terminal service:

```sourcegraph
repo:^github\.com/gitpod-io/openvscode-server$@8b3e975 const persistentTerminalId = await this.ptyService.createProcess
```

The terminal service then enacts the corresponding action and relays the response back through the request chain covered above.

## Diving in

This hopefully gives you a good overview of how OpenVSCode Server turns VS Code into a web-based IDE. The code is completely open-source and released by Gitpod. You can try out [Gitpod](https://www.gitpod.io/) as a service or dive into more of the [source code on Sourcegraph](https://sourcegraph.com/github.com/gitpod-io/openvscode-server).
