/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { IModelPickerPrototypeConfigurationSection, IModelPickerPrototypeSource, ModelPickerPrototype, ModelPickerPrototypeHarness } from './modelPickerPrototype.js';
import './modelPickerPrototype.fixture.css';

// Copilot-style credits per 1M tokens. Anchored so the frontier tier matches
// Claude Opus (500 in / 2500 out); cache read is 10% of input and cache write 125%.
const budgetCredits = {
	default: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 4 },
};

const efficientCredits = {
	default: { input: 10, output: 50, cacheRead: 1, cacheWrite: 13 },
	longContext: { input: 20, output: 100, cacheRead: 2, cacheWrite: 25 },
};

const standardCredits = {
	default: { input: 40, output: 200, cacheRead: 4, cacheWrite: 50 },
	longContext: { input: 80, output: 400, cacheRead: 8, cacheWrite: 100 },
};

const premiumCredits = {
	default: { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
	longContext: { input: 200, output: 1000, cacheRead: 20, cacheWrite: 250 },
};

const frontierCredits = {
	default: { input: 500, output: 2500, cacheRead: 50, cacheWrite: 625 },
	longContext: { input: 1000, output: 5000, cacheRead: 100, cacheWrite: 1250 },
};

// PROPOSED — not in the API today. `buildConfigurationSchema` returns `{}` for
// `AutoChatEndpoint` and the CLI's `buildAutoModel` ships no schema, so Auto is
// currently unconfigurable. Modelled here as a routing tier pending the real shape.
const automaticRoutingConfiguration: readonly IModelPickerPrototypeConfigurationSection[] = [{
	id: 'routingTier',
	label: 'Routing',
	description: 'Choose how Auto balances speed, capability, and usage.',
	defaultValue: 'balanced',
	options: [
		{ id: 'eco', label: 'Eco', shortLabel: 'Eco', description: 'Fast models for routine work' },
		{ id: 'balanced', label: 'Balanced', shortLabel: 'Balanced', description: 'Balances capability and usage' },
		{ id: 'max', label: 'Max', shortLabel: 'Max', description: 'Most capable for complex work' },
	],
}];

// Mirrors the production `configurationSchema` builders (`languageModelAccess.ts`,
// `copilotCli.ts`, `claudeCodeModels.ts`), which emit exactly two properties:
// reasoning effort and context size. Effort levels and descriptions come from
// `getReasoningEffortDescription`.
const thinkingEffortConfiguration: readonly IModelPickerPrototypeConfigurationSection[] = [{
	id: 'reasoningEffort',
	label: 'Thinking Effort',
	description: 'Control how much reasoning the model uses before responding.',
	defaultValue: 'medium',
	options: [
		{ id: 'low', label: 'Low', description: 'Faster responses with less reasoning' },
		{ id: 'medium', label: 'Medium', description: 'Balanced reasoning and speed' },
		{ id: 'high', label: 'High', description: 'Greater reasoning depth but slower' },
	],
}];

const extendedThinkingEffortConfiguration: readonly IModelPickerPrototypeConfigurationSection[] = [{
	...thinkingEffortConfiguration[0],
	options: [
		...thinkingEffortConfiguration[0].options,
		{ id: 'xhigh', label: 'Extra high', description: 'Highest reasoning depth but slowest' },
	],
}];

const flexibleThinkingEffortConfiguration: readonly IModelPickerPrototypeConfigurationSection[] = [{
	...thinkingEffortConfiguration[0],
	options: [
		{ id: 'minimal', label: 'Minimal', description: 'Minimal reasoning for fastest responses' },
		...thinkingEffortConfiguration[0].options,
	],
}];

function contextConfiguration(standardWindow: string, extendedWindow: string): IModelPickerPrototypeConfigurationSection {
	return {
		id: 'contextSize',
		label: 'Context',
		description: 'Choose how much session context the model can consider.',
		defaultValue: 'standard',
		options: [
			{ id: 'standard', label: 'Standard', shortLabel: standardWindow, description: `Default context window of ${standardWindow}` },
			{ id: 'extended', label: 'Extended', shortLabel: extendedWindow, description: `Extended context window of ${extendedWindow}`, usesLongContext: true },
		],
	};
}

const extendedContextConfiguration = contextConfiguration('200K', '1M');
const wideContextConfiguration = contextConfiguration('1M', '2M');
const compactContextConfiguration = contextConfiguration('128K', '400K');

const thinkingAndContextConfiguration = [...thinkingEffortConfiguration, extendedContextConfiguration];
const extendedThinkingAndContextConfiguration = [...extendedThinkingEffortConfiguration, extendedContextConfiguration];
const flexibleThinkingAndContextConfiguration = [...flexibleThinkingEffortConfiguration, wideContextConfiguration];

const contextOnlyConfiguration = [compactContextConfiguration];

const sources: readonly IModelPickerPrototypeSource[] = [
	{
		id: 'copilot',
		label: 'Copilot',
		icon: Codicon.copilotCompact,
		groupBy: 'capability',
		account: 'GitHub Copilot',
		models: [
			{ id: 'copilot-auto', label: 'Auto', creator: 'Copilot', icon: Codicon.copilotCompact, ungrouped: true, isAuto: true, configuration: automaticRoutingConfiguration, compatibleHarnesses: ['copilot'] },
			{ id: 'gemini-31-pro', label: 'Gemini 3.1 Pro', recommended: true, category: 'powerful', priceCategory: 'medium', creator: 'Google', icon: Codicon.googleGemini, configuration: flexibleThinkingAndContextConfiguration, creditCosts: standardCredits, compatibleHarnesses: ['copilot'] },
			{ id: 'gemini-35-flash', label: 'Gemini 3.5 Flash', recentRank: 3, category: 'lightweight', priceCategory: 'low', creator: 'Google', icon: Codicon.googleGemini, configuration: flexibleThinkingAndContextConfiguration, creditCosts: efficientCredits, compatibleHarnesses: ['copilot'] },
			{ id: 'gemini-36-flash-lite', label: 'Gemini 3.6 Flash Lite', category: 'lightweight', priceCategory: 'low', creator: 'Google', icon: Codicon.googleGemini, configuration: contextOnlyConfiguration, creditCosts: budgetCredits, compatibleHarnesses: ['copilot'] },
			{ id: 'gpt-5-mini', label: 'GPT-5 mini', recentRank: 4, category: 'lightweight', priceCategory: 'low', creator: 'OpenAI', icon: Codicon.openai, configuration: thinkingEffortConfiguration, creditCosts: efficientCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'gpt-53-codex', label: 'GPT-5.3-Codex', recentRank: 1, category: 'versatile', priceCategory: 'medium', creator: 'OpenAI', icon: Codicon.openai, pinned: true, configuration: extendedThinkingAndContextConfiguration, creditCosts: standardCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'gpt-54', label: 'GPT-5.4', pinned: true, category: 'versatile', priceCategory: 'medium', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: standardCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'gpt-54-mini', label: 'GPT-5.4 mini', category: 'lightweight', priceCategory: 'low', creator: 'OpenAI', icon: Codicon.openai, configuration: thinkingAndContextConfiguration, creditCosts: efficientCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'gpt-55', label: 'GPT-5.5', recentRank: 2, category: 'powerful', priceCategory: 'high', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: premiumCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'gpt-56-luna', label: 'GPT-5.6 Luna', category: 'powerful', priceCategory: 'high', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: premiumCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'gpt-56-terra-copilot', label: 'GPT-5.6 Terra', category: 'powerful', priceCategory: 'high', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: premiumCredits, compatibleHarnesses: ['copilot', 'codex'] },
			{ id: 'claude-sonnet-5-copilot', label: 'Claude Sonnet 5', recommended: true, category: 'powerful', priceCategory: 'high', creator: 'Anthropic', icon: Codicon.claude, configuration: thinkingAndContextConfiguration, creditCosts: premiumCredits, compatibleHarnesses: ['copilot', 'claude'] },
			{ id: 'claude-haiku-45-copilot', label: 'Claude Haiku 4.5', pinned: true, category: 'lightweight', priceCategory: 'low', creator: 'Anthropic', icon: Codicon.claude, creditCosts: efficientCredits, compatibleHarnesses: ['copilot', 'claude'] },
			{ id: 'grok-45-copilot', label: 'Grok 4.5', category: 'versatile', priceCategory: 'medium', creator: 'xAI', icon: Codicon.xai, configuration: thinkingEffortConfiguration, creditCosts: standardCredits, compatibleHarnesses: ['copilot'] },
		],
	},
	{
		id: 'codex',
		label: 'ChatGPT',
		icon: Codicon.openai,
		// Reached by subscription inside its own harness, by API key anywhere else.
		accountPerHarness: { codex: 'ChatGPT Free', copilot: 'OpenAI API', claude: 'OpenAI API' },
		models: [
			{ id: 'gpt-56-sol', label: 'GPT-5.6 Sol', category: 'powerful', priceCategory: 'very_high', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: frontierCredits },
			{ id: 'gpt-56-terra', label: 'GPT-5.6 Terra', category: 'powerful', priceCategory: 'high', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: premiumCredits },
			{ id: 'gpt-56-luna-codex', label: 'GPT-5.6 Luna', category: 'powerful', priceCategory: 'medium', creator: 'OpenAI', icon: Codicon.openai, configuration: thinkingEffortConfiguration, creditCosts: standardCredits },
		],
	},
	{
		id: 'anthropic',
		label: 'Claude',
		icon: Codicon.claude,
		accountPerHarness: { claude: 'Claude Pro', copilot: 'Anthropic API', codex: 'Anthropic API' },
		compatibleHarnesses: ['claude'],
		models: [
			{ id: 'claude-opus-5', label: 'Claude Opus 5', category: 'powerful', priceCategory: 'very_high', creator: 'Anthropic', icon: Codicon.claude, configuration: extendedThinkingAndContextConfiguration, creditCosts: frontierCredits },
			{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5', category: 'powerful', priceCategory: 'high', creator: 'Anthropic', icon: Codicon.claude, configuration: thinkingAndContextConfiguration, creditCosts: premiumCredits },
			{ id: 'claude-opus-48', label: 'Claude Opus 4.8', category: 'powerful', priceCategory: 'high', creator: 'Anthropic', icon: Codicon.claude, configuration: thinkingAndContextConfiguration, creditCosts: premiumCredits },
			{ id: 'claude-haiku-45', label: 'Claude Haiku 4.5', category: 'lightweight', priceCategory: 'low', creator: 'Anthropic', icon: Codicon.claude, creditCosts: efficientCredits },
		],
	},
	{
		id: 'microsoft-foundry',
		label: 'Microsoft Foundry',
		icon: Codicon.blank,
		iconClass: 'model-picker-prototype-icon-foundry',
		account: 'Foundry API',
		compatibleHarnesses: ['copilot'],
		models: [
			{ id: 'mai-1-preview', label: 'MAI-1 Preview', category: 'versatile', priceCategory: 'medium', creator: 'Microsoft', icon: Codicon.microsoft, creditCosts: standardCredits },
			{ id: 'mai-1-mini-foundry', label: 'MAI-1 mini', category: 'lightweight', priceCategory: 'low', creator: 'Microsoft', icon: Codicon.microsoft, configuration: contextOnlyConfiguration, creditCosts: budgetCredits },
			{ id: 'mai-code-1-flash', label: 'MAI-Code-1-Flash', category: 'lightweight', priceCategory: 'low', creator: 'Microsoft', icon: Codicon.microsoft, configuration: thinkingEffortConfiguration, creditCosts: efficientCredits },
			{ id: 'phi-5-foundry', label: 'Phi-5', category: 'lightweight', priceCategory: 'low', creator: 'Microsoft', icon: Codicon.microsoft, configuration: contextOnlyConfiguration, creditCosts: budgetCredits },
			{ id: 'grok-45-foundry', label: 'Grok 4.5', category: 'versatile', priceCategory: 'medium', creator: 'xAI', icon: Codicon.xai, configuration: thinkingAndContextConfiguration, creditCosts: standardCredits },
			{ id: 'grok-4-fast-foundry', label: 'Grok 4 Fast', category: 'lightweight', priceCategory: 'low', creator: 'xAI', icon: Codicon.xai, creditCosts: efficientCredits },
			{ id: 'gpt-54-foundry', label: 'GPT-5.4', category: 'versatile', priceCategory: 'medium', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: standardCredits },
			{ id: 'gpt-5-mini-foundry', label: 'GPT-5 mini', category: 'lightweight', priceCategory: 'low', creator: 'OpenAI', icon: Codicon.openai, configuration: thinkingEffortConfiguration, creditCosts: efficientCredits },
			{ id: 'deepseek-r2-foundry', label: 'DeepSeek R2', category: 'powerful', priceCategory: 'low', creator: 'DeepSeek', icon: Codicon.sparkle, configuration: thinkingEffortConfiguration, creditCosts: efficientCredits },
		],
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		icon: Codicon.blank,
		iconClass: 'model-picker-prototype-icon-openrouter',
		account: 'OpenRouter API',
		compatibleHarnesses: ['copilot'],
		models: [
			{ id: 'claude-sonnet-46-openrouter', label: 'Claude Sonnet 4.6', category: 'powerful', priceCategory: 'high', creator: 'Anthropic', icon: Codicon.claude, configuration: thinkingAndContextConfiguration, creditCosts: premiumCredits },
			{ id: 'deepseek-v3-openrouter', label: 'DeepSeek V3', category: 'versatile', priceCategory: 'low', creator: 'DeepSeek', icon: Codicon.sparkle, creditCosts: efficientCredits },
			{ id: 'deepseek-r2-openrouter', label: 'DeepSeek R2', category: 'powerful', priceCategory: 'low', creator: 'DeepSeek', icon: Codicon.sparkle, configuration: thinkingEffortConfiguration, creditCosts: efficientCredits },
			{ id: 'llama-4-maverick-openrouter', label: 'Llama 4 Maverick', category: 'versatile', priceCategory: 'low', creator: 'Meta', icon: Codicon.sparkle, configuration: contextOnlyConfiguration, creditCosts: budgetCredits },
			{ id: 'mistral-large-3-openrouter', label: 'Mistral Large 3', category: 'versatile', priceCategory: 'low', creator: 'Mistral', icon: Codicon.sparkle, creditCosts: efficientCredits },
			{ id: 'qwen-3-max-openrouter', label: 'Qwen 3 Max', category: 'powerful', priceCategory: 'medium', creator: 'Qwen', icon: Codicon.sparkle, configuration: thinkingAndContextConfiguration, creditCosts: standardCredits },
			{ id: 'grok-45-openrouter', label: 'Grok 4.5', category: 'versatile', priceCategory: 'medium', creator: 'xAI', icon: Codicon.xai, configuration: thinkingEffortConfiguration, creditCosts: standardCredits },
			{ id: 'kimi-k2-openrouter', label: 'Kimi K2', category: 'powerful', priceCategory: 'low', creator: 'Moonshot', icon: Codicon.kimi, configuration: thinkingAndContextConfiguration, creditCosts: efficientCredits },
			{ id: 'kimi-k2-turbo-openrouter', label: 'Kimi K2 Turbo', category: 'lightweight', priceCategory: 'low', creator: 'Moonshot', icon: Codicon.kimi, creditCosts: budgetCredits },
			{ id: 'gemini-31-pro-openrouter', label: 'Gemini 3.1 Pro', category: 'powerful', priceCategory: 'medium', creator: 'Google', icon: Codicon.googleGemini, configuration: flexibleThinkingAndContextConfiguration, creditCosts: standardCredits },
			{ id: 'gpt-55-openrouter', label: 'GPT-5.5', category: 'powerful', priceCategory: 'high', creator: 'OpenAI', icon: Codicon.openai, configuration: extendedThinkingAndContextConfiguration, creditCosts: premiumCredits },
			{ id: 'llama-4-scout-openrouter', label: 'Llama 4 Scout', category: 'lightweight', priceCategory: 'low', creator: 'Meta', icon: Codicon.sparkle, configuration: contextOnlyConfiguration, creditCosts: budgetCredits },
			{ id: 'qwen-3-coder-openrouter', label: 'Qwen 3 Coder', category: 'versatile', priceCategory: 'low', creator: 'Qwen', icon: Codicon.sparkle, configuration: thinkingEffortConfiguration, creditCosts: efficientCredits },
		],
	},
];

const copilotSignIn = { id: 'copilot', label: 'Copilot', icon: Codicon.copilotCompact, models: [], requiresSetup: true, signInLabel: 'Sign in to use GitHub Copilot' };
const chatGptSignIn: IModelPickerPrototypeSource = { id: 'chatgpt', label: 'ChatGPT', icon: Codicon.openai, models: [], requiresSetup: true, signInLabel: 'Sign in to use ChatGPT', compatibleHarnesses: ['codex'] };
const signedOutSources: readonly IModelPickerPrototypeSource[] = [copilotSignIn, chatGptSignIn];

// Signed in with ChatGPT, but Copilot still needs an account.
const chatGptOnlySources: readonly IModelPickerPrototypeSource[] = [
	copilotSignIn,
	{ ...sources.find(source => source.id === 'codex')!, id: 'chatgpt', label: 'ChatGPT' },
];

// The demo starts with nothing pinned so the Pinned section appears as a result of
// pinning during the walkthrough rather than being there from the outset.
const demoSignedInSources: readonly IModelPickerPrototypeSource[] = sources.map(source => ({
	...source,
	models: source.models.map(model => ({ ...model, pinned: false })),
}));

/**
 * Providers arrive two different ways, so the demo tracks them as one set of "present"
 * ids. Copilot and ChatGPT own an account and appear signed-out until connected;
 * Foundry and OpenRouter are bring-your-own-key and do not exist at all until they are
 * added from the overflow menu.
 */
const demoAccountSources: Readonly<Record<string, IModelPickerPrototypeSource>> = {
	copilot: copilotSignIn,
	chatgpt: chatGptSignIn,
};

const demoAddedProviderIds: readonly string[] = ['microsoft-foundry', 'openrouter'];

function demoSources(present: ReadonlySet<string>): readonly IModelPickerPrototypeSource[] {
	return demoSignedInSources
		.filter(source => !demoAddedProviderIds.includes(source.id) || present.has(source.id))
		.map(source => {
			const id = source.id === 'codex' ? 'chatgpt' : source.id;
			const signedOut = demoAccountSources[id];
			if (signedOut && !present.has(id)) {
				return signedOut;
			}
			return source.id === 'codex' ? { ...source, id: 'chatgpt', label: 'ChatGPT' } : source;
		});
}

export default defineThemedFixtureGroup({ path: 'Chat/Model Picker Prototype/' }, {
	'Demo': defineComponentFixture({
		render: context => renderDemo(context),
	}),
	'Home Hub': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources,
				activeSourceId: 'pinned',
				activeHarness: 'copilot',
				selectedModelId: 'gpt-54',
			});
		},
	}),
	'Auto On': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources,
				activeSourceId: 'copilot',
				activeHarness: 'copilot',
				selectedModelId: 'gpt-54',
				autoEnabled: true,
			});
		},
	}),
	'Browse Copilot': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources,
				activeSourceId: 'copilot',
				activeHarness: 'copilot',
				selectedModelId: 'gpt-54',
			});
		},
	}),
	'Global Search': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources,
				activeSourceId: 'copilot',
				activeHarness: 'copilot',
				selectedModelId: 'gemini-35-flash',
				searchQuery: 'sonnet',
			});
		},
	}),
	'Pinned Empty': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				activeSourceId: 'pinned',
				activeHarness: 'copilot',
				sources: sources.map(source => ({ ...source, models: source.models.map(model => ({ ...model, pinned: false })) })),
			});
		},
	}),
	'Hub Empty': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				activeSourceId: 'pinned',
				activeHarness: 'copilot',
				sources: sources.map(source => ({
					...source,
					models: source.models.map(model => ({ ...model, pinned: false, recentRank: undefined, recommended: false })),
				})),
			});
		},
	}),
	'Signed Out': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources: signedOutSources,
				activeSourceId: 'copilot',
				activeHarness: 'copilot',
			});
		},
	}),
	'Signed Out Codex': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources: signedOutSources,
				activeSourceId: 'chatgpt',
				activeHarness: 'codex',
			});
		},
	}),
	'ChatGPT Only': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources: chatGptOnlySources,
				activeSourceId: 'chatgpt',
				activeHarness: 'codex',
			});
		},
	}),
	'Many Sources': defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => {
			renderPrototype(context, {
				sources,
				activeSourceId: 'openrouter',
				activeHarness: 'copilot',
				selectedModelId: 'claude-sonnet-46-openrouter',
			});
		},
	}),
});

