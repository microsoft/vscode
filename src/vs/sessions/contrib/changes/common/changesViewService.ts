/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionChangesSummary, ISessionFileChange } from '../../../services/sessions/common/session.js';
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

export interface IChangesViewService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a service that reports on the session of `sessionResource` instead of the
	 * main window's active session, for a window or editor showing a different session. The
	 * changeset context keys are bound on `contextKeyService`.
	 */
	createScoped(sessionResource: IObservable<URI | undefined>, contextKeyService: IContextKeyService): IChangesViewService & IDisposable;

	/** The live services created by {@link createScoped}, for entries that must offer what any of them offers. */
	readonly scopedServicesObs: IObservable<readonly IChangesViewService[]>;

	/** The session this service reports on: the main window's active session, or the scoped one. */
	readonly activeSessionObs: IObservable<IActiveSession | undefined>;
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

	/** Selects the changeset of the session the main window shows, or of the session with `sessionResource`. */
	setChangesetId(changesetId: string | undefined, sessionResource?: URI): void;
	/** Shows `changeset` for the session the main window shows, or for the session with `sessionResource`. */
	showChangeset(changeset: ISessionChangeset, sessionResource?: URI): void;

	/**
	 * The changes of the selected, or default, changeset of the chat a session shows outside the main window, such as in
	 * a chat window. The `activeSession*` state is of the session the main window shows.
	 */
	getSessionChanges(sessionResource: URI): IObservable<readonly ISessionFileChange[]>;

	readonly viewModeObs: IObservable<ChangesViewMode>;
	setViewMode(mode: ChangesViewMode): void;
	setSectionCollapsed(sessionResource: URI, section: ChangesViewSection, collapsed: boolean): void;
	readonly detailsViewStateTransferObs: IObservable<IChangesDetailsViewStateTransfer | undefined>;
	getDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode): IChangesDetailsViewState | undefined;
	setDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode, state: IChangesDetailsViewState): void;

	setChangesetFilesReviewState(resources: readonly URI[], reviewed: boolean): void;
}
