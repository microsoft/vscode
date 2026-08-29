/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI as ProtocolURI } from './state/sessionState.js';
import type { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostChangesetSubscriptionService = createDecorator<IAgentHostChangesetSubscriptionService>('agentHostChangesetSubscriptionService');

/**
 * Shared changeset subscription registry. The coordinator records subscription
 * lifecycle changes here; compute services read the current per-session set.
 */
export interface IAgentHostChangesetSubscriptionService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires with the session URI whenever that session transitions between
	 * having and not having changeset subscribers. Services that hold
	 * per-session resources only while a client is watching (e.g. the pull
	 * request status watcher) key off this rather than polling.
	 */
	readonly onDidChangeSessionSubscriptions: Event<ProtocolURI>;

	/**
	 * Returns the set of changeset URIs currently subscribed for `session`.
	 * Empty when the session has no active changeset subscribers.
	 */
	getSessionSubscriptions(session: ProtocolURI): ReadonlySet<ProtocolURI>;

	/**
	 * Adds `changeset` to the active subscription set for `session`.
	 */
	addSubscription(session: ProtocolURI, changeset: ProtocolURI): void;

	/**
	 * Removes `changeset` from the active subscription set for `session`.
	 */
	removeSubscription(session: ProtocolURI, changeset: ProtocolURI): void;

	/**
	 * Drops every active subscription for `session`.
	 */
	clearSessionSubscriptions(session: ProtocolURI): void;
}
