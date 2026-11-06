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
	 * Fires with the owner URI after each actual subscription-set membership change.
	 * Consumers read the current set to retain resources only while their changesets are observed.
	 */
	readonly onDidChangeSessionSubscriptions: Event<ProtocolURI>;

	/**
	 * Returns explicit changeset URIs and the session URI for implicit summary interest.
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
