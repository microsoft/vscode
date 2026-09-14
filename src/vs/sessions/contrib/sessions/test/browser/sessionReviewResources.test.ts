/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubPullRequestRef, ISession, ISessionArtifact, ISessionGitRepository, ISessionWorkspace, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { getArtifactPullRequest, getSessionReviewPullRequests } from '../../common/sessionReviewResources.js';

suite('Session review resources', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function reference(owner: string, repo: string, number: number): IGitHubPullRequestRef {
		return { owner, repo, number, uri: URI.parse(`https://github.com/${owner}/${repo}/pull/${number}`) };
	}

	function session(references: readonly IGitHubPullRequestRef[], artifacts: readonly ISessionArtifact[]): ISession {
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly folders = references.map(reference => ({
				root: URI.file(`/${reference.repo}`),
				workingDirectory: URI.file(`/${reference.repo}`),
				name: reference.repo,
				description: undefined,
				gitRepository: new class extends mock<ISessionGitRepository>() {
					override readonly gitHubInfo = constObservable({ owner: reference.owner, repo: reference.repo, pullRequests: [reference] });
				}(),
			}));
		}();
		return new class extends mock<ISession>() {
			override readonly workspace = constObservable(workspace);
			override readonly artifacts = constObservable(artifacts);
		}();
	}

	test('includes pull requests from every workspace folder', () => {
		const references = [reference('microsoft', 'vscode', 12), reference('microsoft', 'tools', 9)];
		assert.deepStrictEqual(getSessionReviewPullRequests(session(references, [])), references);
	});

	test('includes recorded pull requests without a git workspace', () => {
		const artifact: ISessionArtifact = { id: 'result', kind: SessionArtifactKind.PullRequest, label: 'Review fix', isArtifact: true, link: URI.parse('https://github.com/example/repo/pull/42#discussion') };
		assert.deepStrictEqual(getSessionReviewPullRequests(session([], [artifact])).map(({ uri, ...reference }) => ({ ...reference, uri: uri.toString() })), [{
			owner: 'example', repo: 'repo', number: 42, uri: 'https://github.com/example/repo/pull/42', title: 'Review fix', createdByThisSession: true,
		}]);
	});

	test('keeps the known workspace state when an artifact records the same pull request', () => {
		const known = { ...reference('example', 'repo', 42), state: 'open' as const };
		const artifact: ISessionArtifact = { id: 'result', kind: SessionArtifactKind.PullRequest, label: 'Review fix', isArtifact: true, link: URI.parse('https://github.com/Example/Repo/pull/42/') };
		assert.deepStrictEqual(getSessionReviewPullRequests(session([known], [artifact])), [known]);
	});

	test('does not misidentify ordinary links or unsupported pull request hosts', () => {
		assert.deepStrictEqual([
			getArtifactPullRequest({ id: 'site', kind: SessionArtifactKind.Website, label: 'Link', isArtifact: false, link: reference('example', 'repo', 42).uri }),
			getArtifactPullRequest({ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'Link', isArtifact: false, link: URI.parse('https://example.com/repo/pull/42') }),
		], [undefined, undefined]);
	});
});
