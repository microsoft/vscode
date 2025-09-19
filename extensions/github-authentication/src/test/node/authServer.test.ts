/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { LoopbackAuthServer } from '../../node/authServer';
import { env } from 'vscode';

suite('LoopbackAuthServer', () => {
	let server: LoopbackAuthServer;
	let port: number;

	setup(async () => {
		server = new LoopbackAuthServer(__dirname, 'http://localhost:8080', 'https://code.visualstudio.com');
		port = await server.start();
	});

	teardown(async () => {
		await server.stop();
	});

	test('should redirect to starting redirect on /signin', async () => {
		const response = await fetch(`http://localhost:${port}/signin?nonce=${server.nonce}`, {
			redirect: 'manual'
		});
		// Redirect
		assert.strictEqual(response.status, 302);

		// Check location
		const location = response.headers.get('location');
		assert.ok(location);
		const locationUrl = new URL(location);
		assert.strictEqual(locationUrl.origin, 'http://localhost:8080');

		// Check state
		const state = locationUrl.searchParams.get('state');
		assert.ok(state);
		const stateLocation = new URL(state);
		assert.strictEqual(stateLocation.origin, `http://127.0.0.1:${port}`);
		assert.strictEqual(stateLocation.pathname, '/callback');
		assert.strictEqual(stateLocation.searchParams.get('nonce'), server.nonce);
	});

	test('should return 400 on /callback with missing parameters', async () => {
		const response = await fetch(`http://localhost:${port}/callback`);
		assert.strictEqual(response.status, 400);
	});

	test('should resolve with code and state on /callback with valid parameters', async () => {
		server.state = 'valid-state';
		const response = await fetch(
			`http://localhost:${port}/callback?code=valid-code&state=${server.state}&nonce=${server.nonce}`,
			{ redirect: 'manual' }
		);
		assert.strictEqual(response.status, 302);
		assert.strictEqual(response.headers.get('location'), `/?redirect_uri=https%3A%2F%2Fcode.visualstudio.com&app_name=${encodeURIComponent(env.appName)}`);
		await Promise.race([
			server.waitForOAuthResponse().then(result => {
				assert.strictEqual(result.code, 'valid-code');
				assert.strictEqual(result.state, server.state);
			}),
			new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
		]);
	});
});
