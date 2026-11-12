/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../../services/sessions/common/session.js';

export const ISessionAttentionService = createDecorator<ISessionAttentionService>('sessionAttentionService');

export const enum InboxTab {
	ReadyForYou = 'readyForYou',
	Working = 'working',
	ReadyToMerge = 'readyToMerge',
}

export const enum InboxNotificationPriority {
	Now = 0,
	Next = 1,
	Later = 2,
}

/** Live attention classification, independent of sidebar triage decisions. */
export interface IInboxSessionAttention {
	readonly tab: InboxTab.ReadyForYou | InboxTab.Working | InboxTab.ReadyToMerge;
	readonly priority: InboxNotificationPriority;
	readonly notificationIds: readonly string[];
	/** Links a hydrated input identity to its provisional identity while provider activity is unchanged. */
	readonly pendingInput?: { readonly notificationId: string; readonly provisionalId: string };
	/** Completed before sidebar Inbox activation without actionable notifications. */
	readonly isHistoricalCompletion: boolean;
}

export interface ISessionAttentionService {
	readonly _serviceBrand: undefined;
	readonly sessionAttention: IObservable<ReadonlyMap<string, IInboxSessionAttention>>;
	/** Classifies a restoration batch using current metadata without changing archive state or starting polling. */
	getSessionAttentionAfterUnarchive(sessions: readonly ISession[]): ReadonlyMap<string, IInboxSessionAttention>;
	acquireSessionAttention(): IDisposable;
}
