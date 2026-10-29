/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatQuestion, IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../workbench/contrib/chat/common/chat.js';
import { AgentHostPullRequestOperationId } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { getGitHubPullRequestRefs, getSessionOwnedGitHubPullRequestRefs, IGitHubPullRequestRef, ISession, ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope, SessionChangesetOperationStatus } from '../../../services/sessions/common/session.js';
import { getSessionGitHubReferences } from '../../github/common/sessionGitHubReferences.js';

export const IInboxNotificationsService = createDecorator<IInboxNotificationsService>('sessionsInboxNotificationsService');

export const enum InboxNotificationPriority {
	Now = 0,
	Next = 1,
	Later = 2,
}

export const enum InboxNotificationKind {
	ConfirmationRequested = 'confirmationRequested',
	NeedsInput = 'needsInput',
	FailingCI = 'failingCi',
	PassingCI = 'passingCi',
	PullRequestMerged = 'pullRequestMerged',
	ReviewComments = 'reviewComments',
	Completed = 'completed',
	External = 'external',
}

export const enum InboxNotificationsSortMode {
	Priority = 'priority',
	Recency = 'recency',
}

export const enum InboxNotificationActionKind {
	OpenSession = 'openSession',
	MarkDone = 'markDone',
	AgentMergeFixCI = 'agentMergeFixCI',
	AgentMergeAddressReviews = 'agentMergeAddressReviews',
	AgentMergeMergePullRequest = 'agentMergeMergePullRequest',
	ArchiveSession = 'archiveSession',
	DeleteSession = 'deleteSession',
	Dismiss = 'dismiss',
	Command = 'command',
}

export interface IInboxNotificationAction {
	readonly id: string;
	readonly label: string;
	readonly ariaLabel?: string;
	readonly kind: InboxNotificationActionKind;
	readonly commandId?: string;
	readonly commandArgs?: readonly unknown[];
	readonly primary?: boolean;
}

export interface IInboxNotificationPullRequestState {
	readonly label: string;
	readonly repositoryLabel: string;
	readonly pullRequestUri?: URI;
	readonly icon: ThemeIcon;
	readonly statusLabel: string;
}

export interface IInboxNotificationConfirmationPart {
	readonly kind: 'confirmation';
	readonly chatResource: URI;
	readonly requestId: string;
	readonly title: string;
	readonly message: string | IMarkdownString;
	readonly data: unknown;
	readonly buttons?: readonly string[];
}

export interface IInboxNotificationQuestionCarouselPart {
	readonly kind: 'questionCarousel';
	readonly chatResource: URI;
	readonly requestId: string;
	readonly resolveId?: string;
	readonly allowSkip: boolean;
	readonly message?: string | IMarkdownString;
	readonly questions: readonly IChatQuestion[];
}

export interface IInboxNotificationToolConfirmationButton {
	readonly label: string;
	readonly id?: string;
	readonly kind: 'approve' | 'deny';
	readonly useUserActionReason?: boolean;
}

export interface IInboxNotificationToolConfirmationPart {
	readonly kind: 'toolConfirmation';
	readonly chatResource: URI;
	readonly requestId: string;
	readonly toolCallId: string;
	readonly confirmationKind: 'execution' | 'result';
	readonly title: string | IMarkdownString;
	readonly message: string | IMarkdownString;
	readonly commandLine?: string;
	readonly disclaimer?: string | IMarkdownString;
	readonly originMessage?: string | IMarkdownString;
	readonly buttons: readonly IInboxNotificationToolConfirmationButton[];
}

