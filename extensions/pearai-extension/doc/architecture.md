# Architecture - PearAI for Visual Studio Code

## Overview

PearAI is a [Visual Studio Code extension](https://code.visualstudio.com/api). It has two main components:

- The extension itself, which is the main entry point for the extension. It contains the extension static and logic.
- The sidebar webview, which is a iframe that runs in the sidebar. It renders the UI and forwards user input to the extension.

Visual Studio Code initializes the PearAI extension on load. The extension then sets up callback for e.g. the registered commands and initializes the internal structure. The webview is loaded by Visual Studio Code when it is first opened.

```mermaid
graph TD
subgraph PearAI Extension
  A[PearAI Extension]
  B[PearAI Side Bar Webview]
end
C[OpenAI API]
D[Visual Studio Code]
E[User]

E -.-> B
E -..-> D

D --activation & callback--> A
A --API calls-->D
D --loads-->B

A ==state==> B
B ==messages==> A
B --API calls--> D

A --request completion----> C
```

## Project Structure

PearAI for Visual Studio Code is written in [TypeScript](https://www.typescriptlang.org/). It uses [pnpm](https://pnpm.io/) as package manager and [Nx](https://nx.dev/) for monorepo tooling.

The project is structured as follows:

- [`app/vscode`](https://github.com/trypear/pearai-app/tree/main/app/vscode): Extension assets (e.g. icons, `package.json`, `README.md`, walkthrough pages) and packaging scripts.
- [`doc`](https://github.com/trypear/pearai-app/tree/main/doc): documentation (e.g. architecture)
- [`lib/common`](https://github.com/trypear/pearai-app/tree/main/lib/common): API definitions for the message and state protocol between the extension and the webview. Also contains shared types and utilities.
- [`lib/extension`](https://github.com/trypear/pearai-app/tree/main/lib/extension): The main extension logic.
- [`lib/webview`](https://github.com/trypear/pearai-app/tree/main/lib/webview): The webview. It is written using [React](https://reactjs.org/).
- [`template`](https://github.com/trypear/pearai-app/tree/main/template): PearAI Conversation Templates. Some are used in the extension, others are meant as examples for users.

## Extension Module: `lib/extension`

The entrypoint for the extension is [`extension.ts`](https://github.com/trypear/pearai-app/blob/main/lib/extension/src/extension.ts). It registers the commands and the webview panel. It also creates the chat model, panel and controller, which execute the main logic of the extension:

- [`ChatModel.ts`](https://github.com/trypear/pearai-app/blob/main/lib/extension/src/chat/ChatModel.ts): The chat model contains the different conversations and the currently active conversation.
- [`ChatPanel.ts`](https://github.com/trypear/pearai-app/blob/main/lib/extension/src/chat/ChatPanel.ts): The chat panel adds an abstraction layout over the webview panel o make it easier to use.
- [`ChatController.ts`](https://github.com/trypear/pearai-app/blob/main/lib/extension/src/chat/ChatController.ts): The chat controller handlers the different user actions, both from commands and from the webview. It executes logic, including chat creation, OpenAI API calls and updating the chat panel.
