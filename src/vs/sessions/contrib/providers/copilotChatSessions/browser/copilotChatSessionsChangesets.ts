/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedOpts, IObservable, ObservablePromise } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { GitDiffChange, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { gitHubInfoEqual, IChat, IGitHubInfo, ISessionChangeset, ISessionFileChange, ISessionWorkspace, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { toPRContentUri } from '../../../github/common/utils.js';

interface IChangesetResolver {
	resolve(firstCheckpointRef: string, lastCheckpointRef: string | undefined): Promise<IChatSessionFileChange2[] | undefined>;
}

class GitRepositoryChangesetResolver implements IChangesetResolver {
	private readonly _repositoryUriObs: IObservable<URI | undefined>;

	constructor(
		workspace: IObservable<ISessionWorkspace | undefined>,
		@IGitService private readonly _gitService: IGitService
	) {
		this._repositoryUriObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const gitRepository = workspace.read(reader)?.folders[0].gitRepository;
			return gitRepository?.workTreeUri ?? gitRepository?.uri;
		});
	}

	async resolve(firstCheckpointRef: string, lastCheckpointRef: string | undefined): Promise<IChatSessionFileChange2[] | undefined> {
		const repositoryUri = this._repositoryUriObs.get();
		if (!repositoryUri) {
			return undefined;
		}

		const repository = await this._gitService.openRepository(repositoryUri);

		const ref = lastCheckpointRef
			? `${firstCheckpointRef}..${lastCheckpointRef}`
			: firstCheckpointRef;

		const changes = await repository?.diffBetweenWithStats2(ref) ?? [];
		return toIChatSessionFileChange2(changes, firstCheckpointRef, lastCheckpointRef);
	}
}

class GitHubRepositoryChangesetResolver implements IChangesetResolver {
	private readonly _gitHubInfoObs: IObservable<IGitHubInfo | undefined>;

	constructor(
		workspace: IObservable<ISessionWorkspace | undefined>,
		@IGitHubService private readonly _gitHubService: IGitHubService
	) {
		this._gitHubInfoObs = derivedOpts({ equalsFn: gitHubInfoEqual }, reader => {
			const gitRepository = workspace.read(reader)?.folders[0].gitRepository;
			return gitRepository?.gitHubInfo.read(reader);
		});
	}

	async resolve(firstCheckpointRef: string, lastCheckpointRef: string): Promise<IChatSessionFileChange2[] | undefined> {
		const gitHubInfo = this._gitHubInfoObs.get();
		if (!gitHubInfo || !gitHubInfo.pullRequest?.number) {
			return undefined;
		}

		const params = {
			owner: gitHubInfo.owner,
			repo: gitHubInfo.repo,
			prNumber: gitHubInfo.pullRequest.number,
		} as const;

		const changes = await this._gitHubService.getChangedFiles(params.owner, params.repo, firstCheckpointRef, lastCheckpointRef);
		return changes.map(change => {
			const uri = toPRContentUri(change.filename, {
				...params,
				commitSha: lastCheckpointRef,
				status: change.status,
				isBase: false
			});

			const originalUri = change.status !== 'added'
				? toPRContentUri(change.previous_filename || change.filename, {
					...params,
					commitSha: firstCheckpointRef,
					previousFileName: change.previous_filename,
					status: change.status,
					isBase: true
				})
				: undefined;

			const modifiedUri = change.status !== 'removed'
				? uri
				: undefined;

			return {
				uri,
				originalUri,
				modifiedUri,
				insertions: change.additions,
				deletions: change.deletions
			} satisfies IChatSessionFileChange2;
		});
	}
}

