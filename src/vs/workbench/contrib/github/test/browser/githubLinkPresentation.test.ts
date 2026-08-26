/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILinkPresentationProvider, ILinkPresentationProviderRegistration, ILinkPresentationService } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IGitHubService } from '../../../../../platform/github/common/githubService.js';
import { GitHubIssue, GitHubRepository } from '../../../../../platform/github/common/githubQueryService.js';
import { FragmentState, PullRequestSnapshot } from '../../../../../platform/github/common/githubPullRequestService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { GitHubLinkPresentationContribution } from '../../browser/githubLinkPresentation.contribution.js';

suite('GitHub link presentations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('maps shared GitHub resources to accessible link presentations', async () => {
		const linkPresentationService = new TestLinkPresentationService();
		const hydrationBatches: string[][] = [];
		store.add(new GitHubLinkPresentationContribution(
			createGitHubService(resources => hydrationBatches.push(resources.map(resource => resource.kind))),
			linkPresentationService,
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override resolveGitHubUrl(path: string): string {
					return `https://github.com/${path}`;
				}
			}(),
			new NullLogService(),
		));

		const resources = [
			URI.parse('https://github.com/microsoft/vscode'),
			URI.parse('https://github.com/microsoft/vscode/issues/7'),
			URI.parse('https://github.com/microsoft/vscode/pull/8'),
		];
		const watchers = resources.map(resource => store.add(linkPresentationService.createWatcher(resource)));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			hydrationBatches,
			presentations: watchers.map(watcher => watcher.presentation.get()),
		}, {
			hydrationBatches: [['repository', 'issue']],
			presentations: [{
				kind: 'repository',
				detail: 'TypeScript · 170k stars',
				tooltip: 'microsoft/vscode',
				ariaLabel: 'GitHub repository microsoft slash vscode',
			},
			{
				kind: 'issue',
				title: 'Issue title',
				reference: '#7',
				status: { kind: 'notPlanned', label: 'Not planned' },
				tooltip: 'microsoft/vscode#7 · Not planned',
				ariaLabel: 'Issue microsoft slash vscode number 7, Not planned: Issue title',
			},
			{
				kind: 'pullRequest',
				title: 'Pull request title',
				reference: '#8',
				status: { kind: 'open', label: 'Open' },
				secondaryStatus: { kind: 'error', label: 'Checks failed' },
				tooltip: 'microsoft/vscode#8 · Open · Checks failed',
				ariaLabel: 'Pull request microsoft slash vscode number 8, Open, Checks failed: Pull request title',
			}],
		});
	});

	test('re-registers providers when the default account changes', () => {
		const linkPresentationService = new TestLinkPresentationService();
		const onDidChangeDefaultAccount = store.add(new Emitter<IDefaultAccount | null>());
		let authority = 'github.com';
		store.add(new GitHubLinkPresentationContribution(
			createGitHubService(() => { }),
			linkPresentationService,
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
				override resolveGitHubUrl(path: string): string {
					return `https://${authority}/${path}`;
				}
			}(),
			new NullLogService(),
		));

		const before = linkPresentationService.hasProvider(URI.parse('https://github.com/microsoft/vscode/issues/1'));
		authority = 'github.example.com';
		onDidChangeDefaultAccount.fire(null);

		assert.deepStrictEqual({
			before,
			oldAuthority: linkPresentationService.hasProvider(URI.parse('https://github.com/microsoft/vscode/issues/1')),
			newAuthority: linkPresentationService.hasProvider(URI.parse('https://github.example.com/microsoft/vscode/issues/1')),
		}, {
			before: true,
			oldAuthority: false,
			newAuthority: true,
		});
	});
});

class TestLinkPresentationService extends mock<ILinkPresentationService>() {

	private readonly _providers: { readonly registration: ILinkPresentationProviderRegistration; readonly provider: ILinkPresentationProvider }[] = [];

	override registerLinkPresentationProvider(registration: ILinkPresentationProviderRegistration, provider: ILinkPresentationProvider): IDisposable {
		if (this._providers.some(candidate => candidate.registration.id === registration.id)) {
			throw new Error(`Duplicate provider '${registration.id}'.`);
		}
		const entry = { registration, provider };
		this._providers.push(entry);
		return toDisposable(() => {
			const index = this._providers.indexOf(entry);
			if (index >= 0) {
				this._providers.splice(index, 1);
			}
		});
	}

