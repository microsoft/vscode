/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeApi } from './timeApi.js';

/**
 * Wrap `underlying` so that every call to `setTimeout`, `setInterval`,
 * `setImmediate` or `requestAnimationFrame` invokes `onCall` first.
 *
 * Useful for diagnostics — e.g. logging timer registrations made outside of
 * virtual time, to find leaks of real-time scheduling into a fixture.
 */
export function createLoggingTimeApi(
	underlying: TimeApi,
	onCall: (name: string, stack: string | undefined, handler?: () => void) => void,
): TimeApi {
	return {
		setTimeout(handler, timeout) {
			onCall('setTimeout', new Error().stack, handler);
			return underlying.setTimeout(handler, timeout);
		},
		clearTimeout(id) { return underlying.clearTimeout(id); },
		setInterval(handler, interval) {
			onCall('setInterval', new Error().stack, handler);
			return underlying.setInterval(handler, interval);
		},
		clearInterval(id) { return underlying.clearInterval(id); },
		setImmediate: underlying.setImmediate ? handler => {
			onCall('setImmediate', new Error().stack, handler);
			return underlying.setImmediate!(handler);
		} : undefined,
		clearImmediate: underlying.clearImmediate,
		requestAnimationFrame: underlying.requestAnimationFrame ? cb => {
			onCall('requestAnimationFrame', new Error().stack, cb as () => void);
			return underlying.requestAnimationFrame!(cb);
		} : undefined,
		cancelAnimationFrame: underlying.cancelAnimationFrame,
		Date: underlying.Date,
	};
}
