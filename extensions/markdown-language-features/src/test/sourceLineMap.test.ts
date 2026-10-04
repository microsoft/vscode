/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { SourceLineMap } from '../util/sourceLineMap';

suite('markdown.SourceLineMap', () => {
	function mapLines(lines: readonly number[], targets: readonly number[]) {
		const body = { line: -1 };
		const elements = [body, ...lines.map(line => ({ line }))] as const;
		const map = new SourceLineMap(elements);
		return targets.map(target => {
			const { previous, next } = map.getElementsForSourceLine(target);
			return [elements.indexOf(previous), next ? elements.indexOf(next) : undefined];
		});
	}

	test('preserves boundaries, fractional lines, and the first exact duplicate', () => {
		assert.deepStrictEqual(
			mapLines([2, 2, 4, 6], [-4, -1, 0, 1, 2, 2.8, 3, 4, 5, 6, 7]),
			[[0, 0], [0, undefined], [0, 1], [0, 1], [1, undefined], [1, undefined], [2, 3], [3, undefined], [3, 4], [4, undefined], [4, undefined]],
		);
	});

	test('preserves DOM order for nested and out-of-order mappings', () => {
		assert.deepStrictEqual(
			mapLines([0, 0, 4, 2, 8, 8, 3, 12], [0, 2, 4, 5, 8, 9, 12, 20]),
			[[1, undefined], [2, 3], [3, undefined], [4, 5], [5, undefined], [7, 8], [8, undefined], [8, undefined]],
		);
	});

	test('restarts for backward and unordered queries, including after the last element', () => {
		assert.deepStrictEqual(
			mapLines([0, 2, 2, 8], [20, 2, 8, 0, 3, 2, 2, 1]),
			[[4, undefined], [2, undefined], [4, undefined], [1, undefined], [3, 4], [2, undefined], [2, undefined], [1, 2]],
		);
	});

	test('maps an empty document to its body sentinel', () => {
		assert.deepStrictEqual(
			mapLines([], [0, 100, -1, -2, 0]),
			[[0, undefined], [0, undefined], [0, undefined], [0, 0], [0, undefined]],
		);
	});

	test('preserves non-finite query behavior without poisoning subsequent lookups', () => {
		assert.deepStrictEqual(
			mapLines([0, 2, 4], [NaN, 0, Infinity, 2, -Infinity, 4]),
			[[3, undefined], [1, undefined], [3, undefined], [2, undefined], [0, 0], [3, undefined]],
		);
	});

	test('agrees with the legacy scan for arbitrary mapping and query order', () => {
		for (let seed = 0; seed < 256; seed++) {
			const body = { line: -1 };
			const elements = [body, ...Array.from({ length: 8 }, (_, index) => ({ line: (seed >> index) % 5 }))] as const;
			const map = new SourceLineMap(elements);
			const targets = [-2, -1, 0, 0, 0.8, 1, 2, 3, 4, 5, 3, 0, 5, 1, 4, 2];
			const expected = targets.map(target => {
				const line = Math.floor(target);
				let previous = elements[0];
				for (const entry of elements) {
					if (entry.line === line) {
						return { previous: entry, next: undefined };
					} else if (entry.line > line) {
						return { previous, next: entry };
					}
					previous = entry;
				}
				return { previous };
			});
			assert.deepStrictEqual(targets.map(target => map.getElementsForSourceLine(target)), expected);
		}
	});

	test('scans mapped elements only once for ascending changed source lines', () => {
		let reads = 0;
		const count = 1600;
		const body = { line: -1 };
		const elements = [body, ...Array.from({ length: count }, (_, index) => ({
			get line() {
				++reads;
				return index * 2;
			},
		}))] as const;
		const map = new SourceLineMap(elements);
		const actual = Array.from({ length: count * 2 }, (_, line) => map.getElementsForSourceLine(line).previous);
		assert.deepStrictEqual(actual, Array.from({ length: count * 2 }, (_, line) => elements[Math.floor(line / 2) + 1]));
		assert.ok(reads <= 6 * (elements.length + actual.length), `Expected linear line reads, got ${reads}`);
	});
});