export function getInboxToolConfirmationDetails(invocation: IChatToolInvocation) {
	const state = invocation.state.get();
	if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
		return { requiresSession: true };
	}
	const data = invocation.toolSpecificData;
	const terminal = data?.kind === 'terminal' ? migrateLegacyTerminalToolSpecificData(data) : undefined;
	const commandLine = terminal ? terminal.commandLine.userEdited ?? terminal.commandLine.toolEdited ?? terminal.commandLine.original : undefined;
	const hasParameters = state.parameters !== undefined && state.parameters !== null
		&& (typeof state.parameters !== 'object' || Object.keys(state.parameters).length > 0);
	return {
		commandLine,
		disclaimer: state.confirmationMessages?.disclaimer,
		originMessage: invocation.originMessage,
		requiresSession: !!state.confirmationMessages?.terminalCustomActions?.length
			|| (terminal ? !commandLine : !!data || hasParameters),
	};
}

export type IInboxNotificationNeedsInputPart = IInboxNotificationConfirmationPart | IInboxNotificationQuestionCarouselPart | IInboxNotificationToolConfirmationPart;

export interface IInboxNotificationItem {
	readonly id: string;
	readonly kind: InboxNotificationKind;
	readonly priority: InboxNotificationPriority;
	readonly title: string;
	readonly description: string;
	readonly repositoryLabel?: string;
	readonly pullRequestStates?: readonly IInboxNotificationPullRequestState[];
	readonly needsInputPart?: IInboxNotificationNeedsInputPart;
	readonly timestamp: number;
	readonly sessionResource?: URI;
	/** The originating conversation, retained after pending input controls are removed. */
	readonly chatResource?: URI;
	readonly actions: readonly IInboxNotificationAction[];
	/**
	 * Signature under which a model-generated preview for this item is cached and
	 * looked up in {@link IInboxNotificationsService.previews}. Changes whenever the
	 * underlying content (and therefore the desired preview) changes.
	 */
	readonly previewSignature?: string;
	/** The text fed to the utility model to generate this item's preview. */
	readonly previewInputText?: string;
}

export interface IExternalInboxNotification {
	readonly id: string;
	readonly kind?: InboxNotificationKind;
	readonly title: string;
	readonly description: string;
	readonly repositoryLabel?: string;
	readonly priority?: InboxNotificationPriority;
	readonly timestamp?: number;
	readonly sessionResource?: URI;
	readonly actions?: readonly IInboxNotificationAction[];
}

export interface IInboxNotificationsService {
	readonly _serviceBrand: undefined;

	readonly notifications: IObservable<readonly IInboxNotificationItem[]>;
	readonly dismissedNotifications: IObservable<readonly IInboxNotificationItem[]>;
	readonly sortMode: IObservable<InboxNotificationsSortMode>;
	readonly isLoading: IObservable<boolean>;

	/**
	 * Map from {@link IInboxNotificationItem.previewSignature} to a short, model-generated
	 * one-line preview describing the item's latest state. Populated asynchronously as
	 * items land; an entry is absent until its preview has been generated.
	 */
	readonly previews: IObservable<ReadonlyMap<string, string>>;

	/**
	 * Map from a completed item's id to its structured, model-generated evidence pack.
	 * Generation is focus-triggered via {@link requestDetailSummary}; an entry is absent
	 * until it has been generated.
	 */
	readonly detailSummaries: IObservable<ReadonlyMap<string, IInboxDetailSummary>>;

	publishExternalNotification(notification: IExternalInboxNotification): void;
	removeExternalNotification(id: string): void;
	dismissNotification(id: string, snapshot?: IInboxNotificationItem): void;
	setSortMode(sortMode: InboxNotificationsSortMode): void;

	/**
	 * Trigger (once, then cached) generation of the one-line preview for an item. Called by the
	 * view as cards become visible so hidden items don't fan out utility-model traffic.
	 */
	requestPreview(item: IInboxNotificationItem): void;

	/**
	 * Trigger (once, then cached) generation of the structured evidence pack for a completed
	 * item. No-op for non-completed items. Results land in {@link detailSummaries}.
	 */
	requestDetailSummary(item: IInboxNotificationItem): void;

