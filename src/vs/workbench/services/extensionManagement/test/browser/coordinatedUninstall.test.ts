/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalExtension, UninstallExtensionInfo } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspace } from '../../../../../platform/workspace/common/workspace.js';
import { IExtensionManagementServer, IExtensionManagementServerService, IProfileAwareExtensionManagementService } from '../../common/extensionManagement.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { ExtensionManagementService } from '../../common/extensionManagementService.js';

type ServiceArguments = ConstructorParameters<typeof ExtensionManagementService>;

interface Operation {
	target: string;
	state: 'prepared' | 'terminal' | 'aborted';
	pending: boolean;
}

suite('Coordinated local uninstall exchanges', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function harness(initialFailures: string[] = []) {
		const calls: string[] = [];
		const operations = new Map<string, Operation>();
		const reservations = new Set<string>();
		const released = new Set<string>();
		const failures = new Set(initialFailures);
		const gates: { release?: DeferredPromise<void>; ack?: DeferredPromise<void> } = {};
		const started = { release: new DeferredPromise<void>(), ack: new DeferredPromise<void>() };
		const state = {
			identity: 'store-one',
			identityCalls: 0,
			commits: 0,
			installed: true,
			dependent: false,
			workspace: 'workspace-one',
			profile: upcastPartial<IUserDataProfile>({ id: 'default', location: URI.file('/profiles/one'), extensionsResource: URI.file('/profiles/one/extensions.json') }),
		};
		const extension = upcastPartial<ILocalExtension>({
			identifier: { id: 'fixture.local' }, location: URI.file('/extensions/fixture.local'),
			manifest: { name: 'local', publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' } },
		});
		const fail = (stage: string) => {
			if (failures.delete(stage)) { throw new Error(`lost ${stage} reply`); }
		};
		const events = {
			onInstallExtension: Event.None, onDidInstallExtensions: Event.None,
			onUninstallExtension: Event.None, onDidUninstallExtension: Event.None,
			onDidUpdateExtensionMetadata: Event.None, onDidChangeProfile: Event.None,
			onProfileAwareDidInstallExtensions: Event.None, onProfileAwareDidUninstallExtension: Event.None,
			onProfileAwareDidUpdateExtensionMetadata: Event.None,
		};
		const local = upcastPartial<IProfileAwareExtensionManagementService>({
			...events,
			supportsCoordinatedUninstall: async () => true,
			getPendingLocalUninstalls: async target => {
				calls.push('pending'); fail('pending');
				return [...operations].filter(([, value]) => value.pending && value.target === target).map(([id]) => id);
			},
			prepareLocalUninstall: async (id, batch, target) => {
				calls.push('prepare');
				assert.strictEqual(batch[0].options?.profileLocation?.toString(), state.profile.extensionsResource.toString());
				operations.set(id, { target, state: 'prepared', pending: true }); fail('prepare');
			},
			commitLocalUninstall: async id => {
				calls.push('commit'); fail('rejected commit');
				const operation = operations.get(id)!;
				assert.strictEqual(operation.state, 'prepared');
				assert.ok(reservations.has(id));
				operation.state = 'terminal'; state.installed = false; state.commits++; fail('commit');
			},
			abortLocalUninstall: async id => {
				calls.push('abort');
				const operation = operations.get(id);
				if (operation) { operation.state = 'aborted'; }
				fail('abort');
			},
			acknowledgeLocalUninstall: async id => {
				calls.push('ack'); started.ack.complete(); await gates.ack?.p; fail('unreceived ack');
				assert.ok(released.has(id));
				const operation = operations.get(id)!;
				assert.notStrictEqual(operation.state, 'prepared');
				operation.pending = false; fail('ack');
			},
		});
		const remote = upcastPartial<IProfileAwareExtensionManagementService>({
			...events,
			supportsCoordinatedUninstall: async () => true,
			getCoordinatedUninstallIdentity: async () => { calls.push('identity'); state.identityCalls++; fail('identity'); return state.identity; },
			reserveLocalUninstall: async (id, _profile, expected) => {
				calls.push('reserve');
				if (expected !== state.identity) { throw new Error('identity changed'); }
				assert.ok(!released.has(id)); reservations.add(id); fail('reserve');
				return state.dependent ? [upcastPartial<ILocalExtension>({ identifier: { id: 'fixture.remote' }, manifest: { name: 'remote', publisher: 'fixture', version: '1.0.0', engines: { vscode: '*' }, extensionDependencies: ['fixture.local'] } })] : [];
			},
			releaseLocalUninstall: async (id, expected) => {
				calls.push('release'); started.release.complete(); await gates.release?.p;
				if (expected !== state.identity) { throw new Error('identity changed'); }
				fail('unreceived release'); reservations.delete(id); released.add(id); fail('release');
			},
		});
		const localServer = upcastPartial<IExtensionManagementServer>({ id: 'local', extensionManagementService: local });
		const remoteServer = upcastPartial<IExtensionManagementServer>({ id: 'remote', extensionManagementService: remote });
		function createService() {
			const workspaceExtensions = Object.assign(new class extends Disposable { }(), { onDidChangeInvalidExtensions: Event.None });
			const service = new ExtensionManagementService(
				upcastPartial<IExtensionManagementServerService>({ localExtensionManagementServer: localServer, remoteExtensionManagementServer: remoteServer, getExtensionManagementServer: () => localServer }),
				upcastPartial({}), upcastPartial<IUserDataProfileService>({ get currentProfile() { return state.profile; } }), upcastPartial({}), upcastPartial({}),
				upcastPartial<ServiceArguments[5]>({ quality: 'stable' }), upcastPartial({}), upcastPartial({}), upcastPartial({}), upcastPartial({}),
				upcastPartial<ServiceArguments[10]>({ prefersExecuteOnUI: () => false }), upcastPartial({}), new NullLogService(),
				upcastPartial<ServiceArguments[13]>({ createInstance: (() => workspaceExtensions) as IInstantiationService['createInstance'] }),
				upcastPartial({}), upcastPartial({}), upcastPartial({}), upcastPartial({}),
				upcastPartial<ServiceArguments[18]>({ getWorkspace: () => upcastPartial<IWorkspace>({ id: state.workspace }) }),
			);
			return disposables.add(service);
		}
		const restartBackend = () => Object.assign(remoteServer, { extensionManagementService: { ...remote } });
		const service = createService();
		const uninstall = (target = service) => target.uninstallExtensions([{ extension } satisfies UninstallExtensionInfo]);
		return { calls, operations, reservations, failures, gates, started, state, service, createService, restartBackend, uninstall };
	}

	test('startup identity is reused and successful commits await release and acknowledgement without abort', async () => {
		const h = harness();
		await h.uninstall();
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 1);
		assert.strictEqual(h.state.commits, 2);
		assert.ok(!h.calls.includes('abort'));
		assert.deepStrictEqual(h.calls.slice(-5), ['prepare', 'reserve', 'commit', 'release', 'ack']);
		assert.ok([...h.operations.values()].every(operation => !operation.pending));
		assert.strictEqual(h.reservations.size, 0);
	});

	test('cached identity remains valid across a backend restart using the same database', async () => {
		const h = harness();
		await h.uninstall();
		// Replace the backend proxy while retaining its durable identity and operation state.
		h.restartBackend();
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 1);
		assert.strictEqual(h.state.commits, 2);
	});

	test('current workspace and profile bind each new intent without another identity handshake', async () => {
		const h = harness();
		await h.uninstall();
		h.state.workspace = 'workspace-two';
		h.state.profile = upcastPartial<IUserDataProfile>({ id: 'two', location: URI.file('/profiles/two'), extensionsResource: URI.file('/profiles/two/extensions.json') });
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 1);
		assert.strictEqual([...h.operations.values()].at(-1)!.target, JSON.stringify(['store-one', 'workspace-two', h.state.profile.location.toString()]));
	});

	for (const stage of ['prepare', 'reserve', 'commit', 'rejected commit']) {
		test(`${stage} failure fences locally before releasing and refreshes identity without automatic replay`, async () => {
			const h = harness([stage]);
			await assert.rejects(h.uninstall(), /lost .* reply/);
			assert.deepStrictEqual(h.calls.slice(-3), ['abort', 'release', 'ack']);
			assert.strictEqual(h.state.commits, stage === 'commit' ? 1 : 0);
			assert.strictEqual(h.reservations.size, 0);
			assert.ok([...h.operations.values()].every(operation => !operation.pending));
			await h.uninstall();
			assert.strictEqual(h.state.identityCalls, 2);
		});
	}

	for (const stage of ['release', 'unreceived release']) {
		test(`${stage} failure retains recovery intent and restart with the same DB fences before retrying release`, async () => {
			const h = harness([stage]);
			await assert.rejects(h.uninstall(), /lost .*release reply/);
			assert.strictEqual(h.state.commits, 1);
			assert.ok(!h.calls.includes('abort'));
			assert.ok([...h.operations.values()].some(operation => operation.pending));
			const offset = h.calls.length;
			const restarted = h.createService();
			await h.uninstall(restarted);
			assert.deepStrictEqual(h.calls.slice(offset, offset + 5), ['identity', 'pending', 'abort', 'release', 'ack']);
			assert.strictEqual(h.state.identityCalls, 2);
			assert.strictEqual(h.reservations.size, 0);
			assert.ok([...h.operations.values()].every(operation => !operation.pending));
		});
	}

	for (const stage of ['ack', 'unreceived ack']) {
		test(`${stage} failure refreshes identity without replaying a confirmed commit`, async () => {
			const h = harness([stage]);
			await assert.rejects(h.uninstall(), /lost .*ack reply/);
			assert.strictEqual(h.state.commits, 1);
			assert.strictEqual([...h.operations.values()].some(operation => operation.pending), stage === 'unreceived ack');
			await h.uninstall();
			assert.strictEqual(h.state.identityCalls, 2);
			assert.strictEqual(h.state.commits, 2);
			assert.ok([...h.operations.values()].every(operation => !operation.pending));
		});
	}

	test('failed abort prevents release until a later explicit request recovers the fence', async () => {
		const h = harness(['reserve', 'abort']);
		await assert.rejects(h.uninstall(), /lost abort reply/);
		assert.strictEqual(h.calls.at(-1), 'abort');
		assert.strictEqual(h.reservations.size, 1);
		assert.strictEqual(h.state.commits, 0);
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 2);
		assert.strictEqual(h.reservations.size, 0);
		assert.ok([...h.operations.values()].every(operation => !operation.pending));
	});

	for (const stage of ['release', 'ack'] as const) {
		test(`public completion waits for confirmed ${stage}`, async () => {
			const h = harness();
			h.gates[stage] = new DeferredPromise<void>();
			let completed = false;
			const uninstall = h.uninstall().then(() => { completed = true; });
			await h.started[stage].p;
			assert.strictEqual(completed, false);
			h.gates[stage]!.complete();
			await uninstall;
			assert.strictEqual(completed, true);
			assert.ok(!h.calls.includes('abort'));
		});
	}

	test('retarget mismatch prevents local commit and refreshes identity on the next explicit request', async () => {
		const h = harness();
		await h.uninstall();
		h.state.identity = 'store-two';
		await assert.rejects(h.uninstall(), /identity changed/);
		assert.strictEqual(h.state.commits, 1);
		assert.strictEqual(h.reservations.size, 0);
		assert.ok([...h.operations.values()].some(operation => operation.pending && JSON.parse(operation.target)[0] === 'store-one'));
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 2);
		assert.strictEqual(h.state.commits, 2);
		assert.strictEqual([...h.operations.values()].at(-1)!.target, JSON.stringify(['store-two', 'workspace-one', h.state.profile.location.toString()]));
	});

	test('dependency validation and pending-recovery failures invalidate cached identity', async () => {
		const h = harness();
		h.state.dependent = true;
		await assert.rejects(h.uninstall(), /depends on this/);
		assert.strictEqual(h.state.commits, 0);
		assert.deepStrictEqual(h.calls.slice(-3), ['abort', 'release', 'ack']);
		h.state.dependent = false;
		h.failures.add('pending');
		await assert.rejects(h.uninstall(), /lost pending reply/);
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 3);
	});

	test('failed startup identity handshake is refreshed by the first explicit request', async () => {
		const h = harness(['identity']);
		await h.uninstall();
		assert.strictEqual(h.state.identityCalls, 2);
		assert.strictEqual(h.state.commits, 1);
	});
});
