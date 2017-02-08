/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Configuration tests', () => {

	test('Default configurations', function () {
		const defaultLanguageSettings = vscode.workspace.getConfiguration().get('[abcLang]');

		assert.deepEqual(defaultLanguageSettings, {
			'editor.lineNumbers': 'off',
			'editor.tabSize': 2
		});
	});

});