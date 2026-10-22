/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromValueWithChangeEvent, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { isEditorOpenError } from '../../../../../workbench/common/editor.js';
import { MultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { createPullRequestChangesEditorInput, PullRequestChangesMultiDiffSourceResolver } from '../../browser/pullRequestChangesMultiDiffSourceResolver.js';
import { GitHubPullRequestState, IGitHubPullRequest, IGitHubPullRequestChanges } from '../../common/types.js';
import { parsePRContentUri } from '../../common/utils.js';

suite('PullRequestChangesMultiDiffSourceResolver', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const pullRequest = { owner: 'upstream', repo: 'project', number: 7 };

	function side(resource: URI | undefined): string | undefined {
		const content = resource && parsePRContentUri(resource);
		return content && `${content.fileName}@${content.commitSha}`;
	}

	class TestGitHubService extends mock<IGitHubService>() {
		readonly requested: unknown[][] = [];
		readonly livePullRequest = observableValue<IGitHubPullRequest | undefined>('pullRequest', undefined);
		readonly references = { acquired: 0, released: 0 };
		readonly polling = { started: 0, stopped: 0 };

		constructor(private readonly _getChanges: () => IGitHubPullRequestChanges) {
			super();
		}

		override async getPullRequestChanges(...args: unknown[]): Promise<IGitHubPullRequestChanges> {
			this.requested.push(args);
			return this._getChanges();
		}

		override createPullRequestModelReference(): IReference<GitHubPullRequestModel> {
			this.references.acquired++;
			return {
				object: upcastPartial<GitHubPullRequestModel>({
					pullRequest: this.livePullRequest,
					startPolling: () => {
						this.polling.started++;
						return toDisposable(() => this.polling.stopped++);
					},
				}),
				dispose: () => this.references.released++,
			};
		}
	}

	function createResolver(gitHubService: IGitHubService) {
		const resolverService = new MultiDiffSourceResolverService();
		const resolver = store.add(new PullRequestChangesMultiDiffSourceResolver(gitHubService, resolverService, new NullLogService()));
		return { resolver, resolverService };
	}

	test('resolves a pull request into its changes and follows its head commit and title', async () => {
		const changesByHead: Record<string, IGitHubPullRequestChanges> = {
			'head-1': {
				title: 'Open pull request changes in a multi diff editor',
				baseRef: 'main',
				baseSha: 'merge-base',
				headSha: 'head-1',
				totalFileCount: 3,
				files: [
					{ filename: 'added.ts', previous_filename: undefined, status: 'added', additions: 1, deletions: 0 },
					{ filename: 'new-name.ts', previous_filename: 'old-name.ts', status: 'renamed', additions: 1, deletions: 1 },
					{ filename: 'removed.ts', previous_filename: undefined, status: 'removed', additions: 0, deletions: 1 },
				],
			},
			'head-2': {
				title: 'Fix typo',
				baseRef: 'main',
				baseSha: 'merge-base-2',
				headSha: 'head-2',
				totalFileCount: 1,
				files: [{ filename: 'app.ts', previous_filename: undefined, status: 'modified', additions: 1, deletions: 1 }],
			},
		};
		let head = 'head-1';
		const gitHubService = new TestGitHubService(() => changesByHead[head]);
		const { resolver, resolverService } = createResolver(gitHubService);
		const source = createPullRequestChangesEditorInput(pullRequest).multiDiffSource!;

		const resolved = (await resolverService.resolve(source))!;
		const resources = observableFromValueWithChangeEvent(undefined, resolved.resources);
		const label = observableFromValueWithChangeEvent(undefined, resolved.label!);
		const observing = new DisposableStore();
		observing.add(autorun(reader => {
			resources.read(reader);
			label.read(reader);
		}));
		const snapshot = () => ({
			label: label.get(),
			files: resources.get().map(item => [side(item.originalUri), side(item.modifiedUri)]),
		});

		const initial = snapshot();
		// Partial pull request data without a base ref keeps the loaded changes.
		gitHubService.livePullRequest.set(upcastPartial<IGitHubPullRequest>({ headSha: 'head-1', title: 'Open pull request changes in a multi diff editor' }), undefined);
		// The polled shared model reports a new head commit and title.
		head = 'head-2';
		gitHubService.livePullRequest.set(upcastPartial<IGitHubPullRequest>({ headSha: 'head-2', title: 'Fix typo' }), undefined);
		await waitForState(resources, items => items.length === 1);
		const updated = snapshot();
		gitHubService.livePullRequest.set(upcastPartial<IGitHubPullRequest>({ headSha: 'head-2', title: 'Fix typo', state: GitHubPullRequestState.Merged }), undefined);
		const pollingAfterMerge = { ...gitHubService.polling };
		observing.dispose();

		assert.deepStrictEqual({
			source: source.toString(true),
			sourceIgnoresCasing: createPullRequestChangesEditorInput({ owner: 'UpStream', repo: 'Project', number: 7 }).multiDiffSource!.toString() === source.toString(),
			canHandle: [source, source.with({ path: '/upstream/project/pull/latest' }), URI.parse('multi-diff-editor:/upstream/project/pull/7')].map(uri => resolver.canHandleUri(uri)),
			requested: gitHubService.requested,
			initial,
			updated,
			pollingAfterMerge,
			references: gitHubService.references,
		}, {
			source: 'sessions-pull-request-changes:/upstream/project/pull/7',
			sourceIgnoresCasing: true,
			canHandle: [true, false, false],
			requested: [['upstream', 'project', 7], ['upstream', 'project', 7]],
			initial: {
				label: '#7 Open pull request...',
				files: [
					[undefined, 'added.ts@head-1'],
					['old-name.ts@merge-base', 'new-name.ts@head-1'],
					['removed.ts@merge-base', undefined],
				],
			},
			updated: {
				label: '#7 Fix typo',
				files: [['app.ts@merge-base-2', 'app.ts@head-2']],
			},
			pollingAfterMerge: { started: 1, stopped: 1 },
			references: { acquired: 1, released: 1 },
		});
	});

	test('refreshes the diff when the pull request is retargeted without a new head commit', async () => {
		const initialChanges: IGitHubPullRequestChanges = {
			title: 'Retargeted pull request', baseRef: 'main', baseSha: 'main-base', headSha: 'head', totalFileCount: 1,
			files: [{ filename: 'app.ts', previous_filename: undefined, status: 'modified', additions: 1, deletions: 1 }],
		};
		let changes = initialChanges;
		const gitHubService = new TestGitHubService(() => changes);
		gitHubService.livePullRequest.set(upcastPartial<IGitHubPullRequest>({ headSha: 'head', baseRef: 'main' }), undefined);
		const { resolverService } = createResolver(gitHubService);
		const resolved = (await resolverService.resolve(createPullRequestChangesEditorInput(pullRequest).multiDiffSource!))!;
		const resources = observableFromValueWithChangeEvent(undefined, resolved.resources);
		const observing = store.add(autorun(reader => resources.read(reader)));

		changes = { ...initialChanges, baseRef: 'release', baseSha: 'release-base' };
		gitHubService.livePullRequest.set(upcastPartial<IGitHubPullRequest>({ headSha: 'head', baseRef: 'release' }), undefined);
		await waitForState(resources, items => side(items[0].originalUri) === 'app.ts@release-base');
		const retargeted = resources.get().map(item => [side(item.originalUri), side(item.modifiedUri)]);
		gitHubService.livePullRequest.set(upcastPartial<IGitHubPullRequest>({ headSha: 'head', baseRef: 'main' }), undefined);
		await waitForState(resources, items => side(items[0].originalUri) === 'app.ts@main-base');
		const restored = resources.get().map(item => [side(item.originalUri), side(item.modifiedUri)]);
		observing.dispose();

		assert.deepStrictEqual({ retargeted, restored, requests: gitHubService.requested, references: gitHubService.references }, {
			retargeted: [['app.ts@release-base', 'app.ts@head']],
			restored: [['app.ts@main-base', 'app.ts@head']],
			requests: [['upstream', 'project', 7], ['upstream', 'project', 7]],
			references: { acquired: 1, released: 1 },
		});
	});

	test('reports load failures and incomplete file lists in the editor', async () => {
		const results: unknown[] = [];
		for (const getChanges of [
			(): IGitHubPullRequestChanges => { throw new Error('Not found'); },
			(): IGitHubPullRequestChanges => ({
				title: 'Large pull request', baseRef: 'main', baseSha: 'base', headSha: 'head', totalFileCount: 3001,
				files: Array.from({ length: 3000 }, (_, index) => ({ filename: `file-${index}.ts`, previous_filename: undefined, status: 'added' as const, additions: 1, deletions: 0 })),
			}),
		]) {
			const { resolverService } = createResolver(new TestGitHubService(getChanges));
			try {
				await resolverService.resolve(createPullRequestChangesEditorInput(pullRequest).multiDiffSource!);
				results.push('resolved');
			} catch (error) {
				results.push({ message: error instanceof Error ? error.message : error, forceMessage: isEditorOpenError(error) && error.forceMessage });
			}
		}

		assert.deepStrictEqual(results, [
			{ message: 'Could not load the changes of pull request #7: Not found', forceMessage: true },
			{ message: 'Could not open pull request #7 changes: GitHub returned 3000 of 3001 changed files.', forceMessage: true },
		]);
	});
});
