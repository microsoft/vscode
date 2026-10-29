/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createTextInputActions } from '../../browser/textInputActions.js';
import { TestClipboardService } from '../common/testClipboardService.js';

suite('Text input actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function paste(clipboardText: string) {
		const clipboardService = new TestClipboardService();
		await clipboardService.writeText(clipboardText);
		const input = mainWindow.document.createElement('input');
		mainWindow.document.body.appendChild(input);
		store.add(toDisposable(() => input.remove()));
		input.value = 'harmless';
		input.setSelectionRange(2, 5);
		let inputEvents = 0;
		input.addEventListener('input', () => inputEvents++);
		const action = createTextInputActions(clipboardService, new NullLogService()).find(action => action.id === 'editor.action.clipboardPasteAction')!;
		await action.run(input);
		return { value: input.value, selection: [input.selectionStart, input.selectionEnd], inputEvents };
	}

	test('paste replaces the selection with the clipboard text', async () => {
		assert.deepStrictEqual(await paste('XY'), { value: 'haXYess', selection: [4, 4], inputEvents: 1 });
	});

	test('paste keeps the value and selection when the clipboard is empty or cannot be read', async () => {
		assert.deepStrictEqual(await paste(''), { value: 'harmless', selection: [2, 5], inputEvents: 0 });
	});
});
