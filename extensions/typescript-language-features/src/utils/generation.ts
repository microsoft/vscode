/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function createGenerationGuardedHandler<T>(
	generation: number,
	getCurrentGeneration: () => number,
	isActive: () => boolean,
	handler: (value: T) => void,
): (value: T) => void {
	return value => {
		if (getCurrentGeneration() === generation && isActive()) {
			handler(value);
		}
	};
}
