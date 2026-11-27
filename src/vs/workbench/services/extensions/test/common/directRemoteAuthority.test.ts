/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, RemoteConnectionType } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { resolveDirectRemoteAuthority } from '../../common/directRemoteAuthority.js';

suite('Direct remote authority', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('supplies the token for the exact authority without prompting for loopback', async () => {
		const result = await resolveDirectRemoteAuthority('127.0.0.1:8000', async authority => {
			assert.strictEqual(authority, '127.0.0.1:8000');
			return 'test-token';
		}, async () => assert.fail('Unexpected host confirmation'));
		assert.deepStrictEqual(result, { authority: { authority: '127.0.0.1:8000', connectTo: { type: RemoteConnectionType.WebSocket, host: '127.0.0.1', port: 8000 }, connectionToken: 'test-token' } });
	});

	test('preserves an absent token', async () => {
		const result = await resolveDirectRemoteAuthority('localhost:8000', async () => undefined, async () => assert.fail('Unexpected host confirmation'));
		assert.strictEqual(result.authority.connectionToken, undefined);
	});

	test('classifies IPC credential failures as unavailable without falling back', async () => {
		await assert.rejects(resolveDirectRemoteAuthority('localhost:8000', async () => {
			throw new Error('Token file unavailable');
		}, async () => { }), error => error instanceof RemoteAuthorityResolverError && error._code === RemoteAuthorityResolverErrorCode.NotAvailable && error.message === 'Token file unavailable');
	});

	test('confirms non-loopback hosts before requesting credentials', async () => {
		const calls: string[] = [];
		await resolveDirectRemoteAuthority('remote.example:8000', async authority => {
			calls.push(`token:${authority}`);
			return 'test-token';
		}, async (host, port) => { calls.push(`confirm:${host}:${port}`); });
		assert.deepStrictEqual(calls, ['confirm:remote.example:8000', 'token:remote.example:8000']);
	});

	test('rejecting the host prevents credential lookup', async () => {
		const rejection = new Error('Host rejected');
		await assert.rejects(resolveDirectRemoteAuthority('remote.example:8000', async () => assert.fail('Unexpected credential lookup'), async () => { throw rejection; }), error => error === rejection);
	});
});
