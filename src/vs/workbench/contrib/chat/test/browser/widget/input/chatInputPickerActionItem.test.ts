/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { ChatInputPickerActionViewItem, renderChatInputPickerSplit, trackChatInputPickerFocus } from '../../../../browser/widget/input/chatInputPickerActionItem.js';

const action: IAction = {
	id: 'test.chatInputPicker',
	label: 'Agent',
	tooltip: '',
	class: undefined,
	enabled: true,
	run: async () => { },
};

class TestChatInputPickerActionViewItem extends ChatInputPickerActionViewItem {
	constructor() {
		super(
			action,
			{ actions: [] },
			{ compact: constObservable(false) },
			new class extends mock<IActionWidgetService>() { },
			new class extends mock<IKeybindingService>() { },
			new class extends mock<IContextKeyService>() { },
			new class extends mock<ITelemetryService>() { },
		);
	}

	setElement(element: HTMLElement): void {
		this.element = element;
	}
}

suite('ChatInputPickerActionViewItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the picker in the Tab order when it is not the leading toolbar item', () => {
		const item = disposables.add(new TestChatInputPickerActionViewItem());
		const element = document.createElement('a');
		item.setElement(element);

		item.setFocusable(false);
		const afterToolbarUpdate = element.tabIndex;
		item.focus();
		const afterFocus = element.tabIndex;
		item.blur();

		assert.deepStrictEqual({
			afterToolbarUpdate,
			afterFocus,
			afterBlur: element.tabIndex,
		}, {
			afterToolbarUpdate: 0,
			afterFocus: 0,
			afterBlur: 0,
		});
	});
});

suite('ChatInputPickerSplit', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders two independent keyboard targets instead of focusing the group', () => {
		const container = dom.$('div', { 'aria-haspopup': 'menu', 'aria-expanded': 'true' });
		const { primaryButton, secondaryButton } = renderChatInputPickerSplit(container);

		assert.deepStrictEqual({
			group: { role: container.role, tabIndex: container.tabIndex, popup: container.ariaHasPopup, expanded: container.ariaExpanded },
			buttons: [primaryButton, secondaryButton].map(button => ({
				role: button.role, tabIndex: button.tabIndex, popup: button.ariaHasPopup, expanded: button.ariaExpanded,
				parent: button.parentElement === container,
			})),
		}, {
			group: { role: 'group', tabIndex: -1, popup: null, expanded: null },
			buttons: [
				{ role: 'button', tabIndex: 0, popup: 'true', expanded: 'false', parent: true },
				{ role: 'button', tabIndex: 0, popup: 'true', expanded: 'false', parent: true },
			],
		});
	});

	test('preserves focus and expansion when reusing the split buttons', () => {
		const container = dom.append(document.body, dom.$('div'));
		disposables.add({ dispose: () => container.remove() });
		const { primaryButton, secondaryButton } = renderChatInputPickerSplit(container);
		secondaryButton.focus();
		secondaryButton.ariaExpanded = 'true';
		const updated = renderChatInputPickerSplit(container, primaryButton, secondaryButton);

		assert.deepStrictEqual({
			samePrimary: updated.primaryButton === primaryButton,
			sameSecondary: updated.secondaryButton === secondaryButton,
			focused: document.activeElement === secondaryButton,
			expanded: secondaryButton.ariaExpanded,
		}, { samePrimary: true, sameSecondary: true, focused: true, expanded: 'true' });
	});

	test('excludes both buttons from keyboard navigation when disabled', () => {
		const container = dom.$('div', { 'aria-disabled': 'true' });
		const { primaryButton, secondaryButton } = renderChatInputPickerSplit(container);

		assert.deepStrictEqual([primaryButton, secondaryButton].map(button => ({
			tabIndex: button.tabIndex, disabled: button.ariaDisabled,
		})), [
			{ tabIndex: -1, disabled: 'true' },
			{ tabIndex: -1, disabled: 'true' },
		]);
	});
});

suite('ChatInputPickerFocus', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks pointer dismissal outside the composer and restores keyboard focus styling', () => {
		const container = dom.$('div');
		const targetWindow = dom.getWindow(container);
		const tracker = disposables.add(trackChatInputPickerFocus(container));
		const states = [container.className];
		targetWindow.dispatchEvent(new PointerEvent('pointerdown'));
		states.push(container.className);
		targetWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
		states.push(container.className);
		targetWindow.dispatchEvent(new PointerEvent('pointerdown'));
		states.push(container.className);
		tracker.dispose();
		targetWindow.dispatchEvent(new PointerEvent('pointerdown'));
		states.push(container.className);

		assert.deepStrictEqual(states, [
			'chat-input-picker-focus-scope',
			'chat-input-picker-focus-scope pointer-focus',
			'chat-input-picker-focus-scope',
			'chat-input-picker-focus-scope pointer-focus',
			'',
		]);
	});
});
