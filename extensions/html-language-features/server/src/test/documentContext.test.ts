/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocumentContext } from '../utils/documentContext.js';

suite('HTML Document Context', () => {

	test('Context', function (): any {
		const docURI = 'file:///users/test/folder/test.html';
		const rootFolders = [{ name: '', uri: 'file:///users/test/' }];

		const context = getDocumentContext(docURI, rootFolders);
		assert.strictEqual(context.resolveReference('/', docURI), 'file:///users/test/');
		assert.strictEqual(context.resolveReference('/message.html', docURI), 'file:///users/test/message.html');
		assert.strictEqual(context.resolveReference('message.html', docURI), 'file:///users/test/folder/message.html');
		assert.strictEqual(context.resolveReference('message.html', 'file:///users/test/'), 'file:///users/test/message.html');
	});

	test('Only resolves relative references against hierarchical bases', function (): any {
		const docURI = 'file:///users/test/folder/test.html';
		const context = getDocumentContext(docURI, [{ name: '', uri: 'file:///users/test/' }]);
		assert.deepStrictEqual([
			context.resolveReference('workbench.action.quit', 'command:workbench.action.quit?%5B%5D'),
			context.resolveReference('foo', 'COMMAND:foo?%5B%5D'),
			context.resolveReference('foo', 'javascript:alert(1)'),
			context.resolveReference('page.html', 'https://example.com/docs/index.html'),
			context.resolveReference('page.html', 'http://example.com/docs/'),
			context.resolveReference('page.html', 'file:///users/test/other/'),
			context.resolveReference('page.html', 'HTTPS://example.com/docs/'),
			context.resolveReference('page.html', 'Http://example.com/docs/'),
			context.resolveReference('page.html', 'FILE:///users/test/other/'),
		], [
			undefined,
			undefined,
			undefined,
			'https://example.com/docs/page.html',
			'http://example.com/docs/page.html',
			'file:///users/test/other/page.html',
			'https://example.com/docs/page.html',
			'http://example.com/docs/page.html',
			'file:///users/test/other/page.html',
		]);

		const untitledContext = getDocumentContext('untitled:Untitled-1', []);
		assert.strictEqual(untitledContext.resolveReference('page.html', 'untitled:Untitled-1'), 'untitled:page.html');
		assert.strictEqual(untitledContext.resolveReference('page.html', 'UNTITLED:Untitled-1'), 'untitled:page.html');
	});
});