	createWatcher(resource: URI) {
		const value = resource.toString(true);
		const entry = this._providers.find(candidate => candidate.registration.uriPattern.test(value));
		assert.ok(entry);
		return entry.provider.createLinkPresentationWatcher(resource);
	}

	hasProvider(resource: URI): boolean {
		const value = resource.toString(true);
		return this._providers.some(candidate => candidate.registration.uriPattern.test(value));
	}
}

function createGitHubService(onHydrate: (resources: Parameters<IGitHubService['query']['hydrateResources']>[0]) => void): IGitHubService {
	const ready = <T>(value: T): FragmentState<T> => ({ value, status: 'ready', complete: true });
	const missing: FragmentState<never> = { status: 'missing', complete: false };
	const pullRequestSnapshot: PullRequestSnapshot = {
		ref: { host: 'api.github.com', accountId: '1', owner: 'microsoft', repo: 'vscode', number: 8 },
		generation: 1,
		headGeneration: 1,
		core: ready({
			repositoryNameWithOwner: 'microsoft/vscode',
			number: 8,
			title: 'Pull request title',
			url: 'https://github.com/microsoft/vscode/pull/8',
			state: 'open',
			draft: false,
			headSha: 'head',
			headRef: 'feature',
			baseSha: 'base',
			baseRef: 'main',
		}),
		topLevelComments: missing,
		submittedReviews: missing,
		inlineComments: missing,
		reviewThreads: missing,
		checks: ready({
			headSha: 'head',
			checks: [{
				id: 'check',
				type: 'checkRun',
				name: 'test',
				status: 'COMPLETED',
				conclusion: 'FAILURE',
			}, {
				id: 'status',
				type: 'statusContext',
				name: 'status',
				status: 'SUCCESS',
			}],
			requirednessComplete: true,
			expectedSuites: [],
			expectedSuitesComplete: true,
		}),
		mergeability: missing,
		participants: missing,
	};

	return new class extends mock<IGitHubService>() {
		override readonly credentials = {
			onDidInvalidate: Event.None,
			getCredential: async () => ({
				account: { host: 'api.github.com', accountId: '1' },
				token: 'token',
				generation: 1,
				signal: new AbortController().signal,
			}),
			resolveCredential: async () => { throw new Error('Not implemented'); },
			handleRequestError: () => { },
		};
		override readonly query = new class extends mock<IGitHubService['query']>() {
			override async hydrateResources(resources: Parameters<IGitHubService['query']['hydrateResources']>[0]): Promise<void> {
				onHydrate(resources);
			}
			override subscribeRepository(ref: Parameters<IGitHubService['query']['subscribeRepository']>[0]) {
				return {
					resource: {
						ref,
						state: observableValue('repository', ready<GitHubRepository>({
							owner: { login: 'microsoft' },
							name: 'vscode',
							nameWithOwner: 'microsoft/vscode',
							language: 'TypeScript',
							stars: 170_000,
							defaultBranch: 'main',
							private: false,
							description: '',
							url: 'https://github.com/microsoft/vscode',
							archived: false,
							fork: false,
						})),
					},
					update: () => { },
					refresh: async () => { },
					dispose: () => { },
				};
			}
			override subscribeIssue(ref: Parameters<IGitHubService['query']['subscribeIssue']>[0]) {
				return {
					resource: {
						ref,
						state: observableValue('issue', ready<GitHubIssue>({
							number: 7,
							title: 'Issue title',
							body: '',
							url: 'https://github.com/microsoft/vscode/issues/7',
							state: 'closed',
							stateReason: 'not_planned',
							author: { login: 'author' },
							assignees: [],
							labels: [],
							createdAt: '2026-08-18T00:00:00Z',
							updatedAt: '2026-08-18T00:00:00Z',
						})),
					},
					update: () => { },
					refresh: async () => { },
					dispose: () => { },
				};
			}
		}();
		override readonly pullRequests = new class extends mock<IGitHubService['pullRequests']>() {
			override subscribePullRequest() {
				return {
					resource: {
						ref: pullRequestSnapshot.ref,
						snapshot: observableValue('pullRequest', pullRequestSnapshot),
					},
					update: () => { },
					refresh: async () => { },
					dispose: () => { },
				};
			}
		}();
	}();
}
