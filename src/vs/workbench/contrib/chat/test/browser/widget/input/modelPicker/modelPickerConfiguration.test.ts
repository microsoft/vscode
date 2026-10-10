/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { renderModelConfigurationButton } from '../../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js';
import { getModelConfigChoices, getModelConfigProperty, IModelConfigurationAccess, setModelConfigValues } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelConfigurationSchema } from '../../../../../common/languageModels.js';

/**
 * Builds a model whose schema advertises a Thinking Effort and a Context Size
 * group. A producer that cannot resolve a default leaves it `undefined` (see
 * the agent host's `thinkingLevel` schema), so each group's default is
 * omittable to cover that case.
 */
function createModel(options?: { readonly omitEffortDefault?: boolean; readonly omitContextDefault?: boolean }): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/test-model',
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: 'test-model',
			name: 'Test Model',
			vendor: 'copilot',
			version: '1.0',
			family: 'test',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			configurationSchema: {
				properties: {
					effort: {
						type: 'string',
						group: 'navigation',
						enum: ['low', 'medium'],
						enumItemLabels: ['Low', 'Medium'],
						enumDescriptions: ['Faster', 'Balanced'],
						default: options?.omitEffortDefault ? undefined : 'low',
					},
					context: {
						type: 'number',
						group: 'tokens',
						enum: [32768, 65536],
						enumItemLabels: ['32K', '64K'],
						default: options?.omitContextDefault ? undefined : 32768,
					},
				},
			},
		} as ILanguageModelChatMetadata,
	};
}

/**
 * Builds a model shaped like Copilot's Auto entry: a single navigation group
 * that names itself "Optimize for" instead of reusing the thinking-effort wording.
 */
function createTierModel(): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/auto',
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: 'auto',
			name: 'Auto',
			vendor: 'copilot',
			version: '1.0',
			family: 'auto',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			configurationSchema: {
				properties: {
					tier: {
						type: 'string',
						title: 'Optimize for',
						group: 'navigation',
						enum: ['eco', 'balanced', 'max'],
						enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'],
						enumDescriptions: ['Cheaper models', 'Balances capability and cost', 'Most capable models'],
						default: 'balanced',
					},
				},
			},
		} as ILanguageModelChatMetadata,
	};
}

function createAccess(configuration: Record<string, unknown> = {}, schema?: ILanguageModelConfigurationSchema): IModelConfigurationAccess {
	return {
		getModelConfiguration: () => configuration,
		getModelConfigurationSchema: () => schema,
		setModelConfiguration: async (_modelId, values) => { Object.assign(configuration, values); },
		getModelConfigurationActions: () => [],
	};
}

/**
 * Renders the configuration readout for `model` and returns what the user can
 * see: whether it is shown, its label and its accessible name.
 */
function render(model: ILanguageModelChatMetadataAndIdentifier | undefined, configuration: Record<string, unknown> = {}, schema?: ILanguageModelConfigurationSchema, hidden = false) {
	const button = document.createElement('a');
	renderModelConfigurationButton(button, model, createAccess(configuration, schema), hidden);
	return {
		visible: button.style.display !== 'none',
		label: button.textContent,
		ariaLabel: button.ariaLabel,
	};
}

