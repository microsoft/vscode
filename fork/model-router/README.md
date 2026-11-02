# Fork model router

One streaming interface over any model a user adds with an **endpoint URL, an API key and a model name**. The rest of Fork (chat, inline edit, the agent) only ever sees `StreamEvent`s and never deals with a provider's request format.

| API format | Covers | Endpoint the URL resolves to |
| --- | --- | --- |
| `openai` | OpenAI, OpenRouter, Groq, Together, DeepSeek, Mistral, Ollama, LM Studio, vLLM, most gateways | `<url>/chat/completions` |
| `anthropic` | Anthropic | `<url>/v1/messages` (`/v1` optional in the URL) |
| `gemini` | Google Gemini API | `<url>/v1beta/models/<model>:streamGenerateContent` |

A full endpoint URL (ending in `/chat/completions`, `/messages` or `:streamGenerateContent`) works too, and query strings such as Azure's `api-version` are kept.

## What it handles

- Streaming text and tool calls, including tool-call arguments split across chunks.
- Tool results sent back in each provider's own shape. Gemini's thought signatures round-trip through `providerData`.
- Typed errors (`auth`, `not_found`, `rate_limit`, `bad_request`, `server`, `network`, `aborted`, `protocol`) that carry the provider's own message.
- HTTPS required; plain HTTP only for `localhost`. Local models need no key.
- `testConnection()`, run when a model is saved: checks reachability, the key, streaming and tool calling.
- `listModels()` for the model-name dropdown.
- `ModelRegistry`: assigns a model to each role (`chat`, `agent`, `edit`, `completion`). Agent and edit fall back to the chat model; tab completion never falls back.

## Use it

```ts
import { createModelClient } from './src/index.ts';

const client = createModelClient({
	id: 'local', displayName: 'Llama (local)', apiFormat: 'openai',
	baseUrl: 'http://localhost:11434/v1', model: 'llama3.1:8b',
});

for await (const event of client.stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
	if (event.type === 'text') { process.stdout.write(event.text); }
}
```

## Try a real model from the terminal

Needs Node 22.18 or newer, with no install step. The key is read from `FORK_API_KEY` so it stays out of your shell history.

```sh
cd fork/model-router
FORK_API_KEY=sk-... node scripts/try-model.ts --format openai --url https://openrouter.ai/api/v1 --model openai/gpt-4o-mini "Say hi"
FORK_API_KEY=sk-ant-... node scripts/try-model.ts --format anthropic --url https://api.anthropic.com --model claude-sonnet-4-5 --check
node scripts/try-model.ts --format openai --url http://localhost:11434/v1 --model llama3.1:8b "Say hi"
```

`--check` runs the connection test and prints the report.

## Develop

```sh
node --test test/*.test.ts     # 32 tests, no dependencies needed
npm install && npm run typecheck
```

The router has no runtime dependencies and uses only `fetch` and web streams, so it runs unchanged in Electron's main process, a utility process or a renderer.
