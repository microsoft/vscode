/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostWorkspaceSessionMembershipStore } from '../../../browser/agentSessions/agentHost/agentHostWorkspaceSessionMembershipStore.js';

suite('AgentHostWorkspaceSessionMembershipStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestMembershipStore extends AgentHostWorkspaceSessionMembershipStore {
		constructor(
			private readonly _now: () => number,
			storageService: InMemoryStorageService,
			workspaceContextService: IWorkspaceContextService,
		) {
			super(storageService, workspaceContextService, new NullLogService());
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
});
