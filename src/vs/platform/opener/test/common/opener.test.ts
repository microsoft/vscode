/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { extractSelection, withSelection } from 'vs/platform/opener/common/opener';

suite('extractSelection', () => {

	test('extractSelection with only startLineNumber', async () => {
		const uri = URI.parse('file:///some/file.js#73');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 1, endLineNumber: undefined, endColumn: undefined });
	});

	test('extractSelection with only startLineNumber in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 1, endLineNumber: undefined, endColumn: undefined });
	});

	test('extractSelection with startLineNumber and startColumn', async () => {
		const uri = URI.parse('file:///some/file.js#73,84');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 84, endLineNumber: undefined, endColumn: undefined });
	});

	test('extractSelection with startLineNumber and startColumn in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73,84');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 84, endLineNumber: undefined, endColumn: undefined });
	});

	test('extractSelection with range and no column number', async () => {
		const uri = URI.parse('file:///some/file.js#73-83');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('extractSelection with range and no column number in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73-L83');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('extractSelection with range and no column number in L format only for start', async () => {
		const uri = URI.parse('file:///some/file.js#L73-83');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('extractSelection with range and no column number in L format only for end', async () => {
		const uri = URI.parse('file:///some/file.js#73-L83');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 1, endLineNumber: 83, endColumn: 1 });
	});

	test('extractSelection with complete range', async () => {
		const uri = URI.parse('file:///some/file.js#73,84-83,52');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 84, endLineNumber: 83, endColumn: 52 });
	});

	test('extractSelection with complete range in L format', async () => {
		const uri = URI.parse('file:///some/file.js#L73,84-L83,52');
		assert.deepStrictEqual(extractSelection(uri).selection, { startLineNumber: 73, startColumn: 84, endLineNumber: 83, endColumn: 52 });
	});

	test('withSelection with startLineNumber and startColumn', async () => {
		assert.deepStrictEqual(withSelection(URI.parse('file:///some/file.js'), { startLineNumber: 73, startColumn: 84 }).toString(), 'file:///some/file.js#73%2C84');
	});

	test('withSelection with startLineNumber, startColumn and endLineNumber', async () => {
		assert.deepStrictEqual(withSelection(URI.parse('file:///some/file.js'), { startLineNumber: 73, startColumn: 84, endLineNumber: 83 }).toString(), 'file:///some/file.js#73%2C84-83');
	});

	test('withSelection with startLineNumber, startColumn and endLineNumber, endColumn', async () => {
		assert.deepStrictEqual(withSelection(URI.parse('file:///some/file.js'), { startLineNumber: 73, startColumn: 84, endLineNumber: 83, endColumn: 52 }).toString(), 'file:///some/file.js#73%2C84-83%2C52');
	});

	test('extractSelection returns original withSelection URI', async () => {
		let uri = URI.parse('file:///some/file.js');

		const uriWithSelection = withSelection(URI.parse('file:///some/file.js'), { startLineNumber: 73, startColumn: 84, endLineNumber: 83, endColumn: 52 });
		assert.strictEqual(uri.toString(), extractSelection(uriWithSelection).uri.toString());

		uri = URI.parse('file:///some/file.js');
		assert.strictEqual(uri.toString(), extractSelection(uri).uri.toString());
	});
});
