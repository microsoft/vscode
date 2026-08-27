/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFileChange } from '../../../services/sessions/common/session.js';
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

	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionIsVirtualWorkspaceObs: IObservable<boolean>;
	readonly activeSessionChangesObs: IObservable<readonly ISessionFileChange[]>;
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

	setChangesetId(changesetId: string | undefined): void;
	showChangeset(changeset: ISessionChangeset): void;

	readonly viewModeObs: IObservable<ChangesViewMode>;
	setViewMode(mode: ChangesViewMode): void;
	setSectionCollapsed(sessionResource: URI, section: ChangesViewSection, collapsed: boolean): void;
	readonly detailsViewStateTransferObs: IObservable<IChangesDetailsViewStateTransfer | undefined>;
	getDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode): IChangesDetailsViewState | undefined;
	setDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode, state: IChangesDetailsViewState): void;

	setChangesetFilesReviewState(resources: readonly URI[], reviewed: boolean): void;
}