suite('ModelPickerConfiguration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('alias selection is independent of object order and preserves original writes', async () => {
		const model = createTierModel();
		const writes: Record<string, unknown>[] = [];
		const properties = {
			reasoningEffort: { type: 'string', group: 'navigation', enum: ['low', 'high'] },
			autoTier: { type: 'string', group: 'navigation', enum: ['default', 'efficiency', 'balance', 'intelligence', 'fast'] },
			tier: { type: 'string', group: 'navigation', enum: ['efficiency', 'balance', 'intelligence'] },
			contextTier: { type: 'string', group: 'tokens', enum: ['default', 'long_context'] },
			contextSize: { type: 'number', group: 'tokens', enum: [32000, 64000] },
		} satisfies NonNullable<ILanguageModelConfigurationSchema['properties']>;
		const snapshots = [];
		for (const entries of [Object.entries(properties), Object.entries(properties).reverse()]) {
			const access: IModelConfigurationAccess = {
				getModelConfigurationSchema: () => ({ properties: Object.fromEntries(entries) }),
				getModelConfiguration: () => ({ autoTier: 'fast', tier: 'efficiency' }),
				setModelConfiguration: async (_id, values) => { writes.push(values); },
				getModelConfigurationActions: () => [],
			};
			snapshots.push(['navigation', 'tokens'].map(group => getModelConfigProperty(model, access, group)?.key));
			await setModelConfigValues(model, access, { tier: 'intelligence' });
		}
		assert.deepStrictEqual({ snapshots, writes }, {
			snapshots: [['tier', 'contextSize'], ['tier', 'contextSize']],
			writes: [{ tier: 'intelligence' }, { tier: 'intelligence' }],
		});
	});

	test('native autoTier keeps fast and omission distinct, without balance or null reset', async () => {
		const model = createTierModel();
		const writes: Record<string, unknown>[] = [];
		let configuration: Record<string, unknown> = {};
		const access: IModelConfigurationAccess = {
			getModelConfigurationSchema: () => ({ properties: { autoTier: { type: 'string', group: 'navigation', enum: ['default', 'efficiency', 'balance', 'intelligence', 'fast'] } } }),
			getModelConfiguration: () => configuration,
			setModelConfiguration: async (_id, values) => { writes.push(values); configuration = { ...configuration, ...values }; },
			getModelConfigurationActions: () => [],
		};
		const omitted = getModelConfigProperty(model, access, 'navigation')?.value;
		await setModelConfigValues(model, access, { autoTier: 'fast' });
		const fast = getModelConfigProperty(model, access, 'navigation')?.value;
		await setModelConfigValues(model, access, { autoTier: 'default' });
		assert.deepStrictEqual({ omitted, fast, reset: getModelConfigProperty(model, access, 'navigation')?.value, writes }, {
			omitted: undefined, fast: 'fast', reset: 'default', writes: [{ autoTier: 'fast' }, { autoTier: 'default' }],
		});
	});

	test('choice metadata consistently describes values, descriptions, defaults, selection, and read-only state', () => {
		assert.deepStrictEqual(getModelConfigChoices({
			key: 'context',
			value: 64000,
			schema: { type: 'number', enum: [32000, 64000], enumDescriptions: ['Standard', 'Extended'], default: 32000, readOnly: true },
		}), [
			{ index: 0, value: 32000, label: '32K', description: 'Standard', checked: false, isDefault: true, readOnly: true },
			{ index: 1, value: 64000, label: '64K', description: 'Extended', checked: true, isDefault: false, readOnly: true },
		]);
	});

	test('renders the effective configuration and names its details destination', () => {
		assert.deepStrictEqual(render(createModel(), { effort: 'medium', context: 65536 }), {
			visible: true,
			label: 'Medium · 64K',
			ariaLabel: 'Test Model details, Thinking Effort: Medium, Context: 64K',
		});
	});

	test('the readout includes defaults', () => {
		assert.deepStrictEqual(render(createModel()), {
			visible: true,
			label: 'Low · 32K',
			ariaLabel: 'Test Model details, Thinking Effort: Low, Context: 32K',
		});
	});

	test('the Auto readout opens its Details like any model', () => {
		assert.deepStrictEqual(render(createTierModel()), {
			visible: true,
			label: 'Balance',
			ariaLabel: 'Auto details, Optimize for: Balance',
		});
	});

	test('names the navigation group after the schema title when one is given', () => {
		assert.deepStrictEqual(render(createTierModel(), { tier: 'max' }), {
			visible: true,
			label: 'Intelligence',
			ariaLabel: 'Auto details, Optimize for: Intelligence',
		});
	});

	// A producer that cannot resolve a default leaves it `undefined`, which must
	// not be stringified into the label. The group is dropped from the readout.
	test('omits an unresolved group from the label rather than rendering "undefined"', () => {
		assert.deepStrictEqual(render(createModel({ omitEffortDefault: true })), {
			visible: true,
			label: '32K',
			ariaLabel: 'Test Model details, Context: 32K',
		});
	});

	test('keeps unresolved settings reachable without guessing', () => {
		assert.deepStrictEqual(render(createModel({ omitEffortDefault: true, omitContextDefault: true })), {
			visible: true,
			label: 'Configure',
			ariaLabel: 'Test Model details, Configure',
		});
	});

	test('links fixed context to information without adding configuration', () => {
		const model = createModel();
		assert.deepStrictEqual(render({ ...model, metadata: { ...model.metadata, configurationSchema: undefined, maxContextWindowTokens: 200000 } }), {
			visible: true,
			label: '200K',
			ariaLabel: 'Test Model details, Max context: 200K',
		});
	});

	test('is hidden when asked to or without a model', () => {
		assert.deepStrictEqual([render(createModel(), {}, undefined, true).visible, render(undefined).visible], [false, false]);
	});

	test('uses the scoped managed default without rewriting provider metadata', () => {
		const model = createTierModel();
		const original = model.metadata.configurationSchema!;
		const schema = { ...original, properties: { ...original.properties, tier: { ...original.properties!.tier, default: 'max' } } };
		const property = getModelConfigProperty(model, createAccess({ tier: 'balanced' }, schema), 'navigation');
		assert.ok(property);
		assert.deepStrictEqual({
			choices: getModelConfigChoices(property).map(({ label, checked, isDefault }) => ({ label, checked, isDefault })),
			providerDefault: original.properties?.tier.default,
		}, {
			choices: [
				{ label: 'Efficiency', checked: false, isDefault: false },
				{ label: 'Balance', checked: true, isDefault: false },
				{ label: 'Intelligence', checked: false, isDefault: true },
			],
			providerDefault: 'balanced',
		});
	});
});
