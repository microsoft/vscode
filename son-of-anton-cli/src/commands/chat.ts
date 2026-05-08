/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as readline from 'readline';
import { LlmClient, type LlmMessage, type ModelId } from 'son-of-anton-core/dist/llm/LlmClient';
import { bootstrapCredentials } from '../auth/bootstrap';
import { buildCliHost } from '../cliHost';
import type { CliConversation } from '../persistence/ConversationStore';
import { makeRenderer, type Renderer } from '../render/renderer';

interface ChatOptions {
	specialist: string;
	model: string;
	output: 'text' | 'json';
	tui?: boolean;
	resumeFrom?: CliConversation;
}

/**
 * Decide whether to render the Ink TUI for this invocation. The TUI is the
 * default when stdout is a real TTY and the user did not opt out via
 * `--no-tui` or `--output json`. Headless / piped invocations fall back to
 * the readline-based path so `sota chat | tee log.txt` keeps working.
 */
function shouldUseTui(opts: ChatOptions): boolean {
	if (opts.tui === false) {
		return false;
	}
	if (opts.output !== 'text') {
		return false;
	}
	return !!process.stdout.isTTY && !!process.stdin.isTTY;
}

/**
 * Resolve the user-supplied model id to the strongly-typed `ModelId` set.
 * Falls back to `'sonnet'` (the project's recommended balanced default) on an
 * unknown value so the REPL stays usable without making the user reach for the
 * full model id list.
 */
function resolveModelId(raw: string): ModelId {
	const known: ReadonlySet<ModelId> = new Set<ModelId>([
		// Anthropic
		'opus', 'sonnet', 'haiku',
		'claude-opus-4-7', 'claude-sonnet-4-7', 'claude-haiku-4-7',
		'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-6',
		'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
		'claude-opus-4-1', 'claude-sonnet-4-1', 'claude-opus-4', 'claude-sonnet-4',
		'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku',
		'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
		// OpenAI
		'gpt-4o', 'gpt-4o-mini',
		'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-codex',
		'gpt-4-1', 'gpt-4-1-mini', 'gpt-4-1-nano',
		'gpt-4-turbo', 'gpt-3-5-turbo',
		'o1', 'o1-mini', 'o1-pro', 'o3', 'o3-mini', 'o4-mini',
		// Foundry
		'foundry-gpt-4', 'foundry-gpt-4o', 'foundry-gpt-4o-mini',
		'foundry-gpt-4-1', 'foundry-gpt-4-1-mini', 'foundry-gpt-4-1-nano',
		'foundry-gpt-5', 'foundry-gpt-5-mini', 'foundry-gpt-5-nano',
		'foundry-o1', 'foundry-o1-mini', 'foundry-o3', 'foundry-o3-mini', 'foundry-o4-mini',
		'foundry-claude-sonnet', 'foundry-mistral-large',
		'foundry-llama-3-70b', 'foundry-phi-4', 'foundry-custom',
		// Bedrock
		'bedrock-claude-opus-4', 'bedrock-claude-sonnet-4', 'bedrock-claude-haiku-4',
		'bedrock-claude-3-7-sonnet',
		'bedrock-claude-sonnet', 'bedrock-claude-haiku',
		'bedrock-llama-3-1-70b', 'bedrock-llama-3-1-8b', 'bedrock-llama-3-70b',
		'bedrock-mistral-large', 'bedrock-titan-text-express',
		'bedrock-cohere-command-r-plus',
		'bedrock-nova-pro', 'bedrock-nova-lite', 'bedrock-nova-micro',
		// Gemini
		'gemini-2-5-pro', 'gemini-2-5-flash',
		'gemini-2-0-pro', 'gemini-2-0-flash', 'gemini-2-0-flash-lite',
		'gemini-1-5-pro', 'gemini-1-5-flash',
	]);
	return known.has(raw as ModelId) ? raw as ModelId : 'sonnet';
}

