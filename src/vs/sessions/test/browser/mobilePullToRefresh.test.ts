/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { installPullToRefresh } from '../../browser/mobile/mobilePullToRefresh.js';

suite('Mobile pull to refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const endEvent of ['touchend', 'touchcancel']) {
		test(`${endEvent} reports a rejected refresh and resets the indicator`, async () => {
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const error = new Error('Refresh failed');
			const reported = new DeferredPromise<Error>();
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			store.add(toDisposable(() => setUnexpectedErrorHandler(previousHandler)));
			setUnexpectedErrorHandler(error => { void reported.complete(error); });
			let refreshCount = 0;
			store.add(installPullToRefresh(container, {
				isAtTop: () => true,
				refresh: async () => { refreshCount++; throw error; },
			}));

			for (const [type, clientY] of [['touchstart', 100], ['touchmove', 200]] as const) {
				container.dispatchEvent(new TouchEvent(type, { touches: [new Touch({ identifier: 1, target: container, clientY })] }));
			}
			container.dispatchEvent(new TouchEvent(endEvent));
			const failure = await reported.p;
			const indicator = container.querySelector<HTMLElement>('.mobile-pull-indicator')!;
			assert.deepStrictEqual({
				reported: failure === error, refreshCount,
				refreshing: indicator.classList.contains('refreshing'),
				armed: indicator.classList.contains('armed'),
				transform: indicator.style.transform,
				message: container.querySelector('.mobile-pull-live')?.textContent,
			}, { reported: true, refreshCount: 1, refreshing: false, armed: false, transform: 'translateY(0px)', message: 'Could not refresh' });
		});
	}
});
