/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getUntitledSessionTitle, IGitHubInfo, ISessionWorkspace, sessionFileChangesEqual, sessionWorkspaceEqual } from '../../common/session.js';

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

suite('sessionWorkspaceEqual', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function workspace(branchName = 'main', gitHubInfo: IObservable<IGitHubInfo | undefined> = constObservable(undefined)): ISessionWorkspace {
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
