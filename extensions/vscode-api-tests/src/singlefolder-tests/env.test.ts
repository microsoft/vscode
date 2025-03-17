/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { env, ExtensionKind, extensions, UIKind, Uri } from 'vscode';
import { assertNoRpc } from '../utils';

suite('vscode API - env', () => {

	teardown(assertNoRpc);

	test('env is set', function () {
		assert.strictEqual(typeof env.language, 'string');
		assert.strictEqual(typeof env.appRoot, 'string');
		assert.strictEqual(typeof env.appName, 'string');
		assert.strictEqual(typeof env.machineId, 'string');
		assert.strictEqual(typeof env.sessionId, 'string');
		assert.strictEqual(typeof env.shell, 'string');
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
		const knownUiAndWorkspaceExtension = extensions.getExtension('vscode.media-preview');
		if (typeof remoteName === 'undefined') {
			// not running in remote, so we expect both extensions
			assert.ok(knownWorkspaceExtension);
			assert.ok(knownUiAndWorkspaceExtension);
			assert.strictEqual(ExtensionKind.UI, knownUiAndWorkspaceExtension!.extensionKind);
		} else if (typeof remoteName === 'string') {
			// running in remote, so we only expect workspace extensions
			assert.ok(knownWorkspaceExtension);
			if (env.uiKind === UIKind.Desktop) {
				assert.ok(!knownUiAndWorkspaceExtension); // we currently can only access extensions that run on same host
			} else {
				assert.ok(knownUiAndWorkspaceExtension);
			}
			assert.strictEqual(ExtensionKind.Workspace, knownWorkspaceExtension!.extensionKind);
		} else {
			assert.fail();
		}
	});

	test('env.uiKind', async function () {
		const uri = Uri.parse(`${env.uriScheme}:://vscode.vscode-api-tests/path?key=value&other=false`);
		const result = await env.asExternalUri(uri);

		const kind = env.uiKind;
		if (result.scheme === 'http' || result.scheme === 'https') {
			assert.strictEqual(kind, UIKind.Web);
		} else {
			assert.strictEqual(kind, UIKind.Desktop);
		}
	});

	test('env.asExternalUri - with env.uriScheme', async function () {
		const uri = Uri.parse(`${env.uriScheme}:://vscode.vscode-api-tests/path?key=value&other=false`);
		const result = await env.asExternalUri(uri);
		assert.ok(result);

		if (env.uiKind === UIKind.Desktop) {
			assert.strictEqual(uri.scheme, result.scheme);
			assert.strictEqual(uri.authority, result.authority);
			assert.strictEqual(uri.path, result.path);
		} else {
			assert.ok(result.scheme === 'http' || result.scheme === 'https');
		}
	});

	test('env.isTrustedExternalUris', function () {
		// Test exact domain match with https
		const githubUri = Uri.parse('https://github.com/microsoft/vscode');

		// Test subdomain wildcard match
		const galleryCdnUri = Uri.parse('https://foo.gallerycdn.vsassets.io/extension');

		// Test exact domain without specific scheme (should work with https)
		const marketplaceUri = Uri.parse('https://marketplace.visualstudio.com/items');

		// Test untrusted domain
		const untrustedUri = Uri.parse('https://example.com');

		// Test with path
		const docsUri = Uri.parse('https://code.visualstudio.com/api');

		const result = env.isTrustedExternalUris([
			githubUri,
			galleryCdnUri,
			marketplaceUri,
			untrustedUri,
			docsUri
		]);

		assert.strictEqual(result.length, 5, 'Expected 5 trusted URIs');
		assert.strictEqual(result[0], true, 'Expected github URI to be trusted');
		assert.strictEqual(result[1], true, 'Expected gallery CDN URI to be trusted');
		assert.strictEqual(result[2], true, 'Expected marketplace URI to be trusted');
		assert.strictEqual(result[3], false, 'Expected untrusted URI to be undefined');
		assert.strictEqual(result[4], true, 'Expected docs URI to be trusted');
	});

	// Depends on web request
	test.skip('env.extractExternalUris', async function () {
		const result = await env.extractExternalUris([Uri.parse('http://content-security-policy.com')]);
		assert.ok(result[0].includes('Content Security Policy Reference'));
	});
});
