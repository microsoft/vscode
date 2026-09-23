/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatQuestion } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';

export const IInboxNotificationsService = createDecorator<IInboxNotificationsService>('sessionsInboxNotificationsService');

export const enum InboxNotificationPriority {
	Critical = 0,
	Moderate = 1,
	Low = 2,
}

export const enum InboxNotificationKind {
	ConfirmationRequested = 'confirmationRequested',
	NeedsInput = 'needsInput',
	FailingCI = 'failingCi',
	PassingCI = 'passingCi',
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
	readonly title: string | IMarkdownString;
	readonly message: string | IMarkdownString;
	readonly buttons: readonly IInboxNotificationToolConfirmationButton[];
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

	/** A request to reveal and focus a notification card in the view, or `undefined`. */
	readonly revealRequest: IObservable<IInboxNotificationRevealRequest | undefined>;

	publishExternalNotification(notification: IExternalInboxNotification): void;
	removeExternalNotification(id: string): void;
	dismissNotification(id: string): void;
	clearDismissedNotifications(): void;
	setSortMode(sortMode: InboxNotificationsSortMode): void;

	/** Ask the inbox view to reveal and focus the notification with the given id. */
	requestReveal(id: string): void;

	/**
	 * Trigger (once, then cached) generation of the structured evidence pack for a completed
	 * item. No-op for non-completed items. Results land in {@link detailSummaries}.
	 */
	requestDetailSummary(item: IInboxNotificationItem): void;
}

export interface IInboxNotificationRevealRequest {
	readonly id: string;
	/** Increments on every request so repeated reveals of the same id retrigger. */
	readonly token: number;
}

/** A concrete, session-produced artifact an evidence claim is grounded in and links to. */
export interface IInboxEvidenceArtifact {
	readonly kind: 'file' | 'session';
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
