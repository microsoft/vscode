/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISession, ISessionFolder, ISessionWorkspace } from '../../../sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { SessionsRepositoriesService } from '../../browser/sessionsRepositoriesService.js';
import { SessionRepositoryKind } from '../../common/sessionRepository.js';
import { ISessionsRepository } from '../../common/sessionsRepositories.js';

const SCHEME = 'vscode-tests';
const uri = (path: string) => URI.from({ scheme: SCHEME, path });

function workspace(root: URI, gitHub?: { readonly owner: string; readonly repo: string }, gitUri?: URI): ISessionWorkspace {
	const folder: ISessionFolder = {
		root,
		workingDirectory: root,
		name: root.path.split('/').pop() ?? '',
		description: undefined,
		gitRepository: (gitHub || gitUri) ? { uri: gitUri ?? root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(gitHub) } : undefined,
	};
	return { uri: root, label: folder.name, icon: Codicon.folder, folders: [folder], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
}

class TestSession extends mock<ISession>() {
	override readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	override readonly isArchived = observableValue(this, false);
	override readonly createdAt: Date;
	constructor(override readonly sessionId: string, override readonly providerId: string, ws: ISessionWorkspace | undefined, createdAt: number) {
		super();
		this.workspace = observableValue(this, ws);
		this.createdAt = new Date(createdAt);
	}
}

suite('SessionsRepositoriesService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(sessions: TestSession[], storage = store.add(new InMemoryStorageService()), fileService = store.add(new FileService(new NullLogService()))) {
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSessions() { return sessions; }
			override resolveWorkspace(folderUri: URI, providerId?: string) {
				return { providerId: providerId ?? 'local', workspace: workspace(folderUri) };
			}
		};
		const service = store.add(new SessionsRepositoriesService(management, storage, fileService, new NullLogService()));
		return { service, storage, fileService, fireSessionsChanged: () => onDidChangeSessions.fire({ added: [], removed: [], changed: [] }) };
	}

	function snapshot(service: SessionsRepositoriesService) {
		return service.repositories.get().map(repository => ({ key: repository.key, label: repository.label, isSaved: repository.isSaved, sessions: repository.sessionCount, aliases: repository.aliases, locations: repository.locations.map(location => `${location.providerId}:${location.folderUri.path}`) }));
	}

	test('discovers repositories across environments and keeps sessions on their own providers', () => {
		const vscode = { owner: 'microsoft', repo: 'vscode' };
		const archived = new TestSession('local:3', 'local', workspace(uri('/old'), undefined), 4);
		archived.isArchived.set(true, undefined);
		const { service } = createService([
			new TestSession('local:1', 'local', workspace(uri('/src/vscode'), vscode), 1),
			new TestSession('remote:1', 'remote-ssh', workspace(uri('/home/me/vscode'), vscode), 3),
			new TestSession('local:2', 'local', workspace(uri('/notes')), 2),
			new TestSession('local:4', 'local', undefined, 5),
			archived,
		]);
		assert.deepStrictEqual(snapshot(service), [
			{ key: 'github:microsoft/vscode', label: 'vscode', isSaved: false, sessions: 2, aliases: [], locations: ['remote-ssh:/home/me/vscode', 'local:/src/vscode'] },
			{ key: `folder:${uri('/notes').toString()}`, label: 'notes', isSaved: false, sessions: 1, aliases: [], locations: ['local:/notes'] },
		]);
	});

	test('saved repositories persist without sessions and merge once their folder reports a repository', () => {
		const sessions: TestSession[] = [];
		const { service, storage, fireSessionsChanged } = createService(sessions);
		const folderProject: ISessionsRepository = { key: `folder:${uri('/src/app').toString()}`, kind: SessionRepositoryKind.Folder, label: 'app', isSaved: false, aliases: [], locations: [{ folderUri: uri('/src/app'), providerId: 'local' }], sessionCount: 0 };
		service.saveRepository(folderProject);
		service.selectRepository(folderProject.key);

		const reloaded = createService(sessions, storage).service;
		const beforeSession = { repositories: snapshot(reloaded), selected: reloaded.selectedRepository.get()?.key };

		sessions.push(new TestSession('local:1', 'local', workspace(uri('/src/app'), { owner: 'octo', repo: 'app' }), 1));
		fireSessionsChanged();
		const afterSession = { repositories: snapshot(service), selected: service.selectedRepository.get()?.key, inProject: service.isSessionInRepository(sessions[0], service.selectedRepository.get()!) };

		assert.deepStrictEqual({ beforeSession, afterSession }, {
			beforeSession: {
				repositories: [{ key: folderProject.key, label: 'app', isSaved: true, sessions: 0, aliases: [], locations: ['local:/src/app'] }],
				selected: folderProject.key,
			},
			afterSession: {
				repositories: [{ key: 'github:octo/app', label: 'app', isSaved: true, sessions: 1, aliases: [folderProject.key], locations: ['local:/src/app'] }],
				selected: 'github:octo/app',
				inProject: true,
			},
		});
	});

	test('adds a repository subfolder as its own repository from Git metadata', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(SCHEME, store.add(new InMemoryFileSystemProvider())));
		await fileService.createFolder(joinPath(uri('/src/vscode'), '.git'));
		await fileService.writeFile(joinPath(uri('/src/vscode'), '.git', 'config'), VSBuffer.fromString('[remote "origin"]\n\turl = https://github.com/microsoft/vscode.git\n'));
		await fileService.createFolder(uri('/src/vscode/extensions/git'));

		const rootSession = new TestSession('local:1', 'local', workspace(uri('/src/vscode'), { owner: 'microsoft', repo: 'vscode' }), 1);
		const { service } = createService([rootSession], undefined, fileService);
		const repository = await service.addFolder(uri('/src/vscode/extensions/git'));

		assert.deepStrictEqual({
			repository: repository && { key: repository.key, label: repository.label, isSaved: repository.isSaved },
			rootSessionInSubfolderProject: service.isSessionInRepository(rootSession, repository!),
			keys: service.repositories.get().map(p => p.key),
		}, {
			repository: { key: 'github:microsoft/vscode/extensions/git', label: 'vscode/extensions/git', isSaved: true },
			rootSessionInSubfolderProject: false,
			keys: ['github:microsoft/vscode/extensions/git', 'github:microsoft/vscode'],
		});
	});

	test('a worktree without GitHub metadata joins the GitHub repository of its repository', () => {
		const worktree = uri('/src/vscode.worktrees/feature');
		const worktreeSession = new TestSession('local:2', 'local', workspace(worktree, undefined, worktree), 2);
		const { service } = createService([
			new TestSession('local:1', 'local', workspace(uri('/src/vscode'), { owner: 'microsoft', repo: 'vscode' }), 1),
			worktreeSession,
		]);
		const [repository] = service.repositories.get();
		assert.deepStrictEqual({ repositories: snapshot(service), worktreeSessionInProject: service.isSessionInRepository(worktreeSession, repository) }, {
			repositories: [{ key: 'github:microsoft/vscode', label: 'vscode', isSaved: false, sessions: 2, aliases: [`git:${uri('/src/vscode').toString()}`], locations: ['local:/src/vscode', 'local:/src/vscode.worktrees/feature'] }],
			worktreeSessionInProject: true,
		});
	});

	test('removing a saved repository keeps it listed only while it has sessions', () => {
		const { service } = createService([new TestSession('local:1', 'local', workspace(uri('/notes')), 1)]);
		const [discovered] = service.repositories.get();
		service.saveRepository(discovered);
		service.saveRepository({ ...discovered, key: 'folder:empty', label: 'empty', locations: [], sessionCount: 0, aliases: [] });
		const saved = service.repositories.get().map(p => ({ key: p.key, isSaved: p.isSaved }));
		for (const repository of service.repositories.get()) {
			service.removeSavedRepository(repository);
		}
		assert.deepStrictEqual({ saved, removed: service.repositories.get().map(p => ({ key: p.key, isSaved: p.isSaved })) }, {
			saved: [{ key: discovered.key, isSaved: true }, { key: 'folder:empty', isSaved: true }],
			removed: [{ key: discovered.key, isSaved: false }],
		});
	});
});
