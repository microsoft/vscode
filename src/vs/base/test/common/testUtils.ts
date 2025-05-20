/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../common/assert.js';
import { isOneOf } from '../../common/types.js';
import { randomInt } from '../../common/numbers.js';

export function flakySuite(title: string, fn: () => void) /* Suite */ {
	return suite(title, function () {

		// Flaky suites need retries and timeout to complete
		// e.g. because they access browser features which can
		// be unreliable depending on the environment.
		this.retries(3);
		this.timeout(1000 * 20);

		// Invoke suite ensuring that `this` is
		// properly wired in.
		fn.call(this);
	});
}

/**
 * @deprecated use `async#timeout` instead
 */
export const wait = (ms: number): Promise<void> => {
	return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Helper function that allows to await for a random amount of time.
 * @param maxMs The `maximum` amount of time to wait, in milliseconds.
 * @param minMs [`optional`] The `minimum` amount of time to wait, in milliseconds.
 */
export const waitRandom = (maxMs: number, minMs: number = 0): Promise<void> => {
	return wait(randomInt(maxMs, minMs));
};

/**
 * (pseudo)Random boolean generator.
 *
 * ## Examples
 *
 * ```typescript
 * randomBoolean(); // generates either `true` or `false`
 * ```
 *
 */
export const randomBoolean = (): boolean => {
	return Math.random() > 0.5;
};

/**
 *@deprecated use `mock.ts#mock` instead
 */
export function mockObject<TObject extends Object>(
	overrides: Partial<TObject>,
): TObject {
	// ensure that the overrides object cannot be modified afterward
	overrides = Object.freeze(overrides);

	const keys = Object.keys(overrides) as (keyof (typeof overrides))[];
	const service = new Proxy(
		{},
		{
			get: (_target, key: string | number | Symbol) => {
				// sanity check for the provided `key`
				assert(
					isOneOf(key, keys),
					`The '${key}' is not mocked.`,
				);

				return overrides[key];
			},
		});

	// note! it's ok to `as TObject` here, because of
	// 		 the runtime checks in the `Proxy` getter
	return service as (typeof overrides) as TObject;
}
