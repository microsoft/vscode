/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChat, ISession, ISessionChangeset, ISessionChangesetOperation, ISessionChangesSummary, ISessionFileChange } from '../../../services/sessions/common/session.js';
import { IHostSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ChangesViewMode, IsolationMode } from './changes.js';

export interface ActiveSessionState {
	readonly isolationMode: IsolationMode;
	readonly hasGitRepository: boolean;
	readonly branchName: string | undefined;
	readonly baseBranchName: string | undefined;
	readonly upstreamBranchName: string | undefined;
	readonly isMergeBaseBranchProtected: boolean | undefined;
	readonly incomingChanges: number | undefined;
	readonly outgoingChanges: number | undefined;
	readonly uncommittedChanges: number | undefined;
	readonly hasBranchChanges: boolean | undefined;
	readonly hasGitHubRemote: boolean | undefined;
	readonly hasPullRequest: boolean | undefined;
	readonly hasOpenPullRequest: boolean | undefined;
	readonly hasGitOperationInProgress: boolean | undefined;
}

export const IChangesViewService = createDecorator<IChangesViewService>('changesViewService');

/**
 * Resolves the changeset shown when there is no explicit selection: the
 * changeset marked as default, otherwise the first enabled changeset.
 */
export function findDefaultChangeset(changesets: readonly ISessionChangeset[], reader: IReader): ISessionChangeset | undefined {
	return changesets.find(c => c.isDefault.read(reader))
		?? changesets.find(c => c.isEnabled.read(reader));
}

export interface IChangesViewSectionCollapseState {
	readonly checks: boolean;
}

export type ChangesViewSection = keyof IChangesViewSectionCollapseState;

export interface IChangesDetailsViewState {
	readonly focus: readonly string[];
	readonly selection: readonly string[];
	readonly expanded: Readonly<Record<string, 0 | 1>>;
	readonly scrollTop: number;
}

export interface IChangesDetailsViewStateTransfer {
	readonly from: URI;
	readonly to: URI;
}

/** Observables describing the changes of one session. */
export interface IChangesSessionObservables {
	readonly resourceObs: IObservable<URI | undefined>;
	readonly typeObs: IObservable<string | undefined>;
	readonly isVirtualWorkspaceObs: IObservable<boolean>;
	readonly hasGitRepositoryObs: IObservable<boolean>;
	readonly reviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly agentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly changesetsLoadingObs: IObservable<boolean>;
	readonly changesetsObs: IObservable<readonly ISessionChangeset[] | undefined>;
	readonly changesetObs: IObservable<ISessionChangeset | undefined>;
	readonly changesetLoadingObs: IObservable<boolean>;
	readonly changesetOperationsObs: IObservable<readonly ISessionChangesetOperation[]>;
	readonly changesObs: IObservable<readonly ISessionFileChange[]>;
	readonly loadingObs: IObservable<boolean>;
	readonly changesSummaryObs: IObservable<ISessionChangesSummary | undefined>;
	readonly sectionCollapseStateObs: IObservable<IChangesViewSectionCollapseState>;
	readonly stateObs: IObservable<ActiveSessionState | undefined>;
}

/** The session a changes view or actions bar acts on, with that session's changes observables. */
export interface IChangesSessionScope {
	readonly session: IObservable<IHostSession | undefined>;
	/** The chat the host shows of {@link session}. */
	readonly chat: IObservable<IChat | undefined>;
	readonly changes: IChangesSessionObservables;
	/** Whether the session is that of the main window, whose workspace is mounted and whose keys are bound globally. */
	readonly isMainWindow: boolean;
}

