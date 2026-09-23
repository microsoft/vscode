/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubInfo, ISession, ISessionArtifact, ISessionWorkspace, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { getSessionGitHubReferences } from '../../common/sessionGitHubReferences.js';

suite('Session GitHub References', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(entries: readonly ISessionArtifact[], gitHubInfo?: IGitHubInfo) {
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', entries);
		const root = URI.file('/repo');
		return upcastPartial<ISession>({
			artifacts,
			workspace: constObservable(gitHubInfo ? upcastPartial<ISessionWorkspace>({
				folders: [{
					root, workingDirectory: root, name: 'repo', description: undefined,
					gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(gitHubInfo) },
				}],
			}) : undefined),
		});
	}

	for (const isArtifact of [true, false]) {
		test(`resolves an issue-only ${isArtifact ? 'artifact' : 'reference'} without a workspace or repository`, () => {
			const uri = URI.parse('https://github.com/microsoft/vscode/issues/337297');
			const session = createSession([{
				id: 'issue', kind: SessionArtifactKind.Issue, label: 'Workspace picker', isArtifact, isGitHub: true, link: uri,
			}]);

			assert.deepStrictEqual(getSessionGitHubReferences(session, undefined), {
				pullRequests: [],
				issues: [{ owner: 'microsoft', repo: 'vscode', number: 337297, uri, title: 'Workspace picker', recordedReferenceId: 'issue' }],
			});
		});
	}

	test('keeps recorded links from different repositories alongside checkout associations', () => {
		const pullRequest = URI.parse('https://github.com/other/project/pull/1');
		const issue = URI.parse('https://github.com/another/project/issues/2');
		const discovered = { owner: 'owner', repo: 'repo', number: 3, uri: URI.parse('https://github.com/owner/repo/pull/3') };
		const session = createSession([
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'Recorded PR', isArtifact: true, isGitHub: true, link: pullRequest },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Recorded issue', isArtifact: false, isGitHub: true, link: issue },
		], { owner: 'owner', repo: 'repo', pullRequest: discovered });

		const references = getSessionGitHubReferences(session, undefined);
		assert.deepStrictEqual({
			pullRequests: references.pullRequests.map(ref => [ref.owner, ref.repo, ref.number, ref.recordedReferenceId, ref.createdByThisSession]),
			issues: references.issues.map(ref => [ref.owner, ref.repo, ref.number, ref.recordedReferenceId]),
		}, {
			pullRequests: [['other', 'project', 1, 'pr', true], ['owner', 'repo', 3, undefined, undefined]],
			issues: [['another', 'project', 2, 'issue']],
		});
	});

	test('preserves recorded IDs and live presentation when merging duplicate associations', () => {
		const uri = URI.parse('https://github.com/OWNER/REPO/pull/1/');
		const associated = { owner: 'owner', repo: 'repo', number: 1, uri: URI.parse('https://github.com/owner/repo/pull/1') };
		const session = createSession([
			{ id: 'reference', kind: SessionArtifactKind.PullRequest, label: 'Reference', isArtifact: false, isGitHub: true, link: uri },
			{ id: 'artifact', kind: SessionArtifactKind.PullRequest, label: 'Artifact', isArtifact: true, isGitHub: true, link: uri },
		], {
			owner: 'owner', repo: 'repo',
			pullRequests: [
				{ ...associated, recordedReferenceId: 'artifact', createdByThisSession: true },
				{ ...associated, recordedReferenceId: 'reference', createdByThisSession: true, state: 'merged', icon: Codicon.gitMerge, title: 'Live title' },
			],
		});
		const references = getSessionGitHubReferences(session, undefined);
		assert.deepStrictEqual(references.pullRequests.map(ref => ({
			id: ref.recordedReferenceId, title: ref.title, owned: ref.createdByThisSession, state: ref.state, icon: ref.icon, uri: ref.uri,
		})), [
			{ id: 'reference', title: 'Live title', owned: true, state: 'merged', icon: Codicon.gitMerge, uri },
			{ id: 'artifact', title: 'Artifact', owned: true, state: undefined, icon: undefined, uri },
		]);
	});

	test('keeps an independently discovered PR after its recorded duplicate is removed', () => {
		const uri = URI.parse('https://github.com/owner/repo/pull/1');
		const associated = { owner: 'owner', repo: 'repo', number: 1, uri, createdByThisSession: false };
		const entry: ISessionArtifact = { id: 'artifact', kind: SessionArtifactKind.PullRequest, label: 'Recorded', isArtifact: true, isGitHub: true, link: uri };
		const gitHubInfo = { owner: 'owner', repo: 'repo', pullRequests: [associated] };
		const before = getSessionGitHubReferences(createSession([entry], gitHubInfo), undefined);
		const after = getSessionGitHubReferences(createSession([], gitHubInfo), undefined);

		assert.deepStrictEqual([before, after].map(refs => refs.pullRequests.map(ref => [ref.number, ref.recordedReferenceId, ref.createdByThisSession])), [
			[[1, 'artifact', true]],
			[[1, undefined, false]],
		]);
	});
});
