/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createTestBrowserView } from './browserViewTestUtils.js';

suite('BrowserView native lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const source of ['native', 'editor', 'window'] as const) {
		test(`disposes listeners and pending favicon work after ${source} closure`, async () => {
			const testCase = createTestBrowserView(store);
			let closed = 0;
			store.add(testCase.view.onDidClose(() => closed++));
			const iconUrl = 'https://first.example/pending.png';
			testCase.events.emit('page-favicon-updated', {}, [iconUrl]);
			const subscribed = testCase.windowClosed.hasListeners() && testCase.permissionsChanged.hasListeners();

			if (source === 'native') {
				testCase.webContents.close();
			} else if (source === 'editor') {
				testCase.view.dispose();
			} else {
				testCase.windowClosed.fire();
			}
			testCase.view.dispose();
			await testCase.completeFavicon(iconUrl, 'late-icon');

			assert.deepStrictEqual({
				subscribed, closed, closeCalls: testCase.closeCalls,
				contents: testCase.view.getWebContentsView().webContents,
				windowListeners: testCase.windowClosed.hasListeners(),
				permissionListeners: testCase.permissionsChanged.hasListeners(),
				historyIcon: testCase.history[0].favicon,
			}, {
				subscribed: true, closed: 1, closeCalls: 1, contents: undefined,
				windowListeners: false, permissionListeners: false, historyIcon: undefined,
			});
		});
	}
});
