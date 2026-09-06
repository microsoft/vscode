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
});
