/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { createPullRequestBootstrapPrompt, createPullRequestQuickPickItems, getExistingPullRequests, getGitHubRepositoryFromRemotes, IPullRequestQuickPickItem, pullRequestMatchesQuery, resolvePullRequestSessionRepository } from '../../browser/pullRequestPicker.js';
import { IGitHubPullRequestSummary } from '../../common/types.js';

suite('Create Session from Pull Request', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('groups available pull requests by review and assignment priority', () => {
		const items = createPullRequestQuickPickItems([
			pullRequest(1, { reviewRequestedFromViewer: true, assignedToViewer: true }),
			pullRequest(2, { assignedToViewer: true }),
			pullRequest(3),
			pullRequest(4, { reviewRequestedFromViewer: true }),
		], { numbers: new Set([4]), headRefs: new Set() });

		assert.deepStrictEqual(items.map(item => item.type === 'separator'
			? { separator: item.label }
			: { pullRequest: item.pullRequest.number }), [
			{ separator: 'Waiting for My Review' },
			{ pullRequest: 1 },
			{ separator: 'Assigned to Me' },
			{ pullRequest: 2 },
			{ separator: 'Other Pull Requests' },
			{ pullRequest: 3 },
		]);
	});

	test('renders the requested two-line pull request information', () => {
		const [separator, item] = createPullRequestQuickPickItems([
			pullRequest(17, { title: 'Fix session creation', additions: 24, deletions: 5 }),
		], { numbers: new Set(), headRefs: new Set() }) as readonly [{ readonly type: 'separator' }, IPullRequestQuickPickItem];

		assert.deepStrictEqual({
			separator: separator.type,
			label: item.label,
			detailHasAuthor: item.detail?.includes('@author'),
			detailHasDiff: item.detail?.includes('+24 -5'),
		}, {
			separator: 'separator',
			label: '#17 Fix session creation',
			detailHasAuthor: true,
			detailHasDiff: true,
		});
	});

	test('matches pull requests by number, title, and author', () => {
		const item = pullRequest(42, { title: 'Improve pull request picker' });
		assert.deepStrictEqual({
			number: pullRequestMatchesQuery(item, '#42'),
			title: pullRequestMatchesQuery(item, 'request picker'),
			author: pullRequestMatchesQuery(item, 'AUTHOR'),
			missing: pullRequestMatchesQuery(item, 'unrelated'),
		}, {
			number: true,
			title: true,
			author: true,
			missing: false,
		});

	});

	test('bootstrap prompt forbids tools and file operations', () => {
		assert.strictEqual(
			createPullRequestBootstrapPrompt(pullRequest(42, { title: 'Improve pull request picker' })),
			'Initialize this session for pull request #42, "Improve pull request picker". Do not inspect or modify files, use tools, or take any other action until the user sends a visible follow-up request. Reply only with "Ready".',
		);
	});

	test('collects existing pull request numbers and tracked head branches only from the selected repository', () => {
		const sessions = [
			sessionWithPullRequest('microsoft', 'vscode', 1),
			sessionWithPullRequest('microsoft', 'vscode', 2, 'origin/feature-two'),
			sessionWithPullRequest('other', 'vscode', 3),
		];
		const existing = getExistingPullRequests(sessions, 'microsoft', 'vscode');
		assert.deepStrictEqual({
			numbers: [...existing.numbers],
			headRefs: [...existing.headRefs],
		}, {
			numbers: [1, 2],
			headRefs: ['feature-two'],
		});
	});

	test('resolves non-cloud repositories from session metadata or Git remotes', async () => {
		const cloudRoot = URI.parse('github-remote-file://github/alexr00/playground/copilot%252Finspect-pull-request-748');
		const localRoot = URI.file('/repos/alexr00/playground');
		const remoteRoot = URI.parse('vscode-remote://ssh-remote+host/repos/alexr00/playground');
		const cloudSession = sessionWithRepository(cloudRoot, 'alexr00', 'playground');
		const localSession = sessionWithRepository(localRoot, 'alexr00', 'playground', false);
		const remoteSession = sessionWithRepository(remoteRoot, 'alexr00', 'playground');

		assert.deepStrictEqual({
			cloud: await resolvePullRequestSessionRepository([cloudSession], async () => undefined),
			local: await resolvePullRequestSessionRepository([localSession], async () => ({ owner: 'alexr00', repo: 'playground' })),
			mixed: await resolvePullRequestSessionRepository([cloudSession, localSession], async () => undefined),
			remote: await resolvePullRequestSessionRepository([remoteSession], async () => undefined),
		}, {
			cloud: undefined,
			local: {
				folderUri: localRoot,
				owner: 'alexr00',
				repo: 'playground',
			},
			mixed: {
				folderUri: localRoot,
				owner: 'alexr00',
				repo: 'playground',
			},
			remote: {
				folderUri: remoteRoot,
				owner: 'alexr00',
				repo: 'playground',
			},
		});
	});

	test('parses GitHub repository identity from origin before other remotes', () => {
		assert.deepStrictEqual({
			https: getGitHubRepositoryFromRemotes([
				{ name: 'upstream', fetchUrl: 'git@github.com:microsoft/vscode.git' },
				{ name: 'origin', fetchUrl: 'https://github.com/alexr00/vscode.git' },
			]),
			ssh: getGitHubRepositoryFromRemotes([
				{ name: 'origin', fetchUrl: 'ssh://git@github.com/alexr00/playground' },
			]),
			nonGitHub: getGitHubRepositoryFromRemotes([
				{ name: 'origin', fetchUrl: 'https://example.com/alexr00/playground.git' },
			]),
		}, {
			https: { owner: 'alexr00', repo: 'vscode' },
			ssh: { owner: 'alexr00', repo: 'playground' },
			nonGitHub: undefined,
		});
	});
});

