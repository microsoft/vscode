/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomInt } from './randomInt';

/**
 * Helper function that allows to await for a specified amount of time.
 * @param ms The amount of time to wait in milliseconds.
 */
export const wait = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Helper function that allows to await for a random amount of time.
 * @param maxMs The `maximum` amount of time to wait, in milliseconds.
 * @param minMs [`optional`] The `minimum` amount of time to wait, in milliseconds.
 */
export const waitRandom = (maxMs: number, minMs: number = 0): Promise<void> => {
	return wait(randomInt(maxMs, minMs));
};