/**
 * Drive a single user-turn: stream the LLM response into the renderer and
 * accumulate the assistant text so it can be appended to the conversation
 * history. Errors are reported through the renderer rather than thrown so
 * the REPL stays alive across transient API failures.
 */
async function runUserTurn(
	llm: LlmClient,
	model: ModelId,
	messages: LlmMessage[],
	renderer: Renderer,
	specialistHandle: string,
): Promise<string> {
	let assistantText = '';
	try {
		for await (const event of llm.streamRequest({
			model,
			messages,
			agentHandle: specialistHandle,
		})) {
			if (event.type === 'token') {
				renderer.emit({ type: 'token', text: event.token });
				assistantText += event.token;
			} else if (event.type === 'tool-call') {
				renderer.emit({ type: 'tool_call_start', name: event.name, input: event.input });
			} else if (event.type === 'error') {
				renderer.emit({ type: 'error', message: event.error });
			}
			// 'complete' carries token usage we don't surface in the REPL today.
		}
		renderer.emit({ type: 'done' });
	} catch (err) {
		renderer.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
	}
	return assistantText;
}

export async function runChat(opts: ChatOptions): Promise<void> {
	const host = buildCliHost();

	const auth = await bootstrapCredentials(host);
	if (!auth.ok) {
		process.stderr.write(`error: ${auth.message}\n`);
		process.exit(1);
	}

	const model = resolveModelId(opts.model);
	const llm = new LlmClient(host.secrets, host.config);

	if (shouldUseTui(opts)) {
		await runChatTui({ llm, model, specialist: opts.specialist, resumeFrom: opts.resumeFrom });
		return;
	}

	const renderer = makeRenderer(opts.output);
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	if (opts.output === 'text') {
		process.stdout.write(`Son of Anton CLI · @${opts.specialist} · ${model}\n`);
		process.stdout.write(`Type 'exit' to quit.\n\n`);
	}
	rl.setPrompt('> ');
	rl.prompt();

	const messages: LlmMessage[] = [];
	let busy = false;

	rl.on('line', (line) => {
		if (busy) {
			// Drop input while a turn is in flight — readline has already
			// echoed the user's keystrokes; we just refuse to dispatch a
			// second concurrent request.
			return;
		}
		const input = line.trim();
		if (input === 'exit' || input === 'quit') {
			rl.close();
			return;
		}
		if (!input) {
			rl.prompt();
			return;
		}

		messages.push({ role: 'user', content: input });
		busy = true;

		void (async () => {
			const assistantText = await runUserTurn(llm, model, messages, renderer, opts.specialist);
			if (assistantText) {
				messages.push({ role: 'assistant', content: assistantText });
			} else {
				// Drop the orphaned user message on error so retries don't
				// double-stack the conversation.
				messages.pop();
			}
			busy = false;
			rl.prompt();
		})();
	});

	rl.on('close', () => {
		renderer.end();
		if (opts.output === 'text') {
			process.stdout.write('\nBye.\n');
		}
		process.exit(0);
	});
}

interface ChatTuiArgs {
	llm: LlmClient;
	model: ModelId;
	specialist: string;
	resumeFrom?: CliConversation;
}

/**
 * Mount the Ink-rendered chat TUI. Loaded via `require` rather than a static
 * import so that environments without React + Ink installed (or callers that
 * bypass the TUI by setting `--no-tui` / piping stdout) never pay the cost of
 * resolving the React tree.
 */
async function runChatTui(args: ChatTuiArgs): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const ink = require('ink') as typeof import('ink');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const React = require('react') as typeof import('react');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { ChatApp } = require('../tui/ChatApp') as typeof import('../tui/ChatApp');

	const { waitUntilExit } = ink.render(
		React.createElement(ChatApp, {
			llm: args.llm,
			model: args.model,
			specialist: args.specialist,
			resumeFrom: args.resumeFrom,
		}),
	);
	await waitUntilExit();
}
