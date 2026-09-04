/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ModelPickerAutoRow } from '../../../../../browser/widget/input/modelPicker/modelPickerAutoRow.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function createAutoModel(): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/auto',
		metadata: {
			id: 'auto',
			name: 'Auto',
			vendor: 'copilot',
			version: '1.0',
			family: 'auto',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
		} as ILanguageModelChatMetadata,
	};
}

function createConfigurationAccess(): IModelConfigurationAccess {
	const values: IStringDictionary<IStringDictionary<unknown>> = {};
	return {
		getModelConfiguration: modelId => values[modelId],
		setModelConfiguration: async (modelId, next) => { values[modelId] = { ...values[modelId], ...next }; },
		getModelConfigurationActions: () => [],
	};
}

suite('ModelPickerAutoRow', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRow(initiallyEnabled: boolean) {
		const toggles: boolean[] = [];
		let enabled = initiallyEnabled;
		const row = disposables.add(new ModelPickerAutoRow({
			autoModel: createAutoModel(),
			configurationAccess: createConfigurationAccess(),
			isEnabled: () => enabled,
			onToggle: next => {
				enabled = next;
				toggles.push(next);
			},
		}));
		const element = row.element;
		return {
			toggles,
			main: element.querySelector('.chat-model-picker-auto-main') as HTMLElement,
			label: element.querySelector('.chat-model-picker-auto-label') as HTMLElement,
			description: element.querySelector('.chat-model-picker-auto-description') as HTMLElement,
			toggle: element.querySelector('.monaco-switch') as HTMLElement,
		};
	}

	test('clicking the label toggles Auto on', () => {
		const { toggles, label, toggle } = createRow(false);

		label.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [true], checked: 'true' });
	});

	test('clicking the label toggles Auto back off', () => {
		const { toggles, label, toggle } = createRow(true);

		label.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [false], checked: 'false' });
	});

	test('clicking the switch itself reports one change, not two', () => {
		const { toggles, toggle } = createRow(false);

		toggle.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [true], checked: 'true' });
	});

	test('clicking the strip beside the label toggles Auto', () => {
		const { toggles, main, toggle } = createRow(false);

		main.click();

		assert.deepStrictEqual({ toggles, checked: toggle.getAttribute('aria-checked') }, { toggles: [true], checked: 'true' });
	});

	// The row sits in the popup's footer, which is dismissed when focus leaves it.
	// Pressing inert parts of the row must not move focus, or the popup closes first.
	test('pressing the strip and the description does not move focus', () => {
		const { main, description } = createRow(false);
		const defaultPrevented = (target: HTMLElement) => {
			const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event.defaultPrevented;
		};

		assert.deepStrictEqual(
			{ strip: defaultPrevented(main), description: defaultPrevented(description) },
			{ strip: true, description: true });
	});
});
