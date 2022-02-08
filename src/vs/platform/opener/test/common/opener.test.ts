/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { selectionFragment } from 'vs/platform/opener/common/opener';

suite('selectionFragment', () => {

	test('get selectionFragment with only startLineNumber', async () => {
		const uri = URI.parse('file:///some/file.js#73');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 1 });
	});

	test('get selectionFragment with only startLineNumber in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 1 });
	});

	test('get selectionFragment with startLineNumber and startColumn', async () => {
		const uri = URI.parse('file:///some/file.js#73,84');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 84 });
	});

	test('get selectionFragment with startLineNumber and startColumn in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73,84');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 84 });
	});

	test('get selectionFragment with range and no column number', async () => {
		const uri = URI.parse('file:///some/file.js#73-83');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('get selectionFragment with range and no column number in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73-L83');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('get selectionFragment with range and no column number in L format only for start', async () => {
		const uri = URI.parse('file:///some/file.js#L73-83');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('get selectionFragment with range and no column number in L format only for end', async () => {
		const uri = URI.parse('file:///some/file.js#73-L83');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('get selectionFragment with complete range', async () => {
		const uri = URI.parse('file:///some/file.js#73,84-83,52');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 84, endLineNumber: 83, endColumn: 52 });
	});

	test('get selectionFragment with complete range in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73,84-L83,52');
		assert.deepStrictEqual(selectionFragment(uri), { startLineNumber: 73, startColumn: 84, endLineNumber: 83, endColumn: 52 });
	});

});
