/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiPaginationOptions, ApiRequestOptions } from '../client/request.js';
import { PageOptions, RepositoryRef } from '../client/types.js';
import { RepositoryIdentity } from './core.js';

/** One notification thread, distinct from a pull request review thread. */
export interface NotificationThread {
	/** Opaque notification-thread ID, distinct from issue numbers and GraphQL IDs. */
	readonly id: string;
	/** Whether the notification is unread. */
	readonly unread: boolean;
	/** Server-defined subscription reason, such as review_requested or mention. */
	readonly reason: string;
	/** Last update timestamp. */
	readonly updated_at: string;
	/** Last read timestamp, or null if never read. */
	readonly last_read_at: string | null;
	/** Thread REST URL. */
	readonly url: string;
	/** Subscription-management REST URL. */
	readonly subscription_url: string;
	/** Owning repository identity. */
	readonly repository: RepositoryIdentity;
	/** Notification subject, which may no longer have an accessible resource. */
	readonly subject: {
		/** Subject title. */
		readonly title: string;
		/** Resource API URL, or null when unavailable. */
		readonly url: string | null;
		/** Latest comment API URL, or null when unavailable. */
		readonly latest_comment_url: string | null;
		/** Subject type, such as Issue, PullRequest, or Commit. */
		readonly type: string;
	};
}

/** Filters for listing notifications. */
export type ListNotificationsOptions = ApiPaginationOptions<PageOptions & {
	/** Include read notifications as well as unread ones. */
	readonly all?: boolean;
	/** Restrict to threads in which the user is directly participating. */
	readonly participating?: boolean;
	/** RFC 3339 lower bound on update time. */
	readonly since?: string;
	/** RFC 3339 upper bound on update time. */
	readonly before?: string;
}>;

/** Operations for listing notifications and marking threads as read or done. */
export interface INotificationsClient {

	/** GET /notifications: list one page of notification threads. */
	list(signal: AbortSignal, options?: ListNotificationsOptions): Promise<readonly NotificationThread[]>;

	/** GET /repos/{owner}/{repo}/notifications: return one repository's notification page. */
	listForRepository(repository: RepositoryRef, signal: AbortSignal, options?: ListNotificationsOptions): Promise<readonly NotificationThread[]>;

	/** GET /notifications/threads/{id}: read one notification thread. */
	get(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NotificationThread>;

	/** PATCH /notifications/threads/{id}: mark read; the successful bodyless response is HTTP 205. */
	markRead(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;

	/** DELETE /notifications/threads/{id}: mark done; success is HTTP 204. */
	markDone(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;
}
