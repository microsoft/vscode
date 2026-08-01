/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { lineRangesToGutterMarkers } from '../preview/markdownEditorProvider';

suite('Markdown editor diff', () => {
	test('maps modified-side line changes to quick diff gutter markers', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'one\ntwo changed\nthree added\nfour\n' });
		const changes = [
			{ originalRange: new vscode.Range(1, 0, 2, 0), modifiedRange: new vscode.Range(1, 0, 2, 0) },
			{ originalRange: new vscode.Range(2, 0, 2, 0), modifiedRange: new vscode.Range(2, 0, 3, 0) },
			{ originalRange: new vscode.Range(3, 0, 4, 0), modifiedRange: new vscode.Range(3, 0, 3, 0) },
		];

		assert.deepStrictEqual(lineRangesToGutterMarkers(document, changes), [
			{ start: 4, endExclusive: 15, type: 'modified' },
			{ start: 16, endExclusive: 27, type: 'added' },
			{ start: 28, endExclusive: 28, type: 'deleted' },
		]);
	});
});
