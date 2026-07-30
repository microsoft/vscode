/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AgentHostWorkspaceSessionMembershipStore } from '../../../browser/agentSessions/agentHost/agentHostWorkspaceSessionMembershipStore.js';

suite('AgentHostWorkspaceSessionMembershipStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestMembershipStore extends AgentHostWorkspaceSessionMembershipStore {
		constructor(
			private readonly _now: () => number,
			storageService: InMemoryStorageService,
			workspaceContextService: IWorkspaceContextService,
			isSessionsWindow = false,
		) {
			super(storageService, workspaceContextService, new NullLogService(), { isSessionsWindow } as Partial<IWorkbenchEnvironmentService> as IWorkbenchEnvironmentService);
		}

		protected override now(): number {
			return this._now();
		}
	}

	class TestWorkspaceContextService extends mock<IWorkspaceContextService>() {
		state = WorkbenchState.WORKSPACE;
		folders: URI[] = [];
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkbenchState(): WorkbenchState { return this.state; }
		override getWorkspace(): IWorkspace {
			return upcastPartial<IWorkspace>({
				id: 'workspace',
				folders: this.folders.map((uri, index) => ({ uri, index, name: uri.path, toResource: path => URI.joinPath(uri, path) })),
			});
		}
	}

	test('workspace membership survives folder and directory-set transitions', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		const c = URI.file('/workspace/c');
		const d = URI.file('/workspace/d');
		workspaceService.folders = [a, b];
		const store = new TestMembershipStore(() => 1000, storageService, workspaceService);

		const key = 'copilot://session';
		const initial = store.shouldInclude(key, [a, b], false);
		store.reconcileBackendSessions([key]);
		const restoredStore = new TestMembershipStore(() => 1000, storageService, workspaceService);
		workspaceService.folders = [c, d];
		const changedWorkspace = restoredStore.shouldInclude(key, [a, b], false);
		workspaceService.folders = [c];
		const singleFolder = restoredStore.shouldInclude(key, [a, b], false);
		workspaceService.folders = [c, d];
		const shrunkSession = restoredStore.shouldInclude(key, [a], false);
		const expandedAgain = restoredStore.shouldInclude(key, [a, b], false);
		restoredStore.remove(key);
		const afterDelete = restoredStore.shouldInclude(key, [a, b], false);

		assert.deepStrictEqual({
			initial,
			changedWorkspace,
			singleFolder,
			shrunkSession,
			expandedAgain,
			afterDelete,
		}, {
			initial: true,
			changedWorkspace: true,
			singleFolder: false,
			shrunkSession: false,
			expandedAgain: true,
			afterDelete: false,
		});
	});

	test('records only eligible multi-root session provenance', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		const c = URI.file('/workspace/c');
		const d = URI.file('/workspace/d');
		workspaceService.folders = [a, b];
		const store = new TestMembershipStore(() => 1000, storageService, workspaceService);

		const pathMatchKey = 'copilot://path-match';
		const pendingKey = 'copilot://pending';
		const noMatchKey = 'copilot://no-match';
		const singleRootKey = 'copilot://single-root';
		assert.deepStrictEqual({
			pathMatch: store.shouldInclude(pathMatchKey, [c, b], false),
			pathMatchStored: store.has(pathMatchKey),
			pendingNoMatch: store.shouldInclude(pendingKey, [c, d], true),
			pendingStored: store.has(pendingKey),
			nonPendingNoMatch: store.shouldInclude(noMatchKey, [c, d], false),
			nonPendingStored: store.has(noMatchKey),
			singleRootPathMatch: store.shouldInclude(singleRootKey, [a], false),
			singleRootStored: store.has(singleRootKey),
		}, {
			pathMatch: true,
			pathMatchStored: true,
			pendingNoMatch: true,
			pendingStored: true,
			nonPendingNoMatch: false,
			nonPendingStored: false,
			singleRootPathMatch: true,
			singleRootStored: false,
		});
	});

	test('last-seen reconciliation retains active sessions and prunes after thirty unseen days', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		workspaceService.folders = [a, b];
		let now = 0;
		const store = new TestMembershipStore(() => now, storageService, workspaceService);
		const key = 'copilot://session';

		store.shouldInclude(key, [a, b], false);
		now = 20 * 24 * 60 * 60 * 1000;
		store.reconcileBackendSessions([key]);
		now += 29 * 24 * 60 * 60 * 1000;
		store.reconcileBackendSessions([]);
		const retained = store.has(key);
		now += 2 * 24 * 60 * 60 * 1000;
		store.reconcileBackendSessions([]);

		assert.deepStrictEqual({ retained, pruned: store.has(key) }, { retained: true, pruned: false });
	});

	test('snapshot reconciliation batches new and retained membership writes', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		workspaceService.folders = [a, b];
		let now = 0;
		const store = new TestMembershipStore(() => now, storageService, workspaceService);
		const first = 'copilot://first';
		const second = 'copilot://second';
		const listenerStore = disposables.add(new DisposableStore());
		let writes = 0;
		listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, listenerStore)(() => writes++));
		store.shouldInclude(first, [a, b], false);
		store.shouldInclude(second, [a, b], false);
		const beforeSnapshot = writes;
		store.reconcileBackendSessions([first, second]);
		const afterNewMembershipSnapshot = writes;
		now = 2 * 24 * 60 * 60 * 1000;
		store.reconcileBackendSessions([first, second]);
		const afterRetainedMembershipSnapshot = writes;
		now += 12 * 60 * 60 * 1000;
		store.markSeen(first);
		const afterThrottledNotification = writes;
		now += 24 * 60 * 60 * 1000;
		store.markSeen(first);

		assert.deepStrictEqual({
			beforeSnapshot,
			afterNewMembershipSnapshot,
			afterRetainedMembershipSnapshot,
			afterThrottledNotification,
			afterEligibleNotification: writes,
		}, {
			beforeSnapshot: 0,
			afterNewMembershipSnapshot: 1,
			afterRetainedMembershipSnapshot: 2,
			afterThrottledNotification: 2,
			afterEligibleNotification: 3,
		});
	});

	test('snapshot freshness prevents pruning before thirty full days of absence', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		workspaceService.folders = [a, b];
		let now = 0;
		const store = new TestMembershipStore(() => now, storageService, workspaceService);
		const key = 'copilot://session';
		store.shouldInclude(key, [a, b], false);
		store.reconcileBackendSessions([key]);
		now = 12 * 60 * 60 * 1000;
		store.reconcileBackendSessions([key]);
		now += 29 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000;
		store.reconcileBackendSessions([]);
		const retainedBeforeThirtyDays = store.has(key);
		now += 2 * 60 * 60 * 1000;
		store.reconcileBackendSessions([]);

		assert.deepStrictEqual({ retainedBeforeThirtyDays, prunedAfterThirtyDays: store.has(key) }, {
			retainedBeforeThirtyDays: true,
			prunedAfterThirtyDays: false,
		});
	});

	test('notification path flushes a newly discovered membership', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		workspaceService.folders = [a, b];
		const key = 'copilot://session';
		const store = new TestMembershipStore(() => 1000, storageService, workspaceService);
		const listenerStore = disposables.add(new DisposableStore());
		let writes = 0;
		listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, listenerStore)(() => writes++));

		store.shouldInclude(key, [a, b], false);
		const beforeMarkSeen = writes;
		store.markSeen(key);
		const restoredStore = new TestMembershipStore(() => 1000, storageService, workspaceService);

		assert.deepStrictEqual({ beforeMarkSeen, afterMarkSeen: writes, restored: restoredStore.has(key) }, {
			beforeMarkSeen: 0,
			afterMarkSeen: 1,
			restored: true,
		});
	});

	test('ignores malformed persisted membership', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('agentHost.workspaceSessionMembership.v1', '{not-json', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const workspaceService = new TestWorkspaceContextService();
		workspaceService.folders = [URI.file('/workspace/a'), URI.file('/workspace/b')];
		const store = new TestMembershipStore(() => 1000, storageService, workspaceService);

		assert.deepStrictEqual({
			hasCorruptEntry: store.has('copilot://corrupt'),
			unmatchedSession: store.shouldInclude('copilot://unmatched', [URI.file('/other/a'), URI.file('/other/b')], false),
		}, {
			hasCorruptEntry: false,
			unmatchedSession: false,
		});
	});

	test('storage is dormant in the Agents window', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		const c = URI.file('/workspace/c');
		const d = URI.file('/workspace/d');
		workspaceService.folders = [a, b];
		const key = 'copilot://session';
		const seedStore = new TestMembershipStore(() => 0, storageService, workspaceService);
		seedStore.shouldInclude(key, [a, b], false);
		seedStore.reconcileBackendSessions([key]);

		const listenerStore = disposables.add(new DisposableStore());
		let writes = 0;
		listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, listenerStore)(() => writes++));
		workspaceService.folders = [c, d];
		const sessionsWindowStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1000, storageService, workspaceService, true);
		const sessionsWindowIncluded = sessionsWindowStore.shouldInclude(key, [a, b], false);
		sessionsWindowStore.reconcileBackendSessions([key]);
		sessionsWindowStore.markSeen(key);
		sessionsWindowStore.remove(key);
		workspaceService.folders = [a, b];
		const restoredEditorStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1000, storageService, workspaceService);

		assert.deepStrictEqual({
			sessionsWindowIncluded,
			writes,
			membershipPreserved: restoredEditorStore.has(key),
		}, {
			sessionsWindowIncluded: false,
			writes: 0,
			membershipPreserved: true,
		});
	});

	test('storage is dormant in Editor windows without a multi-root workspace', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const workspaceService = new TestWorkspaceContextService();
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		const c = URI.file('/workspace/c');
		workspaceService.folders = [a, b];
		const key = 'copilot://session';
		const seedStore = new TestMembershipStore(() => 0, storageService, workspaceService);
		seedStore.shouldInclude(key, [a, b], false);
		seedStore.reconcileBackendSessions([key]);

		const listenerStore = disposables.add(new DisposableStore());
		let writes = 0;
		listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, listenerStore)(() => writes++));
		workspaceService.folders = [c];
		const singleFolderWorkspaceStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1000, storageService, workspaceService);
		const singleFolderWorkspaceIncluded = singleFolderWorkspaceStore.shouldInclude(key, [a, b], false);
		singleFolderWorkspaceStore.reconcileBackendSessions([key]);
		singleFolderWorkspaceStore.markSeen(key);
		singleFolderWorkspaceStore.remove(key);
		workspaceService.state = WorkbenchState.FOLDER;
		const folderWindowStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1000, storageService, workspaceService);
		const folderWindowIncluded = folderWindowStore.shouldInclude(key, [a, b], false);
		folderWindowStore.reconcileBackendSessions([key]);
		folderWindowStore.markSeen(key);
		folderWindowStore.remove(key);
		workspaceService.state = WorkbenchState.EMPTY;
		workspaceService.folders = [];
		const emptyWindowStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1000, storageService, workspaceService);
		const emptyWindowIncluded = emptyWindowStore.shouldInclude(key, [a, b], false);
		emptyWindowStore.reconcileBackendSessions([key]);
		emptyWindowStore.markSeen(key);
		emptyWindowStore.remove(key);
		workspaceService.state = WorkbenchState.WORKSPACE;
		workspaceService.folders = [a, b];
		const restoredEditorStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1000, storageService, workspaceService);

		assert.deepStrictEqual({
			singleFolderWorkspaceIncluded,
			folderWindowIncluded,
			emptyWindowIncluded,
			writes,
			membershipPreserved: restoredEditorStore.has(key),
		}, {
			singleFolderWorkspaceIncluded: false,
			folderWindowIncluded: false,
			emptyWindowIncluded: true,
			writes: 0,
			membershipPreserved: true,
		});
	});
});