export function createChangesets(
	sessionType: string,
	workspaceObs: IObservable<ISessionWorkspace | undefined>,
	chatsObs: IObservable<readonly IChat[]>,
	instantiationService: IInstantiationService,
): IObservable<readonly ISessionChangeset[]> {
	const changesetResolver = sessionType === AgentSessionProviders.Cloud
		? instantiationService.createInstance(GitHubRepositoryChangesetResolver, workspaceObs)
		: instantiationService.createInstance(GitRepositoryChangesetResolver, workspaceObs);

	const changesets: ISessionChangeset[] = [new BranchChangesChangeset(workspaceObs, chatsObs)];
	if (sessionType !== AgentSessionProviders.Cloud) {
		changesets.push(new UncommittedChangesChangeset(workspaceObs, chatsObs, changesetResolver));
	}

	changesets.push(new AllChangesChangeset(chatsObs, changesetResolver));
	changesets.push(new LastTurnChangesChangeset(chatsObs, changesetResolver));

	return constObservable(changesets);
}

/**
 * Common base for {@link ISessionChangeset} implementations.
 *
 * Changesets operate at the session level and derive everything they need
 * from the session's chats list (checkpoints, archived state, last-turn
 * end time). Subclasses that need session-level metadata not carried on
 * `IChat` (e.g. workspace / git repository info) take those as additional
 * constructor parameters.
 */
abstract class AbstractChangeset implements ISessionChangeset {
	abstract readonly id: string;
	abstract readonly label: string;
	abstract readonly description?: string;

	abstract readonly isEnabled: IObservable<boolean>;
	abstract readonly isDefault: IObservable<boolean>;

	abstract readonly isLoadingChanges: IObservable<boolean>;
	abstract readonly changes: IObservable<readonly ISessionFileChange[]>;
	abstract readonly originalCheckpointRef: IObservable<string | undefined>;
	abstract readonly modifiedCheckpointRef: IObservable<string | undefined>;

	constructor(protected readonly _chats: IObservable<readonly IChat[]>) { }
}

/**
 * Diff between a branch and its base (e.g. `main...feature`). Used for
 * PR-style review and "what changed on this branch" views. Expected to be
 * semi-static — refresh on new commits to either ref.
 */
export class BranchChangesChangeset extends AbstractChangeset {
	static readonly ID = 'branchChanges';

	readonly id = BranchChangesChangeset.ID;
	readonly label = localize('branchChanges', "Branch Changes");
	readonly description: string | undefined;
	readonly category = localize('changesCategory', "Changes");

	readonly isEnabled: IObservable<boolean>;
	readonly isDefault: IObservable<boolean>;

	readonly isLoadingChanges = constObservable(false);
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly originalCheckpointRef: IObservable<string | undefined>;
	readonly modifiedCheckpointRef = constObservable<string | undefined>(undefined);

	constructor(
		workspaceObs: IObservable<ISessionWorkspace | undefined>,
		chatsObs: IObservable<readonly IChat[]>,
	) {
		super(chatsObs);

		const gitRepository = workspaceObs.get()?.folders[0].gitRepository;
		const branchName = gitRepository?.branchName;
		const baseBranchName = gitRepository?.baseBranchName;

		this.description = branchName && baseBranchName
			? `${branchName} → ${baseBranchName}`
			: branchName;

		this.originalCheckpointRef = derived(reader => {
			return chatsObs.read(reader)[0]?.checkpoints.read(reader)?.firstCheckpointRef;
		});

		const isArchivedObs = derived(reader => chatsObs.read(reader)[0]?.isArchived.read(reader) === true);
		this.isDefault = derived(reader => !isArchivedObs.read(reader));
		this.isEnabled = derived(reader => !isArchivedObs.read(reader));

		this.changes = derived(reader => {
			return chatsObs.read(reader)[0]?.changes.read(reader) ?? [];
		});
	}
}

/**
 * Uncommitted changes in a session's working tree (index + working tree +
 * untracked + merge).
 */
export class UncommittedChangesChangeset extends AbstractChangeset {
	static readonly ID = 'uncommittedChanges';

	readonly id = UncommittedChangesChangeset.ID;
	readonly label = localize('uncommittedChanges', "Uncommitted Changes");
	readonly description = localize('uncommittedChangesDescription', "Show uncommitted changes in this session");
	readonly category = localize('changesCategory', "Changes");

