---
description: Useful context to use when talking about inlining Copilot Chat with VS Code.
applyTo: '**'
---

We are working on inlining Copilot Chat into VS Code. This means we want to ship Copilot Chat as a built-in experience in VS Code, without requiring users to install a separate extension. This will allow us to reach more users and provide a more seamless experience.

We need to figure out the build pipelines, the local dev setup and the UX around running VS Code with Copilot Chat as builtin.

We've done the first step: simply add the vscode-copilot-chat repository as a submodule to extensions/copilot.
