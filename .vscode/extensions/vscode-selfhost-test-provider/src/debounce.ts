/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debounces the function call for an interval.
 */
export function debounce(duration: number, fn: () => void): (() => void) & { clear: () => void } {
	let timeout: NodeJS.Timeout | void;
	const debounced = () => {
		if (timeout !== undefined) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => {
			timeout = undefined;
			fn();
		}, duration);
	};

	debounced.clear = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
	};

	return debounced;
}
