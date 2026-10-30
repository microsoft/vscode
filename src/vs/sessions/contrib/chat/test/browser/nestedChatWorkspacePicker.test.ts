/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionWorkspaceBrowseAction } from '../../../../services/sessions/common/session.js';
import { INestedChatFolderInfo, INestedChatWorkspaceSupport } from '../../../../services/sessions/common/sessionsProvider.js';
import { getDefaultNestedChatFolder, getNestedChatFolderMark, getNestedChatFolderOptions, NestedChatFolderChoice, toNestedChatWorkspace } from '../../browser/nestedChatWorkspacePicker.js';

suite('NestedChatWorkspacePicker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const repo = URI.file('/repo');
	const other = URI.file('/other');
	const browse: ISessionWorkspaceBrowseAction = { label: 'Browse...', icon: Codicon.folderOpened, providerId: 'p', run: async () => undefined };
	const git: INestedChatFolderInfo = { supportsWorktree: true, defaultBranch: 'main' };
	const plain: INestedChatFolderInfo = { supportsWorktree: false, defaultBranch: undefined };

	function support(sessionFolder: URI | undefined, multipleFolders: boolean): INestedChatWorkspaceSupport {
		return { sessionFolder, sessionFolderWorktree: undefined, multipleFolders, browseActions: [browse] };
	}

	function describe(choice: NestedChatFolderChoice): string {
		return choice.kind === 'scratch' ? 'scratch' : choice.folder.path;
	}

	test('offers the session folder, recent folders, browsing and No Workspace per session and agent', () => {
		const cases = {
			workspaceSession: support(repo, true),
			workspacelessSession: support(undefined, true),
			singleFolderWorkspaceSession: support(repo, false),
			singleFolderWorkspacelessSession: support(undefined, false),
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, value]) => {
			const options = getNestedChatFolderOptions(value, { recentFolders: [URI.file('/recent'), repo, other], canOpenLocalFolder: true });
			return [name, { default: describe(getDefaultNestedChatFolder(value)), choices: options.choices.map(describe), browse: options.browseActions.length, openFolder: options.openFolder }];
		})), {
			workspaceSession: { default: '/repo', choices: ['/repo', '/recent', '/other', 'scratch'], browse: 1, openFolder: true },
			workspacelessSession: { default: 'scratch', choices: ['/recent', '/repo', '/other', 'scratch'], browse: 1, openFolder: true },
			singleFolderWorkspaceSession: { default: '/repo', choices: ['/repo'], browse: 0, openFolder: false },
			singleFolderWorkspacelessSession: { default: 'scratch', choices: ['scratch'], browse: 0, openFolder: false },
		});
	});

	test('marks only the session folder of a worktree session as the session\'s worktree', () => {
		const worktreeSupport: INestedChatWorkspaceSupport = { ...support(repo, true), sessionFolderWorktree: { branch: 'agents/fix', repositoryLabel: 'project' } };
		const unnamedBranchSupport: INestedChatWorkspaceSupport = { ...worktreeSupport, sessionFolderWorktree: { branch: undefined, repositoryLabel: undefined } };
		const mark = (value: INestedChatWorkspaceSupport, choice: NestedChatFolderChoice) => {
			const { icon, worktreeNote } = getNestedChatFolderMark(value, choice, Codicon.commentDiscussion);
			return { icon: icon.id, worktreeNote };
		};
		assert.deepStrictEqual({
			sessionWorktree: mark(worktreeSupport, { kind: 'folder', folder: repo }),
			sessionWorktreeWithoutBranch: mark(unnamedBranchSupport, { kind: 'folder', folder: repo }),
			otherFolderOfWorktreeSession: mark(worktreeSupport, { kind: 'folder', folder: other }),
			scratchOfWorktreeSession: mark(worktreeSupport, { kind: 'scratch' }),
			plainSessionFolder: mark(support(repo, true), { kind: 'folder', folder: repo }),
		}, {
			sessionWorktree: { icon: Codicon.worktreeCompact.id, worktreeNote: 'Session worktree · agents/fix' },
			sessionWorktreeWithoutBranch: { icon: Codicon.worktreeCompact.id, worktreeNote: 'Session worktree' },
			otherFolderOfWorktreeSession: { icon: Codicon.folder.id, worktreeNote: undefined },
			scratchOfWorktreeSession: { icon: Codicon.commentDiscussion.id, worktreeNote: undefined },
			plainSessionFolder: { icon: Codicon.folder.id, worktreeNote: undefined },
		});
	});

	test('requests a workspace only when the choice differs from the default', () => {
		const ws = support(repo, true);
		const wl = support(undefined, true);
		assert.deepStrictEqual({
			wsDefault: toNestedChatWorkspace(ws, { kind: 'folder', folder: repo }, false, git, 'main'),
			wsScratch: toNestedChatWorkspace(ws, { kind: 'scratch' }, false, undefined, undefined),
			wsOtherFolder: toNestedChatWorkspace(ws, { kind: 'folder', folder: other }, false, plain, undefined),
			wsOwnWorktree: toNestedChatWorkspace(ws, { kind: 'folder', folder: repo }, true, git, 'release'),
			wsWorktreeWithoutGit: toNestedChatWorkspace(ws, { kind: 'folder', folder: other }, true, plain, undefined),
			wsWorktreeUnresolved: toNestedChatWorkspace(ws, { kind: 'folder', folder: repo }, true, undefined, undefined),
			wlDefault: toNestedChatWorkspace(wl, { kind: 'scratch' }, false, undefined, undefined),
			wlFolder: toNestedChatWorkspace(wl, { kind: 'folder', folder: repo }, false, git, 'main'),
		}, {
			wsDefault: undefined,
			wsScratch: { kind: 'scratch' },
			wsOtherFolder: { kind: 'folder', folder: other, isolation: 'folder' },
			wsOwnWorktree: { kind: 'folder', folder: repo, isolation: 'worktree', baseBranch: 'release' },
			wsWorktreeWithoutGit: { kind: 'folder', folder: other, isolation: 'folder' },
			wsWorktreeUnresolved: undefined,
			wlDefault: undefined,
			wlFolder: { kind: 'folder', folder: repo, isolation: 'folder' },
		});
	});
});
