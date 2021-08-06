/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

suite('vscode - untitled automatic language detection', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('test automatic language detection works', async () => {
		const doc = await vscode.workspace.openTextDocument();
		const editor = await vscode.window.showTextDocument(doc);

		assert.strictEqual(editor.document.languageId, 'plaintext');

		const settingResult = vscode.workspace.getConfiguration().get<boolean>('workbench.editor.untitled.experimentalLanguageDetection');
		assert.ok(settingResult);

		const result = await editor.edit(editBuilder => {
			editBuilder.insert(new vscode.Position(0, 0), `{
	"extends": "./tsconfig.base.json",
	"compilerOptions": {
		"removeComments": false,
		"preserveConstEnums": true,
		"sourceMap": false,
		"outDir": "../out/vs",
		"target": "es2020",
		"types": [
			"keytar",
			"mocha",
			"semver",
			"sinon",
			"winreg",
			"trusted-types",
			"wicg-file-system-access"
		],
		"plugins": [
			{
				"name": "tsec",
				"exemptionConfig": "./tsec.exemptions.json"
			}
		]
	},
	"include": [
		"./typings",
		"./vs"
	]
}`);
		});

		assert.ok(result);

		// language detection is debounced so we need to wait a bit
		await sleep(2000);
		assert.strictEqual(editor.document.languageId, 'json');
	});
});
