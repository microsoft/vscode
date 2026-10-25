/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mergeArrayPages } from '../client/pagination.js';
import { ApiRequestOptions } from '../client/request.js';
import { pathSegment, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { RepositoryRef } from '../client/types.js';
import { CoreClient, parseRepositoryIdentity } from './coreClient.js';
import { INotificationsClient, ListNotificationsOptions, NotificationThread } from './notifications.js';

export class NotificationsClient implements INotificationsClient {
	constructor(private readonly _client: CoreClient) { }

	async list(signal: AbortSignal, options?: ListNotificationsOptions): Promise<readonly NotificationThread[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'notifications',
			method: 'GET',
			path: withQuery('/notifications', { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseNotifications, mergeArrayPages);
	}

	async listForRepository(repository: RepositoryRef, signal: AbortSignal, options?: ListNotificationsOptions): Promise<readonly NotificationThread[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.requestPages({
			domain: 'notifications',
			method: 'GET',
			path: withQuery(`${repositoryPath(repository)}/notifications`, { ...query }),
			authentication: 'required',
			expectedStatus: 200,
			options: requestOptions
		}, signal, parseNotifications, mergeArrayPages);
	}

	async get(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<NotificationThread> {
		return this._client.request({
			domain: 'notifications',
			method: 'GET',
			path: notificationPath(threadId),
			authentication: 'required',
			expectedStatus: 200,
			options
		}, signal, parseNotification);
	}

	async markRead(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'notifications',
			method: 'PATCH',
			path: notificationPath(threadId),
			authentication: 'required',
			expectedStatus: 205,
			responseBody: 'none',
			options
		}, signal);
	}

	async markDone(threadId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'notifications',
			method: 'DELETE',
			path: notificationPath(threadId),
			authentication: 'required',
			expectedStatus: 204,
			responseBody: 'none',
			options
		}, signal);
	}
}

function notificationPath(threadId: string): string {
	return `/notifications/threads/${pathSegment(threadId)}`;
}

const parseNotification = parse.object<NotificationThread>({
	id: parse.nonEmptyString,
	unread: parse.boolean,
	reason: parse.string,
	updated_at: parse.dateTime,
	last_read_at: parse.nullable(parse.dateTime),
	url: parse.nonEmptyString,
	subscription_url: parse.nonEmptyString,
	repository: parseRepositoryIdentity,
	subject: parse.object({
		title: parse.string,
		url: parse.nullable(parse.string),
		latest_comment_url: parse.nullable(parse.string),
		type: parse.string,
	}),
});

const parseNotifications = parse.arrayOf(parseNotification);
