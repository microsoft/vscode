/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWebview } from '../../browser/webview.js';
import { WebviewWindowDragMonitor } from '../../browser/webviewWindowDragMonitor.js';

suite('WebviewWindowDragMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupDrag(mime: string) {
		const calls: string[] = [];
		const webview = upcastPartial<IWebview>({
			windowDidDragStart: () => calls.push('block'),
			windowDidDragEnd: () => calls.push('unblock'),
			windowDidDrag: event => calls.push(event.type),
		});
		store.add(new WebviewWindowDragMonitor(mainWindow, () => webview));
		const transfer = new DataTransfer();
		transfer.setData(mime, 'resource');
		const dispatch = (type: string, shiftKey = true) => mainWindow.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, shiftKey }));
		return { calls, dispatch };
	}

	for (const mime of ['ResourceURLs', 'CodeFiles']) {
		test(`keeps ${mime} drags in the host until they can be forwarded`, () => {
			const { calls, dispatch } = setupDrag(mime);
			for (const type of ['dragstart', 'drag', 'dragover', 'dragleave', 'drop', 'dragend', 'dragover']) {
				dispatch(type);
			}
			assert.deepStrictEqual(calls, ['block', 'block', 'block', 'dragover', 'dragleave', 'drop', 'unblock', 'unblock']);
		});
	}

	test('preserves native forwarding for external drags and other transfer types', () => {
		const { calls, dispatch } = setupDrag('text/plain');
		dispatch('dragover');
		dispatch('dragstart', false);
		dispatch('dragover', false);
		dispatch('dragover');
		dispatch('drop');
		dispatch('dragend');
		assert.deepStrictEqual(calls, ['unblock', 'block', 'block', 'unblock', 'unblock']);
	});
});
