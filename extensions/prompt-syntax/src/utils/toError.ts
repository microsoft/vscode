/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TODO: @legomushroom
 */
export const toError = (maybeError: unknown): Error => {
	if (maybeError instanceof Error) {
		return maybeError;
	}

	return new Error(`${maybeError}`);
};
