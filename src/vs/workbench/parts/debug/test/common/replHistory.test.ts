/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ReplHistory } from 'vs/workbench/parts/debug/common/replHistory';

suite('Debug - Repl History', () => {
	let history: ReplHistory;

	setup(() => {
		history = new ReplHistory(['one', 'two', 'three', 'four', 'five']);
	});

	teardown(() => {
		history = null;
	});

	test('previous and next', () => {
		assert.equal(history.previous(), 'five');
		assert.equal(history.previous(), 'four');
		assert.equal(history.previous(), 'three');
		assert.equal(history.previous(), 'two');
		assert.equal(history.previous(), 'one');
		assert.equal(history.previous(), null);
		assert.equal(history.next(), 'two');
		assert.equal(history.next(), 'three');
		assert.equal(history.next(), 'four');
		assert.equal(history.next(), 'five');
	});

	test('evaluated and remember', () => {
		history.evaluated('six');
		assert.equal(history.previous(), 'six');
		assert.equal(history.previous(), 'five');
		assert.equal(history.next(), 'six');

		history.remember('six++', true);
		assert.equal(history.next(), 'six++');
		assert.equal(history.previous(), 'six');

		history.evaluated('seven');
		assert.equal(history.previous(), 'seven');
		assert.equal(history.previous(), 'six');
	});
});
