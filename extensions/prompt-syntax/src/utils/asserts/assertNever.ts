/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TODO: @legomushroom
 */
export function assertNever(_value: never, message = 'Unreachable'): never {
	throw new Error(message);
}
