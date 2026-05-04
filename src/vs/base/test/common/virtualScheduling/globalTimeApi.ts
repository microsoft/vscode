/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../common/lifecycle.js';
import { captureGlobalTimeApi, realTimeApi, TimeApi } from './timeApi.js';

/** Cast through `unknown` so we don't widen our typed `TimeApi` shapes to `any`. */
type AsGlobal<K extends keyof typeof globalThis> = (typeof globalThis)[K];

/**
 * Replace the global time APIs (`setTimeout`, `setInterval`, …, `Date`,
 * optionally `requestAnimationFrame`) with the ones from `api`. Returns a
 * disposable that restores the previous globals.
 *
 * The previous globals are captured *at install time*, so nested installs
 * compose correctly (the disposable restores to whatever was current when
 * this call was made, not to the original real values).
 *
 * `api.setTimeout.originalFn` (if present) is preserved on the installed
 * function so callers like the component-explorer host can escape virtual
 * time when polling.
 */
export function pushGlobalTimeApi(api: TimeApi): IDisposable {
	const previous = captureGlobalTimeApi();

	globalThis.setTimeout = api.setTimeout as unknown as AsGlobal<'setTimeout'>;
	globalThis.clearTimeout = api.clearTimeout as unknown as AsGlobal<'clearTimeout'>;
	globalThis.setInterval = api.setInterval as unknown as AsGlobal<'setInterval'>;
	globalThis.clearInterval = api.clearInterval as unknown as AsGlobal<'clearInterval'>;
	globalThis.Date = api.Date;

	if (api.requestAnimationFrame) {
		globalThis.requestAnimationFrame = api.requestAnimationFrame;
	}
	if (api.cancelAnimationFrame) {
		globalThis.cancelAnimationFrame = api.cancelAnimationFrame;
	}

	return {
		dispose: () => {
			globalThis.setTimeout = previous.setTimeout as unknown as AsGlobal<'setTimeout'>;
			globalThis.clearTimeout = previous.clearTimeout as unknown as AsGlobal<'clearTimeout'>;
			globalThis.setInterval = previous.setInterval as unknown as AsGlobal<'setInterval'>;
			globalThis.clearInterval = previous.clearInterval as unknown as AsGlobal<'clearInterval'>;
			globalThis.Date = previous.Date;
			if (previous.requestAnimationFrame) {
				globalThis.requestAnimationFrame = previous.requestAnimationFrame;
			}
			if (previous.cancelAnimationFrame) {
				globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
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
