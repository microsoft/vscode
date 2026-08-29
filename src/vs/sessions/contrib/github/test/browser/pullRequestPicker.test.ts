/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { readSessionGitHubState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { createPullRequestBootstrapPrompt, createPullRequestContextAttachment, createPullRequestQuickPickItems, createPullRequestSessionMetadata, getExistingPullRequests, getPullRequestNumberFromCheckoutRef, IPullRequestQuickPickItem, isPullRequestAvailable, mergePullRequestSummaries, pullRequestMatchesQuery, resolvePullRequestSessionRepository } from '../../browser/pullRequestPicker.js';
import { IGitHubPullRequestSummary } from '../../common/types.js';
import { createAndOpenPullRequestSession } from '../../browser/pullRequestSessionCreation.js';

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

	test('uses semantic open and draft pull request icon classes', () => {
		const items = createPullRequestQuickPickItems([
			pullRequest(17),
			pullRequest(18, { isDraft: true }),
		], { numbers: new Set(), headRefs: new Set() }).filter((item): item is IPullRequestQuickPickItem => item.type !== 'separator');

		assert.deepStrictEqual(items.map(item => item.iconClass), [
			'codicon codicon-git-pull-request sessions-pull-request-open',
			'codicon codicon-git-pull-request-draft sessions-pull-request-draft',
		]);
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

	test('only makes same-repository pull requests without existing sessions available', () => {
		const existingPullRequests = { numbers: new Set([1]), headRefs: new Set(['feature-2']) };

		assert.deepStrictEqual([
			pullRequest(1),
			pullRequest(2),
			pullRequest(3, { isCrossRepository: true }),
			pullRequest(4),
		].map(item => isPullRequestAvailable(item, existingPullRequests)), [
			false,
			false,
			false,
			true,
		]);
	});

	test('merges viewer-group results into the loaded catalog without dropping either set', () => {
		const merged = mergePullRequestSummaries([
			pullRequest(1),
			pullRequest(2),
		], [
			pullRequest(3, { reviewRequestedFromViewer: true }),
			pullRequest(2, { assignedToViewer: true }),
		]);

		assert.deepStrictEqual(merged.map(item => ({
			number: item.number,
			review: item.reviewRequestedFromViewer,
			assigned: item.assignedToViewer,
		})), [
			{ number: 1, review: false, assigned: false },
			{ number: 2, review: false, assigned: true },
			{ number: 3, review: true, assigned: false },
		]);
	});

	test('bootstrap prompt forbids tools and file operations', () => {
		assert.strictEqual(
			createPullRequestBootstrapPrompt(pullRequest(42, { title: 'Improve pull request picker' })),
			'Initialize this session for pull request #42. The attached JSON is a complete pull request snapshot. For future questions about this pull request, use the attached snapshot as the primary source and do not fetch pull request data or run tools unless the user explicitly asks for refreshed information or the requested information is absent from the snapshot. Do not inspect or modify files, use tools, or take any other action until the user sends a visible follow-up request. Reply only with "Ready".',
		);
	});

	test('creates session metadata with the selected pull request identity', () => {
		assert.deepStrictEqual(
			readSessionGitHubState(createPullRequestSessionMetadata('microsoft', 'vscode', pullRequest(42, { headRef: 'feature' }))),
			{
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/42'],
				pullRequestBranchName: 'feature',
			},
		);
	});

	test('creates a transcript context attachment containing the PR snapshot as JSON', () => {
		const attachment = createPullRequestContextAttachment({
			owner: 'owner',
			repo: 'repo',
			number: 42,
			url: 'https://github.com/owner/repo/pull/42',
			title: 'Improve sessions',
			description: 'Description',
			author: 'author',
			isDraft: false,
			baseRef: 'main',
			branchName: 'feature',
			headRef: 'feature',
			updatedAt: '2026-01-01T00:00:00Z',
			patch: '@@ -1 +1 @@',
			comments: [],
		});

		assert.deepStrictEqual({
			kind: attachment.kind,
			name: attachment.name,
			fullName: attachment.fullName,
			icon: attachment.icon?.id,
			uri: attachment.uri.toString(),
			value: JSON.parse(attachment.value ?? ''),
		}, {
			kind: 'transcriptContext',
			name: '#42 Improve sessions',
			fullName: '#42 Improve sessions',
			icon: 'git-pull-request',
			uri: 'https://github.com/owner/repo/pull/42',
			value: {
				usageInstructions: 'Use this snapshot as the primary source for questions about the pull request. Do not fetch pull request data or run tools unless the user explicitly asks for refreshed information or the requested information is absent from this snapshot.',
				owner: 'owner',
				repo: 'repo',
				number: 42,
				url: 'https://github.com/owner/repo/pull/42',
				title: 'Improve sessions',
				description: 'Description',
				author: 'author',
				isDraft: false,
				baseRef: 'main',
				branchName: 'feature',
				headRef: 'feature',
				updatedAt: '2026-01-01T00:00:00Z',
				patch: '@@ -1 +1 @@',
				comments: [],
			},
		});
	});

	test('shows the provisional session before configuration starts', async () => {
		const resource = URI.parse('test:///session');
		const session = new class extends mock<ISession>() {
			override readonly resource = resource;
		}();
		const commitBarrier = new DeferredPromise<void>();
		const events: string[] = [];

		const resultPromise = createAndOpenPullRequestSession(
			async onSessionCreated => {
				events.push('create');
				onSessionCreated(session);
				events.push('configureWorktree');
				await commitBarrier.p;
				events.push('commit');
				return session;
			},
			openedResource => {
				events.push(`show:${openedResource.toString()}`);
			},
			() => {
				events.push('hidePicker');
			},
		);
		await Promise.resolve();
		const whileCreatingWorktree = [...events];
		commitBarrier.complete();
		const result = await resultPromise;

		assert.deepStrictEqual({
			whileCreatingWorktree,
			events,
			result: result?.resource.toString(),
		}, {
			whileCreatingWorktree: ['create', `show:${resource.toString()}`, 'hidePicker', 'configureWorktree'],
			events: ['create', `show:${resource.toString()}`, 'hidePicker', 'configureWorktree', 'commit'],
			result: resource.toString(),
		});
	});

	test('collects existing pull requests from matching metadata and repository-scoped branches', () => {
		const repositoryRoot = URI.file('/repos/microsoft/vscode');
		const cloudRoot = URI.parse('github-remote-file://github/microsoft/vscode/feature-seven');
		const repositorySessionAwaitingMetadata = sessionWithRepository(repositoryRoot, 'microsoft', 'vscode', false, 'origin/feature-three');
		const pullRefSessionAwaitingMetadata = sessionWithRepository(repositoryRoot, 'microsoft', 'vscode', false, 'origin/pull/5/head');
		const sessions = [
			sessionWithPullRequest('microsoft', 'vscode', 1),
			sessionWithPullRequest('microsoft', 'vscode', 2, 'origin/feature-two'),
			sessionWithPullRequest('Microsoft', 'VSCode', 4),
			sessionWithPullRequest('microsoft', 'vscode', 7, undefined, cloudRoot),
			repositorySessionAwaitingMetadata,
			pullRefSessionAwaitingMetadata,
			sessionWithPullRequest('other', 'vscode', 3),
		];
		const existing = getExistingPullRequests(sessions, 'microsoft', 'vscode', [repositorySessionAwaitingMetadata, pullRefSessionAwaitingMetadata]);
		const availableItems = createPullRequestQuickPickItems([
			pullRequest(5, { headRef: 'feature-three' }),
			pullRequest(7),
			pullRequest(6),
		], existing);
		assert.deepStrictEqual({
			numbers: [...existing.numbers],
			headRefs: [...existing.headRefs],
			availableNumbers: availableItems.flatMap(item => item.type === 'separator' ? [] : [item.pullRequest.number]),
		}, {
			numbers: [1, 2, 4, 5],
			headRefs: ['feature-two', 'feature-three', 'pull/5/head'],
			availableNumbers: [7, 6],
		});
	});

	test('extracts PR numbers from checkout refs', () => {
		assert.deepStrictEqual({
			pull: getPullRequestNumberFromCheckoutRef('pull/42/head'),
			full: getPullRequestNumberFromCheckoutRef('refs/pull/42/head'),
			branch: getPullRequestNumberFromCheckoutRef('feature'),
		}, {
			pull: 42,
			full: 42,
			branch: undefined,
		});
	});

	test('resolves non-cloud repositories from session metadata', async () => {
		const cloudRoot = URI.parse('github-remote-file://github/alexr00/playground/copilot%252Finspect-pull-request-748');
		const localRoot = URI.file('/repos/alexr00/playground');
		const remoteRoot = URI.parse('vscode-remote://ssh-remote+host/repos/alexr00/playground');
		const cloudSession = sessionWithRepository(cloudRoot, 'alexr00', 'playground');
		const localSession = sessionWithRepository(localRoot, 'alexr00', 'playground', false);
		const localSessionWithMetadata = sessionWithRepository(localRoot, 'alexr00', 'playground');
		const otherCloudSession = sessionWithRepository(cloudRoot, 'microsoft', 'vscode');
		const remoteSession = sessionWithRepository(remoteRoot, 'alexr00', 'playground');

		assert.deepStrictEqual({
			cloud: await resolvePullRequestSessionRepository([cloudSession]),
			local: await resolvePullRequestSessionRepository([localSession]),
			mixed: await resolvePullRequestSessionRepository([cloudSession, localSession]),
			mixedRepositories: await resolvePullRequestSessionRepository([otherCloudSession, localSessionWithMetadata]),
			remote: await resolvePullRequestSessionRepository([remoteSession]),
		}, {
			cloud: undefined,
			local: undefined,
			mixed: {
				folderUri: localRoot,
				owner: 'alexr00',
				repo: 'playground',
			},
			mixedRepositories: {
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
});

function pullRequest(number: number, overrides: Partial<IGitHubPullRequestSummary> = {}): IGitHubPullRequestSummary {
	return {
		number,
		title: `Pull request ${number}`,
		author: { login: 'author', avatarUrl: '' },
		headRef: `feature-${number}`,
		isCrossRepository: false,
		isDraft: false,
		updatedAt: new Date().toISOString(),
		additions: 1,
		deletions: 1,
		reviewRequestedFromViewer: false,
		assignedToViewer: false,
		...overrides,
		checkoutRef: overrides.checkoutRef ?? `refs/pull/${number}/head`,
	};
}

function sessionWithPullRequest(owner: string, repo: string, number: number, upstreamBranchName?: string, root = URI.file('/repo')): ISession {
	const workspace: ISessionWorkspace = {
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
		isVirtualWorkspace: root.scheme !== Schemas.file,
	};
	return sessionWithWorkspace(workspace);
}

function sessionWithRepository(root: URI, owner: string, repo: string, includeGitHubInfo = true, upstreamBranchName?: string): ISession {
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
				upstreamBranchName,
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
