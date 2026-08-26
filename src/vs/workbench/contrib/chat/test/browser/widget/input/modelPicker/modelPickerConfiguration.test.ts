/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { ModelPickerConfiguration } from '../../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

type TestActionListDelegate = Omit<IActionListDelegate<IActionWidgetDropdownAction>, 'onSelect'> & {
	onSelect(action: IActionWidgetDropdownAction): Promise<void>;
};

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

/**
 * Renders the configuration button and opens the dropdown for `model`, then
 * returns the rendered view and interaction state used by the tests.
 */
function render(model: ILanguageModelChatMetadataAndIdentifier, configuration: Record<string, unknown> = {}) {
	const access: IModelConfigurationAccess = {
		getModelConfiguration: () => configuration,
		setModelConfiguration: async (_modelId, values) => { Object.assign(configuration, values); },
		getModelConfigurationActions: () => [],
	};
	const calls = {
		hide: 0,
		updateItems: 0,
	};
	let shownDelegate: TestActionListDelegate | undefined;
	let shownItems: IActionListItem<IActionWidgetDropdownAction>[] = [];
	let shownOptions: IActionListOptions | undefined;
	const actionWidgetService = {
		show: (
			_id: string,
			_supportsPreview: boolean,
			items: IActionListItem<IActionWidgetDropdownAction>[],
			delegate: IActionListDelegate<IActionWidgetDropdownAction>,
			_anchor: unknown,
			_container: unknown,
			_actions: unknown,
			_accessibilityProvider: unknown,
			options: IActionListOptions,
		) => {
			shownItems = items;
			shownDelegate = delegate as TestActionListDelegate;
			shownOptions = options;
		},
		hide: () => {
			calls.hide++;
		},
		focusItemById: () => { },
		updateItems: () => {
			calls.updateItems++;
		},
	} as unknown as IActionWidgetService;
	const controller = new ModelPickerConfiguration({
		getSelectedModel: () => model,
		getConfigurationAccess: () => access,
		isDisabled: () => false,
		shouldShowCacheBreakHint: () => false,
		getCacheBreakLearnMoreLink: () => undefined,
		dismissCacheBreakHint: () => { },
	}, actionWidgetService, { publicLog2: () => { } } as unknown as ITelemetryService);
	const button = document.createElement('a');

	controller.renderButton(button, false, false);
	controller.show(button);

	return {
		view: {
			label: button.textContent,
			ariaLabel: button.ariaLabel,
			listOptions: {
				reserveSubmenuSpace: shownOptions?.reserveSubmenuSpace,
			},
			sections: shownItems.map(item => item.kind === ActionListItemKind.Action ? {
				className: item.className,
				label: item.label,
				checked: item.item!.checked,
				ariaDescription: item.ariaDescription,
			} : { kind: item.kind, label: item.label }),
		},
		shownItems,
		shownDelegate,
		calls,
	};
}

suite('ModelPickerConfiguration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders the combined label and builds accessible option sections', () => {
		assert.deepStrictEqual(render(createModel(), { effort: 'medium', context: 65536 }).view, {
			label: 'Medium 64K',
			ariaLabel: 'Thinking Effort: Medium, Context Size: 64K',
			listOptions: {
				reserveSubmenuSpace: false,
			},
			sections: [
				{ kind: ActionListItemKind.Header, label: 'Thinking Effort' },
				{ className: 'chat-model-picker-config-option', label: 'Low', checked: false, ariaDescription: 'Default, Faster' },
				{ className: 'chat-model-picker-config-option', label: 'Medium', checked: true, ariaDescription: 'Balanced' },
				{ kind: ActionListItemKind.Separator, label: undefined },
				{ kind: ActionListItemKind.Header, label: 'Context Size' },
				{ className: 'chat-model-picker-config-option', label: '32K', checked: false, ariaDescription: 'Default' },
				{ className: 'chat-model-picker-config-option', label: '64K', checked: true, ariaDescription: undefined },
			],
		});
	});

	// A producer that cannot resolve a default leaves it `undefined`, which used
	// to be stringified straight into the label as "undefined 272K". The group is
	// dropped from the label instead, while its options stay selectable.
	test('omits an unresolved group from the label rather than rendering "undefined"', () => {
		assert.deepStrictEqual(render(createModel({ omitEffortDefault: true })).view, {
			label: '32K',
			ariaLabel: 'Context Size: 32K',
			listOptions: {
				reserveSubmenuSpace: false,
			},
			sections: [
				{ kind: ActionListItemKind.Header, label: 'Thinking Effort' },
				{ className: 'chat-model-picker-config-option', label: 'Low', checked: false, ariaDescription: 'Faster' },
				{ className: 'chat-model-picker-config-option', label: 'Medium', checked: false, ariaDescription: 'Balanced' },
				{ kind: ActionListItemKind.Separator, label: undefined },
				{ kind: ActionListItemKind.Header, label: 'Context Size' },
				{ className: 'chat-model-picker-config-option', label: '32K', checked: true, ariaDescription: 'Default' },
				{ className: 'chat-model-picker-config-option', label: '64K', checked: false, ariaDescription: undefined },
			],
		});
	});

	// With nothing to summarize the button falls back to a generic label so the
	// configuration stays reachable — it must not read "undefined undefined".
	test('falls back to a generic label when no group resolves a value', () => {
		const rendered = render(createModel({ omitEffortDefault: true, omitContextDefault: true })).view;
		assert.deepStrictEqual({ label: rendered.label, ariaLabel: rendered.ariaLabel }, {
			label: 'Configure',
			ariaLabel: 'Configure',
		});
	});

	// The navigation group is generic: Copilot's Auto model uses it for the
	// routing tier rather than thinking effort, and names it through `title`.
	test('names the navigation group after the schema title when one is given', () => {
		assert.deepStrictEqual(render(createTierModel(), { tier: 'max' }).view, {
			label: 'Intelligence',
			ariaLabel: 'Optimize for: Intelligence',
			listOptions: {
				reserveSubmenuSpace: false,
			},
			sections: [
				{ kind: ActionListItemKind.Header, label: 'Optimize for' },
				{ className: 'chat-model-picker-config-option', label: 'Efficiency', checked: false, ariaDescription: 'Cheaper models' },
				{ className: 'chat-model-picker-config-option', label: 'Balance', checked: false, ariaDescription: 'Default, Balances capability and cost' },
				{ className: 'chat-model-picker-config-option', label: 'Intelligence', checked: true, ariaDescription: 'Most capable models' },
			],
		});
	});

	test('hides picker upon selection when there is only one configuration section', async () => {
		const result = render(createTierModel());

		const action = result.shownItems.find(item => item.kind === ActionListItemKind.Action)?.item;

		assert.ok(action);
		assert.ok(result.shownDelegate);

		const selection = result.shownDelegate.onSelect(action);

		// Hiding must happen synchronously to cancel pending hover UI.
		assert.strictEqual(result.calls.hide, 1);

		await selection;

		assert.strictEqual(result.calls.hide, 1);
		assert.strictEqual(result.calls.updateItems, 0);
	});

	test('keeps the picker open upon selection when there are multiple configuration sections', async () => {
		const result = render(createModel());

		const action = result.shownItems.find(item => item.kind === ActionListItemKind.Action)?.item;

		assert.ok(action);
		assert.ok(result.shownDelegate);

		await result.shownDelegate.onSelect(action);

		assert.strictEqual(result.calls.hide, 0);
		assert.strictEqual(result.calls.updateItems, 1);
	});
});
