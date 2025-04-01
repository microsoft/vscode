/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertOneOf } from '../../../../../base/common/types.js';

/**
 * Mocks an `TObject` with the provided `overrides`.
 *
 * If you need to mock an `Service`, please use {@link mockService}
 * instead which provides better type safety guarantees for the case.
 *
 * @throws Reading non-overidden property or function
 * 		   on `TObject` throws an error.
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
				assertOneOf(
					key,
					keys,
					`The '${key}' is not mocked.`,
				);

				return overrides[key];
			},
		});

	// note! it's ok to `as TObject` here, because of
	// 		 the runtime checks in the `Proxy` getter
	return service as (typeof overrides) as TObject;
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
 * @throws Reading non-overidden property or function
 * 		   on `TService` throws an error.
 */
export function mockService<TService extends TAnyService>(
	overrides: Partial<TService>,
): TService {
	return mockObject(overrides);
}
