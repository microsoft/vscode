/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IModelConfigurationAccess, getModelConfigProperty, getModelConfigSummary, isExtendedContext, MODEL_CONFIG_GROUP_CONTEXT } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { getModelBadge } from '../../../../../browser/widget/input/modelPicker/modelPickerBadges.js';
import { latestOfEachLine, parseModelLine } from '../../../../../browser/widget/input/modelPicker/modelPickerLineage.js';
import { buildSpeedVariants, collapseSpeedVariants } from '../../../../../browser/widget/input/modelPicker/modelPickerVariants.js';
import { buildModelPickerDestinations, buildModelPickerSections, hasPromotedModels, IModelPickerProviderPlaceholder } from '../../../../../browser/widget/input/modelPicker/modelPickerTabs.js';
import { getProviderGroupKey } from '../../../../../browser/widget/input/modelPicker/modelPickerItemPrimitives.js';
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

	/** The destination id a provider gets, keyed by identity rather than by display name. */
	const providerId = (vendor: string, label: string) => `provider:${getProviderGroupKey(vendor, label)}`;

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
				// The relayed model carries the host's vendor, so that is the identity it
				// is keyed by; only the group supplies the name the user reads.
				{ id: providerId('agent-host-copilotcli', 'Ollama'), label: 'Ollama', models: ['Llama 3'] },
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

	test('a provider the user added gets its own destination', () => {
		assert.deepStrictEqual(
			summarize([gpt, llama]),
			[
				{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5'] },
				{ id: providerId('ollama', 'Ollama'), label: 'Ollama', models: ['Llama 3'] },
			],
		);
	});

	test('every provider the user added gets a destination, in name order', () => {
		assert.deepStrictEqual(
			summarize([gpt, mistral, llama]),
			[
				{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5'] },
				{ id: providerId('ollama', 'Ollama'), label: 'Ollama', models: ['Llama 3'] },
				{ id: providerId('openai', 'OpenAI'), label: 'OpenAI', models: ['Mistral Large'] },
			],
		);
	});

	test('two providers sharing a display name each keep their own tab', () => {
		// Nothing stops two providers from presenting the same name, and merging them
		// would file one provider's models under the other.
		const sameName = createModel('local-1', 'Local One', { vendor: 'ollama', isBYOK: true });
		const alsoSameName = createModel('local-2', 'Local Two', { vendor: 'openai', isBYOK: true });
		const service = {
			getVendors: () => [
				{ vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true },
				{ vendor: 'ollama', displayName: 'Local Models', isDefault: false },
				{ vendor: 'openai', displayName: 'Local Models', isDefault: false },
			],
			getLanguageModelGroups: () => [],
		} as unknown as ILanguageModelsService;

		assert.deepStrictEqual(
			buildModelPickerDestinations([sameName, alsoSameName], service)
				.map(destination => ({ id: destination.id, label: destination.label, models: destination.models.map(model => model.metadata.name) })),
			[
				{ id: providerId('ollama', 'Local Models'), label: 'Local Models', models: ['Local One'] },
				{ id: providerId('openai', 'Local Models'), label: 'Local Models', models: ['Local Two'] },
			],
		);
	});

	test('a provider waiting on sign-in gets its own destination with no models', () => {
		assert.deepStrictEqual(
			summarize([gpt], [{ vendor: 'ollama', label: 'Ollama', message: 'Sign in to see available models.' }]),
			[
				{ id: 'builtIn', label: 'GitHub Copilot', models: ['GPT-5.5'] },
				{ id: providerId('ollama', 'Ollama'), label: 'Ollama', models: [] },
			],
		);
	});

	test('the built-in provider waiting on sign-in still gets its destination', () => {
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
				other: sections.other,
			},
			{
				pinned: ['Claude Sonnet 5'],
				// The selected model rides along with the curated ones, so it is never folded away.
				suggested: ['Gemini 3.1 Pro', 'GPT-5.5'],
				other: [],
			},
		);
	});

	test('a model superseded within its line falls through to the rest', () => {
		const sections = buildModelPickerSections({
			models: [createModel('example-5.5', 'Example 5.5'), createModel('example-5.6', 'Example 5.6'), claude],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: {},
			showSuggested: true,
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.map(model => model.metadata.name),
				other: sections.other.map(model => model.metadata.name),
				promoted: hasPromotedModels(sections),
			},
			{ suggested: ['Claude Sonnet 5', 'Example 5.6'], other: ['Example 5.5'], promoted: true },
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
			controlModels: {
				'alpha': { label: 'Alpha', exists: true, demoted: true },
				'claude-sonnet-5': { label: 'Claude Sonnet 5', exists: true, demoted: true },
				'gemini-3-1-pro': { label: 'Gemini 3.1 Pro', exists: true, demoted: true },
			},
			showSuggested: true,
		});
		assert.deepStrictEqual(
			sections.other.map(model => model.metadata.name),
			['Claude Sonnet 5', 'Gemini 3.1 Pro', 'Alpha'],
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
			{ suggested: sections.suggested.length, other: sections.other.map(model => model.metadata.name) },
			{ suggested: 0, other: ['Llama 3'] },
		);
	});

	test('a destination with no shortlist puts every model in the list', () => {
		const sections = buildModelPickerSections({
			models: [llama, mistral],
			selectedModelId: 'ollama/llama-3',
			recentModelIds: ['openai/mistral'],
			pinnedModelIds: [],
			controlModels: {},
			showSuggested: false,
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.length,
				other: sections.other.map(model => model.metadata.name),
			},
			{ suggested: 0, other: ['Llama 3', 'Mistral Large'] },
		);
	});

	test('a model id splits into the line it belongs to and its version', () => {
		// The id shapes a provider can use: version last, version in the middle, a
		// multi-word line, and no version at all.
		assert.deepStrictEqual(
			['example-5.5', 'example-5.6-sol', 'example-1.1-lite', 'example-opus-5', 'example-prime']
				.map(id => ({ id, ...parseModelLine(id) })),
			[
				{ id: 'example-5.5', line: 'example', version: [5, 5] },
				{ id: 'example-5.6-sol', line: 'example-sol', version: [5, 6] },
				{ id: 'example-1.1-lite', line: 'example-lite', version: [1, 1] },
				{ id: 'example-opus-5', line: 'example-opus', version: [5] },
				// No version token, so it stands as its own line rather than being buried.
				{ id: 'example-prime', line: 'example-prime', version: [] },
			],
		);
	});

	test('the shortlist is the newest of each line, so a launch needs no list edit', () => {
		const line = (id: string, vendor = 'copilot') => createModel(id, id, { vendor });
		const shortlist = (models: readonly ILanguageModelChatMetadataAndIdentifier[]) =>
			latestOfEachLine(models).map(model => model.metadata.id).sort();

		const catalogue = [line('example-5.6-sol'), line('example-opus-4.8'), line('example-opus-5')];
		assert.deepStrictEqual(
			{
				today: shortlist(catalogue),
				// A newer version of a line replaces it; a line of its own joins the shortlist.
				afterLaunch: shortlist([...catalogue, line('example-5.7-sol'), line('example-6-vega')]),
				// `example-5.5` is the `example` line and `example-5.6-sol` is the
				// `example-sol` line, so neither supersedes the other. Replacing a line
				// takes a name, not a rule.
				acrossLines: shortlist([line('example-5.5'), line('example-5.6-sol')]),
				// Two providers can ship the same line name without displacing each other.
				perVendor: shortlist([line('example-5.4-mini'), line('example-5-mini', 'azure')]),
			},
			{
				today: ['example-5.6-sol', 'example-opus-5'],
				afterLaunch: ['example-5.7-sol', 'example-6-vega', 'example-opus-5'],
				acrossLines: ['example-5.5', 'example-5.6-sol'],
				perVendor: ['example-5-mini', 'example-5.4-mini'],
			},
		);
	});

	test('a line replaced by a different line is demoted by name, and promos still lead', () => {
		const sol = createModel('example-5.6-sol', 'Example 5.6 Sol');
		const codex = createModel('example-5.3-codex', 'Example 5.3 Codex');
		const promoCodex = { ...codex, metadata: { ...codex.metadata, promo: { id: 'p', discountPercent: 25, message: 'Save now.' } } };
		const sections = (codexModel: ILanguageModelChatMetadataAndIdentifier) => buildModelPickerSections({
			models: [sol, codexModel],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			// Codex is the newest of its own line, so only a name can move it down.
			controlModels: { 'example-5.3-codex': { label: 'Example 5.3 Codex', exists: true, demoted: true } },
			showSuggested: true,
		});
		assert.deepStrictEqual(
			{
				demoted: {
					suggested: sections(codex).suggested.map(model => model.metadata.id),
					other: sections(codex).other.map(model => model.metadata.id),
				},
				// An offer outranks the demotion: it is time-limited and worth seeing.
				withPromo: sections(promoCodex).suggested.map(model => model.metadata.id),
			},
			{
				demoted: { suggested: ['example-5.6-sol'], other: ['example-5.3-codex'] },
				withPromo: ['example-5.3-codex', 'example-5.6-sol'],
			},
		);
	});

	test('demoting every model leaves the list open rather than empty', () => {
		// A demotion is honoured whether or not anything replaced the model, so a config
		// that names them all is possible. The fold has nothing to hide behind then, and
		// the rest is shown instead of the picker opening on nothing.
		const sections = buildModelPickerSections({
			models: [gpt, claude],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: {
				'gpt-5-5': { label: 'GPT-5.5', exists: true, demoted: true },
				'claude-sonnet-5': { label: 'Claude Sonnet 5', exists: true, demoted: true },
			},
			showSuggested: true,
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.length,
				other: sections.other.map(model => model.metadata.name),
				// False, so the caller leaves the rest expanded instead of folding it away.
				folds: hasPromotedModels(sections),
			},
			{ suggested: 0, other: ['Claude Sonnet 5', 'GPT-5.5'], folds: false },
		);
	});

	test('an early-access build stays out of the shortlist without being named', () => {
		const sections = buildModelPickerSections({
			models: [gpt, createModel('example-3-eap', 'Example 3 EAP'), createModel('example-4-experimental', 'Example 4')],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			// No entry for either: the id says enough, so a new one needs no config.
			controlModels: {},
			showSuggested: true,
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.map(model => model.metadata.id),
				// Held back from the shortlist, not hidden: still selectable further down.
				other: sections.other.map(model => model.metadata.id),
			},
			{
				suggested: ['gpt-5-5'],
				other: ['example-3-eap', 'example-4-experimental'],
			},
		);
	});

	test('a demotion names one model, so a newer one in that line surfaces again', () => {
		// Deliberate: a demotion says "not this model", not "not this line". A line that
		// comes back is worth seeing, which is the whole point of failing upward. The
		// cost is that suppressing a variant has to be repeated when it is re-released.
		const shortlist = (models: readonly ILanguageModelChatMetadataAndIdentifier[]) => buildModelPickerSections({
			models,
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: {
				'example-5.5': { label: 'Example 5.5', exists: true, demoted: true },
				'example-1-lite-picker': { label: 'Example 1 Lite', exists: true, demoted: true },
			},
			showSuggested: true,
		}).suggested.map(model => model.metadata.id).sort();

		const retired = createModel('example-5.5', 'Example 5.5');
		const variant = createModel('example-1-lite-picker', 'Example 1 Lite');
		assert.deepStrictEqual(
			{
				demoted: shortlist([retired, variant]),
				// A flagship on the line that was retired, and a re-release of the variant.
				succeeded: shortlist([retired, variant, createModel('example-6', 'Example 6'), createModel('example-2-lite-picker', 'Example 2 Lite')]),
			},
			{ demoted: [], succeeded: ['example-2-lite-picker', 'example-6'] },
		);
	});

	test('a model is paired with the faster twin the provider names by id', () => {
		// The ids and names the provider actually uses for the pair.
		const standard = createModel('example-2.5', 'Example 2.5');
		const fast = createModel('example-2.5-fast', 'Example 2.5 (fast mode)');
		// Ends in the suffix but has no twin, so it is a model in its own right.
		const orphan = createModel('some-model-fast', 'Some Model (fast mode)');
		const variants = buildSpeedVariants([gpt, standard, fast, orphan]);

		assert.deepStrictEqual(
			{
				fromStandard: variants.get(standard.identifier)?.fast.metadata.id,
				fromFast: variants.get(fast.identifier)?.standard.metadata.id,
				unpaired: [gpt, orphan].map(model => variants.has(model.identifier)),
			},
			{ fromStandard: 'example-2.5-fast', fromFast: 'example-2.5', unpaired: [false, false] },
		);
	});

	test('a pair takes one row, showing whichever twin is in use', () => {
		const standard = createModel('example-2.5', 'Example 2.5');
		const fast = createModel('example-2.5-fast', 'Example 2.5 (fast mode)');
		const models = [gpt, standard, fast];
		const variants = buildSpeedVariants(models);
		const names = (selected: string | undefined) =>
			collapseSpeedVariants(models, variants, selected).map(model => model.metadata.name);

		assert.deepStrictEqual(
			{
				neither: names(undefined),
				standardSelected: names(standard.identifier),
				fastSelected: names(fast.identifier),
			},
			{
				neither: ['GPT-5.5', 'Example 2.5'],
				standardSelected: ['GPT-5.5', 'Example 2.5'],
				// The twin in use is never hidden, however the pair is collapsed.
				fastSelected: ['GPT-5.5', 'Example 2.5 (fast mode)'],
			},
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
			'example-opus-5': { label: 'Claude Opus 5', featured: true, exists: false },
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
				unavailable: [{ id: 'example-opus-5', needsUpdate: false }, { id: 'gpt-6', needsUpdate: true }],
			},
		);
	});

	test('an offer on a model this build is too old to run does not break the shortlist', () => {
		// The promoted model is gated, so it is not among the selectable models. Reaching
		// for it regardless used to put a hole in the shortlist and crash the sort.
		const base = createModel('gpt-6', 'GPT-6');
		const gatedPromo = { ...base, metadata: { ...base.metadata, promo: { id: 'p', discountPercent: 25, message: 'Save now.' } } };
		const sections = buildModelPickerSections({
			models: [gatedPromo, gpt],
			selectedModelId: undefined,
			recentModelIds: [],
			pinnedModelIds: [],
			controlModels: { 'gpt-6': { label: 'GPT-6', featured: true, exists: true, minVSCodeVersion: '99.0.0' } },
			showSuggested: true,
			showUnavailable: true,
			currentVSCodeVersion: '1.100.0',
		});
		assert.deepStrictEqual(
			{
				suggested: sections.suggested.map(model => model.metadata.name),
				other: sections.other.map(model => model.metadata.name),
				unavailable: sections.unavailable.map(entry => ({ id: entry.id, needsUpdate: entry.needsUpdate })),
			},
			{ suggested: ['GPT-5.5'], other: [], unavailable: [{ id: 'gpt-6', needsUpdate: true }] },
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
			controlModels: { ...controlModels, 'claude-sonnet-5': { label: 'Claude Sonnet 5', exists: true, demoted: true } },
			showSuggested: true,
			showUnavailable: true,
			currentVSCodeVersion: '1.100.0',
		});
		assert.deepStrictEqual(
			{
				pinned: sections.pinned.map(model => model.metadata.name),
				suggested: sections.suggested.map(model => model.metadata.name),
				other: sections.other.map(model => model.metadata.name),
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
			controlModels: { 'example-opus-5': { label: 'Claude Opus 5', featured: true, exists: false } },
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