	readonly isEnabled: IObservable<boolean>;
	readonly isDefault = constObservable(false);

	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly originalCheckpointRef = constObservable('HEAD');
	readonly modifiedCheckpointRef = constObservable<string | undefined>(undefined);

	constructor(
		workspaceObs: IObservable<ISessionWorkspace | undefined>,
		chatsObs: IObservable<readonly IChat[]>,
		changesetResolver: IChangesetResolver,
	) {
		super(chatsObs);

		this.isEnabled = derived(reader => chatsObs.read(reader)[0]?.isArchived.read(reader) !== true);

		const uncommittedChangesCountObs = derived(reader => {
			const gitRepository = workspaceObs.read(reader)?.folders[0].gitRepository;
			return gitRepository?.uncommittedChanges ?? 0;
		});

		const changesPromiseObs = derived(reader => {
			const originalCheckpointRef = this.originalCheckpointRef.read(reader);
			const modifiedCheckpointRef = this.modifiedCheckpointRef.read(reader);

			// Re-run when the number of uncommitted changes changes
			uncommittedChangesCountObs.read(reader);

			const diffPromise = changesetResolver.resolve(originalCheckpointRef, modifiedCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		this.isLoadingChanges = derived(reader => {
			return changesPromiseObs.read(reader).read(reader) === undefined;
		});

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			return changesPromiseObs.read(reader).read(reader) ?? [];
		});
	}
}

/**
 * Aggregate of every file the session has touched.
 */
export class AllChangesChangeset extends AbstractChangeset {
	static readonly ID = 'allChanges';

	readonly id = AllChangesChangeset.ID;
	readonly label = localize('allChanges', "All Changes");
	readonly description = localize('allChangesDescription', "Show all changes made in this session");
	readonly category = localize('checkpointsCategory', "Checkpoints");
	readonly isEnabled: IObservable<boolean>;
	readonly isDefault: IObservable<boolean>;

	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly originalCheckpointRef: IObservable<string | undefined>;
	readonly modifiedCheckpointRef: IObservable<string | undefined>;

