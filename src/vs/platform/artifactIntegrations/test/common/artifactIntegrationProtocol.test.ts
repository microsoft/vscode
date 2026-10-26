/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Relay } from '../../../../base/common/event.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue, waitForState } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactAuthenticationRequest, ArtifactDetails, ArtifactSnapshot, IArtifactIntegrationAccess, IArtifactModel } from '../../common/artifactIntegration.js';
import { ArtifactIntegrationClient, ArtifactIntegrationRequest, ArtifactIntegrationServer, ArtifactIntegrationUpdate, isArtifactIntegrationRequest, isArtifactIntegrationResponse } from '../../common/artifactIntegrationProtocol.js';
import { isArtifactAuthenticationRequest, isArtifactSnapshot } from '../../common/artifactIntegrationValidation.js';
import { isArtifactDetails } from '../../common/artifactPresentationValidation.js';
import { ArtifactAutomationNotice } from '../../common/artifactRuntime.js';

suite('Artifact Integration Protocol', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function model(authenticationRequired = false) {
		const snapshot = observableValue<ArtifactSnapshot>('snapshot', {
			authority: { id: 'authority', targetHost: 'host', location: 'host' },
			session: 'session', artifact: { id: 'artifact', label: 'Old', resource: 'https://example.test' }, runs: [],
			contributions: authenticationRequired ? [{
				integrationId: 'integration', label: 'Integration', authentication: { enabled: true },
				view: { availability: { kind: 'authenticationRequired', reason: 'Sign in' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
				actions: [], options: [], configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
			}] : [],
		});
		const details = observableValue<ArtifactDetails>('details', { title: 'Details', availability: { kind: 'available' }, links: [], items: [], completeness: 'complete' });
		let references = 0;
		let detailReferences = 0;
		const authenticationRequests: string[] = [];
		const object: IArtifactModel = {
			snapshot, configure: async () => { }, cancel: async () => { }, reconcile: async () => { },
			requestAuthentication: async integrationId => {
				authenticationRequests.push(integrationId);
				return { resource: 'https://example.test', authorizationServers: ['https://auth.example.test'], scopes: ['read'] };
			},
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
		return { access, snapshot, details, authenticationRequests, counts: () => ({ references, detailReferences }) };
	}

	test('client notices use the subscribed artifact provenance, never client-supplied routing', async () => {
		const f = model();
		const artifact = { ...f.snapshot.get().artifact, origin: { chat: 'vendor-chat://original?thread=opaque' } };
		f.snapshot.set({ ...f.snapshot.get(), session: 'vendor-session://opaque', artifact }, undefined);
		const notices: ArtifactAutomationNotice[] = [];
		const server = store.add(new ArtifactIntegrationServer(f.access, async notice => { notices.push(notice); }));
		const request = {
			kind: 'notice' as const, subscription: 'notice',
			notice: { kind: 'enabled' as const, content: 'Analysis enabled', iconId: 'beaker', session: 'wrong-session', artifact: { origin: { chat: 'wrong-chat' } } },
		};
		await assert.rejects(server.request(request), /subscription not found/);
		await server.request({ kind: 'acquire', subscription: 'notice', session: 'vendor-session://opaque', artifactId: 'artifact' });
		await server.request(request);
		await server.request({ kind: 'release', subscription: 'notice' });
		await assert.rejects(server.request(request), /subscription not found/);
		assert.deepStrictEqual({ notices, counts: f.counts() }, {
			notices: [{ session: 'vendor-session://opaque', artifact, kind: 'enabled', content: 'Analysis enabled', iconId: 'beaker' }],
			counts: { references: 0, detailReferences: 0 },
		});
	});

	test('notice capability is optional and malformed notices are rejected', async () => {
		const f = model();
		const server = store.add(new ArtifactIntegrationServer(f.access));
		const request = { kind: 'notice' as const, subscription: 'notice', notice: { kind: 'enabled' as const, content: 'Enabled' } };
		await assert.rejects(server.request(request), /does not support/);
		assert.deepStrictEqual([
			isArtifactIntegrationRequest(request),
			isArtifactIntegrationRequest({ ...request, notice: { kind: 'sent', content: 'Unsupported' } }),
			isArtifactIntegrationRequest({ ...request, notice: { kind: 'enabled', content: '' } }),
			isArtifactIntegrationRequest({ ...request, notice: { kind: 'enabled', content: 'Enabled', iconId: 'invalid icon' } }),
		], [true, false, false, false]);
	});

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
		const f = model(true);
		const reset = store.add(new Emitter<void>());
		const updates = store.add(new Relay<ArtifactIntegrationUpdate>());
		const requests: ArtifactIntegrationRequest['kind'][] = [];
		let server = store.add(new ArtifactIntegrationServer(f.access));
		updates.input = server.onDidUpdate;
		const client = store.add(new ArtifactIntegrationClient({
			onDidUpdate: updates.event, onDidReset: reset.event,
			authenticate: async () => { },
			request: async request => { requests.push(request.kind); return server.request(request); },
		}, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		const details = store.add(await reference.object.acquireDetails('integration', 'details'));
		await reference.object.configure('integration', 0, { automatic: true });
		await reference.object.requestAuthentication('integration');
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

	test('authentication is routed once to the invoking client and can be retried after dismissal', async () => {
		const f = model(true);
		const server = store.add(new ArtifactIntegrationServer(f.access));
		const barrier = new DeferredPromise<void>();
		const requests: ArtifactAuthenticationRequest[] = [];
		const client = store.add(new ArtifactIntegrationClient({
			onDidUpdate: server.onDidUpdate,
			request: request => server.request(request),
			authenticate: async request => { requests.push(request); await barrier.p; },
		}, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		const first = reference.object.requestAuthentication('integration');
		const duplicate = reference.object.requestAuthentication('integration');
		const pending = reference.object.snapshot.get().contributions[0].authentication;
		await barrier.complete();
		await first;
		await reference.object.requestAuthentication('integration');
		assert.deepStrictEqual({
			deduplicated: first === duplicate,
			pending: pending?.enabled,
			after: reference.object.snapshot.get().contributions[0].authentication,
			requests, received: f.authenticationRequests, runs: f.snapshot.get().runs,
		}, {
			deduplicated: true, pending: false, after: { enabled: true },
			requests: [
				{ resource: 'https://example.test', authorizationServers: ['https://auth.example.test'], scopes: ['read'] },
				{ resource: 'https://example.test', authorizationServers: ['https://auth.example.test'], scopes: ['read'] },
			],
			received: ['integration', 'integration'], runs: [],
		});
	});

	for (const stage of ['challenge', 'interaction'] as const) {
		test(`authentication is fenced across disconnect during ${stage}`, async () => {
			const f = model(true);
			const server = store.add(new ArtifactIntegrationServer(f.access));
			const available = observableValue('available', true);
			const entered = new DeferredPromise<void>();
			const barrier = new DeferredPromise<void>();
			let interactions = 0;
			const client = store.add(new ArtifactIntegrationClient({
				onDidUpdate: server.onDidUpdate, available,
				request: async request => {
					const response = await server.request(request);
					if (request.kind === 'authenticate' && stage === 'challenge') {
						await entered.complete();
						await barrier.p;
					}
					return response;
				},
				authenticate: async () => {
					interactions++;
					if (stage === 'interaction') {
						await entered.complete();
						await barrier.p;
					}
				},
			}, new NullLogService()));
			const reference = store.add(await client.acquireArtifact('session', 'artifact'));
			const request = reference.object.requestAuthentication('integration');
			const rejected = assert.rejects(request, isCancellationError);
			await entered.p;
			available.set(false, undefined);
			const disconnected = reference.object.snapshot.get().contributions[0].authentication?.enabled;
			available.set(true, undefined);
			await barrier.complete();
			await rejected;
			assert.deepStrictEqual({ interactions, disconnected, requests: f.authenticationRequests }, {
				interactions: stage === 'challenge' ? 0 : 1, disconnected: false, requests: ['integration'],
			});
		});
	}

	test('clients without an authentication handler do not send recovery requests', async () => {
		const f = model(true);
		const server = store.add(new ArtifactIntegrationServer(f.access));
		const client = store.add(new ArtifactIntegrationClient(server, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		await assert.rejects(reference.object.requestAuthentication('integration'), /not available/);
		assert.deepStrictEqual({
			enabled: reference.object.snapshot.get().contributions[0].authentication?.enabled,
			requests: f.authenticationRequests,
		}, { enabled: false, requests: [] });
	});

	test('validates authentication requests, challenges, and capability state', () => {
		const f = model(true);
		const current = f.snapshot.get();
		assert.deepStrictEqual([
			isArtifactIntegrationRequest({ kind: 'authenticate', subscription: 'sub', integrationId: 'integration' }),
			isArtifactIntegrationRequest({ kind: 'authenticate', subscription: 'sub', integrationId: '' }),
			isArtifactAuthenticationRequest({ resource: 'https://example.test', scopes: ['read'] }),
			isArtifactAuthenticationRequest({ resource: 'http://example.test' }),
			isArtifactAuthenticationRequest({ resource: 'https://example.test#fragment' }),
			isArtifactAuthenticationRequest({ resource: 'https://user:secret@example.test' }),
			isArtifactAuthenticationRequest({ resource: 'https://example.test', authorizationServers: ['command:run'] }),
			isArtifactAuthenticationRequest({ resource: 'https://example.test', scopes: [true] }),
			isArtifactIntegrationResponse({ kind: 'authentication', request: { resource: 'https://example.test' } }),
			isArtifactIntegrationResponse({ kind: 'authentication', request: {} }),
			isArtifactSnapshot(current),
			isArtifactSnapshot({ ...current, contributions: [{ ...current.contributions[0], authentication: { enabled: 'true' } }] }),
			isArtifactSnapshot({ ...current, contributions: [{ ...current.contributions[0], authority: { id: 'extension', targetHost: 'host', location: 'client' } }] }),
			isArtifactSnapshot({ ...current, contributions: [{ ...current.contributions[0], authority: { id: 'extension', location: 'invalid' } }] }),
		], [true, false, true, false, false, false, false, false, true, false, true, false, true, false]);
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

	test('validates and transports chat-specific manual action availability', async () => {
		const f = model();
		const action = { id: 'repair', enabled: true, chatAvailability: { 'chat:one': { enabled: false, disabledReason: 'Wrong checkout' }, 'chat:two': { enabled: true } } };
		f.snapshot.set({
			...f.snapshot.get(), contributions: [{
				integrationId: 'test', label: 'Test', actions: [{ id: 'repair', label: 'Repair', iconId: 'tools', kind: 'prompt' }], options: [],
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: { availability: { kind: 'available' }, sections: [], stateActions: [action], generalActions: [], automationAvailability: [] },
			}]
		}, undefined);
		const server = store.add(new ArtifactIntegrationServer(f.access));
		const client = store.add(new ArtifactIntegrationClient({ onDidUpdate: server.onDidUpdate, request: request => server.request(request) }, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		const contribution = f.snapshot.get().contributions[0];
		const malformed = {
			kind: 'artifact', subscription: 'subscription', revision: 0,
			snapshot: { ...f.snapshot.get(), contributions: [{ ...contribution, view: { ...contribution.view, stateActions: [{ ...action, chatAvailability: { 'chat:one': { enabled: 'yes' } } }] } }] },
		};
		assert.deepStrictEqual({ actions: reference.object.snapshot.get().contributions[0].view.stateActions, malformedAccepted: isArtifactIntegrationResponse(malformed) },
			{ actions: [action], malformedAccepted: false });
	});

	test('compact part descriptions are optional plain text across the transport', () => {
		const part = { label: '3/6', description: '3 of 6 checks passed', icon: { id: 'pass' }, detailsId: 'checks' };
		const contribution = {
			integrationId: 'test', label: 'Test', actions: [], options: [],
			configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
			view: {
				availability: { kind: 'available' }, main: part, sections: [{ ...part, id: 'checks' }],
				stateActions: [], generalActions: [], automationAvailability: [],
			},
		};
		const response = {
			kind: 'artifact', subscription: 'subscription', revision: 0,
			snapshot: { ...model().snapshot.get(), mainIntegrationId: 'test', contributions: [contribution] },
		};
		const withParts = (mainDescription: string | number | undefined, sectionDescription: string | number | undefined) => ({
			...response,
			snapshot: {
				...response.snapshot,
				contributions: [{
					...contribution,
					view: { ...contribution.view, main: { ...part, description: mainDescription }, sections: [{ ...part, id: 'checks', description: sectionDescription }] },
				}],
			},
		});
		assert.deepStrictEqual([
			isArtifactIntegrationResponse(response),
			isArtifactIntegrationResponse(withParts(undefined, undefined)),
			isArtifactIntegrationResponse(withParts(42, part.description)),
			isArtifactIntegrationResponse(withParts(part.description, 42)),
		], [true, true, false, false]);
	});

	test('wire snapshots reject ambiguous identities and unregistered presentation references', () => {
		const action = { id: 'act', label: 'Act', iconId: 'play', kind: 'code' as const };
		const option = { id: 'auto', label: 'Automatic', description: 'Act automatically', kind: 'boolean' as const, defaultValue: false as const, actionIds: ['act'], maxAttempts: 1 };
		const section = { id: 'status', label: 'Status', icon: { id: 'info' }, detailsId: 'status' };
		const view = {
			availability: { kind: 'available' as const }, sections: [section],
			stateActions: [{ id: 'act', enabled: true }], generalActions: [],
			automationAvailability: [{ id: 'auto', available: true }],
		};
		const contribution = {
			integrationId: 'test', label: 'Test', actions: [action], options: [option], view,
			configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
		};
		const snapshot = { ...model().snapshot.get(), mainIntegrationId: 'test', contributions: [contribution] };
		const withContribution = (changes: object) => ({ ...snapshot, contributions: [{ ...contribution, ...changes }] });
		assert.deepStrictEqual([
			isArtifactSnapshot(snapshot),
			isArtifactSnapshot({ ...snapshot, contributions: [contribution, contribution] }),
			isArtifactSnapshot({ ...snapshot, mainIntegrationId: 'missing' }),
			isArtifactSnapshot(withContribution({ actions: [action, action] })),
			isArtifactSnapshot(withContribution({ options: [option, option] })),
			isArtifactSnapshot(withContribution({ view: { ...view, sections: [section, section] } })),
			isArtifactSnapshot(withContribution({ view: { ...view, generalActions: view.stateActions } })),
			isArtifactSnapshot(withContribution({ view: { ...view, automationAvailability: [...view.automationAvailability, ...view.automationAvailability] } })),
			isArtifactSnapshot(withContribution({ view: { ...view, stateActions: [{ id: 'missing', enabled: true }] } })),
			isArtifactSnapshot(withContribution({ view: { ...view, automationAvailability: [{ id: 'missing', available: true }] } })),
			isArtifactSnapshot(withContribution({ actions: [{ ...action, consentVersion: 1 }] })),
			// Registered descriptors outlive their applicability; retained options may outlive their provider.
			isArtifactSnapshot(withContribution({ view: { ...view, stateActions: [] } })),
			isArtifactSnapshot(withContribution({ actions: [], view: { ...view, stateActions: [], automationAvailability: [] } })),
		], [true, false, false, false, false, false, false, false, false, false, false, true, true]);
	});

	test('wire snapshots accept an integration group label and per-artifact group icon with a finite priority', () => {
		const view = { availability: { kind: 'available' as const }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] };
		const contribution = { integrationId: 'test', label: 'Test', actions: [], options: [], view, configuration: { revision: 0, values: {}, generations: {}, disablements: {} } };
		const snapshot = { ...model().snapshot.get(), mainIntegrationId: 'test', contributions: [contribution] };
		const withContribution = (changes: object) => ({ ...snapshot, contributions: [{ ...contribution, ...changes }] });
		const withGroup = (group: unknown) => withContribution({ view: { ...view, group } });
		assert.deepStrictEqual([
			isArtifactSnapshot(withContribution({ groupLabel: 'Tests', view: { ...view, group: { icon: { id: 'beaker', colorId: 'charts.green' }, priority: 2 } } })),
			isArtifactSnapshot(withContribution({ groupLabel: '' })),
			isArtifactSnapshot(withContribution({ groupLabel: 'Two\nlines' })),
			isArtifactSnapshot(withGroup({ icon: { id: 'beaker' }, priority: Number.POSITIVE_INFINITY })),
			isArtifactSnapshot(withGroup({ icon: { id: 'beaker' }, priority: '2' })),
			isArtifactSnapshot(withGroup({ icon: { id: 'not an icon' }, priority: 1 })),
			isArtifactSnapshot(withGroup({ priority: 1 })),
		], [true, false, false, false, false, false, false]);
	});

	test('detail pages have an explicit bounded shape', () => {
		const details = { title: 'Details', availability: { kind: 'available' }, completeness: 'partial', links: [], items: Array.from({ length: 200 }, (_, index) => ({ id: String(index), label: 'Item', icon: { id: 'link' }, resource: 'https://example.test' })) };
		assert.deepStrictEqual([
			isArtifactDetails(details),
			isArtifactDetails({ ...details, items: [...details.items, { ...details.items[0], id: 'overflow' }] }),
			isArtifactDetails({ ...details, items: [details.items[0], details.items[0]] }),
		], [true, false, false]);
	});

	test('item actions run through the details subscription, and items reference declared item actions', async () => {
		const f = model();
		const calls: unknown[][] = [];
		const access: IArtifactIntegrationAccess = {
			acquireArtifact: async (session, artifactId) => {
				const reference = await f.access.acquireArtifact(session, artifactId);
				return {
					object: {
						...reference.object,
						acquireDetails: async (integrationId, detailsId) => {
							const details = await reference.object.acquireDetails(integrationId, detailsId);
							return { ...details, runItemAction: async (...args) => { calls.push([detailsId, ...args.slice(0, 2)]); }, dispose: () => details.dispose() };
						},
					},
					dispose: () => reference.dispose(),
				};
			},
		};
		const server = store.add(new ArtifactIntegrationServer(access));
		const client = store.add(new ArtifactIntegrationClient({ onDidUpdate: server.onDidUpdate, request: request => server.request(request) }, new NullLogService()));
		const reference = store.add(await client.acquireArtifact('session', 'artifact'));
		const details = store.add(await reference.object.acquireDetails('test', 'checks'));
		await details.runItemAction!('build', 'rerun', CancellationToken.None);

		const request = { kind: 'runItemAction', subscription: 'sub', itemId: 'build', actionId: 'rerun' };
		const page = (itemActions: unknown, actions: unknown) => ({
			title: 'Checks', availability: { kind: 'available' }, completeness: 'complete', links: [], itemActions,
			items: [{ id: 'build', label: 'Build', icon: { id: 'error' }, resource: 'https://example.test', actions }],
		});
		const rerun = { id: 'rerun', label: 'Rerun Check', iconId: 'debug-rerun' };
		assert.deepStrictEqual({
			calls,
			requests: [isArtifactIntegrationRequest(request), isArtifactIntegrationRequest({ ...request, itemId: '' }), isArtifactIntegrationRequest({ ...request, actionId: 1 })],
			details: [
				isArtifactDetails(page([rerun], ['rerun'])),
				isArtifactDetails(page(undefined, undefined)),
				isArtifactDetails(page(undefined, ['rerun'])),
				isArtifactDetails(page([rerun], ['missing'])),
				isArtifactDetails(page([rerun], ['rerun', 'rerun'])),
				isArtifactDetails(page([rerun, rerun], ['rerun'])),
				isArtifactDetails(page([{ ...rerun, iconId: 'not an icon' }], ['rerun'])),
			],
		}, {
			calls: [['checks', 'build', 'rerun']],
			requests: [true, false, false],
			details: [true, true, false, false, false, false, false],
		});
	});
});