/** The changes observables of the active session, assembled from the service's `activeSession*` observables. */
export function getActiveSessionChanges(service: IChangesViewService): IChangesSessionObservables {
	return {
		resourceObs: service.activeSessionResourceObs,
		typeObs: service.activeSessionTypeObs,
		isVirtualWorkspaceObs: service.activeSessionIsVirtualWorkspaceObs,
		hasGitRepositoryObs: service.activeSessionHasGitRepositoryObs,
		reviewCommentCountByFileObs: service.activeSessionReviewCommentCountByFileObs,
		agentFeedbackCountByFileObs: service.activeSessionAgentFeedbackCountByFileObs,
		changesetsLoadingObs: service.activeSessionChangesetsLoadingObs,
		changesetsObs: service.activeSessionChangesetsObs,
		changesetObs: service.activeSessionChangesetObs,
		changesetLoadingObs: service.activeSessionChangesetLoadingObs,
		changesetOperationsObs: service.activeSessionChangesetOperationsObs,
		changesObs: service.activeSessionChangesObs,
		loadingObs: service.activeSessionLoadingObs,
		changesSummaryObs: service.activeSessionChangesSummaryObs,
		sectionCollapseStateObs: service.activeSessionSectionCollapseStateObs,
		stateObs: service.activeSessionStateObs,
	};
}

/**
 * The changes observables of `chat` of `session`, else of its main chat, using the cheaper ones of the active session when
 * `active`, the session and chat they are of, shows them: the same session, and the same chat unless none is given.
 */
export function getChangesOfSession(service: IChangesViewService, active: { readonly session: IHostSession | undefined; readonly chat: IChat | undefined }, session: ISession, chat?: IChat): IChangesSessionObservables {
	return session === active.session && (!chat || chat === active.chat)
		? getActiveSessionChanges(service)
		: service.getSessionChanges(constObservable(session), constObservable(chat ?? session.mainChat.get()));
}

export interface IChangesViewService {
	readonly _serviceBrand: undefined;

	/** Creates the changes observables for the given session; the `activeSession*` observables are this over the active session. */
	/**
	 * The changes of `chatObs` of a session: such as for a Changes editor, which shows the changes of its own chat whichever
	 * chat is active.
	 */
	getSessionChanges(sessionObs: IObservable<ISession | undefined>, chatObs: IObservable<IChat | undefined>): IChangesSessionObservables;

	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionIsVirtualWorkspaceObs: IObservable<boolean>;
	readonly activeSessionChangesObs: IObservable<readonly ISessionFileChange[]>;
	readonly activeSessionChangesSummaryObs: IObservable<ISessionChangesSummary | undefined>;
	readonly activeSessionChangesetsObs: IObservable<readonly ISessionChangeset[] | undefined>;
	readonly activeSessionChangesetsLoadingObs: IObservable<boolean>;
	readonly activeSessionChangesetObs: IObservable<ISessionChangeset | undefined>;
	readonly activeSessionChangesetLoadingObs: IObservable<boolean>;
	readonly activeSessionChangesetOperationsObs: IObservable<readonly ISessionChangesetOperation[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionStateObs: IObservable<ActiveSessionState | undefined>;
	readonly activeSessionLoadingObs: IObservable<boolean>;
	readonly activeSessionSectionCollapseStateObs: IObservable<IChangesViewSectionCollapseState>;

	/** Selects the changeset of `chat` of `session`, which default to those of the main window. */
	setChangesetId(changesetId: string | undefined, session?: IHostSession, chat?: IChat): void;
	/** Shows a transient changeset in `chat` of `session`, which default to those of the main window. */
	showChangeset(changeset: ISessionChangeset, session?: IHostSession, chat?: IChat): void;

	readonly viewModeObs: IObservable<ChangesViewMode>;
	setViewMode(mode: ChangesViewMode): void;
	setSectionCollapsed(sessionResource: URI, section: ChangesViewSection, collapsed: boolean): void;
	readonly detailsViewStateTransferObs: IObservable<IChangesDetailsViewStateTransfer | undefined>;
	getDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode): IChangesDetailsViewState | undefined;
	setDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode, state: IChangesDetailsViewState): void;

	/** Sets the review state of files of the selected changeset of `session`, which defaults to the active session. */
	setChangesetFilesReviewState(resources: readonly URI[], reviewed: boolean, session?: ISession, chat?: IChat): void;
}
