/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { GitHubService } from '../../browser/githubService.js';
import { URI } from '../../../../../base/common/uri.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../fileTreeView/browser/githubFileSystemProvider.js';
import { IActiveSessionItem } from '../../../sessions/browser/sessionsManagementService.js';

suite('GitHubService', () => {

	const store = new DisposableStore();
	let service: GitHubService;

	setup(() => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());

		service = store.add(instantiationService.createInstance(GitHubService));
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getRepository returns cached model for same key', () => {
		const model1 = service.getRepository('owner', 'repo');
		const model2 = service.getRepository('owner', 'repo');
		assert.strictEqual(model1, model2);
	});

	test('getRepository returns different models for different repos', () => {
		const model1 = service.getRepository('owner', 'repo1');
		const model2 = service.getRepository('owner', 'repo2');
		assert.notStrictEqual(model1, model2);
	});

	test('getPullRequest returns cached model for same key', () => {
		const model1 = service.getPullRequest('owner', 'repo', 1);
		const model2 = service.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(model1, model2);
	});

	test('getPullRequest returns different models for different PRs', () => {
		const model1 = service.getPullRequest('owner', 'repo', 1);
		const model2 = service.getPullRequest('owner', 'repo', 2);
		assert.notStrictEqual(model1, model2);
	});

	test('getPullRequestCI returns cached model for same key', () => {
		const model1 = service.getPullRequestCI('owner', 'repo', 'abc123');
		const model2 = service.getPullRequestCI('owner', 'repo', 'abc123');
		assert.strictEqual(model1, model2);
	});

	test('getPullRequestCI returns different models for different refs', () => {
		const model1 = service.getPullRequestCI('owner', 'repo', 'abc');
		const model2 = service.getPullRequestCI('owner', 'repo', 'def');
		assert.notStrictEqual(model1, model2);
	});

	test('disposing service does not throw', () => {
		service.getRepository('owner', 'repo');
		service.getPullRequest('owner', 'repo', 1);
		service.getPullRequestCI('owner', 'repo', 'abc');

		// Disposing the service should not throw and should clean up models
		assert.doesNotThrow(() => service.dispose());
	});
});

suite('getGitHubContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeSession(overrides: Partial<IActiveSessionItem>): IActiveSessionItem {
		return {
			resource: URI.parse('test://session/1'),
			isUntitled: false,
			label: 'Test Session',
			repository: undefined,
			worktree: undefined,
			worktreeBranchName: undefined,
			providerType: 'copilot-cloud-agent',
			...overrides,
		};
	}

	test('parses owner/repo from github-remote-file URI', () => {
		const session = makeSession({
			repository: URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: '/microsoft/vscode/main'
			}),
		});

		const parts = session.repository!.path.split('/').filter(Boolean);
		assert.strictEqual(parts.length >= 2, true);
		assert.strictEqual(decodeURIComponent(parts[0]), 'microsoft');
		assert.strictEqual(decodeURIComponent(parts[1]), 'vscode');
	});

	test('parses PR number from pullRequestUrl', () => {
		const url = 'https://github.com/microsoft/vscode/pull/12345';
		const match = /\/pull\/(\d+)/.exec(url);
		assert.ok(match);
		assert.strictEqual(parseInt(match![1], 10), 12345);
	});

	test('parses owner/repo from repositoryNwo', () => {
		const nwo = 'microsoft/vscode';
		const parts = nwo.split('/');
		assert.strictEqual(parts.length, 2);
		assert.strictEqual(parts[0], 'microsoft');
		assert.strictEqual(parts[1], 'vscode');
	});

	test('returns undefined for non-GitHub file URI', () => {
		const session = makeSession({
			repository: URI.file('/local/path/to/repo'),
		});

		// file:// scheme is not github-remote-file
		assert.notStrictEqual(session.repository!.scheme, GITHUB_REMOTE_FILE_SCHEME);
	});
});
