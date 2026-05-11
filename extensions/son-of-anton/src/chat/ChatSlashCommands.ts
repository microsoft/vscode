/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelId } from 'son-of-anton-core/llm/LlmClient';
import { SPECIALIST_ROLES, getSpecialist } from 'son-of-anton-core/chat/specialistRegistry';
import { ChatMode } from 'son-of-anton-core/agents/agentEvents';

export interface SlashCommandContext {
	getSpecialistId(): string;
	setSpecialistId(id: string): void;
	getModel(): ModelId;
	setModel(id: ModelId): void;
	getMode(): ChatMode;
	setMode(mode: ChatMode): void;
	clearConversation(): Promise<void>;
	getProviderStatus(): Promise<{ name: string; connected: boolean }[]>;
}

export interface SlashCommandResult {
	output: string;
	handled: boolean;
	/**
	 * Side-channel signal for commands that need to trigger an orchestrator
	 * action after the dispatcher returns. `/approve` and `/reject` both
	 * use this — the caller routes the next turn through the orchestrator's
	 * `command='approve' | 'reject'` branch instead of treating the raw
	 * text as a user prompt.
	 */
	action?: 'approve' | 'reject';
}

// Mirrors the `ModelId` union from `LlmClient.ts`. The literal union is a
// compile-time construct only — we duplicate it here as a runtime list so
// `/model` can validate user input. If the union grows, this list must grow
// with it; the `satisfies ReadonlyArray<ModelId>` check keeps them in sync.
const ALL_MODELS = [
	'opus', 'sonnet', 'haiku',
	'claude-opus-4-7', 'claude-sonnet-4-7', 'claude-haiku-4-7',
	'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-6',
	'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
	'claude-opus-4-1', 'claude-sonnet-4-1', 'claude-opus-4', 'claude-sonnet-4',
	'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku',
	'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
	'gpt-4o', 'gpt-4o-mini',
	'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-codex',
	'gpt-4-1', 'gpt-4-1-mini', 'gpt-4-1-nano',
	'gpt-4-turbo', 'gpt-3-5-turbo',
	'o1', 'o1-mini', 'o1-pro', 'o3', 'o3-mini', 'o4-mini',
	'foundry-gpt-4', 'foundry-gpt-4o', 'foundry-gpt-4o-mini',
	'foundry-gpt-4-1', 'foundry-gpt-4-1-mini', 'foundry-gpt-4-1-nano',
	'foundry-gpt-5', 'foundry-gpt-5-mini', 'foundry-gpt-5-nano',
	'foundry-o1', 'foundry-o1-mini', 'foundry-o3', 'foundry-o3-mini', 'foundry-o4-mini',
	'foundry-claude-sonnet', 'foundry-mistral-large',
	'foundry-llama-3-70b', 'foundry-phi-4', 'foundry-custom',
	'bedrock-claude-opus-4', 'bedrock-claude-sonnet-4', 'bedrock-claude-haiku-4',
	'bedrock-claude-3-7-sonnet',
	'bedrock-claude-sonnet', 'bedrock-claude-haiku',
	'bedrock-llama-3-1-70b', 'bedrock-llama-3-1-8b', 'bedrock-llama-3-70b',
	'bedrock-mistral-large', 'bedrock-titan-text-express',
	'bedrock-cohere-command-r-plus',
	'bedrock-nova-pro', 'bedrock-nova-lite', 'bedrock-nova-micro',
	'gemini-2-5-pro', 'gemini-2-5-flash',
	'gemini-2-0-pro', 'gemini-2-0-flash', 'gemini-2-0-flash-lite',
	'gemini-1-5-pro', 'gemini-1-5-flash',
] as const satisfies ReadonlyArray<ModelId>;

const MODEL_SET: ReadonlySet<string> = new Set(ALL_MODELS);

export interface CommandDescriptor {
	readonly name: string;
	readonly args: string;
	readonly description: string;
}

// Single source of truth that drives both `/help` output AND the dispatch
// switch below. Keep names lowercase — the parser lowercases the input
// command before lookup.
export const COMMANDS: ReadonlyArray<CommandDescriptor> = [
	{ name: '/help', args: '', description: 'Show this list of commands' },
	{ name: '/clear', args: '', description: 'Clear the current conversation' },
	{ name: '/specialist', args: '<id>', description: 'Switch the active specialist (e.g. /specialist anton-code)' },
	{ name: '/model', args: '<id>', description: 'Switch the active model (e.g. /model sonnet)' },
	{ name: '/agents', args: '', description: 'List registered specialists with handles and descriptions' },
	{ name: '/status', args: '', description: 'Show current specialist, model, and provider connection state' },
	{ name: '/plan', args: '', description: 'Switch to Plan mode — Anton drafts a plan without executing tools' },
	{ name: '/act', args: '', description: 'Switch to Act mode — plan and execute (default)' },
	{ name: '/approve', args: '', description: 'Execute the orchestrator\'s most recently proposed plan' },
	{ name: '/reject', args: '', description: 'Discard the orchestrator\'s most recently proposed plan' },
];

/**
 * Pure helper exposing the slash-command catalogue so the webview can render
 * an autocomplete popup without duplicating the list. Callers receive a
 * defensive shallow copy — mutation is safe even though the source is
 * `ReadonlyArray<CommandDescriptor>`.
 */
export function getCommandList(): CommandDescriptor[] {
	return COMMANDS.map(c => ({ name: c.name, args: c.args, description: c.description }));
}

