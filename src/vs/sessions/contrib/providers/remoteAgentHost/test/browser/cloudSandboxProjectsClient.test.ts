/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxProjectsClient, ICloudSandboxCloneProjectOptions } from '../../browser/cloudSandboxProjectsClient.js';
import { createCloudSandboxProject as project, createCloudSandboxProjectsTestConnection } from './cloudSandboxProjectsTestUtils.js';

suite('CloudSandboxProjectsClient', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: ICloudSandboxCloneProjectOptions = { url: 'https://github.com/owner/repo', depth: 1 };

	test('sends the existing clone RPC and returns a validated project', async () => {
		const expected = { ...project({ status: 'cloning', git: false, progress: 10 }), error: undefined };
		const h = createCloudSandboxProjectsTestConnection(store, { request: async () => ({ project: expected }) });
		const client = store.add(new CloudSandboxProjectsClient(h.connection));
		const result = await client.cloneProject(options, CancellationToken.None);
		assert.deepStrictEqual({ requests: h.requests, result }, {
			requests: [{ method: 'extensions/cloneProject', params: options }],
			result: expected,
		});
	});

	for (const capability of [null, false, {}, { available: false }, { available: 'true' }]) {
		test(`does not send a clone without the advertised capability (${JSON.stringify(capability)})`, async () => {
			const h = createCloudSandboxProjectsTestConnection(store, { capability });
			const client = store.add(new CloudSandboxProjectsClient(h.connection));
			await assert.rejects(client.cloneProject(options, CancellationToken.None), /cannot prepare repositories/);
			assert.deepStrictEqual({ available: client.isAvailable(), requests: h.requests }, { available: false, requests: [] });
		});
	}

	test('missing root state is an error, not an unsupported-host fallback', async () => {
		const h = createCloudSandboxProjectsTestConnection(store);
		const client = store.add(new CloudSandboxProjectsClient(h.connection));
		h.setRoot(undefined);
		await assert.rejects(client.cloneProject(options, CancellationToken.None), /not available from the remote host/);
		assert.deepStrictEqual(h.requests, []);
	});

	test('propagates the transport error without returning a project', async () => {
		const error = new Error('Connection lost');
		const h = createCloudSandboxProjectsTestConnection(store, { request: async () => { throw error; } });
		const client = store.add(new CloudSandboxProjectsClient(h.connection));
		await assert.rejects(client.cloneProject(options, CancellationToken.None), candidate => candidate === error);
	});

	for (const response of [
		undefined,
		null,
		{},
		{ project: { ...project(), id: '' } },
		{ project: { ...project(), path: 'relative/path' } },
		{ project: { ...project(), git: 'true' } },
		{ project: { ...project(), status: 'unknown' } },
		{ project: { ...project(), progress: 101 } },
		{ project: { ...project(), progress: -1 } },
		{ project: { ...project(), progress: 10.5 } },
		{ project: { ...project(), error: 123 } },
		{ project: project({ remoteUrl: undefined }) },
		{ project: project({ remoteUrl: 'https://github.com/another/repo' }) },
	]) {
		test(`rejects malformed or mismatched clone results (${JSON.stringify(response)})`, async () => {
			const h = createCloudSandboxProjectsTestConnection(store, { request: async () => response });
			const client = store.add(new CloudSandboxProjectsClient(h.connection));
			await assert.rejects(client.cloneProject(options, CancellationToken.None), /invalid repository information/);
		});
	}

	test('validates catalogue entries before exposing them', () => {
		const h = createCloudSandboxProjectsTestConnection(store, { projects: [{}] });
		const client = store.add(new CloudSandboxProjectsClient(h.connection));
		assert.throws(() => client.getProjects(), /invalid repository information/);
	});

	test('does not send a clone for a cancelled caller', async () => {
		const h = createCloudSandboxProjectsTestConnection(store);
		const client = store.add(new CloudSandboxProjectsClient(h.connection));
		await assert.rejects(client.cloneProject(options, CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual(h.requests, []);
	});

	for (const closeConnection of [false, true]) {
		test(`cancels an outstanding request without needing its response (${closeConnection ? 'connection closed' : 'caller cancelled'})`, async () => {
			const response = new DeferredPromise<unknown>();
			const h = createCloudSandboxProjectsTestConnection(store, { request: () => response.p });
			const client = store.add(new CloudSandboxProjectsClient(h.connection));
			const cts = store.add(new CancellationTokenSource());
			const result = client.cloneProject(options, cts.token);
			await h.requested.p;
			if (closeConnection) {
				client.dispose();
			} else {
				cts.cancel();
			}
			await assert.rejects(result, CancellationError);
			response.complete({ project: project() });
		});
	}

	test('a disposed adapter cannot read state or send another clone', async () => {
		const h = createCloudSandboxProjectsTestConnection(store);
		const client = store.add(new CloudSandboxProjectsClient(h.connection));
		client.dispose();
		await assert.rejects(client.cloneProject(options, CancellationToken.None), CancellationError);
		assert.throws(() => client.getProjects(), CancellationError);
		assert.throws(() => client.isAvailable(), CancellationError);
		assert.deepStrictEqual(h.requests, []);
	});
});
