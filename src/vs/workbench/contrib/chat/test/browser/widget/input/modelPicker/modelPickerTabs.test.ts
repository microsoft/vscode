/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { getModelConfigProperty, getModelConfigSummary, isExtendedContext, MODEL_CONFIG_GROUP_CONTEXT } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { getModelBadge } from '../../../../../browser/widget/input/modelPicker/modelPickerBadges.js';
import { buildModelPickerDestinations, buildModelPickerSections, hasPromotedModels, IModelPickerProviderPlaceholder } from '../../../../../browser/widget/input/modelPicker/modelPickerTabs.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry } from '../../../../../common/languageModels.js';

interface IFixtureModelOptions {
	readonly vendor?: string;
	readonly isBYOK?: boolean;
	readonly byokModelIdentifier?: string;
	readonly modelGroupId?: string;
}

function createModel(id: string, name: string, options: IFixtureModelOptions = {}): ILanguageModelChatMetadataAndIdentifier {
	const vendor = options.vendor ?? 'copilot';
	return {
		identifier: `${vendor}/${id}`,
		metadata: {
			id,
			name,
			vendor,
			version: '1.0',
			family: id,
			isBYOK: options.isBYOK,
			byokModelIdentifier: options.byokModelIdentifier,
			modelGroup: options.modelGroupId ? { id: options.modelGroupId } : undefined,
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
		} as ILanguageModelChatMetadata,
	};
}

function createConfigurableModel(): ILanguageModelChatMetadataAndIdentifier {
	const model = createModel('gpt-5-5', 'GPT-5.5');
	return {
		...model,
		metadata: {
			...model.metadata,
			configurationSchema: {
				properties: {
					reasoningEffort: {
						type: 'string',
						group: 'navigation',
						enum: ['low', 'medium', 'xhigh'],
						enumItemLabels: ['Low', 'Medium', 'Extra high'],
						default: 'medium',
					},
					contextSize: {
						type: 'number',
						group: 'tokens',
						enum: [264000, 1000000],
						enumItemLabels: ['264K', '1M'],
						default: 264000,
					},
				},
			},
		},
	};
}

function createLanguageModelsService(): ILanguageModelsService {
	return {
		getVendors: () => [
			{ vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true },
			{ vendor: 'ollama', displayName: 'Ollama', isDefault: false },
			{ vendor: 'openai', displayName: 'OpenAI', isDefault: false },
		],
		getLanguageModelGroups: () => [],
	} as unknown as ILanguageModelsService;
}

function createConfigurationAccess(values: IStringDictionary<unknown> = {}): IModelConfigurationAccess {
	return {
		getModelConfiguration: () => values,
		setModelConfiguration: async () => { },
		getModelConfigurationActions: () => [],
	};
}

