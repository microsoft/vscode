/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { env, extensions, ExtensionKind, UIKind } from 'vscode';

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
		const knownWorkspaceExtension = extensions.getExtension('vscode.git');
		const knownUiExtension = extensions.getExtension('vscode.git-ui');
		if (typeof remoteName === 'undefined') {
			// not running in remote, so we expect both extensions
			assert.ok(knownWorkspaceExtension);
			assert.ok(knownUiExtension);
			assert.equal(ExtensionKind.UI, knownUiExtension!.extensionKind);
		} else if (typeof remoteName === 'string') {
			// running in remote, so we only expect workspace extensions
			assert.ok(knownWorkspaceExtension);
			assert.ok(!knownUiExtension); // we currently can only access extensions that run on same host
			assert.equal(ExtensionKind.Workspace, knownWorkspaceExtension!.extensionKind);
		} else {
			assert.fail();
		}
	});

	test('env.uiKind', function () {
		const kind = env.uiKind;
		assert.equal(kind, UIKind.Desktop);
	});
});
