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
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { createPullRequestBootstrapPrompt, createPullRequestContextAttachment, createPullRequestQuickPickItems, getExistingPullRequests, getGitHubRepositoryFromRemotes, IPullRequestQuickPickItem, pullRequestMatchesQuery, resolvePullRequestSessionRepository } from '../../browser/pullRequestPicker.js';
import { getChatTranscriptContext } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
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
			headRef: 'feature',
			updatedAt: '2026-01-01T00:00:00Z',
			patch: '@@ -1 +1 @@',
			comments: [],
		});

		assert.deepStrictEqual({
			kind: attachment.kind,
			name: attachment.name,
			value: JSON.parse(attachment.value ?? ''),
			transcriptContext: getChatTranscriptContext(attachment),
		}, {
			kind: 'string',
			name: '#42 Improve sessions',
			value: {
				owner: 'owner',
				repo: 'repo',
				number: 42,
				url: 'https://github.com/owner/repo/pull/42',
				title: 'Improve sessions',
				description: 'Description',
				author: 'author',
				isDraft: false,
				baseRef: 'main',
				headRef: 'feature',
				updatedAt: '2026-01-01T00:00:00Z',
				patch: '@@ -1 +1 @@',
				comments: [],
			},
			transcriptContext: {
				label: '#42 Improve sessions',
				iconId: 'git-pull-request',
				tooltip: 'Pull request #42 by @author',
			},
		});
	});

	test('keeps creation pending until the committed session is opened', async () => {
		const resource = URI.parse('test:///session');
		const session = new class extends mock<ISession>() {
			override readonly resource = resource;
		}();
		const createBarrier = new DeferredPromise<ISession | undefined>();
		const openBarrier = new DeferredPromise<void>();
		const openStarted = new DeferredPromise<void>();
		const events: string[] = [];

		const resultPromise = createAndOpenPullRequestSession(
			async () => {
				events.push('create');
				return createBarrier.p;
			},
			async openedResource => {
				events.push(`open:${openedResource.toString()}`);
				openStarted.complete();
				await openBarrier.p;
				events.push('opened');
			},
			() => {
				events.push('hidePicker');
			},
		);
		await Promise.resolve();
		const whileCreating = [...events];
		createBarrier.complete(session);
		await openStarted.p;
		const whileOpening = [...events];
		openBarrier.complete();
		const result = await resultPromise;

		assert.deepStrictEqual({
			whileCreating,
			whileOpening,
			events,
			result: result?.resource.toString(),
		}, {
			whileCreating: ['create'],
			whileOpening: ['create', `open:${resource.toString()}`],
			events: ['create', `open:${resource.toString()}`, 'opened', 'hidePicker'],
			result: resource.toString(),
		});
	});

	test('collects existing pull requests from matching metadata and repository-scoped branches', () => {
		const repositoryRoot = URI.file('/repos/microsoft/vscode');
		const repositorySessionAwaitingMetadata = sessionWithRepository(repositoryRoot, 'microsoft', 'vscode', false, 'origin/feature-three');
		const sessions = [
			sessionWithPullRequest('microsoft', 'vscode', 1),
			sessionWithPullRequest('microsoft', 'vscode', 2, 'origin/feature-two'),
			sessionWithPullRequest('Microsoft', 'VSCode', 4),
			repositorySessionAwaitingMetadata,
			sessionWithPullRequest('other', 'vscode', 3),
		];
		const existing = getExistingPullRequests(sessions, 'microsoft', 'vscode', [repositorySessionAwaitingMetadata]);
		const availableItems = createPullRequestQuickPickItems([
			pullRequest(5, { headRef: 'feature-three' }),
			pullRequest(6),
		], existing);
		assert.deepStrictEqual({
			numbers: [...existing.numbers],
			headRefs: [...existing.headRefs],
			availableNumbers: availableItems.flatMap(item => item.type === 'separator' ? [] : [item.pullRequest.number]),
		}, {
			numbers: [1, 2, 4],
			headRefs: ['feature-two', 'feature-three'],
			availableNumbers: [6],
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
