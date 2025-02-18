/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { ExtensionContext, extensions, Uri } from 'vscode';

suite('vscode API - globalState / workspaceState', () => {

	let extensionContext: ExtensionContext;
	suiteSetup(async () => {
		// Trigger extension activation and grab the context as some tests depend on it
		await extensions.getExtension('vscode.vscode-api-tests')?.activate();
		extensionContext = (global as any).testExtensionContext;
	});

	test('state basics', async () => {
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

	test('state - handling of objects', async () => {
		for (const state of [extensionContext.globalState, extensionContext.workspaceState]) {
			const keys = state.keys();
			assert.strictEqual(keys.length, 0);

			state.update('state.test.date', new Date());
			const date = state.get('state.test.date');
			assert.ok(typeof date === 'string');

			state.update('state.test.regex', /foo/);
			const regex = state.get('state.test.regex');
			assert.ok(typeof regex === 'object' && !(regex instanceof RegExp));

			class Foo { }
			state.update('state.test.class', new Foo());
			const clazz = state.get('state.test.class');
			assert.ok(typeof clazz === 'object' && !(clazz instanceof Foo));

			const cycle: any = { self: null };
			cycle.self = cycle;
			assert.throws(() => state.update('state.test.cycle', cycle));

			const uriIn = Uri.parse('/foo/bar');
			state.update('state.test.uri', uriIn);
			const uriOut = state.get('state.test.uri') as Uri;
			assert.ok(uriIn.toString() === Uri.from(uriOut).toString());

			state.update('state.test.null', null);
			assert.strictEqual(state.get('state.test.null'), null);

			state.update('state.test.undefined', undefined);
			assert.strictEqual(state.get('state.test.undefined'), undefined);
		}
	});
});
