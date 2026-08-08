/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as parse from '../parse';
import * as assert from 'assert';
import Parser from 'web-tree-sitter';

suite('Tree-sitter Parsing Tests', function () {
	test('language wasm loading', async function () {
		await Parser.init();
		await parse.getLanguage('python');
		await parse.getLanguage('javascript');
		await parse.getLanguage('go');
		await parse.getLanguage('php');
		await parse.getLanguage('c');
		await parse.getLanguage('cpp');
		await assert.rejects(async () => await parse.getLanguage('xxx'));
	});

	suite('getBlockCloseToken', function () {
		test('all', function () {
			assert.strictEqual(parse.getBlockCloseToken('javascript'), '}');
			assert.strictEqual(parse.getBlockCloseToken('typescript'), '}');
			assert.strictEqual(parse.getBlockCloseToken('python'), null);
			assert.strictEqual(parse.getBlockCloseToken('ruby'), 'end');
			assert.strictEqual(parse.getBlockCloseToken('go'), '}');
		});
	});
});
