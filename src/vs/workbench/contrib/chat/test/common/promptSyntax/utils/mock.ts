/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../../base/common/assert.js';
import { isOneOf } from '../../../../../../../base/common/types.js';



/**
 * Mocks an `TObject` with the provided `overrides`.
 *
 * If you need to mock an `Service`, please use {@link mockService}
 * instead which provides better type safety guarantees for the case.
 *
 * @throws Reading non-overridden property or function on `TObject` throws an error.
 */
export function mockObject<TObject extends object>(
	overrides: Partial<TObject>,
): TObject {
	// ensure that the overrides object cannot be modified afterward
	overrides = Object.freeze(overrides);

	const keys: (keyof Partial<TObject>)[] = [];
	for (const key in overrides) {
		if (Object.hasOwn(overrides, key)) {
			keys.push(key);
		}
	}

	const mocked: object = new Proxy(
		{},
		{
			get: <T extends keyof TObject>(
				_target: TObject,
				key: string | number | Symbol,
			): TObject[T] => {
				assert(
					isOneOf(key, keys),
					`The '${key}' is not mocked.`,
				);

				// note! it's ok to type assert here, because of the explicit runtime
				//       assertion  above
				return overrides[key as T] as TObject[T];
			},
		});

	// note! it's ok to type assert here, because of the runtime checks in
	//       the `Proxy` getter
	return mocked as TObject;
}

/**
 * Type for any service.
 */
type TAnyService = {
	readonly _serviceBrand: undefined;
};

/**
 * Mocks provided service with the provided `overrides`.
 * Same as more generic {@link mockObject} utility, but with
 * the service constraint on the `TService` type.
 *
 * @throws Reading non-overridden property or function
 * 		   on `TService` throws an error.
 */
export function mockService<TService extends TAnyService>(
	overrides: Partial<TService>,
): TService {
	return mockObject(overrides);
}
