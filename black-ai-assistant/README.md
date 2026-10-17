# Black AI Assistant

A semi-independent AI coding assistant for VS Code powered by Gemini.

## Features

- Ask questions about the active file and selection
- Use project context from the current editor
- Generate and explain code in a practical way
- Upload local files and include them in the AI request
- Insert the last AI response directly into the active editor
- Clean dark interface with custom VS Code webview styling

## Setup

1. Open VS Code settings.
2. Search for `Black AI Assistant`.
3. Add your Gemini API key under `blackAiAssistant.apiKey`.
4. Run the command: `Black AI: Open Chat`.

## Notes

This module is intentionally designed as an independent AI assistant with its own identity, not a direct clone of GitHub Copilot. It is built as a standalone product focused on code help and practical workflows.

## Development

```bash
cd black-ai-assistant
npm install
npm run compile
```

Then press `F5` in VS Code to launch the extension host.
