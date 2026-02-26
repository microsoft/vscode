/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { env, Uri, window } from 'vscode';
import * as sinon from 'sinon';
import { UriHandlerLoopbackClient } from '../loopbackClientAndOpener';
import { UriEventHandler } from '../../UriEventHandler';

suite('UriHandlerLoopbackClient', () => {
	const redirectUri = 'http://localhost';
	let uriHandler: UriEventHandler;
	let client: UriHandlerLoopbackClient;
	let envStub: sinon.SinonStubbedInstance<typeof env>;
	let callbackUri: Uri;

	setup(async () => {
		callbackUri = await env.asExternalUri(Uri.parse(`${env.uriScheme}://vscode.microsoft-authentication`));
		envStub = sinon.stub(env);
		envStub.openExternal.resolves(true);
		envStub.asExternalUri.callThrough();
		uriHandler = new UriEventHandler();
		client = new UriHandlerLoopbackClient(uriHandler, redirectUri, callbackUri, window.createOutputChannel('test', { log: true }));
	});

	teardown(() => {
		sinon.restore();
		uriHandler.dispose();
	});

	suite('openBrowser', () => {
		test('should open browser with correct URL', async () => {
			const testUrl = 'http://example.com?foo=5';

			await client.openBrowser(testUrl);
			assert.ok(envStub.openExternal.calledOnce);

			const expectedUri = Uri.parse(testUrl + `&state=${encodeURI(callbackUri.toString(true))}`);
			const value = envStub.openExternal.getCalls()[0].args[0];
			assert.strictEqual(value.toString(true), expectedUri.toString(true));
		});
	});

	suite('getRedirectUri', () => {
		test('should return the redirect URI', () => {
			const result = client.getRedirectUri();
			assert.strictEqual(result, redirectUri);
		});
	});

	// Skipped for now until `listenForAuthCode` is refactored to not show quick pick
	suite('listenForAuthCode', () => {
		test('should return auth code from URL', async () => {
			const code = '1234';
			const state = '5678';
			const testUrl = Uri.parse(`http://example.com?code=${code}&state=${state}`);
			const promise = client.listenForAuthCode();
			uriHandler.handleUri(testUrl);
			const result = await promise;

			assert.strictEqual(result.code, code);
			assert.strictEqual(result.state, state);
		});

		test('should return auth error from URL', async () => {
			const error = 'access_denied';
			const errorDescription = 'reason';
			const errorUri = 'uri';
			const testUrl = Uri.parse(`http://example.com?error=${error}&error_description=${errorDescription}&error_uri=${errorUri}`);

			const promise = client.listenForAuthCode();
			uriHandler.handleUri(testUrl);
			const result = await promise;

			assert.strictEqual(result.error, 'access_denied');
			assert.strictEqual(result.error_description, 'reason');
			assert.strictEqual(result.error_uri, 'uri');
		});
	});
});
