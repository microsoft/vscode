/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { env, extensions, ExtensionKind } from 'vscode';

suite('env-namespace', () => {

	test('env is set', function () {
		assert.equal(typeof env.language, 'string');
		assert.equal(typeof env.appRoot, 'string');
		assert.equal(typeof env.appName, 'string');
		assert.equal(typeof env.machineId, 'string');
		assert.equal(typeof env.sessionId, 'string');
		assert.equal(typeof env.shell, 'string');
	});

	test('env is readonly', function () {
		assert.throws(() => (env as any).language = '234');
		assert.throws(() => (env as any).appRoot = '234');
		assert.throws(() => (env as any).appName = '234');
		assert.throws(() => (env as any).machineId = '234');
		assert.throws(() => (env as any).sessionId = '234');
		assert.throws(() => (env as any).shell = '234');
	});

	test('env.remoteName', function () {
		const remoteName = env.remoteName;
		const apiTestExtension = extensions.getExtension('vscode.vscode-api-tests');
		const testResolverExtension = extensions.getExtension('vscode.vscode-test-resolver');
		if (typeof remoteName === 'undefined') {
			assert.ok(apiTestExtension);
			assert.ok(testResolverExtension);
			assert.equal(ExtensionKind.UI, apiTestExtension!.extensionKind);
			assert.equal(ExtensionKind.UI, testResolverExtension!.extensionKind);
		} else if (typeof remoteName === 'string') {
			assert.ok(apiTestExtension);
			assert.ok(!testResolverExtension); // we currently can only access extensions that run on same host
			assert.equal(ExtensionKind.Workspace, apiTestExtension!.extensionKind);
		} else {
			assert.fail();
		}
	});

});
