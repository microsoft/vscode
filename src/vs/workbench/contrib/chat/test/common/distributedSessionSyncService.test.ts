/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatSessionStatus, IChatSessionItem } from '../../common/chatSessionsService.js';
import {
	compareVersionVectors,
	HostStatus,
	IDistributedSessionSnapshot,
	incrementVersionVector,
	mergeVersionVectors,
	sessionNeedsFailover,
	ISessionHost,
	SessionVersionVector,
	SyncUpdateResult,
} from '../../common/distributedSessionSyncService.js';
import { DistributedSessionSyncService } from '../../common/distributedSessionSyncServiceImpl.js';

function makeSessionItem(overrides?: Partial<IChatSessionItem>): IChatSessionItem {
	return {
		resource: URI.parse('vscode-chat-session://test/session-1'),
		label: 'Test Session',
		timing: { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined },
		...overrides,
	};
}

function makeSnapshot(overrides?: Partial<IDistributedSessionSnapshot>): IDistributedSessionSnapshot {
	return {
		sessionResource: URI.parse('vscode-chat-session://test/session-1'),
		version: [{ clientId: 'client-a', counter: 1 }],
		ownerHostId: 'host-1',
		item: makeSessionItem(),
		timestamp: Date.now(),
		...overrides,
	};
}

