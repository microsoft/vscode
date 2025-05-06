/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mockObject } from '../../../../../base/test/common/testUtils.js';

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
