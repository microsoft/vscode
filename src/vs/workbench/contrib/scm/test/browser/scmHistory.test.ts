/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ColorIdentifier } from '../../../../../platform/theme/common/colorUtils.js';
import { colorRegistry, historyItemBaseRefColor, historyItemRefColor, historyItemRemoteRefColor, toISCMHistoryItemViewModelArray } from '../../browser/scmHistory.js';
import { ISCMHistoryItem, ISCMHistoryItemRef } from '../../common/history.js';

function toSCMHistoryItem(id: string, parentIds: string[], references?: ISCMHistoryItemRef[]): ISCMHistoryItem {
	return { id, parentIds, subject: '', message: '', references } satisfies ISCMHistoryItem;
}

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
			toSCMHistoryItem('a', []),
		];

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
			toSCMHistoryItem('a', ['b']),
			toSCMHistoryItem('b', ['c']),
			toSCMHistoryItem('c', ['d']),
			toSCMHistoryItem('d', ['e']),
			toSCMHistoryItem('e', []),
		];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 5);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, colorRegistry[0]);

		// node b
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, colorRegistry[0]);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, colorRegistry[0]);

		// node c
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, colorRegistry[0]);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, colorRegistry[0]);

		// node d
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, colorRegistry[0]);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, colorRegistry[0]);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, colorRegistry[0]);

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
			toSCMHistoryItem('a', ['b']),
			toSCMHistoryItem('b', ['c', 'd']),
			toSCMHistoryItem('d', ['c']),
			toSCMHistoryItem('c', ['e']),
			toSCMHistoryItem('e', ['f']),
		];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 5);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, colorRegistry[0]);

		// node b
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, colorRegistry[0]);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, colorRegistry[1]);

		// node d
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, colorRegistry[1]);

		// node c
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, colorRegistry[0]);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, colorRegistry[0]);
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
			toSCMHistoryItem('a', ['b', 'c']),
			toSCMHistoryItem('c', ['d']),
			toSCMHistoryItem('b', ['e']),
			toSCMHistoryItem('e', ['f']),
			toSCMHistoryItem('f', ['d']),
			toSCMHistoryItem('d', ['g']),
		];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 6);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[0].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[0].outputSwimlanes[1].color, colorRegistry[1]);

		// node c
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[1].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, colorRegistry[1]);

		// node b
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, colorRegistry[1]);

		// node e
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].outputSwimlanes[1].color, colorRegistry[1]);

		// node f
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, colorRegistry[1]);

		// node d
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, colorRegistry[0]);
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
			toSCMHistoryItem('a', ['b', 'c']),
			toSCMHistoryItem('c', ['b']),
			toSCMHistoryItem('b', ['d', 'e']),
			toSCMHistoryItem('e', ['f']),
			toSCMHistoryItem('f', ['g']),
			toSCMHistoryItem('d', ['h']),
		];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 6);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[0].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[0].outputSwimlanes[1].color, colorRegistry[1]);

		// node c
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[1].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, colorRegistry[1]);

		// node b
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'e');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, colorRegistry[2]);

		// node e
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'e');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, colorRegistry[2]);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].outputSwimlanes[1].id, 'f');
		assert.strictEqual(viewModels[3].outputSwimlanes[1].color, colorRegistry[2]);

		// node f
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].inputSwimlanes[1].id, 'f');
		assert.strictEqual(viewModels[4].inputSwimlanes[1].color, colorRegistry[2]);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, colorRegistry[2]);

		// node d
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, colorRegistry[2]);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'h');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[5].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[1].color, colorRegistry[2]);
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
			toSCMHistoryItem('a', ['b', 'c']),
			toSCMHistoryItem('c', ['d']),
			toSCMHistoryItem('b', ['e', 'f']),
			toSCMHistoryItem('f', ['g']),
			toSCMHistoryItem('e', ['g']),
			toSCMHistoryItem('d', ['g']),
			toSCMHistoryItem('g', ['h']),
		] satisfies ISCMHistoryItem[];

		const viewModels = toISCMHistoryItemViewModelArray(models);

		assert.strictEqual(viewModels.length, 7);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[0].outputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[0].outputSwimlanes[1].color, colorRegistry[1]);

		// node c
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].inputSwimlanes[1].id, 'c');
		assert.strictEqual(viewModels[1].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[1].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[1].outputSwimlanes[1].color, colorRegistry[1]);

		// node b
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].inputSwimlanes[1].color, colorRegistry[1]);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[2].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[2].outputSwimlanes[2].id, 'f');
		assert.strictEqual(viewModels[2].outputSwimlanes[2].color, colorRegistry[2]);

		// node f
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[3].inputSwimlanes[2].id, 'f');
		assert.strictEqual(viewModels[3].inputSwimlanes[2].color, colorRegistry[2]);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[3].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[3].outputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[3].outputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[3].outputSwimlanes[2].color, colorRegistry[2]);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].inputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[4].inputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[4].inputSwimlanes[2].color, colorRegistry[2]);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[4].outputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[2].color, colorRegistry[2]);

		// node d
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'd');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[5].inputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[2].color, colorRegistry[2]);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 3);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[5].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[5].outputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[5].outputSwimlanes[2].color, colorRegistry[2]);

		// node g
		assert.strictEqual(viewModels[6].inputSwimlanes.length, 3);
		assert.strictEqual(viewModels[6].inputSwimlanes[0].id, 'g');
		assert.strictEqual(viewModels[6].inputSwimlanes[0].color, colorRegistry[0]);
		assert.strictEqual(viewModels[6].inputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[6].inputSwimlanes[1].color, colorRegistry[1]);
		assert.strictEqual(viewModels[6].inputSwimlanes[2].id, 'g');
		assert.strictEqual(viewModels[6].inputSwimlanes[2].color, colorRegistry[2]);

		assert.strictEqual(viewModels[6].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[6].outputSwimlanes[0].id, 'h');
		assert.strictEqual(viewModels[6].outputSwimlanes[0].color, colorRegistry[0]);
	});

	/**
	 * 	* a(b) [topic]
	 * 	* b(c)
	 * 	* c(d) [origin/topic]
	 * 	* d(e)
	 * 	* e(f,g)
	 * 	|\
	 * 	| * g(h) [origin/main]
	 */
	test('graph with color map', () => {
		const models = [
			toSCMHistoryItem('a', ['b'], [{ id: 'topic', name: 'topic' }]),
			toSCMHistoryItem('b', ['c']),
			toSCMHistoryItem('c', ['d'], [{ id: 'origin/topic', name: 'origin/topic' }]),
			toSCMHistoryItem('d', ['e']),
			toSCMHistoryItem('e', ['f', 'g']),
			toSCMHistoryItem('g', ['h'], [{ id: 'origin/main', name: 'origin/main' }])
		];

		const colorMap = new Map<string, ColorIdentifier>([
			['topic', historyItemRefColor],
			['origin/topic', historyItemRemoteRefColor],
			['origin/main', historyItemBaseRefColor],
		]);

		const viewModels = toISCMHistoryItemViewModelArray(models, colorMap);

		assert.strictEqual(viewModels.length, 6);

		// node a
		assert.strictEqual(viewModels[0].inputSwimlanes.length, 0);

		assert.strictEqual(viewModels[0].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[0].outputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[0].outputSwimlanes[0].color, historyItemRefColor);

		// node b
		assert.strictEqual(viewModels[1].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].inputSwimlanes[0].id, 'b');
		assert.strictEqual(viewModels[1].inputSwimlanes[0].color, historyItemRefColor);

		assert.strictEqual(viewModels[1].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[1].outputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[1].outputSwimlanes[0].color, historyItemRefColor);

		// node c
		assert.strictEqual(viewModels[2].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[2].inputSwimlanes[0].id, 'c');
		assert.strictEqual(viewModels[2].inputSwimlanes[0].color, historyItemRefColor);

		assert.strictEqual(viewModels[2].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[2].outputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[2].outputSwimlanes[0].color, historyItemRemoteRefColor);

		// node d
		assert.strictEqual(viewModels[3].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].inputSwimlanes[0].id, 'd');
		assert.strictEqual(viewModels[3].inputSwimlanes[0].color, historyItemRemoteRefColor);

		assert.strictEqual(viewModels[3].outputSwimlanes.length, 1);
		assert.strictEqual(viewModels[3].outputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[3].outputSwimlanes[0].color, historyItemRemoteRefColor);

		// node e
		assert.strictEqual(viewModels[4].inputSwimlanes.length, 1);
		assert.strictEqual(viewModels[4].inputSwimlanes[0].id, 'e');
		assert.strictEqual(viewModels[4].inputSwimlanes[0].color, historyItemRemoteRefColor);

		assert.strictEqual(viewModels[4].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[4].outputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[4].outputSwimlanes[0].color, historyItemRemoteRefColor);
		assert.strictEqual(viewModels[4].outputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[4].outputSwimlanes[1].color, historyItemBaseRefColor);

		// node g
		assert.strictEqual(viewModels[5].inputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].inputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[5].inputSwimlanes[0].color, historyItemRemoteRefColor);
		assert.strictEqual(viewModels[5].inputSwimlanes[1].id, 'g');
		assert.strictEqual(viewModels[5].inputSwimlanes[1].color, historyItemBaseRefColor);

		assert.strictEqual(viewModels[5].outputSwimlanes.length, 2);
		assert.strictEqual(viewModels[5].outputSwimlanes[0].id, 'f');
		assert.strictEqual(viewModels[5].outputSwimlanes[0].color, historyItemRemoteRefColor);
		assert.strictEqual(viewModels[5].outputSwimlanes[1].id, 'h');
		assert.strictEqual(viewModels[5].outputSwimlanes[1].color, historyItemBaseRefColor);
	});
});
