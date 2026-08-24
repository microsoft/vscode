/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { IQuickInputButton } from '../../common/quickInput.js';
import { quickInputButtonToAction, quickInputButtonsToActionArrays } from '../../browser/quickInputUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('QuickInputUtils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('quickInputButtonToAction', () => {
		test('should convert simple button to action', () => {
			const button: IQuickInputButton = {
				iconPath: { dark: URI.file('/path/to/icon.svg') },
				tooltip: 'Test Tooltip'
			};

			let runCalled = false;
			const action = quickInputButtonToAction(button, 'test-id', () => {
				runCalled = true;
			});

			assert.strictEqual(action.id, 'test-id');
			assert.strictEqual(action.tooltip, 'Test Tooltip');
			assert.strictEqual(action.enabled, true);
			assert.ok(action.class);

			action.run();
			assert.strictEqual(runCalled, true);
		});

		test('should handle button with iconClass', () => {
			const button: IQuickInputButton = {
				iconClass: 'custom-icon-class',
				tooltip: 'Test'
			};

			const action = quickInputButtonToAction(button, 'test-id', () => { });

			assert.ok(action.class?.includes('custom-icon-class'));
		});

		test('should handle alwaysVisible button', () => {
			const button: IQuickInputButton = {
				iconClass: 'icon-class',
				tooltip: 'Test',
				alwaysVisible: true
			};

			const action = quickInputButtonToAction(button, 'test-id', () => { });

			assert.ok(action.class?.includes('always-visible'));
			assert.ok(action.class?.includes('icon-class'));
		});

		test('should handle alwaysVisible without iconClass', () => {
			const button: IQuickInputButton = {
				tooltip: 'Test',
				alwaysVisible: true
			};

			const action = quickInputButtonToAction(button, 'test-id', () => { });

			assert.strictEqual(action.class, 'always-visible');
		});

		test('should handle toggle button', () => {
			const toggle = {
				checked: false
			};
			const button: IQuickInputButton = {
				iconClass: 'toggle-icon',
				tooltip: 'Toggle Test',
				toggle
			};

			let runCalled = false;
			const action = quickInputButtonToAction(button, 'toggle-id', () => {
				runCalled = true;
			});

			assert.strictEqual(action.id, 'toggle-id');
			// For toggle buttons, tooltip is used as label
			assert.strictEqual(action.label, 'Toggle Test');
			assert.strictEqual(action.tooltip, '');
			assert.notStrictEqual(action.checked, undefined);

			// Initial state
			assert.strictEqual(action.checked, false);
			assert.strictEqual(toggle.checked, false);

			// Run the action
			action.run();
			assert.strictEqual(runCalled, true);

			// Toggle state should be flipped
			assert.strictEqual(action.checked, true);
			assert.strictEqual(toggle.checked, true);
		});

		test('should handle toggle button with initial checked state', () => {
			const toggle = {
				checked: true
			};
			const button: IQuickInputButton = {
				iconClass: 'toggle-icon',
				tooltip: 'Toggle Test',
				toggle
			};

			const action = quickInputButtonToAction(button, 'toggle-id', () => { });

			assert.strictEqual(action.checked, true);
			assert.strictEqual(toggle.checked, true);

			// Run should flip the state
			action.run();

			assert.strictEqual(action.checked, false);
			assert.strictEqual(toggle.checked, false);
		});

		test('should use empty string for tooltip when not provided', () => {
			const button: IQuickInputButton = {
				iconClass: 'icon'
			};

			const action = quickInputButtonToAction(button, 'test-id', () => { });

			assert.strictEqual(action.tooltip, '');
		});

		test('should handle button with label', () => {
			const button: IQuickInputButton = {
				iconClass: 'icon',
				tooltip: 'Test',
				label: 'Button Label'
			};

			const action = quickInputButtonToAction(button, 'test-id', () => { });

			// The label property exists on the button but the action's label is initially empty
			assert.strictEqual(action.label, '');
		});
	});

	suite('quickInputButtonsToActionArrays', () => {
		test('should convert empty array', () => {
			const buttons: IQuickInputButton[] = [];

			const result = quickInputButtonsToActionArrays(buttons, 'prefix', () => { });

			assert.strictEqual(result.primary.length, 0);
			assert.strictEqual(result.secondary.length, 0);
		});

		test('should convert primary buttons', () => {
			const buttons: IQuickInputButton[] = [
				{ iconClass: 'icon1', tooltip: 'Button 1' },
				{ iconClass: 'icon2', tooltip: 'Button 2' }
			];

			const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });

			assert.strictEqual(result.primary.length, 2);
			assert.strictEqual(result.secondary.length, 0);
			assert.strictEqual(result.primary[0].id, 'test-0');
			assert.strictEqual(result.primary[1].id, 'test-1');
		});

		test('should convert secondary buttons', () => {
			const buttons: IQuickInputButton[] = [
				{ iconClass: 'icon1', tooltip: 'Button 1', secondary: true },
				{ iconClass: 'icon2', tooltip: 'Button 2', secondary: true }
			];

			const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });

			assert.strictEqual(result.primary.length, 0);
			assert.strictEqual(result.secondary.length, 2);
			assert.strictEqual(result.secondary[0].id, 'test-0');
			assert.strictEqual(result.secondary[1].id, 'test-1');
		});

		test('should convert mixed primary and secondary buttons', () => {
			const buttons: IQuickInputButton[] = [
				{ iconClass: 'icon1', tooltip: 'Primary 1' },
				{ iconClass: 'icon2', tooltip: 'Secondary 1', secondary: true },
				{ iconClass: 'icon3', tooltip: 'Primary 2' },
				{ iconClass: 'icon4', tooltip: 'Secondary 2', secondary: true }
			];

			const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });

			assert.strictEqual(result.primary.length, 2);
			assert.strictEqual(result.secondary.length, 2);
			assert.strictEqual(result.primary[0].id, 'test-0');
			assert.strictEqual(result.primary[1].id, 'test-2');
			assert.strictEqual(result.secondary[0].id, 'test-1');
			assert.strictEqual(result.secondary[1].id, 'test-3');
		});

		test('should apply label to actions', () => {
			const buttons: IQuickInputButton[] = [
				{ iconClass: 'icon1', tooltip: 'Button 1', label: 'Label 1' },
				{ iconClass: 'icon2', tooltip: 'Button 2' }
			];

			const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });

			assert.strictEqual(result.primary[0].label, 'Label 1');
			assert.strictEqual(result.primary[1].label, '');
		});

		test('should trigger callback with correct button', () => {
			const button1: IQuickInputButton = { iconClass: 'icon1', tooltip: 'Button 1' };
			const button2: IQuickInputButton = { iconClass: 'icon2', tooltip: 'Button 2' };
			const buttons = [button1, button2];

			const triggeredButtons: IQuickInputButton[] = [];
			const result = quickInputButtonsToActionArrays(buttons, 'test', (button) => {
				triggeredButtons.push(button);
			});

			result.primary[0].run();
			assert.strictEqual(triggeredButtons.length, 1);
			assert.strictEqual(triggeredButtons[0], button1);

			result.primary[1].run();
			assert.strictEqual(triggeredButtons.length, 2);
			assert.strictEqual(triggeredButtons[1], button2);
		});

		test('should handle toggle buttons in arrays', () => {
			const toggle = { checked: false };
			const buttons: IQuickInputButton[] = [
				{ iconClass: 'icon1', tooltip: 'Toggle', toggle },
				{ iconClass: 'icon2', tooltip: 'Regular' }
			];

			const result = quickInputButtonsToActionArrays(buttons, 'test', () => { });

			const toggleAction = result.primary[0];
			assert.strictEqual(toggleAction.checked, false);
			toggleAction.run();
			assert.strictEqual(toggleAction.checked, true);
			assert.strictEqual(toggle.checked, true);
		});

		test('should use correct id prefix', () => {
			const buttons: IQuickInputButton[] = [
				{ iconClass: 'icon1', tooltip: 'Button 1' }
			];

			const result1 = quickInputButtonsToActionArrays(buttons, 'custom-prefix', () => { });
			assert.strictEqual(result1.primary[0].id, 'custom-prefix-0');

			const result2 = quickInputButtonsToActionArrays(buttons, 'another', () => { });
			assert.strictEqual(result2.primary[0].id, 'another-0');
		});
	});
});
