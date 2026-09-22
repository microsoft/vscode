/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IInboxNotificationsService = createDecorator<IInboxNotificationsService>('sessionsInboxNotificationsService');

export const enum InboxNotificationPriority {
	Critical = 0,
	High = 1,
	Normal = 2,
	Low = 3,
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

export interface IInboxNotificationItem {
	readonly id: string;
	readonly kind: InboxNotificationKind;
	readonly priority: InboxNotificationPriority;
	readonly title: string;
	readonly description: string;
	readonly repositoryLabel?: string;
	readonly timestamp: number;
	readonly sessionResource?: URI;
	readonly actions: readonly IInboxNotificationAction[];
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

	publishExternalNotification(notification: IExternalInboxNotification): void;
	removeExternalNotification(id: string): void;
	dismissNotification(id: string): void;
	clearDismissedNotifications(): void;
}

export function compareInboxNotifications(a: IInboxNotificationItem, b: IInboxNotificationItem): number {
	if (a.priority !== b.priority) {
		return a.priority - b.priority;
	}
	return b.timestamp - a.timestamp;
}