suite('Model picker destinations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const service = createLanguageModelsService();
	const auto = createModel('auto', 'Auto');
	const gpt = createModel('gpt-5-5', 'GPT-5.5');
	const claude = createModel('claude-sonnet-5', 'Claude Sonnet 5');
	const gemini = createModel('gemini-3-1-pro', 'Gemini 3.1 Pro');
	const llama = createModel('llama-3', 'Llama 3', { vendor: 'ollama', isBYOK: true });
	const mistral = createModel('mistral', 'Mistral Large', { vendor: 'openai', isBYOK: true });

	const summarize = (models: readonly ILanguageModelChatMetadataAndIdentifier[], placeholders: readonly IModelPickerProviderPlaceholder[] = []) =>
		buildModelPickerDestinations(models, service, placeholders)
			.map(destination => ({ id: destination.id, label: destination.label, models: destination.models.map(model => model.metadata.name) }));

	test('a host that relays the built-in provider keeps its models built in', () => {
		// An agent host registers a vendor of its own and republishes the built-in
		// provider's catalogue under it, so neither the vendor nor the BYOK flags say
		// where a model actually came from. Only the provider group does.
		const relayed = createModel('gpt-5-5', 'GPT-5.5', {
			vendor: 'agent-host-copilotcli',
			isBYOK: true,
			byokModelIdentifier: 'copilot/gpt-5-5',
			modelGroupId: 'copilot',
		});
		const relayedNative = createModel('cli-model', 'CLI Model', {
			vendor: 'agent-host-copilotcli',
			isBYOK: true,
			modelGroupId: 'copilotcli',
		});
		const relayedByok = createModel('llama-3', 'Llama 3', {
			vendor: 'agent-host-copilotcli',
			isBYOK: true,
			modelGroupId: 'ollama',
		});
		assert.deepStrictEqual(
			summarize([relayed, relayedNative, relayedByok]),
			[
				{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5', 'CLI Model'] },
				{ id: 'user', label: 'Ollama', models: ['Llama 3'] },
			],
		);
	});

	test('a plan that grants only Auto still opens on the built-in destination', () => {
		// Auto has its own row rather than a place in the list, so without this the
		// picker would have no destination at all and open on nothing.
		assert.deepStrictEqual(
			summarize([auto]),
			[{ id: 'builtIn', label: 'GitHub Copilot', models: [] }],
		);
	});

	test('models from only the built-in provider yield a single destination', () => {
		assert.deepStrictEqual(
			summarize([auto, gpt, claude]),
			[{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5', 'Claude Sonnet 5'] }],
		);
	});

	test('added models share one destination named after their sole provider', () => {
		assert.deepStrictEqual(
			summarize([gpt, llama]),
			[
				{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5'] },
				{ id: 'user', label: 'Ollama', models: ['Llama 3'] },
			],
		);
	});

	test('added models from several providers share one destination', () => {
		assert.deepStrictEqual(
			summarize([gpt, llama, mistral]),
			[
				{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5'] },
				{ id: 'user', label: 'My Models', models: ['Llama 3', 'Mistral Large'] },
			],
		);
	});

	test('a provider waiting on sign-in gets a destination with no models', () => {
		assert.deepStrictEqual(
			summarize([], [{ vendor: 'copilot', label: 'GitHub Copilot', message: 'Sign in to see available models.' }]),
			[{ id: 'builtIn', label: 'GitHub Copilot', models: [] }],
		);
	});

	test('sections place each model once, with the selected model in the shortlist', () => {
		const controlModels: IStringDictionary<IModelControlEntry> = {
			'gemini-3-1-pro': { label: 'Gemini 3.1 Pro', featured: true, exists: true },
		};
		const sections = buildModelPickerSections({
			models: [gpt, claude, gemini],
			selectedModelId: 'copilot/gpt-5-5',
			recentModelIds: ['copilot/gemini-3-1-pro'],
			pinnedModelIds: ['copilot/claude-sonnet-5'],
			controlModels,
			showSuggested: true,
		});
		assert.deepStrictEqual(
			{
				pinned: sections.pinned.map(model => model.metadata.name),
				suggested: sections.suggested.map(model => model.metadata.name),
				otherGroups: sections.otherGroups,
			},
			{
				pinned: ['Claude Sonnet 5'],
				// The selected model rides along with the curated ones, so it is never folded away.
				suggested: ['Gemini 3.1 Pro', 'GPT-5.5'],
				otherGroups: [],
			},
		);
	});

	test('models that are neither favourited nor shortlisted fall into one unnamed group', () => {
		const sections = buildModelPickerSections({
			models: [gpt, claude, gemini],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: {},
			showSuggested: true,
		});
		assert.deepStrictEqual(
			{
				groups: sections.otherGroups.map(group => ({ label: group.label, models: group.models.map(model => model.metadata.name) })),
				promoted: hasPromotedModels(sections),
			},
			{ groups: [{ label: undefined, models: ['Claude Sonnet 5', 'Gemini 3.1 Pro', 'GPT-5.5'] }], promoted: false },
		);
	});

	test('a retiring model sinks below the models that are staying', () => {
		// Alphabetically "Alpha" leads, so only the retirement can move it last.
		const base = createModel('alpha', 'Alpha');
		const alpha = { ...base, metadata: { ...base.metadata, warningText: { model_pending_deprecation: 'Retiring soon.' } } };
		const sections = buildModelPickerSections({
			models: [alpha, claude, gemini],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: {},
			showSuggested: true,
		});
		assert.deepStrictEqual(
			sections.otherGroups.map(group => group.models.map(model => model.metadata.name)),
			[['Claude Sonnet 5', 'Gemini 3.1 Pro', 'Alpha']],
		);
	});

	test('added models always name their provider, so a lone provider is still named', () => {
		const build = (models: readonly ILanguageModelChatMetadataAndIdentifier[]) => buildModelPickerSections({
			models,
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: {},
			showSuggested: false,
			getProviderLabel: model => model.metadata.vendor,
		}).otherGroups.map(group => ({ label: group.label, models: group.models.map(model => model.metadata.name) }));

		assert.deepStrictEqual(
			{ single: build([llama]), multiple: build([llama, mistral]) },
			{
				single: [{ label: 'ollama', models: ['Llama 3'] }],
				multiple: [{ label: 'ollama', models: ['Llama 3'] }, { label: 'openai', models: ['Mistral Large'] }],
			},
		);
	});

	test('the built-in destination is the only one that recommends models', () => {
		const sections = buildModelPickerSections({
			models: [llama],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: { 'llama-3': { label: 'Llama 3', featured: true, exists: true } },
			showSuggested: false,
		});
		assert.deepStrictEqual(
			{ suggested: sections.suggested.length, other: sections.otherGroups.flatMap(group => group.models.map(model => model.metadata.name)) },
			{ suggested: 0, other: ['Llama 3'] },
		);
	});

	test('a destination organized by provider leads with no shortlist', () => {
		const sections = buildModelPickerSections({
			models: [llama, mistral],
			selectedModelId: 'ollama/llama-3',
			recentModelIds: ['openai/mistral'],
			pinnedModelIds: [],
			controlModels: {},
			showSuggested: false,
			getProviderLabel: model => model.metadata.vendor,
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.length,
				groups: sections.otherGroups.map(group => group.label),
			},
			{ suggested: 0, groups: ['ollama', 'openai'] },
		);
	});

	test('badges rank a retiring model over an offer over the settings a model was tuned to', () => {
		const retiring = { ...gpt, metadata: { ...gpt.metadata, warningText: { model_pending_deprecation: 'Retiring soon.' } } };
		const promo = { ...claude, metadata: { ...claude.metadata, promo: { id: 'p', discountPercent: 25, message: 'Save now.' } } };
		const tuned = createConfigurableModel();
		const badge = (model: ILanguageModelChatMetadataAndIdentifier, values: IStringDictionary<unknown> = {}, providerLabel?: string) =>
			getModelBadge(model, { configurationAccess: createConfigurationAccess(values), providerLabel });

		assert.deepStrictEqual(
			{
				retiring: badge(retiring),
				promo: badge(promo),
				tuned: badge(tuned, { reasoningEffort: 'xhigh', contextSize: 1000000 }),
				// Left at its defaults, so there is nothing to report.
				untouched: badge(tuned),
				provider: badge(gpt, {}, 'Ollama'),
				plain: badge(gpt),
			},
			{
				retiring: { text: 'Retiring', tone: 'warning' },
				promo: { text: '25% off', tone: 'promo' },
				tuned: { text: 'Extra high \u00b7 1M', tone: 'selected' },
				untouched: undefined,
				provider: { text: 'Ollama', tone: 'neutral' },
				plain: undefined,
			},
		);
	});

	test('curated models the account cannot reach are named so their unlock path shows', () => {
		const controlModels: IStringDictionary<IModelControlEntry> = {
			'gpt-5-5': { label: 'GPT-5.5', featured: true, exists: true },
			'claude-opus-5': { label: 'Claude Opus 5', featured: true, exists: false },
			'gpt-6': { label: 'GPT-6', featured: true, exists: false, minVSCodeVersion: '99.0.0' },
			'hidden': { label: 'Not Featured', featured: false, exists: false },
		};
		const sections = buildModelPickerSections({
			models: [gpt],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels,
			showSuggested: true,
			showUnavailable: true,
			currentVSCodeVersion: '1.100.0',
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.map(model => model.metadata.name),
				unavailable: sections.unavailable.map(entry => ({ id: entry.id, needsUpdate: entry.needsUpdate })),
			},
			{
				suggested: ['GPT-5.5'],
				unavailable: [{ id: 'claude-opus-5', needsUpdate: false }, { id: 'gpt-6', needsUpdate: true }],
			},
		);
	});

	test('a model this build is too old to run is never offered as selectable', () => {
		const controlModels: IStringDictionary<IModelControlEntry> = {
			'gpt-5-5': { label: 'GPT-5.5', featured: true, exists: true, minVSCodeVersion: '99.0.0' },
		};
		// Favourited and selected both name it, so it would reappear if any section kept it.
		const sections = buildModelPickerSections({
			models: [gpt, claude],
			selectedModelId: 'copilot/gpt-5-5',
			recentModelIds: ['copilot/gpt-5-5'],
			pinnedModelIds: ['copilot/gpt-5-5'],
			controlModels,
			showSuggested: true,
			showUnavailable: true,
			currentVSCodeVersion: '1.100.0',
		});
		assert.deepStrictEqual(
			{
				pinned: sections.pinned.map(model => model.metadata.name),
				suggested: sections.suggested.map(model => model.metadata.name),
				other: sections.otherGroups.flatMap(group => group.models.map(model => model.metadata.name)),
				unavailable: sections.unavailable.map(entry => ({ id: entry.id, needsUpdate: entry.needsUpdate })),
			},
			{
				pinned: [],
				suggested: [],
				other: ['Claude Sonnet 5'],
				unavailable: [{ id: 'gpt-5-5', needsUpdate: true }],
			},
		);
	});

	test('surfaces that cannot act on locked models do not advertise them', () => {
		const sections = buildModelPickerSections({
			models: [gpt],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: { 'claude-opus-5': { label: 'Claude Opus 5', featured: true, exists: false } },
			showSuggested: true,
		});
		assert.deepStrictEqual(sections.unavailable, []);
	});

	test('context is extended only at the largest configured window', () => {
		const model = createConfigurableModel();
		const read = (values: IStringDictionary<unknown>) => {
			const property = getModelConfigProperty(model, createConfigurationAccess(values), MODEL_CONFIG_GROUP_CONTEXT)!;
			return isExtendedContext(property);
		};
		assert.deepStrictEqual(
			{ default: read({}), standard: read({ contextSize: 264000 }), extended: read({ contextSize: 1000000 }) },
			{ default: false, standard: false, extended: true },
		);
	});

	test('the configuration summary names only what was changed from the defaults', () => {
		const model = createConfigurableModel();
		assert.deepStrictEqual(
			{
				defaults: getModelConfigSummary(model, createConfigurationAccess()),
				bothChanged: getModelConfigSummary(model, createConfigurationAccess({ reasoningEffort: 'xhigh', contextSize: 1000000 })),
				oneChanged: getModelConfigSummary(model, createConfigurationAccess({ contextSize: 1000000 })),
				noSchema: getModelConfigSummary(gpt, createConfigurationAccess()),
			},
			{ defaults: undefined, bothChanged: 'Extra high · 1M', oneChanged: '1M', noSchema: undefined },
		);
	});
});
