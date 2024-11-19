/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Asserts that a provided `value` is `defined` - not `null` or `undefined`,
 * throwing an error with the provided error or error message otherwise.
 *
 * @throws if the provided `value` is `null` or `undefined`.
 *
 * ## Examples
 *
 * ```typescript
 * // an assert with an error message
 * assertDefined('some value', 'String constant is not defined.')
 *
 * // `throws!` an assert with an error message
 * assertDefined(null, new Error('Should throw this error.'))
 * ```
 */
export function assertDefined<T>(value: T, error: string | NonNullable<Error>): asserts value is NonNullable<T> {
	if (value === null || value === undefined) {
		const errorToThrow = typeof error === 'string' ? new Error(error) : error;

		throw errorToThrow;
	}
}
