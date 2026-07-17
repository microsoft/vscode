/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { ModelPickerConfiguration } from '../../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function createModel(): ILanguageModelChatMetadataAndIdentifier {
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
						default: 'low',
					},
					context: {
						type: 'number',
						group: 'tokens',
						enum: [32768, 65536],
						enumItemLabels: ['32K', '64K'],
						default: 32768,
					},
				},
			},
		} as ILanguageModelChatMetadata,
	};
}

suite('ModelPickerConfiguration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders the combined label and builds accessible option sections', () => {
		const model = createModel();
		const configuration = { effort: 'medium', context: 65536 };
		const access: IModelConfigurationAccess = {
			getModelConfiguration: () => configuration,
			setModelConfiguration: async (_modelId, values) => { Object.assign(configuration, values); },
			getModelConfigurationActions: () => [],
		};
		let shownItems: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const actionWidgetService = {
			show: (_id: string, _supportsPreview: boolean, items: IActionListItem<IActionWidgetDropdownAction>[]) => shownItems = items,
			focusItemById: () => { },
			updateItems: () => { },
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

		assert.deepStrictEqual({
			label: button.textContent,
			ariaLabel: button.ariaLabel,
			sections: shownItems.map(item => item.kind === ActionListItemKind.Action ? {
				label: item.label,
				checked: item.item!.checked,
				ariaDescription: item.ariaDescription,
			} : { kind: item.kind, label: item.label }),
		}, {
			label: 'Medium 64K',
			ariaLabel: 'Thinking Effort: Medium, Context Size: 64K',
			sections: [
				{ kind: ActionListItemKind.Header, label: 'Thinking Effort' },
				{ label: 'Low', checked: false, ariaDescription: 'Default, Faster' },
				{ label: 'Medium', checked: true, ariaDescription: 'Balanced' },
				{ kind: ActionListItemKind.Separator, label: undefined },
				{ kind: ActionListItemKind.Header, label: 'Context Size' },
				{ label: '32K', checked: false, ariaDescription: 'Default' },
				{ label: '64K', checked: true, ariaDescription: undefined },
			],
		});
	});
});
