/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../../../base/common/actions.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { ChatInputPickerActionViewItem } from '../../../../browser/widget/input/chatInputPickerActionItem.js';

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
