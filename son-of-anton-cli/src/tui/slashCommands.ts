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
	listTools(): Promise<ReadonlyArray<{ name: string; description?: string; category?: string }>>;
	saveSnapshot(name?: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
	resumeSnapshot(): Promise<{ ok: true; messages: ReadonlyArray<TuiMessage> } | { ok: false; error: string }>;
	getConfigValue(key: string): unknown;
	setConfigValue(key: string, value: unknown): Promise<void>;
	listMemory(handle: string): ReadonlyArray<{ key: string; value: string; updatedAt: number }>;
	writeMemory(handle: string, key: string, value: string): void;
	clearMemory(handle: string): void;
	getActiveSpecialist(): string;
	requestExit(): void;
	/**
	 * H18 — attach an image to the next user turn. Returns the parsed
	 * attachment metadata so the dispatcher can confirm with size + name,
	 * or an error string when validation fails.
	 */
	attachImage(rawPath: string): { ok: true; name: string; sizeKb: number } | { ok: false; error: string };
	/** List the currently-pending attachments (name + size). */
	listAttachments(): ReadonlyArray<{ name: string; sizeBytes: number }>;
	/** Drop all pending attachments. */
	clearAttachments(): void;
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
			const grouped = new Map<string, Array<{ name: string; description?: string }>>();
			for (const tool of tools) {
				const bucket = tool.category ?? 'misc';
				if (!grouped.has(bucket)) {
					grouped.set(bucket, []);
				}
				grouped.get(bucket)!.push({ name: tool.name, description: tool.description });
			}
			const sections: string[] = [];
			for (const [category, members] of grouped) {
				sections.push(
					`${category}:\n${members
						.map((m) => `  ${m.name}${m.description ? ` — ${m.description}` : ''}`)
						.join('\n')}`,
				);
			}
			ctx.addSystemMessage(`Tools (${tools.length}):\n\n${sections.join('\n\n')}`);
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
		async run(args, ctx) {
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
			await ctx.setConfigValue(key, parsed);
			ctx.addSystemMessage(`${key} = ${JSON.stringify(parsed)}`);
		},
	},
	{
		name: '/memory',
		description: 'Inspect or write the active specialist\'s memory. /memory · /memory list · /memory write <key> <value> · /memory clear',
		usage: '/memory [list|write <key> <value>|clear]',
		run(args, ctx) {
			const handle = ctx.getActiveSpecialist();
			const verb = args[0] ?? 'list';

			if (verb === 'list' || args.length === 0) {
				const entries = ctx.listMemory(handle);
				if (entries.length === 0) {
					ctx.addSystemMessage(`No memories saved for @${handle}.`);
					return;
				}
				const formatted = entries
					.map((e) => {
						const ago = relativeAgo(e.updatedAt);
						return `  ${e.key.padEnd(24)} ${e.value} ${ago}`;
					})
					.join('\n');
				ctx.addSystemMessage(`Memories for @${handle} (${entries.length}):\n${formatted}`);
				return;
			}

			if (verb === 'clear') {
				ctx.clearMemory(handle);
				ctx.addSystemMessage(`Cleared memory for @${handle}.`);
				return;
			}

			if (verb === 'write') {
				if (args.length < 3) {
					ctx.addSystemMessage('Usage: /memory write <key> <value>');
					return;
				}
				const [, key, ...rest] = args;
				const value = rest.join(' ');
				ctx.writeMemory(handle, key, value);
				ctx.addSystemMessage(`Saved memory ${key} for @${handle}.`);
				return;
			}

			ctx.addSystemMessage('Usage: /memory list  ·  /memory write <key> <value>  ·  /memory clear');
		},
	},
	{
		name: '/attach',
		description: 'Attach an image to the next prompt. Usage: /attach <path> · /attach · /attach clear',
		usage: '/attach <path>',
		run(args, ctx) {
			// Bare `/attach` — print the current pending list and hints for
			// the supporting subcommands. Mirrors the IDE chat panel's
			// "you have N attached" affordance.
			if (args.length === 0) {
				const pending = ctx.listAttachments();
				if (pending.length === 0) {
					ctx.addSystemMessage('No attachments pending. Usage: /attach <path> · /attach clear');
					return;
				}
				const formatted = pending
					.map((a) => `  ${a.name} (${formatSizeKb(a.sizeBytes)})`)
					.join('\n');
				ctx.addSystemMessage(`${pending.length} attachment(s) queued for the next prompt:\n${formatted}\nType /attach clear to drop them.`);
				return;
			}
			if (args[0] === 'clear') {
				const had = ctx.listAttachments().length;
				ctx.clearAttachments();
				ctx.addSystemMessage(had === 0 ? 'No attachments to clear.' : `Cleared ${had} attachment(s).`);
				return;
			}
			// Path-mode — resolve, validate, and queue. The rest of the line
			// (after the command + first token) is joined back together so
			// filenames with embedded spaces still work when quoted by the
			// shell — we just stitch the tokens with a single space which
			// matches what the parser split.
			const rawPath = args.join(' ');
			const result = ctx.attachImage(rawPath);
			if (!result.ok) {
				ctx.addSystemMessage(`attach failed: ${result.error}`);
				return;
			}
			ctx.addSystemMessage(`attached ${result.name} (${result.sizeKb} KB)`);
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
 * Compact KB formatter used by the `/attach` confirmation line. We round
 * to whole KB for files >= 1KB (cheap and matches the transcript style)
 * and fall back to a `<1` indicator for tiny payloads so the message stays
 * truthful for icons / favicons.
 */
function formatSizeKb(sizeBytes: number): string {
	if (sizeBytes < 1024) {
		return '<1 KB';
	}
	return `${Math.round(sizeBytes / 1024)} KB`;
}

/**
 * Render a friendly relative timestamp ("2m ago" / "3h ago" / "yesterday")
 * for slash commands that surface a list of timestamped entries (memory,
 * resume picker peers). The fallback for very old entries is an ISO date
 * so the user can still tell roughly when something was written.
 */
function relativeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) {
		return 'just now';
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days}d ago`;
	}
	return new Date(timestamp).toISOString().slice(0, 10);
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
