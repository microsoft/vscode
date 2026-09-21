/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenWindowIdle, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

/** Lets the newly active session paint before restoring its secondary editors. */
export async function waitForSessionSwitchPaint(
	targetWindow: Window,
	token: CancellationToken,
	scheduleFrame = scheduleAtNextAnimationFrame,
	scheduleIdle = runWhenWindowIdle,
): Promise<void> {
	if (token.isCancellationRequested) {
		return;
	}

	const store = new DisposableStore();
	try {
		await new Promise<void>(resolve => {
			const complete = () => {
				store.dispose();
				resolve();
			};
			store.add(token.onCancellationRequested(complete));
			if (token.isCancellationRequested) {
				complete();
				return;
			}
			store.add(scheduleFrame(targetWindow, () => {
				if (!token.isCancellationRequested) {
					// Resolving in the frame callback itself would resume editor work before paint.
					store.add(scheduleIdle(targetWindow, complete));
				}
			}));
		});
	} finally {
		store.dispose();
	}
}
