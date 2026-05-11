/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as readline from 'readline';
import { LlmClient, type LlmContentPart, type LlmMessage, type ModelId } from 'son-of-anton-core/dist/llm/LlmClient';
import { bootstrapCredentials } from '../auth/bootstrap';
import { buildCliHost } from '../cliHost';
import type { CliConversation } from '../persistence/ConversationStore';
import { HookRunner, hooksFilePath } from '../persistence/HookRunner';
import { makeRenderer, type Renderer } from '../render/renderer';
import { loadAttachment, type PendingAttachment } from '../tui/attachments';
import { maybeNagAboutUpdate } from './update';

interface ChatOptions {
	specialist: string;
	model: string;
	output: 'text' | 'json';
	tui?: boolean;
	resumeFrom?: CliConversation;
	/**
	 * H18 — image paths supplied via `--attach`. Each value is resolved against
	 * `process.cwd()` and pre-loaded onto the first user turn so one-shot
	 * scripted invocations like `sota chat --attach foo.png "describe"` work
	 * without an interactive `/attach` step. Commander surfaces repeatable
	 * options as `string[]`; we accept either shape so the field can come
	 * straight off the parsed options bag.
	 */
	attach?: ReadonlyArray<string> | string;
	/**
	 * H18 — optional positional prompt joined from the trailing CLI args. When
	 * supplied alongside `--no-tui` the REPL fires this single turn and exits
	 * so scripted callers can do `sota chat --no-tui --attach foo.png "describe"`
	 * as a one-shot. Ignored in the TUI path (the user can just type the
	 * prompt directly).
	 */
	initialPrompt?: string;
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
	// One-shot mode (positional prompt) goes through the headless path so
	// the streamed response lands on stdout without Ink's full-screen takeover.
	if (opts.initialPrompt && opts.initialPrompt.trim().length > 0) {
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
		'claude-code-opus', 'claude-code-sonnet', 'claude-code-haiku',
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
		'gemini-3-1-pro-preview', 'gemini-3-1-flash-lite', 'gemini-3-1-flash-live-preview', 'gemini-3-flash-preview',
		'gemini-2-5-pro', 'gemini-2-5-flash',
		'gemini-2-0-pro', 'gemini-2-0-flash', 'gemini-2-0-flash-lite',
		'gemini-1-5-pro', 'gemini-1-5-flash',
		'gemini-deep-research-preview', 'gemini-deep-research-max-preview',
		'gemma-4-31b-it',
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

	// Fire-and-forget version check on startup. Capped at one network call
	// per 24h via the on-disk cache; we don't await so it never blocks the
	// REPL even on a slow connection.
	void maybeNagAboutUpdate();

	const auth = await bootstrapCredentials(host);
	if (!auth.ok) {
		process.stderr.write(`error: ${auth.message}\n`);
		process.exit(1);
	}

	const model = resolveModelId(opts.model);
	const llm = new LlmClient(host.secrets, host.config);

	// Construct a HookRunner only when the workspace is trusted AND a
	// `.son-of-anton/hooks.json` file is present. Skipping instantiation
	// (rather than relying on the runner's no-op behaviour for empty configs)
	// keeps cost zero for the common case where no hooks are configured.
	const workspaceRoot = host.workspace.folders[0]?.fsPath;
	const hookRunner = workspaceRoot && host.workspace.isTrusted && fs.existsSync(hooksFilePath(workspaceRoot))
		? new HookRunner(host)
		: undefined;

	// Pre-load attachments supplied via `--attach`. Validation failures here
	// are surfaced to stderr and exit non-zero so scripted callers see the
	// problem before they get billed for an LLM call against a half-formed
	// turn.
	const initialAttachments = loadInitialAttachments(opts.attach);
	if (!initialAttachments.ok) {
		process.stderr.write(`error: ${initialAttachments.error}\n`);
		process.exit(1);
	}

	if (shouldUseTui(opts)) {
		await runChatTui({
			llm,
			host,
			model,
			specialist: opts.specialist,
			resumeFrom: opts.resumeFrom,
			hookRunner,
			initialAttachments: initialAttachments.attachments,
		});
		return;
	}

	const renderer = makeRenderer(opts.output);
	const oneShotPrompt = opts.initialPrompt && opts.initialPrompt.trim().length > 0 ? opts.initialPrompt.trim() : undefined;
	const messages: LlmMessage[] = [];
	const pendingAttachments: PendingAttachment[] = [...initialAttachments.attachments];

	// H18 — one-shot mode. When a positional prompt was supplied, fire a
	// single turn (with any `--attach`ed images) and exit when it settles.
	// We skip readline entirely so the streamed response lands on stdout
	// without an interactive prompt indicator.
	if (oneShotPrompt) {
		const turnAttachments = pendingAttachments.splice(0, pendingAttachments.length);
		if (turnAttachments.length > 0) {
			if (opts.output === 'text') {
				for (const a of turnAttachments) {
					process.stdout.write(`attached ${a.name} (${Math.max(1, Math.round(a.sizeBytes / 1024))} KB)\n`);
				}
			}
			const parts: LlmContentPart[] = [
				...turnAttachments.map((a) => ({
					type: 'image' as const,
					mimeType: a.mime,
					base64Data: a.base64,
				})),
				{ type: 'text', text: oneShotPrompt },
			];
			messages.push({ role: 'user', content: parts });
		} else {
			messages.push({ role: 'user', content: oneShotPrompt });
		}
		await runUserTurn(llm, model, messages, renderer, opts.specialist);
		renderer.end();
		return;
	}

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	if (opts.output === 'text') {
		process.stdout.write(`Son of Anton CLI · @${opts.specialist} · ${model}\n`);
		process.stdout.write(`Type 'exit' to quit. '/attach <path>' to attach an image.\n\n`);
		// Surface the pre-loaded `--attach` attachments so scripted callers
		// have a confirmation line before any LLM call happens.
		for (const attachment of initialAttachments.attachments) {
			process.stdout.write(`attached ${attachment.name} (${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB)\n`);
		}
	}

	let busy = false;
	rl.setPrompt('> ');
	rl.prompt();

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

		// Headless `/attach` parity with the TUI. Same UX: bare command
		// prints the pending list, `clear` drains it, a path adds it.
		if (input.startsWith('/attach')) {
			handleAttachCommand(input, pendingAttachments, opts.output);
			rl.prompt();
			return;
		}

		const turnAttachments = pendingAttachments.splice(0, pendingAttachments.length);
		if (turnAttachments.length > 0) {
			const parts: LlmContentPart[] = [
				...turnAttachments.map((a) => ({
					type: 'image' as const,
					mimeType: a.mime,
					base64Data: a.base64,
				})),
				{ type: 'text', text: input },
			];
			messages.push({ role: 'user', content: parts });
			if (opts.output === 'text') {
				const noun = turnAttachments.length === 1 ? 'attachment' : 'attachments';
				const summary = turnAttachments
					.map((a) => `${a.name} (${Math.max(1, Math.round(a.sizeBytes / 1024))} KB)`)
					.join(', ');
				process.stdout.write(`📎 ${turnAttachments.length} ${noun}: ${summary}\n`);
			}
		} else {
			messages.push({ role: 'user', content: input });
		}
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
	host: ReturnType<typeof buildCliHost>;
	model: ModelId;
	specialist: string;
	resumeFrom?: CliConversation;
	hookRunner?: HookRunner;
	initialAttachments?: ReadonlyArray<PendingAttachment>;
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
			host: args.host,
			model: args.model,
			specialist: args.specialist,
			resumeFrom: args.resumeFrom,
			hookRunner: args.hookRunner,
			initialAttachments: args.initialAttachments,
		}),
	);
	await waitUntilExit();
}

