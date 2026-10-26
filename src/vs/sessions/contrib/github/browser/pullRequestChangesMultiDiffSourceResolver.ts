/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache, ObservablePromise, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { createEditorOpenError, IResourceMultiDiffEditorInput, isEditorOpenError } from '../../../../workbench/common/editor.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IGitHubPullRequestRef } from '../../../services/sessions/common/session.js';
import { GitHubPullRequestState, IGitHubPullRequestChanges } from '../common/types.js';
import { toPRContentUri } from '../common/utils.js';
import { IGitHubService } from './githubService.js';

type PullRequestIdentity = Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>;

const PULL_REQUEST_CHANGES_SCHEME = 'sessions-pull-request-changes';

/**
 * Creates the multi-file diff editor input for a pull request's changes. The
 * {@link PullRequestChangesMultiDiffSourceResolver} supplies its files and title.
 */
export function createPullRequestChangesEditorInput(pullRequest: PullRequestIdentity): IResourceMultiDiffEditorInput {
	return {
		// GitHub owner and repository names are case-insensitive, so every entry point shares one editor per pull request.
		multiDiffSource: URI.from({ scheme: PULL_REQUEST_CHANGES_SCHEME, path: `/${pullRequest.owner.toLowerCase()}/${pullRequest.repo.toLowerCase()}/pull/${pullRequest.number}` }),
		// Matches the pull request overview editor's title while the changes load.
		label: `#${pullRequest.number}`,
		options: { pinned: true },
	};
}

function parsePullRequestChangesSource(uri: URI): PullRequestIdentity | undefined {
	if (uri.scheme !== PULL_REQUEST_CHANGES_SCHEME) {
		return undefined;
	}
	const [owner, repo, kind, number, ...rest] = uri.path.split('/').filter(Boolean);
	if (!owner || !repo || kind !== 'pull' || !/^[1-9][0-9]*$/.test(number ?? '') || rest.length > 0) {
		return undefined;
	}
	return { owner, repo, number: Number(number) };
}

/**
 * Matches the GitHub Pull Requests extension's overview editor title: the
 * number followed by the title, truncated near 20 characters on a word boundary.
 */
function getPullRequestEditorTitle(pullRequestNumber: number, title: string): string {
	const maxLength = 20;
	let truncated = title;
	if (title.length > maxLength) {
		const lastSpace = title.lastIndexOf(' ', maxLength);
		truncated = `${title.substring(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
	}
	return `#${pullRequestNumber} ${truncated}`;
}

/** Maps each changed file to remote `copilot-pr` content for both sides of its diff. */
function toMultiDiffEditorItems(pullRequest: PullRequestIdentity, changes: IGitHubPullRequestChanges): readonly MultiDiffEditorItem[] {
	return changes.files.map(file => {
		const params = { owner: pullRequest.owner, repo: pullRequest.repo, prNumber: pullRequest.number, status: file.status };
		return new MultiDiffEditorItem(
			file.status !== 'added'
				? toPRContentUri(file.previous_filename || file.filename, { ...params, commitSha: changes.baseSha, isBase: true, previousFileName: file.previous_filename })
				: undefined,
			file.status !== 'removed'
				? toPRContentUri(file.filename, { ...params, commitSha: changes.headSha, isBase: false })
				: undefined,
			undefined,
		);
	});
}

/**
 * Resolves a pull request's changes for the multi-file diff editor, so any entry
 * point can open them with {@link createPullRequestChangesEditorInput}. While the
 * editor is open, its files and title follow the shared pull request model.
 */
export class PullRequestChangesMultiDiffSourceResolver extends Disposable implements IWorkbenchContribution, IMultiDiffSourceResolver {

	static readonly ID = 'workbench.contrib.sessions.pullRequestChangesMultiDiffSourceResolver';

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return parsePullRequestChangesSource(uri) !== undefined;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const pullRequest = parsePullRequestChangesSource(uri)!;
		let initialChanges: IGitHubPullRequestChanges;
		try {
			initialChanges = await this._getChanges(pullRequest);
		} catch (error) {
			if (isCancellationError(error) || isEditorOpenError(error)) {
				throw error;
			}
			throw createEditorOpenError(localize('pullRequestChanges.loadFailed', "Could not load the changes of pull request #{0}: {1}", pullRequest.number, toErrorMessage(error)), [], { forceMessage: true });
		}

		// The editor observes these for its lifetime, which holds the shared model
		// reference and keeps it polling, so new head commits arrive even when the
		// session stops polling this pull request or tracks it under other casing.
		const model = derived(this, reader => {
			const pullRequestModel = reader.store.add(this._gitHubService.createPullRequestModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number)).object;
			// A stable boolean keeps poll results from restarting the poll loop.
			const shouldPoll = derived(this, pollReader => pullRequestModel.pullRequest.read(pollReader)?.state !== GitHubPullRequestState.Merged);
			reader.store.add(autorun(pollReader => {
				if (shouldPoll.read(pollReader)) {
					pollReader.store.add(pullRequestModel.startPolling());
				}
			}));
			return pullRequestModel;
		});
		const livePullRequest = derived(this, reader => model.read(reader).pullRequest.read(reader));
		const headSha = derived(this, reader => livePullRequest.read(reader)?.headSha);
		const baseRef = derived(this, reader => livePullRequest.read(reader)?.baseRef);
		const refresh = derived(this, reader => {
			const sha = headSha.read(reader);
			const base = baseRef.read(reader);
			if (!sha) {
				return undefined;
			}
			if (sha === initialChanges.headSha && (base === undefined || base === initialChanges.baseRef)) {
				return ObservablePromise.resolved<IGitHubPullRequestChanges | undefined>(initialChanges);
			}
			return new ObservablePromise(this._getChanges(pullRequest).catch(error => {
				this._logService.warn(`[PullRequestChanges] Keeping the loaded changes of ${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}; refreshing them for ${sha} failed.`, error);
				return undefined;
			}));
		});
		const changes = derivedObservableWithCache<IGitHubPullRequestChanges>(this, (reader, lastValue) =>
			refresh.read(reader)?.promiseResult.read(reader)?.data ?? lastValue ?? initialChanges);

		return {
			resources: new ValueWithChangeEventFromObservable(changes.map(value => toMultiDiffEditorItems(pullRequest, value))),
			// Shares the pull request pill's title, so renames show up without a new commit.
			label: new ValueWithChangeEventFromObservable(derived(this, reader =>
				getPullRequestEditorTitle(pullRequest.number, livePullRequest.read(reader)?.title ?? changes.read(reader).title))),
		};
	}

	private async _getChanges(pullRequest: PullRequestIdentity): Promise<IGitHubPullRequestChanges> {
		const changes = await this._gitHubService.getPullRequestChanges(pullRequest.owner, pullRequest.repo, pullRequest.number);
		if (changes.files.length !== changes.totalFileCount) {
			throw createEditorOpenError(localize('pullRequestChanges.incomplete', "Could not open pull request #{0} changes: GitHub returned {1} of {2} changed files.", pullRequest.number, changes.files.length, changes.totalFileCount), [], { forceMessage: true });
		}
		return changes;
	}
}
