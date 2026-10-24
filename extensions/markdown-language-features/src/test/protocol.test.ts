/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { serializeTextEdit } from '../client/protocol';

suite('Markdown protocol', () => {
	test('serializes text edits using the server range format', () => {
		const edit = new vscode.TextEdit(new vscode.Range(1, 2, 3, 4), 'new text');

		assert.deepStrictEqual(serializeTextEdit(edit), {
			range: [
				{ line: 1, character: 2 },
				{ line: 3, character: 4 },
			],
			newText: 'new text',
		});
	});
});
