/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIChatSessionFileChange2, type IChatSessionFileChange2 } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import type { ISessionFileChange, ISessionFolder, ISessionGitRepository, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { filterChangesToPrimaryRepoRoot } from '../../browser/agentHostSessionChangesets.js';

function change(uri: string): IChatSessionFileChange2 {
	const u = URI.file(uri);
	return { uri: u, modifiedUri: u, insertions: 1, deletions: 0 };
}

function folder(root: string, options?: { readonly workingDirectory?: string; readonly workTreeUri?: string }): ISessionFolder {
	const rootUri = URI.file(root);
	const gitRepository: ISessionGitRepository | undefined = options?.workTreeUri
		? { uri: rootUri, workTreeUri: URI.file(options.workTreeUri), baseBranchName: undefined, gitHubInfo: constObservable(undefined) }
		: undefined;
	return { root: rootUri, workingDirectory: URI.file(options?.workingDirectory ?? root), name: root, description: undefined, gitRepository };
}

function workspace(folders: ISessionFolder[]): ISessionWorkspace {
	return { uri: folders[0].root, label: 'ws', icon: ThemeIcon.fromId(Codicon.folder.id), folders, requiresWorkspaceTrust: false, isVirtualWorkspace: false };
}

function uris(changes: readonly ISessionFileChange[]): string[] {
	return changes.map(c => (isIChatSessionFileChange2(c) ? c.uri : c.modifiedUri).toString());
}

suite('filterChangesToPrimaryRepoRoot', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('multi-folder: keeps only files under the primary folder, drops secondary-folder files', () => {
		const changes = [change('/repoA/a.ts'), change('/repoB/b.ts'), change('/repoA/sub/c.ts')];
		const result = filterChangesToPrimaryRepoRoot(changes, workspace([folder('/repoA'), folder('/repoB')]));
		assert.deepStrictEqual(uris(result), [URI.file('/repoA/a.ts').toString(), URI.file('/repoA/sub/c.ts').toString()]);
	});

	test('multi-folder: a primary cwd inside the repository keeps the whole repository', () => {
		const changes = [change('/repo/packages/app/a.ts'), change('/repo/packages/lib/b.ts'), change('/other/c.ts')];
		const result = filterChangesToPrimaryRepoRoot(changes, workspace([
			folder('/repo', { workingDirectory: '/repo/packages/app', workTreeUri: '/repo/packages/app' }),
			folder('/elsewhere'),
		]));
		assert.deepStrictEqual(uris(result), [
			URI.file('/repo/packages/app/a.ts').toString(),
			URI.file('/repo/packages/lib/b.ts').toString(),
		]);
	});

	test('multi-folder: a separate primary worktree excludes the source repository', () => {
		const changes = [change('/repo.worktrees/feature/a.ts'), change('/repo/src/b.ts'), change('/other/c.ts')];
		const result = filterChangesToPrimaryRepoRoot(changes, workspace([
			folder('/repo', { workingDirectory: '/repo.worktrees/feature', workTreeUri: '/repo.worktrees/feature' }),
			folder('/elsewhere'),
		]));
		assert.deepStrictEqual(uris(result), [URI.file('/repo.worktrees/feature/a.ts').toString()]);
	});

	test('single-folder: returns changes unchanged (identity)', () => {
		const changes = [change('/repoA/a.ts'), change('/somewhere/else.ts')];
		const result = filterChangesToPrimaryRepoRoot(changes, workspace([folder('/repoA')]));
		assert.strictEqual(result, changes);
	});

	test('no workspace: returns changes unchanged (identity)', () => {
		const changes = [change('/repoA/a.ts')];
		assert.strictEqual(filterChangesToPrimaryRepoRoot(changes, undefined), changes);
	});
});
