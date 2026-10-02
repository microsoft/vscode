/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

/** Allow loading feedback to paint before synchronous history/widget binding. */
export async function renderChatLoadingProgress(container: HTMLElement, token: CancellationToken): Promise<void> {
	const targetWindow = getWindow(container);
	if (targetWindow.document.visibilityState !== 'visible') {
		return;
	}
	const store = new DisposableStore();
	const rendered = new DeferredPromise<void>();
	let frames = 0;
	const schedule = () => store.add(scheduleAtNextAnimationFrame(targetWindow, () => {
		if (++frames === 2) {
			void rendered.complete();
		} else {
			schedule();
		}
	}));
	try {
		store.add(addDisposableListener(targetWindow.document, 'visibilitychange', () => {
			if (targetWindow.document.visibilityState !== 'visible') {
				void rendered.complete();
			}
		}));
		schedule();
		await raceCancellationError(rendered.p, token);
	} finally {
		store.dispose();
	}
}
