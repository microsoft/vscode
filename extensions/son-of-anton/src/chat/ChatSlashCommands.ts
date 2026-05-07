/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ModelId } from '../llm/LlmClient';
import { SPECIALIST_ROLES, getSpecialist } from './specialistRegistry';

export interface SlashCommandContext {
	getSpecialistId(): string;
	setSpecialistId(id: string): void;
	getModel(): ModelId;
	setModel(id: ModelId): void;
	clearConversation(): Promise<void>;
	getProviderStatus(): Promise<{ name: string; connected: boolean }[]>;
}

export interface SlashCommandResult {
	output: string;
	handled: boolean;
}

// Mirrors the `ModelId` union from `LlmClient.ts`. The literal union is a
// compile-time construct only — we duplicate it here as a runtime list so
// `/model` can validate user input. If the union grows, this list must grow
// with it; the `satisfies ReadonlyArray<ModelId>` check keeps them in sync.
const ALL_MODELS = [
	'opus',
	'sonnet',
	'haiku',
	'gpt-4o',
	'gpt-4o-mini',
	'gpt-5-codex',
	'foundry-gpt-4o',
	'foundry-gpt-4o-mini',
	'foundry-claude-sonnet',
	'bedrock-claude-sonnet',
	'bedrock-claude-haiku',
	'gemini-1-5-pro',
	'gemini-1-5-flash',
	'gemini-2-0-flash',
] as const satisfies ReadonlyArray<ModelId>;

const MODEL_SET: ReadonlySet<string> = new Set(ALL_MODELS);

interface CommandDescriptor {
	readonly name: string;
	readonly args: string;
	readonly description: string;
}

// Single source of truth that drives both `/help` output AND the dispatch
// switch below. Keep names lowercase — the parser lowercases the input
// command before lookup.
const COMMANDS: ReadonlyArray<CommandDescriptor> = [
	{ name: '/help', args: '', description: 'Show this list of commands' },
	{ name: '/clear', args: '', description: 'Clear the current conversation' },
	{ name: '/specialist', args: '<id>', description: 'Switch the active specialist (e.g. /specialist anton-code)' },
	{ name: '/model', args: '<id>', description: 'Switch the active model (e.g. /model sonnet)' },
	{ name: '/agents', args: '', description: 'List registered specialists with handles and descriptions' },
	{ name: '/status', args: '', description: 'Show current specialist, model, and provider connection state' },
];

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
		default:
			return { handled: false, output: '' };
	}
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