/**
 * The walkthrough fixture. Nothing is present at the start: accounts have to be connected
 * one at a time, and bring-your-own-key providers have to be added before they exist at all.
 * That lets the demo reach any mix — including ChatGPT connected while Copilot is not.
 */
function renderDemo(context: ComponentFixtureContext): void {
	// Fixtures pin animations off so screenshots are stable, but the walkthrough is here to
	// be watched and is never captured, so it opts back in.
	context.container.classList.remove('disable-animations');

	const present = new Set<string>();
	const prototype = renderPrototype(context, {
		sources: demoSources(present),
		activeSourceId: 'pinned',
		activeHarness: 'copilot',
	}, {
		// Signing in is the moment one provider's catalogue arrives, so the fixture answers
		// the request for that provider rather than swapping in a different picker.
		onSetup: sourceId => {
			present.add(sourceId);
			prototype.setSources(demoSources(present));
		},
		// Bring-your-own-key providers are installed, not ambient — they show up only once
		// they have been added.
		onAddProvider: () => {
			for (const id of demoAddedProviderIds) {
				present.add(id);
			}
			prototype.setSources(demoSources(present));
		},
		onReset: () => {
			present.clear();
			prototype.setSources(demoSources(present));
		},
	});
}

interface IDemoHooks {
	readonly onSetup: (sourceId: string) => void;
	readonly onAddProvider: () => void;
	readonly onReset: () => void;
}

