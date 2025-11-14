/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Fibonacci calculator interface
 */
export interface IFibonacci {
	/**
	 * Calculate the nth Fibonacci number
	 * @param n The position in the Fibonacci sequence (0-indexed)
	 * @returns The Fibonacci number at position n
	 */
	calculate(n: number): bigint;

	/**
	 * Calculate multiple Fibonacci numbers up to position n
	 * @param n The maximum position in the Fibonacci sequence
	 * @returns Array of Fibonacci numbers from 0 to n
	 */
	calculateRange(n: number): bigint[];
}

/**
 * Basic Fibonacci calculator implementation
 */
export class Fibonacci implements IFibonacci {

	calculate(n: number): bigint {
		if (n < 0) {
			throw new Error('Fibonacci is not defined for negative numbers');
		}

		if (n === 0) {
			return 0n;
		}

		if (n === 1) {
			return 1n;
		}

		let prev = 0n;
		let current = 1n;

		for (let i = 2; i <= n; i++) {
			const next = prev + current;
			prev = current;
			current = next;
		}

		return current;
	}

	calculateRange(n: number): bigint[] {
		if (n < 0) {
			throw new Error('Fibonacci is not defined for negative numbers');
		}

		const result: bigint[] = [];

		for (let i = 0; i <= n; i++) {
			result.push(this.calculate(i));
		}

		return result;
	}
}
