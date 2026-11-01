# LocalClaude for VS Code

The AI of this VS Code build. It is [LocalClaude](https://github.com/partham20/localclaude) (Claude Code
through the official Agent SDK, on your **Claude subscription**) running inside the editor instead of in its
own window: chats, projects, artifacts, design, memory, MCP, backups and Remote Control, with everything
stored encrypted on this machine.

Copilot's built-in AI features start hidden in this build (`chat.disableAIFeatures` defaults to `true`), so
LocalClaude is the AI you see.

## Using it

- **Side bar**: the LocalClaude icon in the activity bar opens the chat (Ctrl+Alt+Space, Cmd+Alt+Space on a Mac).
  Drag the view to the secondary side bar if you prefer it on the right.
- **Editor tab**: the "Open in Editor Tab" button (or **LocalClaude: Open in Editor Tab**) gives the full
  layout with the chat list and the artifact panel side by side.
- **Ask About Selection** (Ctrl+Alt+K, or right-click in the editor): puts the selected code, with its file and
  line numbers, into the message box. Add your question and send.
- **Add File to Chat** (right-click a file in the explorer or the editor): adds an `@file` mention.
- **Fix Problems in This File**: puts the errors and warnings VS Code shows for the file into the message box.
- **New chats work in your workspace folder.** Projects created here also default to it.
- **Editor context**: with every message, Claude is told which file is open, what's selected (up to 6,000
  characters) and which other files are open. It isn't shown in the chat. Turn it off with
  `localclaude.includeEditorContext`.
- Files Claude changed open in the editor. Notifications appear when a reply finishes or Claude needs you while
  VS Code is in the background or the view is hidden.

### Claude-powered knowledge search (optional)

Settings → Memory & data → **Claude-powered knowledge search**. Off by default. When it's on, Claude helps find
things in project files, linked folders and your notes, instead of keyword (BM25) search alone, without an
embedding model. Each part can be switched separately:

- **Claude picks the best passages** (on): a search takes the 30 closest passages by wording, and one short
  request to Claude keeps the ones that answer the question. If Claude can't answer, the keyword order is used.
- **Research helper** (on): a subagent with only the knowledge tools. For questions that need many passages or
  long documents, the chat hands it the question; it searches and reads, then reports the facts with their source
  (file › section or `[Page n]`), copying register names, values and limits exactly. The chat's context stays
  focused. It uses the chat's model.
- **Write context for each passage** (off): when knowledge is indexed, Claude writes one line per passage
  saying where it sits and what it's about, and the line is searched with the passage. A datasheet page about
  `SQR1` gets found by "ADC" or "sequence length". Written once per document (about one request per 20
  passages), stored encrypted, and progress shows in Settings.
- **Model** for picking passages and writing context: Haiku by default.

These requests use your plan's usage like chats do. The code is in `src/host/smartKnowledge.ts`; it is part of
this build only, not the LocalClaude desktop app.

On first use, **Sign in with Claude** runs Claude Code's own `claude auth login --claudeai`. If you already use
`claude` in a terminal, you're signed in.

### Subscription use

Like the desktop app, every Claude Code process starts without `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`ANTHROPIC_BASE_URL` or the Bedrock/Vertex/Foundry switches, so requests go through your Claude.ai login.
As the LocalClaude README says, this is meant for **personal** use: Anthropic does not allow third-party
products to offer claude.ai login to other people without its approval (see the note in the
[Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)), so don't distribute builds for other
people to sign in with.

## How it's put together

The code base is LocalClaude's, almost unchanged. What runs where:

| LocalClaude desktop | Here |
|---|---|
| Electron main process (`src/main`) | the extension host: `src/host` (same modules) + `src/host/vscode` (VS Code wiring) |
| Renderer (`src/renderer`) | VS Code webviews: `src/webview` (same React app) |
| Preload + `ipcMain` | `src/preload` (unchanged API) over webview messaging: `src/webview/vscode/electron.ts` ⇄ `src/host/vscode/bridge.ts` |
| `artifact://`, `lcimg://` protocols | a loopback-only HTTP server with a random secret path: `src/host/vscode/server.ts` |
| Electron `safeStorage` | a key in VS Code's SecretStorage (the OS keychain) when there is one; decided once per install |
| Offscreen window for PDF/PNG export | Edge/Chrome/Chromium/Brave on this computer, headless, over the DevTools protocol: `src/host/vscode/designExport.ts` |

`electron` is aliased at build time to small stand-ins (`src/host/vscode/electronShim.ts` for the extension,
`src/webview/vscode/electron.ts` for the UI), so LocalClaude's modules keep importing what they always did.

### Differences from the desktop app

- **No computer use.** Claude would be able to click and type in VS Code itself, including its own permission
  prompts. The setting is replaced by a note.
- **Keyboard shortcuts** are VS Code keybindings, not a global shortcut.
- **PDF/PNG design export** needs a Chromium-based browser installed (Windows always has Edge). Set
  `localclaude.browserPath` if it isn't found.
- **Copying an image** copies the path of a temporary PNG file (VS Code's clipboard API is text only).
- **Image thumbnails** are the full images scaled by the browser (there is no image codec in the extension host).
- **Dropping files from the OS** onto the view copies them to a temporary folder first (a webview can't see a
  dropped file's path). Files dragged from VS Code's explorer are used where they are. The
  reliable way from the editor is **Add File to Chat**.
- Data lives in VS Code's global storage for the extension (`LocalClaude: Show Log` opens the log there), not in
  the desktop app's folder. Use the desktop app's export or backup and import it here to bring chats over.

## Building and testing

```bash
npm install                 # in this folder (the repository's own `npm install` does it too)
node ./esbuild.mts          # dist/extension.js and media/webview.{js,css}
npm test                    # LocalClaude's unit tests, against these modules
```

End-to-end, in a real VS Code with a scripted stand-in for Claude Code (no account needed):

```bash
VSCODE_EXECUTABLE=/path/to/code xvfb-run -a node test/e2e-vscode.mjs
```

Type checking uses the repository's TypeScript 7 (`tsconfig.json` for the extension, `tsconfig.webview.json` for
the UI). The VS Code build runs `esbuild.mts` and packages the native Claude Code binary for the target platform
(`@anthropic-ai/claude-agent-sdk-<platform>`) with the extension.
