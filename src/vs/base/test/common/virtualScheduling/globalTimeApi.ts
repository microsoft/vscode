/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../common/lifecycle.js';
import { captureGlobalTimeApi, realTimeApi, TimeApi } from './timeApi.js';

/** Cast through `unknown` so we don't widen our typed `TimeApi` shapes to `any`. */
type AsGlobal<K extends keyof typeof globalThis> = (typeof globalThis)[K];

/**
 * Ensure `fn` carries an `originalFn` back-door pointing at the real
 * (non-virtual) `setTimeout`. We prefer the existing tag on `fn`, then a tag
 * inherited from `previousFn` (which may itself be a wrapper that already
 * carried the back-door), and finally fall back to `realTimeApi.setTimeout`
 * — which has its own `originalFn` set at module load.
 */
function ensureSetTimeoutOriginalFn(fn: TimeApi['setTimeout'], previousFn: TimeApi['setTimeout']): TimeApi['setTimeout'] {
	const tagged = fn as TimeApi['setTimeout'] & { originalFn?: TimeApi['setTimeout'] };
	if (!tagged.originalFn) {
		const previousTagged = previousFn as TimeApi['setTimeout'] & { originalFn?: TimeApi['setTimeout'] };
		const realTagged = realTimeApi.setTimeout as TimeApi['setTimeout'] & { originalFn?: TimeApi['setTimeout'] };
		tagged.originalFn = previousTagged.originalFn ?? realTagged.originalFn ?? realTimeApi.setTimeout;
	}
	return tagged;
}

/**
 * Replace the global time APIs (`setTimeout`, `setInterval`, …, `Date`,
 * optionally `requestAnimationFrame`) with the ones from `api`. Returns a
 * disposable that restores the previous globals.
 *
 * The previous globals are captured *at install time*, so nested installs
 * compose correctly (the disposable restores to whatever was current when
 * this call was made, not to the original real values).
 *
 * `setTimeout.originalFn` is preserved on the installed function so callers
 * like the component-explorer host can escape virtual time when polling.
 * If `api.setTimeout` does not already carry `originalFn`, it is copied from
 * the previous global (or defaulted to the real `setTimeout`) so wrapping
 * APIs such as a logging wrapper don't drop the back-door.
 */
export function pushGlobalTimeApi(api: TimeApi): IDisposable {
	const previous = captureGlobalTimeApi();

	globalThis.setTimeout = ensureSetTimeoutOriginalFn(api.setTimeout, previous.setTimeout) as unknown as AsGlobal<'setTimeout'>;
	globalThis.clearTimeout = api.clearTimeout as unknown as AsGlobal<'clearTimeout'>;
	globalThis.setInterval = api.setInterval as unknown as AsGlobal<'setInterval'>;
	globalThis.clearInterval = api.clearInterval as unknown as AsGlobal<'clearInterval'>;
	globalThis.Date = api.Date;

	if (api.requestAnimationFrame) {
		globalThis.requestAnimationFrame = api.requestAnimationFrame as unknown as AsGlobal<'requestAnimationFrame'>;
	}
	if (api.cancelAnimationFrame) {
		globalThis.cancelAnimationFrame = api.cancelAnimationFrame as unknown as AsGlobal<'cancelAnimationFrame'>;
	}

	return {
		dispose: () => {
			globalThis.setTimeout = ensureSetTimeoutOriginalFn(previous.setTimeout, previous.setTimeout) as unknown as AsGlobal<'setTimeout'>;
			globalThis.clearTimeout = previous.clearTimeout as unknown as AsGlobal<'clearTimeout'>;
			globalThis.setInterval = previous.setInterval as unknown as AsGlobal<'setInterval'>;
			globalThis.clearInterval = previous.clearInterval as unknown as AsGlobal<'clearInterval'>;
			globalThis.Date = previous.Date;
			if (previous.requestAnimationFrame) {
				globalThis.requestAnimationFrame = previous.requestAnimationFrame as unknown as AsGlobal<'requestAnimationFrame'>;
			}
			if (previous.cancelAnimationFrame) {
				globalThis.cancelAnimationFrame = previous.cancelAnimationFrame as unknown as AsGlobal<'cancelAnimationFrame'>;
			}
		},
	};
}

// One-shot tag on the *real* setTimeout: lets callers (e.g. the
// component-explorer host's polling loop) escape virtual time even after
// pushGlobalTimeApi has installed a virtual version on top. The `originalFn`
// property is not on the `setTimeout` signature by design — it's a back-door
// convention shared with the polling code.
(realTimeApi.setTimeout as unknown as { originalFn: TimeApi['setTimeout'] }).originalFn = realTimeApi.setTimeout;