/**
 * Load each path supplied via `--attach` into a `PendingAttachment`. Returns
 * a tagged result so the caller can stop the whole `runChat` flow on the
 * first validation failure — partial-success behaviour would be hard to
 * communicate clearly in a scripted scenario.
 */
function loadInitialAttachments(
	raw: ReadonlyArray<string> | string | undefined,
): { ok: true; attachments: ReadonlyArray<PendingAttachment> } | { ok: false; error: string } {
	if (!raw) {
		return { ok: true, attachments: [] };
	}
	const list = Array.isArray(raw) ? raw : [raw];
	const out: PendingAttachment[] = [];
	for (const path of list) {
		const result = loadAttachment(path, process.cwd());
		if (!result.ok) {
			return { ok: false, error: `--attach ${path}: ${result.error}` };
		}
		out.push(result.attachment);
	}
	return { ok: true, attachments: out };
}

/**
 * Headless `/attach` dispatcher used by the readline REPL. Mirrors the TUI
 * slash command verbatim — same parsing rules, same confirmation lines,
 * same `clear` behaviour — so users walking between TUI and `--no-tui`
 * sessions don't have to relearn the surface.
 */
function handleAttachCommand(
	input: string,
	pending: PendingAttachment[],
	output: 'text' | 'json',
): void {
	const tokens = input.trim().split(/\s+/);
	const args = tokens.slice(1);
	const write = (line: string): void => {
		if (output === 'text') {
			process.stdout.write(`${line}\n`);
		}
	};
	if (args.length === 0) {
		if (pending.length === 0) {
			write('No attachments pending. Usage: /attach <path>  ·  /attach clear');
			return;
		}
		write(`${pending.length} attachment(s) queued for the next prompt:`);
		for (const a of pending) {
			const kb = Math.max(1, Math.round(a.sizeBytes / 1024));
			write(`  ${a.name} (${kb} KB)`);
		}
		write('Type /attach clear to drop them.');
		return;
	}
	if (args[0] === 'clear') {
		const had = pending.length;
		pending.length = 0;
		write(had === 0 ? 'No attachments to clear.' : `Cleared ${had} attachment(s).`);
		return;
	}
	const rawPath = args.join(' ');
	const result = loadAttachment(rawPath, process.cwd());
	if (!result.ok) {
		write(`attach failed: ${result.error}`);
		return;
	}
	pending.push(result.attachment);
	const kb = Math.max(1, Math.round(result.attachment.sizeBytes / 1024));
	write(`attached ${result.attachment.name} (${kb} KB)`);
}
