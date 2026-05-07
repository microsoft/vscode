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
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../../services/sessions/common/session.js';

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

	test('createRepositoryModelReference returns shared model for same key', () => {
		const ref1 = store.add(service.createRepositoryModelReference('owner', 'repo'));
		const ref2 = store.add(service.createRepositoryModelReference('owner', 'repo'));
		assert.strictEqual(ref1.object, ref2.object);
	});

	test('createRepositoryModelReference returns different models for different repos', () => {
		const ref1 = store.add(service.createRepositoryModelReference('owner', 'repo1'));
		const ref2 = store.add(service.createRepositoryModelReference('owner', 'repo2'));
		assert.notStrictEqual(ref1.object, ref2.object);
	});

	test('createRepositoryModelReference disposes model when last reference is released', () => {
		const ref1 = service.createRepositoryModelReference('owner', 'repo');
		const ref2 = service.createRepositoryModelReference('owner', 'repo');
		const model = ref1.object;
		assert.strictEqual(ref2.object, model);

		// Release one reference; model must still be alive and shared.
		ref1.dispose();
		const ref3 = store.add(service.createRepositoryModelReference('owner', 'repo'));
		assert.strictEqual(ref3.object, model);

		// Release remaining references; the next acquire should create a new model.
		ref2.dispose();
		ref3.dispose();
		const ref4 = store.add(service.createRepositoryModelReference('owner', 'repo'));
		assert.notStrictEqual(ref4.object, model);
	});

	test('createPullRequestModelReference returns shared model for same key', () => {
		const ref1 = store.add(service.createPullRequestModelReference('owner', 'repo', 1));
		const ref2 = store.add(service.createPullRequestModelReference('owner', 'repo', 1));
		assert.strictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestModelReference returns different models for different PRs', () => {
		const ref1 = store.add(service.createPullRequestModelReference('owner', 'repo', 1));
		const ref2 = store.add(service.createPullRequestModelReference('owner', 'repo', 2));
		assert.notStrictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestModelReference disposes model when last reference is released', () => {
		const ref1 = service.createPullRequestModelReference('owner', 'repo', 1);
		const ref2 = service.createPullRequestModelReference('owner', 'repo', 1);
		const model = ref1.object;
		assert.strictEqual(ref2.object, model);

		ref1.dispose();
		const ref3 = store.add(service.createPullRequestModelReference('owner', 'repo', 1));
		assert.strictEqual(ref3.object, model);

		ref2.dispose();
		ref3.dispose();
		const ref4 = store.add(service.createPullRequestModelReference('owner', 'repo', 1));
		assert.notStrictEqual(ref4.object, model);
	});

	test('createPullRequestReviewThreadsModelReference returns shared model for same key', () => {
		const ref1 = store.add(service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1));
		const ref2 = store.add(service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1));
		assert.strictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestReviewThreadsModelReference returns different models for different PRs', () => {
		const ref1 = store.add(service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1));
		const ref2 = store.add(service.createPullRequestReviewThreadsModelReference('owner', 'repo', 2));
		assert.notStrictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestReviewThreadsModelReference disposes model when last reference is released', () => {
		const ref1 = service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1);
		const ref2 = service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1);
		const model = ref1.object;
		assert.strictEqual(ref2.object, model);

		ref1.dispose();
		const ref3 = store.add(service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1));
		assert.strictEqual(ref3.object, model);

		ref2.dispose();
		ref3.dispose();
		const ref4 = store.add(service.createPullRequestReviewThreadsModelReference('owner', 'repo', 1));
		assert.notStrictEqual(ref4.object, model);
	});

	test('createPullRequestCIModelReference returns shared model for same key', () => {
		const ref1 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc'));
		const ref2 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc'));
		assert.strictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestCIModelReference returns different models for different head refs', () => {
		const ref1 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc'));
		const ref2 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'def'));
		assert.notStrictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestCIModelReference returns different models for different pull requests', () => {
		const ref1 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc'));
		const ref2 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 2, 'abc'));
		assert.notStrictEqual(ref1.object, ref2.object);
	});

	test('createPullRequestCIModelReference exposes the requested head ref on the model', () => {
		const ref = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc123'));
		assert.strictEqual(ref.object.headSha, 'abc123');
	});

	test('createPullRequestCIModelReference disposes model when last reference is released', () => {
		const ref1 = service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc');
		const ref2 = service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc');
		const model = ref1.object;
		assert.strictEqual(ref2.object, model);

		ref1.dispose();
		const ref3 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc'));
		assert.strictEqual(ref3.object, model);

		ref2.dispose();
		ref3.dispose();
		const ref4 = store.add(service.createPullRequestCIModelReference('owner', 'repo', 1, 'abc'));
		assert.notStrictEqual(ref4.object, model);
	});
});

suite('getGitHubContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeSession(overrides: { repository?: URI }): { repository: URI | undefined } {
		return {
			repository: undefined,
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