function renderPrototype({ container, disposableStore, theme }: ComponentFixtureContext, options: ConstructorParameters<typeof ModelPickerPrototype>[0], demoHooks?: IDemoHooks): ModelPickerPrototype {
	container.classList.add('model-picker-prototype-fixture');

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const prototype = disposableStore.add(instantiationService.createInstance(ModelPickerPrototype, options));

	if (demoHooks) {
		disposableStore.add(prototype.onDidRequestSetup(sourceId => demoHooks.onSetup(sourceId)));
		disposableStore.add(prototype.onDidRequestAddModelProvider(() => demoHooks.onAddProvider()));
	}

	const harnessControl = $('div.model-picker-prototype-harness-control');
	harnessControl.setAttribute('role', 'group');
	harnessControl.setAttribute('aria-label', 'Harness');
	const harnessLabel = $('span.model-picker-prototype-harness-label');
	harnessLabel.textContent = 'Demo control · not part of the picker';
	harnessControl.appendChild(harnessLabel);

	const harnessButtons = new Map<ModelPickerPrototypeHarness, Button>();
	const updateHarnessButtons = (activeHarness: ModelPickerPrototypeHarness) => {
		for (const [harness, button] of harnessButtons) {
			const active = harness === activeHarness;
			button.element.classList.toggle('active', active);
			button.element.setAttribute('aria-pressed', String(active));
		}
	};
	for (const harness of ['copilot', 'codex', 'claude'] as const) {
		const label = harness === 'copilot' ? 'Copilot' : harness === 'codex' ? 'Codex' : 'Claude';
		const button = disposableStore.add(new Button(harnessControl, { ariaLabel: `${label} harness` }));
		button.element.classList.add('model-picker-prototype-harness-button');
		button.label = label;
		disposableStore.add(button.onDidClick(() => {
			prototype.setHarness(harness);
			updateHarnessButtons(harness);
		}));
		harnessButtons.set(harness, button);
	}
	updateHarnessButtons(options.activeHarness);

	if (demoHooks) {
		const resetButton = disposableStore.add(new Button(harnessControl, { ariaLabel: 'Reset demo' }));
		resetButton.element.classList.add('model-picker-prototype-harness-button', 'model-picker-prototype-harness-reset');
		resetButton.label = 'Reset';
		disposableStore.add(resetButton.onDidClick(() => {
			prototype.setHarness('copilot');
			updateHarnessButtons('copilot');
			demoHooks.onReset();
		}));
	}

	const reopenButton = disposableStore.add(new Button(harnessControl, { ariaLabel: 'Open Model Picker' }));
	reopenButton.element.classList.add('model-picker-prototype-reopen');
	reopenButton.label = 'Open Model Picker';
	disposableStore.add(reopenButton.onDidClick(() => {
		prototype.domNode.classList.remove('closed');
		reopenButton.element.classList.remove('visible');
	}));
	disposableStore.add(prototype.onDidRequestHide(() => {
		prototype.domNode.classList.add('closed');
		reopenButton.element.classList.add('visible');
		reopenButton.focus();
	}));

	container.appendChild(harnessControl);
	container.appendChild(prototype.domNode);
	return prototype;
}
