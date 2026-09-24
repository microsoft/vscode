/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Relay } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue, waitForState } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactDetails, ArtifactSnapshot, IArtifactIntegrationAccess, IArtifactModel } from '../../common/artifactIntegration.js';
import { ArtifactIntegrationClient, ArtifactIntegrationRequest, ArtifactIntegrationServer, ArtifactIntegrationUpdate, isArtifactDetails, isArtifactIntegrationRequest, isArtifactIntegrationResponse } from '../../common/artifactIntegrationProtocol.js';

suite('Artifact Integration Protocol', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function model() {
		const snapshot = observableValue<ArtifactSnapshot>('snapshot', {
			authority: { id: 'authority', targetHost: 'host', location: 'host' },
			session: 'session', artifact: { id: 'artifact', label: 'Old', resource: 'https://example.test' }, contributions: [], runs: [],
		});
		const details = observableValue<ArtifactDetails>('details', { title: 'Details', availability: { kind: 'available' }, links: [], items: [], completeness: 'complete' });
		let references = 0;
		let detailReferences = 0;
		const object: IArtifactModel = {
			snapshot, configure: async () => { }, cancel: async () => { }, reconcile: async () => { },
			invoke: async () => { throw new Error('Not invoked by these tests'); },
			getRuns: async () => ({ runs: [] }),
			acquireDetails: async () => {
				detailReferences++;
				const lease = toDisposable(() => detailReferences--);
				return { details, dispose: () => lease.dispose() };
			},
		};
		const access: IArtifactIntegrationAccess = {
			acquireArtifact: async () => {
				references++;
				const lease = toDisposable(() => references--);
				return { object, dispose: () => lease.dispose() };
			},
		};
		return { access, snapshot, details, counts: () => ({ references, detailReferences }) };
	}

	test('an update arriving before the acquire response is not overwritten by the older response', async () => {
		const f = model();
		const server = store.add(new ArtifactIntegrationServer(f.access));
		const client = store.add(new ArtifactIntegrationClient({
			onDidUpdate: server.onDidUpdate,
			request: async request => {
				const response = await server.request(request);
				if (request.kind === 'acquire') {
					f.snapshot.set({ ...f.snapshot.get(), artifact: { ...f.snapshot.get().artifact, label: 'New' } }, undefined);
				}
				return response;
			},
		}, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		assert.deepStrictEqual(reference.object.snapshot.get().artifact.label, 'New');
	});

	test('details keep their parent subscription alive until the last independent lease closes', async () => {
		const f = model();
		const server = store.add(new ArtifactIntegrationServer(f.access));
		const client = store.add(new ArtifactIntegrationClient({ onDidUpdate: server.onDidUpdate, request: request => server.request(request) }, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		const details = store.add(await reference.object.acquireDetails('integration', 'details'));
		reference.dispose();
		assert.deepStrictEqual({ counts: f.counts(), loadMore: details.loadMore }, { counts: { references: 1, detailReferences: 1 }, loadMore: undefined });
		details.dispose();
		await Promise.resolve();
		assert.deepStrictEqual(f.counts(), { references: 0, detailReferences: 0 });
	});

	test('reconnect restores artifact subscriptions before their details, without replaying side effects', async () => {
		const f = model();
		const reset = store.add(new Emitter<void>());
		const updates = store.add(new Relay<ArtifactIntegrationUpdate>());
		const requests: ArtifactIntegrationRequest['kind'][] = [];
		let server = store.add(new ArtifactIntegrationServer(f.access));
		updates.input = server.onDidUpdate;
		const client = store.add(new ArtifactIntegrationClient({
			onDidUpdate: updates.event, onDidReset: reset.event,
			request: async request => { requests.push(request.kind); return server.request(request); },
		}, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		const details = store.add(await reference.object.acquireDetails('integration', 'details'));
		await reference.object.configure('integration', 0, { automatic: true });
		reference.dispose();
		server.dispose();
		server = store.add(new ArtifactIntegrationServer(f.access));
		updates.input = server.onDidUpdate;
		f.details.set({ ...f.details.get(), title: 'Restored' }, undefined);
		requests.length = 0;
		reset.fire();
		await waitForState(details.details, value => value.title === 'Restored');
		assert.deepStrictEqual(requests, ['acquire', 'details']);
	});

	test('disposing an endpoint releases all of its leases', async () => {
		const f = model();
		const lifetime = store.add(new DisposableStore());
		const server = lifetime.add(new ArtifactIntegrationServer(f.access));
		await server.request({ kind: 'acquire', subscription: 'parent', session: 'session', artifactId: 'artifact' });
		await server.request({ kind: 'details', subscription: 'details', parent: 'parent', integrationId: 'test', detailsId: 'main' });
		lifetime.dispose();
		assert.deepStrictEqual(f.counts(), { references: 0, detailReferences: 0 });
	});

	test('validates revisions, history bounds, and response shapes', () => {
		assert.deepStrictEqual([
			isArtifactIntegrationRequest({ kind: 'history', subscription: 'sub', limit: 0 }),
			isArtifactIntegrationRequest({ kind: 'history', subscription: 'sub', limit: 201 }),
			isArtifactIntegrationRequest({ kind: 'configure', subscription: 'sub', integrationId: 'test', revision: -1, values: {} }),
			isArtifactIntegrationRequest({ kind: 'invoke', subscription: 'sub', integrationId: 'test', actionId: 'act', chat: '', requestId: 'request' }),
			isArtifactIntegrationRequest({ kind: 'history', subscription: 'sub', limit: 50 }),
			isArtifactIntegrationRequest({ kind: 'history', subscription: 'sub', limit: 200 }),
			isArtifactIntegrationResponse({ kind: 'history', runs: [], next: 1 }),
			isArtifactIntegrationResponse({ kind: 'history', runs: [] }),
		], [false, false, false, false, true, true, false, true]);
	});

	test('detail pages have an explicit bounded shape', () => {
		const details = { title: 'Details', availability: { kind: 'available' }, completeness: 'partial', links: [], items: Array.from({ length: 200 }, (_, index) => ({ id: String(index), label: 'Item', icon: { id: 'link' }, resource: 'https://example.test' })) };
		assert.deepStrictEqual([
			isArtifactDetails(details),
			isArtifactDetails({ ...details, items: [...details.items, { ...details.items[0], id: 'overflow' }] }),
			isArtifactDetails({ ...details, items: [details.items[0], details.items[0]] }),
		], [true, false, false]);
	});
});
