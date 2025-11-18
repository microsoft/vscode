---
title: Chat Usage
---

# Chat Usage Guide

This guide explains how to start using the chat, configure your API key, and integrate custom context sources.

## Opening the Chat Bar

1. Click the **Chat** icon in the Activity Bar.
2. Or run the `Chat: Focus on Chat` command from the Command Palette.
3. The chat view opens at the side of the editor where you can begin asking questions.

> Screenshot of the chat interface is available in the online documentation.

## Configure the API Key

The chat connects to a language model using an API key.

1. Open **Settings** and search for `chat.apiKey`.
2. Paste your API key and save.
3. The key is stored securely using the Secret Storage service.

## Typical Workflows

- **Ask about code** – Highlight code in the editor and press `Ctrl+Shift+\` to send it to chat.
- **Generate tests** – Use the prompt `Generate tests for the current file`.
- **Explain errors** – Paste terminal output or stack traces and ask for an explanation.

## Custom Context Sources

Extensions can provide additional context to chat sessions. Use hooks such as `onContextCollect` to contribute data:

```ts
// extension.ts
import { chat } from 'vscode';

chat.onContextCollect(event => {
    event.collect({
        title: 'Selected Test File',
        uri: event.editor.document.uri
    });
});
```

This hook runs before a request is sent and lets you enrich the model input with data from your extension.

Other hooks:

- `onRequestStart`: inspect or modify a request before it is dispatched.
- `onResponse`: read the streaming response and provide UI updates.

With these hooks, extensions can integrate their own signals, telemetry, or custom file types into chat.

## Next Steps

Read the [Chat Architecture](architecture.md) guide to learn how messages flow through the system.

