/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { resolveReference } from 'volar-service-html';
import { URI } from 'vscode-uri';

suite('HTML Document Context', () => {

	test('Context', function (): any {
		const docURI = URI.parse('file:///users/test/folder/test.html');
		const rootFolders = [URI.parse('file:///users/test/')];

		assert.strictEqual(resolveReference('/', docURI, rootFolders), 'file:///users/test/');
		assert.strictEqual(resolveReference('/message.html', docURI, rootFolders), 'file:///users/test/message.html');
		assert.strictEqual(resolveReference('message.html', docURI, rootFolders), 'file:///users/test/folder/message.html');
		assert.strictEqual(resolveReference('message.html', URI.parse('file:///users/test/'), rootFolders), 'file:///users/test/message.html');
	});
});
