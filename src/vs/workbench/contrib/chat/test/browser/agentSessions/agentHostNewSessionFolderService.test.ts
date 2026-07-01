/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IWorkspaceContextService, IWorkspaceFolder, IWorkspace } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';

suite('AgentHostNewSessionFolderService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let service: AgentHostNewSessionFolderService;
	let cleanup: DisposableStore;
	let onDidDisposeSession: Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>;
	let workspaceFolders: URI[];

	setup(() => {
		onDidDisposeSession = ds.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' }>());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidDisposeSession = onDidDisposeSession.event;
		};
		workspaceFolders = [folderA, folderB];
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace {
				return { folders: workspaceFolders.map(uri => ({ uri } as IWorkspaceFolder)) } as IWorkspace;
			}
		};
		service = ds.add(new AgentHostNewSessionFolderService(chatService, workspaceContextService));
		cleanup = ds.add(new DisposableStore());
	});

	const sessionA = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-a' });
	const sessionB = URI.from({ scheme: 'agent-host-copilot', path: '/untitled-b' });
	const folderA = URI.file('/repoA');
	const folderB = URI.file('/repoB');
	const folderC = URI.file('/repoC');

	test('set/get/clear round-trips and fires onDidChange on real changes only', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		assert.strictEqual(service.getFolder(sessionA), undefined, 'unknown resource is undefined');

		service.setFolder(sessionA, folderA);
		service.setFolder(sessionA, folderA); // same value: no event
		service.setFolder(sessionA, folderB);
		const afterSet = service.getFolder(sessionA)?.toString();

		service.clear(sessionA);
		const afterClear = service.getFolder(sessionA);
		service.clear(sessionA); // already cleared: no event

		assert.deepStrictEqual({
			afterSet,
			afterClear,
			changes,
		}, {
			afterSet: folderB.toString(),
			afterClear: undefined,
			changes: [sessionA.toString(), sessionA.toString(), sessionA.toString()],
		});
	});

	test('clears the chosen folder when its session is disposed', () => {
		const changes: string[] = [];
		cleanup.add(service.onDidChangeFolder(uri => changes.push(uri.toString())));

		service.setFolder(sessionA, folderA);
		onDidDisposeSession.fire({ sessionResources: [sessionA], reason: 'cleared' });

		assert.deepStrictEqual({
			afterDispose: service.getFolder(sessionA),
			changes,
		}, {
			afterDispose: undefined,
			changes: [sessionA.toString(), sessionA.toString()],
		});
	});

	test('getDefaultFolder returns the last chosen folder and survives session disposal', () => {
		assert.strictEqual(service.getDefaultFolder(), undefined, 'no default before any choice');

		service.setFolder(sessionA, folderA);
		const afterFirst = service.getDefaultFolder()?.toString();

		service.setFolder(sessionB, folderB);
		const afterSecond = service.getDefaultFolder()?.toString();

		// Disposing a session forgets its per-session choice but keeps the
		// window-level default sticky so a new chat reuses the last folder.
		onDidDisposeSession.fire({ sessionResources: [sessionB], reason: 'cleared' });
		const afterDispose = service.getDefaultFolder()?.toString();

		assert.deepStrictEqual({ afterFirst, afterSecond, afterDispose }, {
			afterFirst: folderA.toString(),
			afterSecond: folderB.toString(),
			afterDispose: folderB.toString(),
		});
	});

	test('getDefaultFolder hides a default not in the workspace and surfaces it once present', () => {
		service.setFolder(sessionA, folderC);
		const whileWorkspaceLacksFolder = service.getDefaultFolder();

		workspaceFolders = [folderA, folderB, folderC];
		const afterFolderAdded = service.getDefaultFolder()?.toString();

		assert.deepStrictEqual({ whileWorkspaceLacksFolder, afterFolderAdded }, {
			whileWorkspaceLacksFolder: undefined,
			afterFolderAdded: folderC.toString(),
		});
	});
});