function pullRequest(number: number, overrides: Partial<IGitHubPullRequestSummary> = {}): IGitHubPullRequestSummary {
	return {
		number,
		title: `Pull request ${number}`,
		author: { login: 'author', avatarUrl: '' },
		headRef: `feature-${number}`,
		isDraft: false,
		updatedAt: new Date().toISOString(),
		additions: 1,
		deletions: 1,
		reviewRequestedFromViewer: false,
		assignedToViewer: false,
		...overrides,
	};
}

function sessionWithPullRequest(owner: string, repo: string, number: number, upstreamBranchName?: string): ISession {
	const workspace: ISessionWorkspace = {
		uri: URI.file('/repo'),
		label: repo,
		icon: Codicon.folder,
		folders: [{
			root: URI.file('/repo'),
			workingDirectory: URI.file('/repo'),
			name: repo,
			description: undefined,
			gitRepository: {
				uri: URI.file('/repo'),
				workTreeUri: URI.file('/repo'),
				baseBranchName: 'main',
				upstreamBranchName,
				gitHubInfo: constObservable({
					owner,
					repo,
					pullRequest: {
						number,
						uri: URI.parse(`https://github.com/${owner}/${repo}/pull/${number}`),
					},
				}),
			},
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	return sessionWithWorkspace(workspace);
}

function sessionWithRepository(root: URI, owner: string, repo: string, includeGitHubInfo = true): ISession {
	return sessionWithWorkspace({
		uri: root,
		label: repo,
		icon: Codicon.folder,
		folders: [{
			root,
			workingDirectory: root,
			name: repo,
			description: undefined,
			gitRepository: {
				uri: root,
				workTreeUri: root,
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				gitHubInfo: constObservable(includeGitHubInfo ? { owner, repo } : undefined),
			},
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: root.scheme !== Schemas.file,
	});
}

function sessionWithWorkspace(workspace: ISessionWorkspace): ISession {
	return new class extends mock<ISession>() {
		override readonly workspace = constObservable(workspace);
	}();
}
