/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Slash-command catalogue for the chat TUI. Handlers receive a context object
 * exposing the bits of REPL state they need to mutate (transcript, model,
 * specialist, conversation snapshot store) so commands stay testable and the
 * registry has no dependency on React itself.
 *
 * Phase CLI2 ships the catalogue + tab completion. Some handlers are stubbed
 * with a sensible feedback message until later phases land their backing
 * stores (e.g. `/save` and `/resume` get persistence in CLI3).
 */

import type { TuiMessage } from './types';

export interface SlashCommandContext {
	addSystemMessage(text: string): void;
	clearTranscript(): void;
	startNewConversation(): void;
	setModel(model: string): void;
	setSpecialist(handle: string): void;
	togglePlanMode(): void;
	listTools(): Promise<ReadonlyArray<{ name: string; description?: string }>>;
	saveSnapshot(name?: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
	resumeSnapshot(): Promise<{ ok: true; messages: ReadonlyArray<TuiMessage> } | { ok: false; error: string }>;
	getConfigValue(key: string): unknown;
	setConfigValue(key: string, value: unknown): void;
	requestExit(): void;
}

export interface SlashCommand {
	name: string;
	description: string;
	usage?: string;
	run(args: ReadonlyArray<string>, ctx: SlashCommandContext): Promise<void> | void;
}

/**
 * The ordered list of built-in slash commands. Order is preserved when
 * surfaced in the palette so the most useful commands stay near the top.
 */
export const BUILT_IN_SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
	{
		name: '/help',
		description: 'List the available slash commands.',
		run(_args, ctx) {
			const lines = BUILT_IN_SLASH_COMMANDS
				.map((c) => `  ${c.name.padEnd(14)} ${c.description}`)
				.join('\n');
			ctx.addSystemMessage(`Slash commands:\n${lines}`);
		},
	},
	{
		name: '/clear',
		description: 'Clear the transcript (keeps the conversation history).',
		run(_args, ctx) {
			ctx.clearTranscript();
		},
	},
	{
		name: '/new',
		description: 'Start a fresh conversation (drops history + memory scope).',
		run(_args, ctx) {
			ctx.startNewConversation();
			ctx.addSystemMessage('Started a new conversation.');
		},
	},
	{
		name: '/model',
		description: 'Switch the active model. Usage: /model sonnet',
		usage: '/model <model-id>',
		run(args, ctx) {
			if (args.length === 0) {
				ctx.addSystemMessage('Usage: /model <model-id>');
				return;
			}
			const model = args[0];
			ctx.setModel(model);
			ctx.addSystemMessage(`Model switched to ${model}.`);
		},
	},
	{
		name: '/specialist',
		description: 'Switch the active specialist. Usage: /specialist anton-code',
		usage: '/specialist <handle>',
		run(args, ctx) {
			if (args.length === 0) {
				ctx.addSystemMessage('Usage: /specialist <handle>');
				return;
			}
			const handle = args[0].replace(/^@/, '');
			ctx.setSpecialist(handle);
			ctx.addSystemMessage(`Specialist switched to @${handle}.`);
		},
	},
	{
		name: '/plan',
		description: 'Toggle plan mode (orchestrator drafts a plan before acting).',
		run(_args, ctx) {
			ctx.togglePlanMode();
		},
	},
	{
		name: '/tools',
		description: 'List the tools available to the active specialist.',
		async run(_args, ctx) {
			const tools = await ctx.listTools();
			if (tools.length === 0) {
				ctx.addSystemMessage('No tools registered.');
				return;
			}
			const body = tools
				.map((t) => `  ${t.name}${t.description ? ` — ${t.description}` : ''}`)
				.join('\n');
			ctx.addSystemMessage(`Tools:\n${body}`);
		},
	},
	{
		name: '/save',
		description: 'Save a snapshot of the current conversation. Usage: /save [name]',
		usage: '/save [name]',
		async run(args, ctx) {
			const result = await ctx.saveSnapshot(args[0]);
			if (result.ok) {
				ctx.addSystemMessage(`Saved as ${result.id}.`);
			} else {
				ctx.addSystemMessage(`Save failed: ${result.error}`);
			}
		},
	},
	{
		name: '/resume',
		description: 'Resume the most recently saved conversation snapshot.',
		async run(_args, ctx) {
			const result = await ctx.resumeSnapshot();
			if (result.ok) {
				ctx.addSystemMessage(`Restored ${result.messages.length} message(s).`);
			} else {
				ctx.addSystemMessage(`Resume failed: ${result.error}`);
			}
		},
	},
	{
		name: '/config',
		description: 'Read or set a config value. Usage: /config get sota.model · /config set sota.model sonnet',
		usage: '/config get|set <key> [value]',
		run(args, ctx) {
			if (args.length === 0 || (args[0] !== 'get' && args[0] !== 'set')) {
				ctx.addSystemMessage('Usage: /config get <key>  ·  /config set <key> <value>');
				return;
			}
			if (args[0] === 'get') {
				if (args.length < 2) {
					ctx.addSystemMessage('Usage: /config get <key>');
					return;
				}
				const value = ctx.getConfigValue(args[1]);
				ctx.addSystemMessage(`${args[1]} = ${JSON.stringify(value)}`);
				return;
			}
			if (args.length < 3) {
				ctx.addSystemMessage('Usage: /config set <key> <value>');
				return;
			}
			const [, key, ...rest] = args;
			const raw = rest.join(' ');
			let parsed: unknown = raw;
			try {
				parsed = JSON.parse(raw);
			} catch {
				// Fall back to the raw string when the value isn't JSON.
			}
			ctx.setConfigValue(key, parsed);
			ctx.addSystemMessage(`${key} = ${JSON.stringify(parsed)}`);
		},
	},
	{
		name: '/quit',
		description: 'Exit the chat session.',
		run(_args, ctx) {
			ctx.requestExit();
		},
	},
	{
		name: '/exit',
		description: 'Alias for /quit.',
		run(_args, ctx) {
			ctx.requestExit();
		},
	},
];

/**
 * Parse a raw input line into `[command, ...args]` if it begins with `/`.
 * Returns `null` for plain prompts so the caller can dispatch to the LLM.
 */
export function parseSlash(input: string): { name: string; args: ReadonlyArray<string> } | null {
	if (!input.startsWith('/')) {
		return null;
	}
	const tokens = input.trim().split(/\s+/);
	const [name, ...args] = tokens;
	return { name, args };
}

/**
 * Look up a command by exact name, then by unique prefix. Returns `null` when
 * the prefix is ambiguous so the caller can surface a "did you mean…" prompt.
 */
export function findCommand(name: string): SlashCommand | null | 'ambiguous' {
	const lower = name.toLowerCase();
	const exact = BUILT_IN_SLASH_COMMANDS.find((c) => c.name === lower);
	if (exact) {
		return exact;
	}
	const matches = BUILT_IN_SLASH_COMMANDS.filter((c) => c.name.startsWith(lower));
	if (matches.length === 1) {
		return matches[0];
	}
	if (matches.length > 1) {
		return 'ambiguous';
	}
	return null;
}

/**
 * Filter the command list against a partial slash-prefix for the palette
 * overlay. An empty filter (`/`) returns all commands.
 */
export function filterCommands(prefix: string): ReadonlyArray<SlashCommand> {
	const lower = prefix.toLowerCase();
	if (lower === '/' || lower === '') {
		return BUILT_IN_SLASH_COMMANDS;
	}
	return BUILT_IN_SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(lower));
}
