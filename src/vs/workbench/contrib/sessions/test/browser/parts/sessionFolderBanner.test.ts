/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ISession, ISessionFolder } from '../../../../../services/sessions/common/session.js';
import { getSessionFolderOutsideScope, SessionFolderBanner, SWITCH_TO_SESSION_FOLDER_COMMAND_ID } from '../../../browser/parts/sessionFolderBanner.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('SessionFolderBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(id: string, folder?: { readonly root: string; readonly workingDirectory?: string; readonly repository?: string; readonly worktree?: string }): ISession {
		const root = folder && URI.parse(folder.root);
		const sessionFolder: ISessionFolder | undefined = folder && root && {
			root,
			workingDirectory: folder.workingDirectory ? URI.parse(folder.workingDirectory) : root,
			name: id,
			description: undefined,
			gitRepository: folder.repository ? {
				uri: URI.parse(folder.repository),
				workTreeUri: folder.worktree ? URI.parse(folder.worktree) : undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable(undefined),
			} : undefined,
		};
		return upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`test-session://${id}`),
			workspace: constObservable(sessionFolder && root ? {
				uri: root, label: id, icon: Codicon.folder, folders: [sessionFolder], requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			} : undefined),
		});
	}

	function createBanner(sessions: readonly ISession[], executed: unknown[][]) {
		const calls = { getSessions: 0, labels: 0 };
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({ onDidChangeSessions: onDidChangeSessions.event, getSessions: () => { calls.getSessions++; return [...sessions]; } }));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (...args: unknown[]) => { executed.push(args); return undefined; } }));
		instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => { calls.labels++; return uri.path; } }));
		const scopeFolders = observableValue<readonly URI[]>('scopeFolders', []);
		const banner = instantiationService.createInstance(SessionFolderBanner, scopeFolders);
		return { banner, scopeFolders, calls, onDidChangeSessions };
	}

	test('shows for a local folder or worktree outside the scope, as the Sessions list scopes it', () => {
		const sessions = {
			inside: createSession('inside', { root: 'file:///work/repo/sub' }),
			repositoryWorktree: createSession('repositoryWorktree', { root: 'file:///work/repo', workingDirectory: 'file:///work/repo.worktrees/x', repository: 'file:///work/repo', worktree: 'file:///work/repo.worktrees/x' }),
			otherFolder: createSession('otherFolder', { root: 'file:///other', repository: 'file:///other' }),
			otherWorktree: createSession('otherWorktree', { root: 'file:///else', workingDirectory: 'file:///else.worktrees/y', repository: 'file:///else', worktree: 'file:///else.worktrees/y' }),
			// A session that reports its worktree as its repository is a folder of its own.
			ownWorktree: createSession('ownWorktree', { root: 'file:///own', repository: 'file:///own', worktree: 'file:///own' }),
			remote: createSession('remote', { root: 'vscode-agent-host://host/other' }),
			cloud: createSession('cloud'),
		};
		const catalog = Object.values(sessions);
		const outside = (scope: string[], session: ISession, sessionCatalog: readonly ISession[] = catalog) => {
			const result = getSessionFolderOutsideScope(session, scope.map(folder => URI.parse(folder)), sessionCatalog, undefined);
			return result && { folder: result.folder.toString(), isWorktree: result.isWorktree };
		};

		// The checkout of an opened worktree is in scope once a session in that worktree names its repository.
		const checkout = createSession('checkout', { root: 'file:///work/repo', repository: 'file:///work/repo' });
		assert.deepStrictEqual({
			...Object.fromEntries(Object.entries(sessions).map(([name, session]) => [name, outside(['file:///work/repo'], session)])),
			emptyWindow: outside([], sessions.otherFolder),
			checkoutOfOpenedWorktree: outside(['file:///work/repo.worktrees/x'], checkout, [...catalog, checkout]),
		}, {
			inside: undefined,
			repositoryWorktree: undefined,
			otherFolder: { folder: 'file:///other', isWorktree: false },
			otherWorktree: { folder: 'file:///else.worktrees/y', isWorktree: true },
			ownWorktree: { folder: 'file:///own', isWorktree: false },
			remote: undefined,
			cloud: undefined,
			emptyWindow: undefined,
			checkoutOfOpenedWorktree: undefined,
		});
	});

	test('follows the window\'s folders, names the folder and runs its action', async () => {
		const session = createSession('other', { root: 'file:///work/other' });
		const worktree = createSession('worktree', { root: 'file:///else', workingDirectory: 'file:///else.worktrees/y', repository: 'file:///else', worktree: 'file:///else.worktrees/y' });
		const executed: unknown[][] = [];
		const { banner, scopeFolders } = createBanner([session, worktree], executed);
		const shown: (string | undefined)[] = [];
		store.add(autorun(reader => { shown.push(banner.getContent(session, constObservable(true)).read(reader)?.action?.label); }));
		const snapshot = (target: ISession) => {
			const content = banner.getContent(target, constObservable(true)).get();
			return content && { message: content.message, ariaLabel: content.ariaLabel, hover: content.hover, action: content.action?.label };
		};

		const emptyWindow = snapshot(session);
		scopeFolders.set([URI.parse('file:///work/repo')], undefined);
		const outsideScope = snapshot(session);
		await banner.getContent(session, constObservable(true)).get()?.action?.run();
		const outsideWorktree = snapshot(worktree);
		scopeFolders.set([URI.parse('file:///work/repo'), URI.parse('file:///work/other')], undefined);
		const addedFolder = snapshot(session);

		assert.deepStrictEqual({ shown, emptyWindow, outsideScope, outsideWorktree, addedFolder, executed: executed.map(([id, resource]) => [id, String(resource)]) }, {
			shown: [undefined, 'Switch to Folder', undefined],
			emptyWindow: undefined,
			outsideScope: { message: 'This session is in other.', ariaLabel: 'This session is in /work/other.', hover: '/work/other', action: 'Switch to Folder' },
			outsideWorktree: { message: 'This session is in y.', ariaLabel: 'This session is in /else.worktrees/y.', hover: '/else.worktrees/y', action: 'Switch to Worktree' },
			addedFolder: undefined,
			executed: [[SWITCH_TO_SESSION_FOLDER_COMMAND_ID, 'test-session://other']],
		});
	});

	test('computes again only as sessions come and go, and not while hidden', () => {
		const session = createSession('other', { root: 'file:///work/other' });
		const { banner, scopeFolders, calls, onDidChangeSessions } = createBanner([session], []);
		scopeFolders.set([URI.parse('file:///work/repo')], undefined);
		const visible = observableValue('visible', true);
		const shown: (string | undefined)[] = [];
		store.add(autorun(reader => { shown.push(banner.getContent(session, visible).read(reader)?.action?.label); }));
		const count = () => ({ ...calls });

		const shownOnce = count();
		for (let i = 0; i < 100; i++) {
			onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		}
		const afterStateUpdates = count();
		onDidChangeSessions.fire({ added: [createSession('new', { root: 'file:///new' })], removed: [], changed: [] });
		const afterAdded = count();
		visible.set(false, undefined);
		scopeFolders.set([URI.parse('file:///elsewhere')], undefined);
		onDidChangeSessions.fire({ added: [createSession('another', { root: 'file:///another' })], removed: [], changed: [] });
		const whileHidden = count();

		assert.deepStrictEqual({ shown, shownOnce, afterStateUpdates, afterAdded, whileHidden }, {
			shown: ['Switch to Folder', undefined],
			shownOnce: { getSessions: 1, labels: 1 },
			afterStateUpdates: { getSessions: 1, labels: 1 },
			afterAdded: { getSessions: 2, labels: 1 },
			whileHidden: { getSessions: 2, labels: 1 },
		});
	});
});
