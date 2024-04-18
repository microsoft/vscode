/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { ExtensionContext, extensions } from 'vscode';

suite('vscode API - globalState / workspaceState', () => {

	let extensionContext: ExtensionContext;
	suiteSetup(async () => {
		// Trigger extension activation and grab the context as some tests depend on it
		await extensions.getExtension('vscode.vscode-api-tests')?.activate();
		extensionContext = (global as any).testExtensionContext;
	});

	test('state', async () => {
		for (const state of [extensionContext.globalState, extensionContext.workspaceState]) {
			let keys = state.keys();
			assert.strictEqual(keys.length, 0);

			let res = state.get('state.test.get', 'default');
			assert.strictEqual(res, 'default');

			state.update('state.test.get', 'testvalue');

			keys = state.keys();
			assert.strictEqual(keys.length, 1);
			assert.strictEqual(keys[0], 'state.test.get');

			res = state.get('state.test.get', 'default');
			assert.strictEqual(res, 'testvalue');

			state.update('state.test.get', undefined);

			keys = state.keys();
			assert.strictEqual(keys.length, 0, `Unexpected keys: ${JSON.stringify(keys)}`);

			res = state.get('state.test.get', 'default');
			assert.strictEqual(res, 'default');
		}
	});
});