export async function parseAndDispatch(
	rawInput: string,
	ctx: SlashCommandContext,
): Promise<SlashCommandResult> {
	const trimmed = rawInput.trimStart();
	if (!trimmed.startsWith('/')) {
		return { handled: false, output: '' };
	}

	const firstWhitespace = trimmed.search(/\s/);
	const commandToken = firstWhitespace === -1 ? trimmed : trimmed.slice(0, firstWhitespace);
	const remainder = firstWhitespace === -1 ? '' : trimmed.slice(firstWhitespace + 1).trim();
	const command = commandToken.toLowerCase();

	switch (command) {
		case '/help':
			return { handled: true, output: renderHelp() };
		case '/clear':
			await ctx.clearConversation();
			// The conversation is cleared by the host; returning empty output
			// avoids posting a stale system message into a fresh history.
			return { handled: true, output: '' };
		case '/specialist':
			return { handled: true, output: handleSpecialist(remainder, ctx) };
		case '/model':
			return { handled: true, output: handleModel(remainder, ctx) };
		case '/agents':
			return { handled: true, output: renderAgents() };
		case '/status':
			return { handled: true, output: await renderStatus(ctx) };
		case '/plan':
			return { handled: true, output: handleMode('plan', ctx) };
		case '/act':
			return { handled: true, output: handleMode('act', ctx) };
		case '/approve':
			// No textual output — the caller fires an orchestrator turn with
			// `command='approve'` which streams its own "Plan approved.
			// Executing subtasks..." preamble via the orchestrator pipeline.
			return { handled: true, output: '', action: 'approve' };
		case '/reject':
			// Symmetric with `/approve`: the caller fires an orchestrator
			// turn with `command='reject'` which discards `activePlan` and
			// emits a `plan-rejected` event for the task-board surface.
			return { handled: true, output: '', action: 'reject' };
		default:
			return { handled: false, output: '' };
	}
}

function handleMode(mode: ChatMode, ctx: SlashCommandContext): string {
	const current = ctx.getMode();
	if (current === mode) {
		return mode === 'plan'
			? 'Already in **Plan** mode. Anton will draft a plan without running any tools.'
			: 'Already in **Act** mode. Anton will plan and execute as needed.';
	}
	ctx.setMode(mode);
	return mode === 'plan'
		? 'Switched to **Plan** mode. Anton will draft a plan but won\'t run any tools until you switch back to Act.'
		: 'Switched to **Act** mode. Anton will plan and execute as needed.';
}

function renderHelp(): string {
	const rows = COMMANDS.map(c => {
		const usage = c.args ? `${c.name} ${c.args}` : c.name;
		return `- \`${usage}\` — ${c.description}`;
	});
	return ['**Available commands:**', '', ...rows].join('\n');
}

function handleSpecialist(arg: string, ctx: SlashCommandContext): string {
	if (!arg) {
		return 'Usage: `/specialist <id>` — e.g. `/specialist anton-code`. Use `/agents` to list available specialists.';
	}
	// Tolerate an optional leading '@' since chat handles use that prefix in
	// the orchestrator's plan output and users may copy them verbatim.
	const id = arg.startsWith('@') ? arg.slice(1) : arg;
	const specialist = getSpecialist(id);
	if (!specialist) {
		return `Unknown specialist: \`${id}\`. Use \`/agents\` to list available specialists.`;
	}
	ctx.setSpecialistId(specialist.id);
	return `Switched specialist to **${specialist.displayName}** (\`${specialist.id}\`).`;
}

function handleModel(arg: string, ctx: SlashCommandContext): string {
	if (!arg) {
		return 'Usage: `/model <id>` — e.g. `/model sonnet`. Use `/help` for the full list.';
	}
	if (!MODEL_SET.has(arg)) {
		const available = ALL_MODELS.map(m => `\`${m}\``).join(', ');
		return `Unknown model: \`${arg}\`.\n\nAvailable models: ${available}.`;
	}
	const id = arg as ModelId;
	ctx.setModel(id);
	return `Switched model to **${id}**.`;
}

function renderAgents(): string {
	const rows = SPECIALIST_ROLES.map(r => `- \`@${r.id}\` — **${r.displayName}**: ${r.description}`);
	return ['**Registered specialists:**', '', ...rows].join('\n');
}

async function renderStatus(ctx: SlashCommandContext): Promise<string> {
	const specialistId = ctx.getSpecialistId();
	const specialist = getSpecialist(specialistId);
	const specialistLabel = specialist ? `${specialist.displayName} (\`${specialist.id}\`)` : `\`${specialistId}\``;
	const model = ctx.getModel();

	const lines: string[] = [
		'**Status:**',
		'',
		`- Specialist: ${specialistLabel}`,
		`- Model: \`${model}\``,
	];

	let providers: { name: string; connected: boolean }[] = [];
	try {
		providers = await ctx.getProviderStatus();
	} catch {
		// Best-effort — surface a hint rather than an error so the rest of the
		// status output still renders cleanly.
		lines.push('- Providers: _unavailable_');
		return lines.join('\n');
	}

	if (providers.length === 0) {
		lines.push('- Providers: _none reported_');
	} else {
		const provLines = providers.map(p => `  - ${p.connected ? '[connected]' : '[disconnected]'} ${p.name}`);
		lines.push('- Providers:');
		lines.push(...provLines);
	}

	return lines.join('\n');
}
