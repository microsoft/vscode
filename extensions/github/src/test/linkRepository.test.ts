/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import {
	LINKABLE_FILE_SCHEMES,
	isLinkableFileUri,
	resolveLinkRepository,
	type ILinkGitApi,
	type ILinkRepository,
} from '../linkRepository.js';

/** A minimal git repository the pure helpers can reason about. */
interface FakeRepository extends ILinkRepository {
	id: string;
}

function makeRepository(id: string, rootPath: string, remotes: readonly { name?: string; fetchUrl?: string }[]): FakeRepository {
	return {
		id,
		rootUri: { path: rootPath, scheme: 'file' },
		state: { remotes },
	};
}

const GITHUB_REMOTE = { name: 'origin', fetchUrl: 'https://github.com/owner/repo.git' };
const NON_GITHUB_REMOTE = { name: 'origin', fetchUrl: 'https://example.com/owner/repo.git' };

function makeGitApi(...repositories: FakeRepository[]): ILinkGitApi<FakeRepository> {
	return { repositories };
}

const FILE = { path: '/work/repo/src/file.ts', scheme: 'file' };

suite('linkRepository (github extension)', () => {

	suite('isLinkableFileUri', () => {
		test('accepts the real file schemes', () => {
			for (const scheme of ['file', 'untitled', 'vscode-remote', 'vscode-notebook-cell']) {
				assert.ok(LINKABLE_FILE_SCHEMES.has(scheme), `expected ${scheme} to be linkable`);
				assert.strictEqual(isLinkableFileUri({ path: '/x', scheme }), true);
			}
		});

		test('rejects virtual editor resources', () => {
			assert.strictEqual(isLinkableFileUri({ path: '/untitled-1', scheme: 'agent-host-copilotcli' }), false);
			assert.strictEqual(isLinkableFileUri({ path: 'log', scheme: 'output' }), false);
			assert.strictEqual(isLinkableFileUri({ path: 'log', scheme: 'log' }), false);
			assert.strictEqual(isLinkableFileUri(undefined), false);
		});
	});

	suite('resolveLinkRepository', () => {
		test('returns the repo a provided file belongs to', () => {
			const other = makeRepository('other', '/other', [GITHUB_REMOTE]);
			const target = makeRepository('target', '/work/repo', [GITHUB_REMOTE]);
			const gitApi = makeGitApi(other, target);

			assert.strictEqual(resolveLinkRepository(gitApi, FILE), target);
		});

		test('does NOT fall back to the first GitHub repo for a virtual resource (regression #341026)', () => {
			const first = makeRepository('first', '/work/repo', [GITHUB_REMOTE]);
			const gitApi = makeGitApi(first);
			const chatUri = { path: '/untitled-123', scheme: 'agent-host-copilotcli' };

			assert.strictEqual(resolveLinkRepository(gitApi, chatUri), undefined);
		});

		test('does NOT fall back when the provided file is not in any repository', () => {
			const first = makeRepository('first', '/work/repo', [GITHUB_REMOTE]);
			const gitApi = makeGitApi(first);
			const orphan = { path: '/elsewhere/else.ts', scheme: 'file' };

			assert.strictEqual(resolveLinkRepository(gitApi, orphan), undefined);
		});

		test('still falls back to the first GitHub repo for repo-level links (no file)', () => {
			const nonGithub = makeRepository('nonGithub', '/a', [NON_GITHUB_REMOTE]);
			const firstGithub = makeRepository('firstGithub', '/b', [GITHUB_REMOTE]);
			const gitApi = makeGitApi(nonGithub, firstGithub);

			assert.strictEqual(resolveLinkRepository(gitApi, undefined), firstGithub);
		});

		test('returns undefined for repo-level links when no GitHub repo exists', () => {
			const nonGithub = makeRepository('nonGithub', '/a', [NON_GITHUB_REMOTE]);
			const gitApi = makeGitApi(nonGithub);

			assert.strictEqual(resolveLinkRepository(gitApi, undefined), undefined);
		});
	});
});
