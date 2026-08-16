/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getSessionStatusMessage, getSessionWorkspaceKind, getUntitledSessionTitle, IGitHubInfo, isActiveSessionStatus, ISessionTurnFileChange, ISessionWorkspace, sessionFileChangesEqual, sessionTurnFileChangesEqual, SessionStatus, SessionWorkspaceKind, sessionWorkspaceEqual } from '../../common/session.js';

suite('isActiveSessionStatus', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('treats in-progress and needs-input sessions as active', () => {
		assert.deepStrictEqual([
			SessionStatus.Untitled,
			SessionStatus.InProgress,
			SessionStatus.NeedsInput,
			SessionStatus.Completed,
			SessionStatus.Error,
		].map(status => isActiveSessionStatus(status)), [
			false,
			true,
			true,
			false,
			false,
		]);
	});
});

suite('getSessionStatusMessage', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses provider activity and shared status fallbacks', () => {
		const activity = new MarkdownString('Creating isolated worktree (42%)');

		assert.deepStrictEqual({
			activity: getSessionStatusMessage(SessionStatus.InProgress, activity),
			working: getSessionStatusMessage(SessionStatus.InProgress, undefined),
			needsInput: getSessionStatusMessage(SessionStatus.NeedsInput, undefined),
			failed: getSessionStatusMessage(SessionStatus.Error, undefined),
			completed: getSessionStatusMessage(SessionStatus.Completed, activity),
		}, {
			activity,
			working: 'Working...',
			needsInput: 'Input needed',
			failed: 'Failed',
			completed: undefined,
		});
	});
});

suite('sessionFileChangesEqual', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const fileA = URI.file('/a.txt');
	const fileB = URI.file('/b.txt');
	const fileAOriginal = URI.file('/a.original.txt');
	const fileAModified = URI.file('/a.modified.txt');

	function v1(modifiedUri: URI, insertions = 1, deletions = 1, originalUri?: URI): IChatSessionFileChange {
		return { modifiedUri, originalUri, insertions, deletions };
	}

	function v2(uri: URI, insertions = 1, deletions = 1, originalUri?: URI, modifiedUri?: URI): IChatSessionFileChange2 {
		return { uri, originalUri, modifiedUri, insertions, deletions };
	}

	test('returns true for the same array reference', () => {
		const arr = [v1(fileA)];
		assert.strictEqual(sessionFileChangesEqual(arr, arr), true);
	});

	test('returns true for two empty arrays', () => {
		assert.strictEqual(sessionFileChangesEqual([], []), true);
	});

	test('returns false when lengths differ', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v1(fileA), v1(fileB)]), false);
	});

	test('returns true for structurally equal v1 entries', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v1(fileA, 2, 3, fileAOriginal)],
			[v1(fileA, 2, 3, fileAOriginal)]
		), true);
	});

	test('returns true for structurally equal v2 entries', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v2(fileA, 2, 3, fileAOriginal, fileAModified)],
			[v2(fileA, 2, 3, fileAOriginal, fileAModified)]
		), true);
	});

	test('returns false when insertions differ', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA, 1, 1)], [v1(fileA, 2, 1)]), false);
	});

	test('returns false when deletions differ', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA, 1, 1)], [v1(fileA, 1, 2)]), false);
	});

	test('returns false when one entry is v1 and the other is v2', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v2(fileA)]), false);
	});

	test('returns false when v1 modifiedUri differs', () => {
		assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v1(fileB)]), false);
	});

	test('returns false when v2 uri differs', () => {
		assert.strictEqual(sessionFileChangesEqual([v2(fileA)], [v2(fileB)]), false);
	});

	test('returns false when v2 modifiedUri differs', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v2(fileA, 1, 1, undefined, fileAModified)],
			[v2(fileA, 1, 1, undefined, undefined)]
		), false);
	});

	test('returns false when originalUri differs', () => {
		assert.strictEqual(sessionFileChangesEqual(
			[v1(fileA, 1, 1, fileAOriginal)],
			[v1(fileA, 1, 1, undefined)]
		), false);
	});

	test('returns true when entries are the same reference (short-circuit)', () => {
		const shared = v1(fileA);
		assert.strictEqual(sessionFileChangesEqual([shared], [shared]), true);
	});
});

suite('sessionTurnFileChangesEqual', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes workspace classification in equality', () => {
		const uri = URI.file('/a.txt');
		const inside: ISessionTurnFileChange = { uri, modifiedUri: uri, insertions: 1, deletions: 0, isOutsideWorkspace: false };
		const outside: ISessionTurnFileChange = { ...inside, isOutsideWorkspace: true };

		assert.deepStrictEqual([
			sessionTurnFileChangesEqual([inside], [{ ...inside }]),
			sessionTurnFileChangesEqual([inside], [outside]),
		], [true, false]);
	});
});