suite('DistributedSessionSyncService', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
	let service: DistributedSessionSyncService;

	setup(() => {
		const instantiationService = testDisposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		service = testDisposables.add(instantiationService.createInstance(DistributedSessionSyncService));
	});

	// --- Version vector utilities ---

	suite('compareVersionVectors', () => {

		test('identical vectors are concurrent', () => {
			const v: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			assert.strictEqual(compareVersionVectors(v, v), 0);
		});

		test('a dominates b', () => {
			const a: SessionVersionVector = [{ clientId: 'a', counter: 2 }];
			const b: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			assert.strictEqual(compareVersionVectors(a, b), 1);
		});

		test('b dominates a', () => {
			const a: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			const b: SessionVersionVector = [{ clientId: 'a', counter: 3 }];
			assert.strictEqual(compareVersionVectors(a, b), -1);
		});

		test('concurrent vectors with different clients', () => {
			const a: SessionVersionVector = [{ clientId: 'a', counter: 2 }, { clientId: 'b', counter: 1 }];
			const b: SessionVersionVector = [{ clientId: 'a', counter: 1 }, { clientId: 'b', counter: 2 }];
			assert.strictEqual(compareVersionVectors(a, b), 0);
		});

		test('empty vectors are concurrent', () => {
			assert.strictEqual(compareVersionVectors([], []), 0);
		});

		test('non-empty dominates empty', () => {
			const a: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			assert.strictEqual(compareVersionVectors(a, []), 1);
		});
	});

	suite('incrementVersionVector', () => {

		test('increments existing entry', () => {
			const v: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			const result = incrementVersionVector(v, 'a');
			assert.deepStrictEqual(result, [{ clientId: 'a', counter: 2 }]);
		});

		test('adds new entry for unknown client', () => {
			const v: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			const result = incrementVersionVector(v, 'b');
			assert.deepStrictEqual(result, [
				{ clientId: 'a', counter: 1 },
				{ clientId: 'b', counter: 1 },
			]);
		});

		test('increments from empty', () => {
			const result = incrementVersionVector([], 'a');
			assert.deepStrictEqual(result, [{ clientId: 'a', counter: 1 }]);
		});
	});

	suite('mergeVersionVectors', () => {

		test('takes max of each client', () => {
			const a: SessionVersionVector = [{ clientId: 'a', counter: 2 }, { clientId: 'b', counter: 1 }];
			const b: SessionVersionVector = [{ clientId: 'a', counter: 1 }, { clientId: 'b', counter: 3 }];
			const result = mergeVersionVectors(a, b);
			const map = new Map(result.map(e => [e.clientId, e.counter]));
			assert.strictEqual(map.get('a'), 2);
			assert.strictEqual(map.get('b'), 3);
		});

		test('includes entries from both sides', () => {
			const a: SessionVersionVector = [{ clientId: 'a', counter: 1 }];
			const b: SessionVersionVector = [{ clientId: 'b', counter: 2 }];
			const result = mergeVersionVectors(a, b);
			assert.strictEqual(result.length, 2);
		});
	});

	// --- sessionNeedsFailover ---

	suite('sessionNeedsFailover', () => {

		test('in-progress session with offline owner needs failover', () => {
			const snapshot = makeSnapshot({
				item: makeSessionItem({ status: ChatSessionStatus.InProgress }),
				ownerHostId: 'host-1',
			});
			const hosts: ISessionHost[] = [{
				hostId: 'host-1', displayName: 'Host 1',
				status: HostStatus.Offline,
				endpoint: URI.parse('wss://host-1.example.com'),
				lastHeartbeat: 0,
			}];
			assert.strictEqual(sessionNeedsFailover(snapshot, hosts), true);
		});

		test('completed session does not need failover', () => {
			const snapshot = makeSnapshot({
				item: makeSessionItem({ status: ChatSessionStatus.Completed }),
				ownerHostId: 'host-1',
			});
			const hosts: ISessionHost[] = [{
				hostId: 'host-1', displayName: 'Host 1',
				status: HostStatus.Offline,
				endpoint: URI.parse('wss://host-1.example.com'),
				lastHeartbeat: 0,
			}];
			assert.strictEqual(sessionNeedsFailover(snapshot, hosts), false);
		});

		test('in-progress session with online owner does not need failover', () => {
			const snapshot = makeSnapshot({
				item: makeSessionItem({ status: ChatSessionStatus.InProgress }),
				ownerHostId: 'host-1',
			});
			const hosts: ISessionHost[] = [{
				hostId: 'host-1', displayName: 'Host 1',
				status: HostStatus.Online,
				endpoint: URI.parse('wss://host-1.example.com'),
				lastHeartbeat: Date.now(),
			}];
			assert.strictEqual(sessionNeedsFailover(snapshot, hosts), false);
		});

		test('in-progress session with missing owner needs failover', () => {
			const snapshot = makeSnapshot({
				item: makeSessionItem({ status: ChatSessionStatus.InProgress }),
				ownerHostId: 'host-unknown',
			});
			assert.strictEqual(sessionNeedsFailover(snapshot, []), true);
		});
	});

	// --- Service: connection lifecycle ---

	suite('connection lifecycle', () => {

		test('connect and disconnect', async () => {
			assert.strictEqual(service.connected, false);

			const events: boolean[] = [];
			testDisposables.add(service.onDidChangeConnectionState(e => events.push(e)));

			await service.connect({ clientId: 'c1', displayName: 'Client 1' });
			assert.strictEqual(service.connected, true);

			await service.disconnect();
			assert.strictEqual(service.connected, false);
			assert.deepStrictEqual(events, [true, false]);
		});

		test('double connect is idempotent', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });
			assert.strictEqual(service.connected, true);
		});
	});

	// --- Service: host management ---

	suite('host management', () => {

		test('register and unregister host', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			const hostReg = service.registerHost({
				hostId: 'host-1',
				displayName: 'Test Host',
				endpoint: URI.parse('wss://host-1.example.com'),
			});

			const hosts = service.getHosts();
			assert.strictEqual(hosts.length, 1);
			assert.strictEqual(hosts[0].hostId, 'host-1');
			assert.strictEqual(hosts[0].status, HostStatus.Online);

			hostReg.dispose();

			assert.strictEqual(service.getHosts().length, 0);
		});

		test('host failure simulation marks host offline', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			const hostStatusChanges: HostStatus[] = [];
			testDisposables.add(service.onDidChangeHostStatus(h => hostStatusChanges.push(h.status)));

			const hostReg = testDisposables.add(service.registerHost({
				hostId: 'host-1',
				displayName: 'Test Host',
				endpoint: URI.parse('wss://host-1.example.com'),
			}));
			assert.ok(hostReg);

			service._simulateHostFailure('host-1');

			const hosts = service.getHosts();
			assert.strictEqual(hosts[0].status, HostStatus.Offline);
			assert.ok(hostStatusChanges.includes(HostStatus.Offline));
		});
	});

	// --- Service: session replication ---

	suite('session replication', () => {

		test('publish and retrieve session', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });
			const snapshot = makeSnapshot();

			const received: IDistributedSessionSnapshot[] = [];
			testDisposables.add(service.onDidChangeSession(s => received.push(s)));

			await service.publishSession(snapshot);

			assert.strictEqual(service.getSessions().length, 1);
			assert.strictEqual(service.getSession(snapshot.sessionResource)?.ownerHostId, 'host-1');
			assert.strictEqual(received.length, 1);
		});

		test('apply update accepted', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			testDisposables.add(service.registerHost({
				hostId: 'host-1',
				displayName: 'Test Host',
				endpoint: URI.parse('wss://host-1.example.com'),
			}));

			const snapshot = makeSnapshot();
			await service.publishSession(snapshot);

			const result = await service.applyUpdate({
				sessionResource: snapshot.sessionResource,
				baseVersion: snapshot.version,
				patch: { label: 'Updated Label' },
			});

			assert.strictEqual(result.result, SyncUpdateResult.Accepted);
			assert.strictEqual(result.snapshot.item.label, 'Updated Label');
		});

		test('apply update conflict on stale version', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			testDisposables.add(service.registerHost({
				hostId: 'host-1',
				displayName: 'Test Host',
				endpoint: URI.parse('wss://host-1.example.com'),
			}));

			const snapshot = makeSnapshot({
				version: [{ clientId: 'c1', counter: 2 }],
			});
			await service.publishSession(snapshot);

			const result = await service.applyUpdate({
				sessionResource: snapshot.sessionResource,
				baseVersion: [{ clientId: 'c1', counter: 1 }], // stale
				patch: { label: 'Should Conflict' },
			});

			assert.strictEqual(result.result, SyncUpdateResult.Conflict);
			// Original label preserved
			assert.strictEqual(service.getSession(snapshot.sessionResource)?.item.label, 'Test Session');
		});

		test('apply update returns OwnerOffline when host is offline', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			testDisposables.add(service.registerHost({
				hostId: 'host-1',
				displayName: 'Test Host',
				endpoint: URI.parse('wss://host-1.example.com'),
			}));

			const snapshot = makeSnapshot();
			await service.publishSession(snapshot);

			// Simulate host failure
			service._simulateHostFailure('host-1');

			const result = await service.applyUpdate({
				sessionResource: snapshot.sessionResource,
				baseVersion: snapshot.version,
				patch: { label: 'Should Queue' },
			});

			assert.strictEqual(result.result, SyncUpdateResult.OwnerOffline);
		});

		test('reassign session owner', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			testDisposables.add(service.registerHost({
				hostId: 'host-1',
				displayName: 'Host 1',
				endpoint: URI.parse('wss://host-1.example.com'),
			}));
			testDisposables.add(service.registerHost({
				hostId: 'host-2',
				displayName: 'Host 2',
				endpoint: URI.parse('wss://host-2.example.com'),
			}));

			const snapshot = makeSnapshot();
			await service.publishSession(snapshot);

			const ok = await service.reassignSessionOwner(snapshot.sessionResource, 'host-2');
			assert.strictEqual(ok, true);
			assert.strictEqual(service.getSession(snapshot.sessionResource)?.ownerHostId, 'host-2');
		});

		test('reassign to offline host fails', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });

			testDisposables.add(service.registerHost({
				hostId: 'host-1',
				displayName: 'Host 1',
				endpoint: URI.parse('wss://host-1.example.com'),
			}));
			testDisposables.add(service.registerHost({
				hostId: 'host-2',
				displayName: 'Host 2',
				endpoint: URI.parse('wss://host-2.example.com'),
			}));

			const snapshot = makeSnapshot();
			await service.publishSession(snapshot);

			service._simulateHostFailure('host-2');

			const ok = await service.reassignSessionOwner(snapshot.sessionResource, 'host-2');
			assert.strictEqual(ok, false);
			// Owner unchanged
			assert.strictEqual(service.getSession(snapshot.sessionResource)?.ownerHostId, 'host-1');
		});

		test('reassign unknown session fails', async () => {
			await service.connect({ clientId: 'c1', displayName: 'Client 1' });
			const ok = await service.reassignSessionOwner(URI.parse('vscode-chat-session://test/unknown'), 'host-1');
			assert.strictEqual(ok, false);
		});
	});
});
