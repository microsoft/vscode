/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

suite('vscode API - Module Interception', () => {

	test('import and require(vscode) return the same API instance in ESM', async function () {
		// This file CANNOT be written to the OS temp directory.
		// The VS Code API module interceptor looks up the extension by associating
		// the parent URL via path containment. If the file is placed outside the
		// extension's directory, the interceptor will fail to provide the 'vscode' module.
		const testFile = path.join(__dirname, 'esm-test.mjs');
		try {
			try {
				fs.writeFileSync(testFile, `
// THIS IS A TEMPORARY FILE CREATED BY VSCODE-API-TESTS (module.test.ts)
// IT SHOULD BE AUTO-DELETED. IF YOU SEE THIS, IT IS SAFE TO REMOVE.
import * as vscode1 from 'vscode';
import { createRequire } from 'node:module';
import * as assert from 'assert';

export function runTest() {
	const vscode2 = createRequire(import.meta.url)('vscode');
	assert.ok(Object.keys(vscode1).length > 0);
	for (const key of Object.keys(vscode1)) {
		assert.strictEqual(vscode1[key], vscode2[key], "Mismatch at " + key);
	}
	return true;
}
`);
			} catch (err) {
				this.skip();
			}

			const asyncImport = new Function('url', 'return import(url)');
			const m = await asyncImport(vscode.Uri.file(testFile).toString(true));
			assert.strictEqual(m.runTest(), true);
		} finally {
			try { fs.unlinkSync(testFile); } catch (err) { /* ignore */ }
		}
	});

});