suite('sessionWorkspaceEqual', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function workspace(branchName = 'main', gitHubInfo: IObservable<IGitHubInfo | undefined> = constObservable(undefined), typeIcon?: ThemeIcon): ISessionWorkspace {
		const root = URI.file('/repo');
		return {
			uri: root,
			label: 'repo',
			group: 'Local',
			icon: Codicon.repo,
			folders: [{
				root,
				workingDirectory: root,
				name: 'repo',
				description: undefined,
				gitRepository: {
					uri: root,
					workTreeUri: undefined,
					branchName,
					baseBranchName: 'main',
					gitHubInfo,
				},
			}],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
			typeIcon,
		};
	}

	test('returns true for rebuilt workspace objects with the same values', () => {
		const gitHubInfo = constObservable<IGitHubInfo | undefined>(undefined);
		assert.strictEqual(sessionWorkspaceEqual(workspace('main', gitHubInfo), workspace('main', gitHubInfo)), true);
	});

	test('returns true for rebuilt workspace objects with equivalent GitHub info values', () => {
		const gitHubInfoA: IGitHubInfo = { owner: 'owner', repo: 'repo' };
		const gitHubInfoB: IGitHubInfo = { owner: 'owner', repo: 'repo' };
		assert.strictEqual(sessionWorkspaceEqual(workspace('main', constObservable(gitHubInfoA)), workspace('main', constObservable(gitHubInfoB))), true);
	});

	test('returns false when folder repository metadata changes', () => {
		assert.strictEqual(sessionWorkspaceEqual(workspace('main'), workspace('feature')), false);
	});

	test('compares typeIcon', () => {
		const info = constObservable<IGitHubInfo | undefined>(undefined);
		assert.deepStrictEqual({
			added: sessionWorkspaceEqual(workspace('main', info), workspace('main', info, Codicon.package)),
			removed: sessionWorkspaceEqual(workspace('main', info, Codicon.package), workspace('main', info)),
			changed: sessionWorkspaceEqual(workspace('main', info, Codicon.package), workspace('main', info, Codicon.folder)),
			same: sessionWorkspaceEqual(workspace('main', info, Codicon.package), workspace('main', info, Codicon.package)),
			bothUnset: sessionWorkspaceEqual(workspace('main', info), workspace('main', info)),
		}, {
			added: false,
			removed: false,
			changed: false,
			same: true,
			bothUnset: true,
		});
	});
});

suite('getSessionWorkspaceKind', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function workspace(options: { workTreeUri?: URI; isVirtualWorkspace?: boolean; folders?: boolean } = {}): ISessionWorkspace {
		const root = URI.file('/repo');
		return {
			uri: root,
			label: 'repo',
			icon: Codicon.repo,
			folders: options.folders === false ? [] : [{
				root,
				workingDirectory: options.workTreeUri ?? root,
				name: 'repo',
				description: undefined,
				gitRepository: {
					uri: root,
					workTreeUri: options.workTreeUri,
					baseBranchName: 'main',
					gitHubInfo: constObservable(undefined),
				},
			}],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: options.isVirtualWorkspace ?? false,
		};
	}

	test('classifies workspaces', () => {
		assert.deepStrictEqual({
			checkout: getSessionWorkspaceKind(workspace()),
			worktree: getSessionWorkspaceKind(workspace({ workTreeUri: URI.file('/worktrees/repo') })),
			virtual: getSessionWorkspaceKind(workspace({ isVirtualWorkspace: true })),
			noFolders: getSessionWorkspaceKind(workspace({ folders: false })),
			undefinedWorkspace: getSessionWorkspaceKind(undefined),
			// A pending worktree still reports the checkout it was started from.
			pendingWorktree: getSessionWorkspaceKind(workspace(), true),
			pendingVirtual: getSessionWorkspaceKind(workspace({ isVirtualWorkspace: true }), true),
		}, {
			checkout: SessionWorkspaceKind.Folder,
			worktree: SessionWorkspaceKind.Worktree,
			virtual: SessionWorkspaceKind.Virtual,
			noFolders: SessionWorkspaceKind.Worktree,
			undefinedWorkspace: SessionWorkspaceKind.Worktree,
			pendingWorktree: SessionWorkspaceKind.Worktree,
			pendingVirtual: SessionWorkspaceKind.Virtual,
		});
	});
});

suite('getUntitledSessionTitle', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns "New Chat" for a quick chat', () => {
		assert.strictEqual(getUntitledSessionTitle(true), 'New Chat');
	});

	test('returns "New Session" for a non-quick-chat session', () => {
		assert.strictEqual(getUntitledSessionTitle(false), 'New Session');
	});
});
