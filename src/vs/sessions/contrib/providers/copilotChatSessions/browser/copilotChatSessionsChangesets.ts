/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedOpts, IObservable, ObservablePromise } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { BRANCH_CHANGES_CHANGESET_ID, gitHubInfoEqual, IChat, IGitHubInfo, ISessionChangeset, ISessionChangesetOperation, ISessionChangesetOperationTarget, ISessionFileChange, ISessionWorkspace, sessionFileChangesEqual } from '../../../../services/sessions/common/session.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { toPRContentUri } from '../../../github/common/utils.js';

type IChangesetChat = Pick<IChat, 'changes' | 'checkpoints' | 'isArchived'>;

interface IChangesetResolver {
	resolve(firstCheckpointRef: string, lastCheckpointRef: string): Promise<IChatSessionFileChange2[] | undefined>;
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
	workspaceObs: IObservable<ISessionWorkspace | undefined>,
	chatsObs: IObservable<readonly IChangesetChat[]>,
	instantiationService: IInstantiationService,
): IObservable<readonly ISessionChangeset[]> {
	const changesetResolver = instantiationService.createInstance(GitHubRepositoryChangesetResolver, workspaceObs);

	return constObservable([
		new BranchChangesChangeset(workspaceObs, chatsObs),
		new AllChangesChangeset(chatsObs, changesetResolver),
		new LastTurnChangesChangeset(chatsObs, changesetResolver),
	]);
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

	readonly operations = constObservable<readonly ISessionChangesetOperation[]>([]);

	constructor(protected readonly _chats: IObservable<readonly IChangesetChat[]>) { }

	async invokeOperation(_operationId: string, _target?: ISessionChangesetOperationTarget): Promise<void> {
		// No-op: copilot chat changesets do not advertise server-driven operations.
	}
}

/**
 * Diff between a branch and its base (e.g. `main...feature`). Used for
 * PR-style review and "what changed on this branch" views. Expected to be
 * semi-static — refresh on new commits to either ref.
 */
export class BranchChangesChangeset extends AbstractChangeset {
	static readonly ID = BRANCH_CHANGES_CHANGESET_ID;

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
		chatsObs: IObservable<readonly IChangesetChat[]>,
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
		chatsObs: IObservable<readonly IChangesetChat[]>,
		changesetResolver: IChangesetResolver
	) {
		super(chatsObs);

		this.originalCheckpointRef = derived<string | undefined>(reader => {
			return chatsObs.read(reader)[0]?.checkpoints.read(reader)?.firstCheckpointRef;
		});

		this.modifiedCheckpointRef = derived<string | undefined>(reader => {
			return chatsObs.read(reader)[0]?.checkpoints.read(reader)?.lastCheckpointRef;
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
		chatsObs: IObservable<readonly IChangesetChat[]>,
		changesetResolver: IChangesetResolver
	) {
		super(chatsObs);

		this.modifiedCheckpointRef = derived(reader => {
			return chatsObs.read(reader)[0]?.checkpoints.read(reader)?.lastCheckpointRef;
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
