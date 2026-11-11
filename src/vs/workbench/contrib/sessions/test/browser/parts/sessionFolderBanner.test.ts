/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { autorun, constObservable, IObservable, IReader, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { getSessionFolderOutsideScope, SessionFolderBanner, SWITCH_TO_SESSION_FOLDER_COMMAND_ID } from '../../../browser/parts/sessionFolderBanner.js';

interface IFolderSpec {
	readonly root: string;
	readonly workingDirectory?: string;
	readonly repository?: string;
	readonly worktree?: string;
}

suite('SessionFolderBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function toWorkspace(id: string, folders: readonly IFolderSpec[]): ISessionWorkspace | undefined {
		if (folders.length === 0) {
			return undefined;
		}
		return {
			uri: URI.parse(folders[0].root), label: id, icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			folders: folders.map((folder): ISessionFolder => ({
				root: URI.parse(folder.root),
				workingDirectory: URI.parse(folder.workingDirectory ?? folder.root),
				name: id,
				description: undefined,
				gitRepository: folder.repository ? {
					uri: URI.parse(folder.repository),
					workTreeUri: folder.worktree ? URI.parse(folder.worktree) : undefined,
					baseBranchName: undefined,
					gitHubInfo: constObservable(undefined),
				} : undefined,
			})),
		};
	}

	/** A session whose workspace counts its reads: each read is a computation of where the session works. */
	function createSession(id: string, folders: readonly IFolderSpec[], mainChatFolders?: readonly IFolderSpec[]) {
		const workspace: ISettableObservable<ISessionWorkspace | undefined> = observableValue(`workspace-${id}`, toWorkspace(id, folders));
		const reads = { count: 0 };
		const countedWorkspace = upcastPartial<IObservable<ISessionWorkspace | undefined>>({
			read: (reader: IReader | undefined) => { reads.count++; return workspace.read(reader); },
			get: () => workspace.get(),
		});
		const session = upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`test-session://${id}`),
			workspace: countedWorkspace,
			mainChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(mainChatFolders && toWorkspace(id, mainChatFolders)) })),
		});
		return { session, workspace, reads };
	}

	function createBanner(executed: unknown[][] = []) {
		const labels = { count: 0 };
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (...args: unknown[]) => { executed.push(args); return undefined; } }));
		instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => { labels.count++; return uri.path; } }));
		const scopeFolders = observableValue<readonly URI[]>('scopeFolders', []);
		const banner = instantiationService.createInstance(SessionFolderBanner, scopeFolders);
		return { banner, scopeFolders, labels };
	}

	test('shows where a session works outside the window\'s folders, including another worktree of their repository', () => {
		const checkout: IFolderSpec = { root: 'file:///work/repo', repository: 'file:///work/repo' };
		const worktreeX: IFolderSpec = { root: 'file:///work/repo', workingDirectory: 'file:///work/repo.worktrees/x', repository: 'file:///work/repo', worktree: 'file:///work/repo.worktrees/x' };
		const outside = (scope: readonly string[], folders: readonly IFolderSpec[], mainChatFolders?: readonly IFolderSpec[]) => {
			const result = getSessionFolderOutsideScope(createSession('session', folders, mainChatFolders).session, scope.map(folder => URI.parse(folder)), undefined);
			return result && { folder: result.folder.toString(), isWorktree: result.isWorktree };
		};

		assert.deepStrictEqual({
			worktreeOfOpenCheckout: outside(['file:///work/repo'], [worktreeX]),
			checkoutOfOpenWorktree: outside(['file:///work/repo.worktrees/x'], [checkout]),
			inside: outside(['file:///work/repo'], [{ root: 'file:///work/repo/sub' }]),
			sameWorktree: outside(['file:///work/repo.worktrees/x'], [worktreeX]),
			otherFolder: outside(['file:///work/repo'], [{ root: 'file:///other', repository: 'file:///other' }]),
			// A session that reports its worktree as its repository is a folder of its own.
			ownWorktree: outside(['file:///work/repo'], [{ root: 'file:///own', repository: 'file:///own', worktree: 'file:///own' }]),
			multiRoot: outside(['file:///other', 'file:///work/repo'], [{ root: 'file:///other' }]),
			// A session over several folders works where its main chat does, not in whichever of its folders is in the window.
			multiFolderSession: outside(['file:///work/repo'], [{ root: 'file:///work/repo/sub' }, { root: 'file:///else' }], [{ root: 'file:///else' }]),
			remote: outside(['file:///work/repo'], [{ root: 'vscode-agent-host://host/other' }]),
			cloud: outside(['file:///work/repo'], []),
			emptyWindow: outside([], [{ root: 'file:///other' }]),
		}, {
			worktreeOfOpenCheckout: { folder: 'file:///work/repo.worktrees/x', isWorktree: true },
			checkoutOfOpenWorktree: { folder: 'file:///work/repo', isWorktree: false },
			inside: undefined,
			sameWorktree: undefined,
			otherFolder: { folder: 'file:///other', isWorktree: false },
			ownWorktree: { folder: 'file:///own', isWorktree: false },
			multiRoot: undefined,
			multiFolderSession: { folder: 'file:///else', isWorktree: false },
			remote: undefined,
			cloud: undefined,
			emptyWindow: undefined,
		});
	});

	test('follows the window\'s folders, names the folder and runs its action', async () => {
		const { session } = createSession('other', [{ root: 'file:///work/other' }]);
		const { session: worktree } = createSession('worktree', [{ root: 'file:///work/repo', workingDirectory: 'file:///work/repo.worktrees/y', repository: 'file:///work/repo', worktree: 'file:///work/repo.worktrees/y' }]);
		const executed: unknown[][] = [];
		const { banner, scopeFolders } = createBanner(executed);
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
		const otherWorktree = snapshot(worktree);
		scopeFolders.set([URI.parse('file:///work/repo'), URI.parse('file:///work/other')], undefined);
		const addedFolder = snapshot(session);

		assert.deepStrictEqual({ shown, emptyWindow, outsideScope, otherWorktree, addedFolder, executed: executed.map(([id, resource]) => [id, String(resource)]) }, {
			shown: [undefined, 'Switch to Folder', undefined],
			emptyWindow: undefined,
			outsideScope: { message: 'This session is in other.', ariaLabel: 'This session is in /work/other.', hover: '/work/other', action: 'Switch to Folder' },
			otherWorktree: { message: 'This session is in y.', ariaLabel: 'This session is in /work/repo.worktrees/y.', hover: '/work/repo.worktrees/y', action: 'Switch to Worktree' },
			addedFolder: undefined,
			executed: [[SWITCH_TO_SESSION_FOLDER_COMMAND_ID, 'test-session://other']],
		});
	});

	test('computes again only as the window\'s folders or the session\'s workspace change, and not while hidden', () => {
		const { session, workspace, reads } = createSession('other', [{ root: 'file:///work/other' }]);
		const { banner, scopeFolders, labels } = createBanner();
		scopeFolders.set([URI.parse('file:///work/repo')], undefined);
		const visible = observableValue('visible', true);
		const shown: (string | undefined)[] = [];
		const content = banner.getContent(session, visible);
		store.add(autorun(reader => { shown.push(content.read(reader)?.message); }));
		const count = () => ({ computed: reads.count, labels: labels.count });

		const shownOnce = count();
		scopeFolders.set([URI.parse('file:///work/repo'), URI.parse('file:///unrelated')], undefined);
		const afterUnrelatedFolder = count();
		workspace.set(toWorkspace('other', [{ root: 'file:///work/moved' }]), undefined);
		const afterMove = count();
		visible.set(false, undefined);
		const hiddenComputed = count();
		scopeFolders.set([URI.parse('file:///elsewhere')], undefined);
		workspace.set(toWorkspace('other', [{ root: 'file:///work/again' }]), undefined);
		const whileHidden = count();

		assert.deepStrictEqual({ shown, shownOnce, afterUnrelatedFolder, afterMove, whileHidden: whileHidden.computed - hiddenComputed.computed }, {
			shown: ['This session is in other.', 'This session is in moved.', undefined],
			shownOnce: { computed: 1, labels: 1 },
			// Computed again, with the same result: the banner is not rebuilt.
			afterUnrelatedFolder: { computed: 2, labels: 1 },
			afterMove: { computed: 3, labels: 2 },
			whileHidden: 0,
		});
	});
});