	/**
	 * Privacy-safe telemetry identity for the item's session: a hashed session id and a bounded
	 * provider category (reusing the shared Agents-window telemetry helpers so inbox events
	 * correlate with `agents/sessionSummary` and friends by the same key). Returns `'none'` for
	 * both when the item has no resolvable session.
	 */
	getInteractionTelemetryContext(item: IInboxNotificationItem): IInboxInteractionTelemetryContext;
}

/** Privacy-safe telemetry identity for an inbox item's underlying session. */
export interface IInboxInteractionTelemetryContext {
	/** SHA-1 hash of the session id (or `'none'`). */
	readonly agentSessionId: string;
	/** Bounded provider category (or `'none'`). */
	readonly providerId: string;
}

/** A concrete, session-produced artifact an evidence claim is grounded in and links to. */
export interface IInboxEvidenceArtifact {
	readonly kind: 'file' | 'session' | 'command';
	readonly label: string;
	readonly uri?: URI;
}

/** A single grounded claim in a detail evidence pack. Every claim links to a real artifact. */
export interface IInboxDetailEvidence {
	readonly text: string;
	readonly artifact: IInboxEvidenceArtifact;
}

/** A structured, model-generated evidence pack shown in the detail pane for a completed session. */
export interface IInboxDetailSummary {
	readonly status: string;
	readonly decisions: readonly string[];
	readonly evidence: readonly IInboxDetailEvidence[];
}

/** Shared PR eligibility for Inbox cards and their repair actions; merge and cleanup remain ownership-gated. */
export function getInboxPullRequestRefs(session: ISession, reader?: IReader, includeReferences = false): readonly IGitHubPullRequestRef[] {
	const references = [
		...getSessionGitHubReferences(session, reader).pullRequests.filter(ref => ref.createdByThisSession),
		...(session.workspace.read(reader)?.folders ?? []).flatMap(folder => {
			const gitHubInfo = folder.gitRepository?.gitHubInfo.read(reader);
			return includeReferences ? getGitHubPullRequestRefs(gitHubInfo) : getSessionOwnedGitHubPullRequestRefs(gitHubInfo);
		}),
	];
	const seen = new Set<string>();
	return references.filter(ref => {
		const key = `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.number}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/** Returns the unambiguous, provider-advertised PR merge operation; never a local branch merge. */
export function getInboxPullRequestMergeOperation(session: ISession, reader?: IReader): { readonly changeset: ISessionChangeset; readonly operation: ISessionChangesetOperation } | undefined {
	const pullRequests = new Set(getSessionGitHubReferences(session, reader).pullRequests.map(ref => ref.uri.toString()));
	for (const folder of session.workspace.read(reader)?.folders ?? []) {
		for (const ref of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader))) {
			pullRequests.add(ref.uri.toString());
		}
	}
	if (pullRequests.size !== 1) {
		return undefined;
	}
	let candidate: { readonly changeset: ISessionChangeset; readonly operation: ISessionChangesetOperation } | undefined;
	for (const changeset of session.mainChat.read(reader).changesets.read(reader) ?? []) {
		if (!changeset.isEnabled.read(reader)) {
			continue;
		}
		for (const operation of changeset.operations.read(reader)) {
			if (operation.id !== AgentHostPullRequestOperationId.Merge
				|| !operation.scopes.includes(SessionChangesetOperationScope.Changeset)
				|| operation.status === SessionChangesetOperationStatus.Disabled
				|| operation.status === SessionChangesetOperationStatus.Running) {
				continue;
			}
			if (candidate) {
				return undefined;
			}
			candidate = { changeset, operation };
		}
	}
	return candidate;
}

export function compareInboxNotifications(a: IInboxNotificationItem, b: IInboxNotificationItem): number {
	if (a.priority !== b.priority) {
		return a.priority - b.priority;
	}
	return b.timestamp - a.timestamp;
}

export function compareInboxNotificationsByRecency(a: IInboxNotificationItem, b: IInboxNotificationItem): number {
	if (a.timestamp !== b.timestamp) {
		return b.timestamp - a.timestamp;
	}
	return a.priority - b.priority;
}
