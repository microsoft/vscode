/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { toISCMHistoryItemViewModelArray } from 'vs/workbench/contrib/scm/browser/scmHistory';
import { ISCMHistoryItem } from 'vs/workbench/contrib/scm/common/history';

suite('toISCMHistoryItemViewModelArray', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty graph', () => {
		const viewModels = toISCMHistoryItemViewModelArray([]);

		assert.strictEqual(viewModels.length, 0);
	});


	/**
	 *	* a
	 */

	test('single commit', () => {
		const models = [
			{ id: 'a', parentIds: [], message: '' },
		] as ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 1);

		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);
		assert.strictEqual(viewModels[0].outputSwimlanes.length, 0);
	});

	/**
	 *	* a(b)
	 *	* b(c)
	 *	* c(d)
	 *	* d(e)
	 *	* e
	 */
	test('linear graph', () => {
		const models = [
			{ id: 'a', parentIds: ['b'] },
			{ id: 'b', parentIds: ['c'] },
			{ id: 'c', parentIds: ['d'] },
			{ id: 'd', parentIds: ['e'] },
			{ id: 'e', parentIds: [] },
		] as ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 5);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, 0);

		// node b
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, 0);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, 0);

		// node c
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, 0);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, 0);

		// node d
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, 0);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, 0);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, 0);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 0);
	});

	/**
	 *	* a(b)
	 *	*   b(c,d)
	 *	|\
	 *	| * d(c)
	 *	|/
	 *	* c(e)
	 *	* e(f)
	 */
	test('merge commit (single commit in topic branch)', () => {
		const models = [
			{ id: 'a', parentIds: ['b'] },
			{ id: 'b', parentIds: ['c', 'd'] },
			{ id: 'd', parentIds: ['c'] },
			{ id: 'c', parentIds: ['e'] },
			{ id: 'e', parentIds: ['f'] },
		] as ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 5);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, 0);

		// node b
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, 0);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, 1);

		// node d
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, 1);

		// node c
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, 0);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, 0);
	});

	/**
	 *	* a(b,c)
	 *	|\
	 *	| * c(d)
	 *	* | b(e)
	 *	* | e(f)
	 *	* | f(d)
	 *	|/
	 *	* d(g)
	 */
	test('merge commit (multiple commits in topic branch)', () => {
		const models = [
			{ id: 'a', parentIds: ['b', 'c'] },
			{ id: 'c', parentIds: ['d'] },
			{ id: 'b', parentIds: ['e'] },
			{ id: 'e', parentIds: ['f'] },
			{ id: 'f', parentIds: ['d'] },
			{ id: 'd', parentIds: ['g'] },
		] as ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 6);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[0].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[0].outputSwimlanes[1].color, 1);

		// node c
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[1].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, 1);

		// node b
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, 1);

		// node e
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].outputSwimlanes[1].color, 1);

		// node f
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, 1);

		// node d
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, 0);
	});

	/**
	 * 	* a(b,c)
	 * 	|\
	 * 	| * c(b)
	 * 	|/
	 * 	* b(d,e)
	 * 	|\
	 * 	| * e(f)
	 * 	| * f(g)
	 * 	* | d(h)
	 */
	test('create brach from merge commit', () => {
		const models = [
			{ id: 'a', parentIds: ['b', 'c'] },
			{ id: 'c', parentIds: ['b'] },
			{ id: 'b', parentIds: ['d', 'e'] },
			{ id: 'e', parentIds: ['f'] },
			{ id: 'f', parentIds: ['g'] },
			{ id: 'd', parentIds: ['h'] },
		] as ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 6);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[0].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[0].outputSwimlanes[1].color, 1);

		// node c
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[1].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, 1);

		// node b
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'e');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, 2);

		// node e
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'e');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, 2);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].outputSwimlanes[1].id, 'f');
		assert.strictEqual(viewModels[3].outputSwimlanes[1].color, 2);

		// node f
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].inputSwimlanes[1].id, 'f');
		assert.strictEqual(viewModels[4].inputSwimlanes[1].color, 2);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, 2);

		// node d
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, 2);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'h');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[5].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[1].color, 2);
	});


	/**
	 * 	* a(b,c)
	 * 	|\
	 * 	| * c(d)
	 * 	* | b(e,f)
	 * 	|\|
	 * 	| |\
	 * 	| | * f(g)
	 * 	* | | e(g)
	 * 	| * | d(g)
	 * 	|/ /
	 * 	| /
	 * 	|/
	 * 	* g(h)
	 */
	test('create multiple branches from a commit', () => {
		const models = [
			{ id: 'a', parentIds: ['b', 'c'] },
			{ id: 'c', parentIds: ['d'] },
			{ id: 'b', parentIds: ['e', 'f'] },
			{ id: 'f', parentIds: ['g'] },
			{ id: 'e', parentIds: ['g'] },
			{ id: 'd', parentIds: ['g'] },
			{ id: 'g', parentIds: ['h'] },
		] as ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 7);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[0].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[0].outputSwimlanes[1].color, 1);

		// node c
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[1].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, 1);

		// node b
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, 1);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[2].outputSwimlanes[2].id, 'f');
		assert.strictEqual(viewModels[2].outputSwimlanes[2].color, 2);

		// node f
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[3].inputSwimlanes[2].id, 'f');
		assert.strictEqual(viewModels[3].inputSwimlanes[2].color, 2);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[3].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].outputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[3].outputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[3].outputSwimlanes[2].color, 2);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].inputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[4].inputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[4].inputSwimlanes[2].color, 2);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[4].outputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[2].color, 2);

		// node d
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[5].inputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[2].color, 2);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[5].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[5].outputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[2].color, 2);

		// node g
		assert.strictEqual(viewModels[6].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[6].inputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[6].inputSwimlanes[0].color, 0);
		assert.strictEqual(viewModels[6].inputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[6].inputSwimlanes[1].color, 1);
		assert.strictEqual(viewModels[6].inputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[6].inputSwimlanes[2].color, 2);

		assert.strictEqual(viewModels[6].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[6].outputSwimlanes[0].id, 'h');
		assert.strictEqual(viewModels[6].outputSwimlanes[0].color, 0);
	});
});
