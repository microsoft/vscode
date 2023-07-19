/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { checkSmartPaste, createLinkSnippet } from '../languageFeatures/copyFiles/shared';
import 'mocha';

suite('getMarkdownLink', () => {

	// implement SkinnyTextDocument
	// end to end test of checkSmartPaste & createLinkSnippet

	// check paste with selection
	// check paste over markdown link
	// check paste over markdown image
	// check paste within markdown link
	// check paste with open bracket

	// check multicursor
	// check image link
	// check each case of smart paste


	// check smart paste
	test('Check smart paste with plain text', async () => {
		const smartPaste = checkSmartPaste("hello! world", 0, 5);
		assert.strictEqual(smartPaste.useDefaultPaste, false);
	});

	test('Check smart paste over a markdown link', async () => {
		const smartPaste = checkSmartPaste("[a](bc)", 0, 7);
		assert.strictEqual(smartPaste.updateTitle, true);
	});

	test('Check smart paste within a markdown link', async () => {
		const smartPaste = checkSmartPaste("[a](bcdef)", 4, 6);
		assert.strictEqual(smartPaste.useDefaultPaste, true);
	});

	test('Snippet when smart paste is false', async () => {
		const uri = vscode.Uri.parse('https://www.microsoft.com');

		const snippet = await createLinkSnippet(new vscode.SnippetString(''), false, 'https://www.microsoft.com', '', uri, 0);
		assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
	});
});
