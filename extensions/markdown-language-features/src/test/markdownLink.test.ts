/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { checkSmartPaste, createLinkSnippet } from '../languageFeatures/copyFiles/shared';
import 'mocha';

suite('getMarkdownLink', () => {

	// check paste with no selection
	// const skinny_document: SkinnyTextDocument = {
	// 	rangeStartOffset: 0,
	// 	rangeEndOffset: 5,
	// 	dir: undefined,
	// 	// textLine: document.lineAt(0),
	// 	documentText: "hello! world",
	// };

	// check paste with selection
	// check paste over markdown link
	// check paste over markdown image
	// check paste within markdown link
	// check paste with open bracket

	// check multicursor
	// check image link
	// check each case of smart paste

	test('Check smart paste', async () => {
		const smartPaste = checkSmartPaste("hello! world", 0, 5);
		assert.strictEqual(smartPaste, false);
	});

	test('Should not create a nested Markdown link on top of a Markdown link', async () => {
		// const link = 'https://www.microsoft.com';
		// const uri_list = [vscode.Uri.parse(link)];

		const uri = vscode.Uri.parse('file:///c%3A/Users/t-mekulkarni/test/b.md');

		const snippet = await createLinkSnippet(new vscode.SnippetString(''), true, 'https://www.microsoft.com', '', uri, 0);
		assert.strictEqual(snippet?.value, '[${0:Title}](https://www.microsoft.com/)');
	});
});
