/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { findBestSymbolByPath } from '../../vscode-node/findSymbol';

suite('Find symbol', () => {
	function docSymbol(name: string, ...children: vscode.DocumentSymbol[]): vscode.DocumentSymbol {
		return {
			name,
			children,
			detail: '',
			range: new vscode.Range(0, 0, 0, 0),
			selectionRange: new vscode.Range(0, 0, 0, 0),
			kind: vscode.SymbolKind.Variable,
		};
	}

	function symbolInfo(name: string): vscode.SymbolInformation {
		return {
			name,
			containerName: '',
			kind: vscode.SymbolKind.Variable,
			location: {
				uri: vscode.Uri.file('fake'),
				range: new vscode.Range(0, 0, 0, 0),
			}
		};
	}

	test('Should find exact match', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([symbolInfo('a')], 'a')?.name, 'a');
	});

	test('Should find nested', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('x', docSymbol('a'))], 'a')?.name, 'a');
	});

	test('Should find child match', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a', docSymbol('b'))], 'a.b')?.name, 'b');
	});

	test('Should find child match skipping level', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a', docSymbol('x', docSymbol('b')))], 'a.b')?.name, 'b');
	});

	test(`Should find match even when children don't match`, () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a.b')?.name, 'a');
	});

	test(`Should find longest match`, () => {
		assert.strictEqual(findBestSymbolByPath([
			docSymbol('a',
				docSymbol('x')),
			docSymbol('x',
				docSymbol('a',
					docSymbol('b',
						docSymbol('z'))))
		], 'a.b')?.name, 'b');
	});

	test('Should ignore function call notation', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a()')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a(1, 2, 3)')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a(b, c)')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a(b: string)')?.name, 'a');
	});

	test('Should ignore generic notation', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a<T>')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a<T>.b')?.name, 'a');
	});

	test('Should match on symbols with $', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('$a')], '$a')?.name, '$a');
	});

	test('Should match on symbols with _', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('_a_')], '_a_')?.name, '_a_');
	});

	test('Should prefer rightmost symbol in flat symbols', () => {
		// When symbols are flat (SymbolInformation), prefer the rightmost match
		// This handles cases like `TextModel.undo()` where we want `undo`, not `TextModel`
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('TextModel'),
				symbolInfo('undo')
			], 'TextModel.undo()')?.name,
			'undo'
		);
	});

	test('Should fall back to leftmost symbol if rightmost not found in flat symbols', () => {
		// If the rightmost part isn't found, fall back to leftmost matches
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('TextModel'),
				symbolInfo('someOtherMethod')
			], 'TextModel.undo()')?.name,
			'TextModel'
		);
	});

	test('Should prefer hierarchical match over flat last part match', () => {
		// When both hierarchical and flat symbols exist, prefer the hierarchical match
		assert.strictEqual(
			findBestSymbolByPath([
				docSymbol('TextModel', docSymbol('undo')),
				symbolInfo('undo')  // This is a different undo from a different class
			], 'TextModel.undo()')?.name,
			'undo'
		);
	});

	test('Should handle deeply qualified names', () => {
		// Test multiple levels of qualification
		assert.strictEqual(
			findBestSymbolByPath([
				docSymbol('namespace', docSymbol('TextModel', docSymbol('undo')))
			], 'namespace.TextModel.undo()')?.name,
			'undo'
		);

		// With flat symbols, prefer the rightmost part
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('namespace'),
				symbolInfo('TextModel'),
				symbolInfo('undo')
			], 'namespace.TextModel.undo()')?.name,
			'undo'
		);

		// Middle part should be preferred over leftmost
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('namespace'),
				symbolInfo('TextModel')
			], 'namespace.TextModel.undo()')?.name,
			'TextModel'
		);
	});

	test('Should handle mixed flat and hierarchical symbols', () => {
		// Some symbols are flat, some are nested
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('Model'),
				docSymbol('TextModel', docSymbol('undo')),
				symbolInfo('OtherClass')
			], 'TextModel.undo()')?.name,
			'undo'
		);
	});

	test('Should handle Python-style naming conventions', () => {
		// Python uses underscores instead of camelCase
		assert.strictEqual(
			findBestSymbolByPath([
				docSymbol('MyClass', docSymbol('my_method'))
			], 'MyClass.my_method()')?.name,
			'my_method'
		);

		// Python dunder methods
		assert.strictEqual(
			findBestSymbolByPath([
				docSymbol('MyClass', docSymbol('__init__'))
			], 'MyClass.__init__()')?.name,
			'__init__'
		);

		// Python private methods
		assert.strictEqual(
			findBestSymbolByPath([
				docSymbol('MyClass', docSymbol('_private_method'))
			], 'MyClass._private_method()')?.name,
			'_private_method'
		);
	});

	test('Should handle Python module qualified names', () => {
		// Python: module.Class.method
		assert.strictEqual(
			findBestSymbolByPath([
				docSymbol('my_module', docSymbol('MyClass', docSymbol('my_method')))
			], 'my_module.MyClass.my_method()')?.name,
			'my_method'
		);
	});

	test('Should prefer rightmost match in flat symbols using position-based priority', () => {
		// When both class and method exist as flat symbols, prefer rightmost
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('TextModel'),  // matchCount=1 (index 0)
				symbolInfo('undo')        // matchCount=2 (index 1)
			], 'TextModel.undo()')?.name,
			'undo'
		);

		// Reverse order - should still prefer undo due to higher matchCount
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('undo'),       // matchCount=2 (index 1)
				symbolInfo('TextModel')   // matchCount=1 (index 0)
			], 'TextModel.undo()')?.name,
			'undo'
		);

		// Works for longer qualified names too
		// For 'a.b.c.d' => ['a', 'b', 'c', 'd']:
		// 'd' (index 3, matchCount=4) > 'c' (index 2, matchCount=3) > 'b' (index 1, matchCount=2) > 'a' (index 0, matchCount=1)
		assert.strictEqual(
			findBestSymbolByPath([
				symbolInfo('a'),  // matchCount=1
				symbolInfo('b'),  // matchCount=2
				symbolInfo('c'),  // matchCount=3
			], 'a.b.c.d')?.name,
			'c'  // Highest matchCount among available symbols
		);
	});
});