	constructor(
		chatsObs: IObservable<readonly IChat[]>,
		changesetResolver: IChangesetResolver
	) {
		super(chatsObs);

		this.originalCheckpointRef = derived<string | undefined>(reader => {
			return chatsObs.read(reader)[0]?.checkpoints.read(reader)?.firstCheckpointRef;
		});

		this.modifiedCheckpointRef = derived<string | undefined>(reader => {
			const chats = chatsObs.read(reader);
			if (chats.length === 0) {
				return undefined;
			}

			if (chats.length === 1) {
				return chats[0].checkpoints.read(reader)?.lastCheckpointRef;
			}

			const chatsSortedByLastTurnEnd = chats.toSorted((chatA, chatB) => {
				const chatALastTurnEnd = chatA.lastTurnEnd.read(reader);
				const chatBLastTurnEnd = chatB.lastTurnEnd.read(reader);

				return sortDateDesc(chatALastTurnEnd, chatBLastTurnEnd);
			});

			return chatsSortedByLastTurnEnd[0].checkpoints.read(reader)?.lastCheckpointRef;
		});

		const changesPromiseObs = derived(reader => {
			const originalCheckpointRef = this.originalCheckpointRef.read(reader);
			const modifiedCheckpointRef = this.modifiedCheckpointRef.read(reader);

			if (!originalCheckpointRef || !modifiedCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = changesetResolver.resolve(originalCheckpointRef, modifiedCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		this.isLoadingChanges = derived(reader => {
			return changesPromiseObs.read(reader).read(reader) === undefined;
		});

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			return changesPromiseObs.read(reader).read(reader) ?? [];
		});

		this.isDefault = derived(reader => chatsObs.read(reader)[0]?.isArchived.read(reader) === true);

		this.isEnabled = derived(reader =>
			this.originalCheckpointRef.read(reader) !== undefined &&
			this.modifiedCheckpointRef.read(reader) !== undefined);
	}
}

/**
 * Files touched by the most recent agent turn.
 */
export class LastTurnChangesChangeset extends AbstractChangeset {
	static readonly ID = 'lastTurnChanges';

	readonly id = LastTurnChangesChangeset.ID;
	readonly label = localize('lastTurnChanges', "Last Turn Changes");
	readonly description = localize('lastTurnChangesDescription', "Show only changes made in the last turn");
	readonly category = localize('checkpointsCategory', "Checkpoints");

	readonly isEnabled: IObservable<boolean>;
	readonly isDefault = constObservable(false);

	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly originalCheckpointRef: IObservable<string | undefined>;
	readonly modifiedCheckpointRef: IObservable<string | undefined>;

	constructor(
		chatsObs: IObservable<readonly IChat[]>,
		changesetResolver: IChangesetResolver
	) {
		super(chatsObs);

		this.modifiedCheckpointRef = derived(reader => {
			const chats = chatsObs.read(reader);
			if (chats.length === 0) {
				return undefined;
			}

			if (chats.length === 1) {
				return chats[0].checkpoints.read(reader)?.lastCheckpointRef;
			}

			const chatsSortedByLastTurnEnd = chats.toSorted((chatA, chatB) => {
				const chatALastTurnEnd = chatA.lastTurnEnd.read(reader);
				const chatBLastTurnEnd = chatB.lastTurnEnd.read(reader);

				return sortDateDesc(chatALastTurnEnd, chatBLastTurnEnd);
			});

			return chatsSortedByLastTurnEnd[0].checkpoints.read(reader)?.lastCheckpointRef;
		});

		this.originalCheckpointRef = derived(reader => {
			const modifiedCheckpointRef = this.modifiedCheckpointRef.read(reader);
			return modifiedCheckpointRef ? `${modifiedCheckpointRef}^` : undefined;
		});

		const changesPromiseObs = derived(reader => {
			const originalCheckpointRef = this.originalCheckpointRef.read(reader);
			const modifiedCheckpointRef = this.modifiedCheckpointRef.read(reader);

			if (!originalCheckpointRef || !modifiedCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = changesetResolver.resolve(originalCheckpointRef, modifiedCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		this.isLoadingChanges = derived(reader => {
			return changesPromiseObs.read(reader).read(reader) === undefined;
		});

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			return changesPromiseObs.read(reader).read(reader) ?? [];
		});

		this.isEnabled = derived(reader =>
			this.originalCheckpointRef.read(reader) !== undefined &&
			this.modifiedCheckpointRef.read(reader) !== undefined);
	}
}

function sortDateDesc(dateA: Date | undefined, dateB: Date | undefined): number {
	const chatALastTurnEnd = dateA?.getTime();
	const chatBLastTurnEnd = dateB?.getTime();

	if (!chatALastTurnEnd && !chatBLastTurnEnd) {
		return 0;
	}

	if (!chatALastTurnEnd) {
		return 1;
	}

	if (!chatBLastTurnEnd) {
		return -1;
	}

	return chatBLastTurnEnd - chatALastTurnEnd;
}

function toIChatSessionFileChange2(changes: GitDiffChange[], originalRef: string | undefined, modifiedRef: string | undefined): IChatSessionFileChange2[] {
	return changes.map(change => ({
		uri: change.uri,
		originalUri: change.originalUri
			? originalRef
				? change.originalUri.with({ scheme: 'git', query: JSON.stringify({ path: change.originalUri.fsPath, ref: originalRef }) })
				: change.originalUri
			: undefined,
		modifiedUri: change.modifiedUri
			? modifiedRef
				? change.modifiedUri.with({ scheme: 'git', query: JSON.stringify({ path: change.modifiedUri.fsPath, ref: modifiedRef }) })
				: change.modifiedUri
			: undefined,
		insertions: change.insertions,
		deletions: change.deletions,
	} satisfies IChatSessionFileChange2));
}
