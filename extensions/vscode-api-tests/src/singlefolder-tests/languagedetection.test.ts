/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { asPromise, assertNoRpc, closeAllEditors } from '../utils';

async function openTextDocumentWithCotents(contents: string) {
	const doc = await vscode.workspace.openTextDocument();
	const editor = await vscode.window.showTextDocument(doc);

	assert.strictEqual(editor.document.languageId, 'plaintext');

	const result = await editor.edit(editBuilder => {
		editBuilder.insert(new vscode.Position(0, 0), contents);
	});

	assert.ok(result);
}

suite('vscode - automatic language detection', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('model loads', async () => {
		await openTextDocumentWithCotents(`{
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

		// Changing the language triggers a file to be closed and opened again so wait for that event to happen.
		const newDoc = await asPromise(vscode.workspace.onDidOpenTextDocument, 5000);

		assert.strictEqual(newDoc.languageId, 'json');
	});

	test('a negatively confident language (sql) still yields correct language', async () => {
		await openTextDocumentWithCotents(`CREATE TABLE something (
key_id int NOT NULL identity(1,1),
user_id int NOT NULL,
description nvarchar(max) NULL,
permissions nvarchar(10) NOT NULL,
consumer_detail nvarchar(64) NOT NULL,
consumer_prop nvarchar(43) NOT NULL,
dice nvarchar(max) NULL,
truncated_key nvarchar(7) NOT NULL,
last_access datetime2 NULL default null,
constraint something PRIMARY KEY (key_id)
)
GO
CREATE INDEX something on somethingelse (consumer_detail)
GO
CREATE INDEX something1 on somethingelse1 (consumer_prop)
GO`);

		// Changing the language triggers a file to be closed and opened again so wait for that event to happen.
		const newDoc = await asPromise(vscode.workspace.onDidOpenTextDocument, 5000);

		assert.strictEqual(newDoc.languageId, 'sql');
	});

	test('a negatively confident language yields nothing', async () => {
		await openTextDocumentWithCotents(`Amet ut aliquip laboris ex duis. Dolore magna proident proident sint veniam magna culpa. Laboris nulla incididunt laboris elit in cupidatat voluptate ad minim incididunt. Deserunt ullamco in aliquip nostrud dolor dolore nisi ex cillum deserunt consectetur reprehenderit.

Adipisicing voluptate commodo sunt esse velit eu. Eu labore nisi adipisicing magna non velit. Tempor excepteur cillum deserunt nisi sit labore. Sint nulla irure aute laborum cillum nostrud consectetur elit deserunt cillum duis officia. Eu ad duis qui mollit. Ex laboris ex reprehenderit eiusmod cillum aliqua adipisicing proident veniam ea laborum ut.`);

		// the timeout should occur
		try {
			await asPromise(vscode.workspace.onDidOpenTextDocument, 5000);
			assert.fail('The language should not have changed.');
		} catch (e) {
			assert.strictEqual(e.toString(), 'Error: asPromise TIMEOUT reached');
		}
	});
});
