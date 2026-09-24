/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ModelPickerAutoRow } from '../../../../../browser/widget/input/modelPicker/modelPickerAutoRow.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';
import '../../../../../browser/widget/input/modelPicker/media/modelPicker.css';

function createAutoModel(withTiers = false): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: 'copilot/auto',
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			id: 'auto',
			name: 'Auto',
			vendor: 'copilot',
			detail: withTiers ? '10% discount' : undefined,
			configurationSchema: withTiers ? {
				properties: {
					tier: {
						type: 'string',
						title: 'Optimize for',
						group: 'navigation',
						enum: ['efficiency', 'balance', 'intelligence'],
						enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'],
						enumDescriptions: ['Cheaper models', 'Balances capability and cost', 'Most capable models'],
						default: 'balance',
					},
				},
			} : undefined,
		}),
	};
}

suite('ModelPickerAutoRow', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRow(initiallyEnabled: boolean, options: {
		autoModel?: ILanguageModelChatMetadataAndIdentifier;
		onShowDetails?: () => void;
	} = {}) {
		const toggles: boolean[] = [];
		let enabled = initiallyEnabled;
		const row: ModelPickerAutoRow = disposables.add(new ModelPickerAutoRow({
			autoModel: options.autoModel ?? createAutoModel(),
			isEnabled: () => enabled,
			onToggle: next => {
				enabled = next;
				toggles.push(next);
				row.render();
			},
			onShowDetails: options.onShowDetails,
		}));
		const element = row.element;
		mainWindow.document.body.appendChild(element);
		disposables.add(toDisposable(() => element.remove()));
		element.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 300px;
			--vscode-spacing-sizeNone: 0px;
			--vscode-spacing-size20: 2px;
			--vscode-spacing-size60: 6px;
			--vscode-spacing-size80: 8px;
			--vscode-spacing-size240: 24px;
			--vscode-fontSize-label2: 11px;
			--vscode-fontWeight-semiBold: 600;
		`;
		return {
			row,
			toggles,
			main: element.querySelector<HTMLElement>('.chat-model-picker-auto-main')!,
			label: element.querySelector<HTMLElement>('.chat-model-picker-auto-label')!,
			description: element.querySelector<HTMLElement>('.chat-model-picker-auto-description')!,
			toggle: element.querySelector<HTMLElement>('.monaco-switch')!,
			details: element.querySelector<HTMLElement>('[role="button"][aria-label="Auto Details"]'),
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

	test('pressing the strip and the description does not move focus', () => {
		const { main, description } = createRow(false);
		const defaultPrevented = (target: HTMLElement) => {
			const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			target.dispatchEvent(event);
			return event.defaultPrevented;
		};
		assert.deepStrictEqual({ strip: defaultPrevented(main), description: defaultPrevented(description) }, { strip: true, description: true });
	});

	for (const enabled of [false, true]) {
		test(`Auto ${enabled ? 'on' : 'off'} keeps details and discount visible without inline tiers`, () => {
			const result = createRow(enabled, { autoModel: createAutoModel(true), onShowDetails: () => { } });
			assert.deepStrictEqual({
				label: result.label.textContent,
				checked: result.toggle.getAttribute('aria-checked'),
				details: !!result.details,
				groups: result.row.element.querySelectorAll('[role="radiogroup"]').length,
				description: result.description.textContent,
				descriptionHidden: result.description.classList.contains('hidden'),
			}, { label: 'Auto', checked: String(enabled), details: true, groups: 0, description: '10% discount', descriptionHidden: false });
		});

		test(`opening details while Auto is ${enabled ? 'on' : 'off'} does not toggle it`, () => {
			let opened = 0;
			const result = createRow(enabled, { onShowDetails: () => { opened++; } });
			result.details!.click();
			assert.deepStrictEqual({ opened, toggles: result.toggles, checked: result.toggle.getAttribute('aria-checked') }, {
				opened: 1, toggles: [], checked: String(enabled),
			});
		});
	}

	for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
		test(`${key === ' ' ? 'Space' : key} opens Auto details without enabling Auto`, async () => {
			let opened = 0;
			const result = createRow(false, { onShowDetails: () => { opened++; } });
			result.details!.focus();
			result.details!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
			result.details!.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
			result.details!.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, bubbles: true }));
			await timeout(0);
			assert.deepStrictEqual({ opened, toggles: result.toggles }, { opened: 1, toggles: [] });
		});
	}

	test('turning Auto off and on preserves the compact footer and focus', () => {
		const result = createRow(true, { autoModel: createAutoModel(true), onShowDetails: () => { } });
		const height = result.row.element.getBoundingClientRect().height;
		result.toggle.focus();
		result.toggle.click();
		result.toggle.click();
		assert.deepStrictEqual({
			toggles: result.toggles,
			height: result.row.element.getBoundingClientRect().height,
			description: result.description.textContent,
			focused: mainWindow.document.activeElement === result.toggle,
			groups: result.row.element.querySelectorAll('[role="radiogroup"]').length,
		}, { toggles: [false, true], height, description: '10% discount', focused: true, groups: 0 });
	});

	test('an absent description does not leave an empty footer line', () => {
		const result = createRow(false);
		assert.deepStrictEqual({
			text: result.description.textContent,
			hidden: result.description.classList.contains('hidden'),
		}, { text: '', hidden: true });
	});

	test('disposing the row disconnects its actions', () => {
		let opened = 0;
		const result = createRow(false, { onShowDetails: () => { opened++; } });
		const details = result.details!;
		result.row.dispose();
		result.row.render();
		result.label.click();
		details.click();
		assert.deepStrictEqual({ opened, toggles: result.toggles }, { opened: 0, toggles: [] });
	});
});
