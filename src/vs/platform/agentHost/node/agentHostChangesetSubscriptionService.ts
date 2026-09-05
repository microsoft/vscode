/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';

const EMPTY_SUBSCRIPTIONS: ReadonlySet<ProtocolURI> = new Set<ProtocolURI>();

export class AgentHostChangesetSubscriptionService extends Disposable implements IAgentHostChangesetSubscriptionService {
	declare readonly _serviceBrand: undefined;

	private readonly _subscriptions = new Map<ProtocolURI, Set<ProtocolURI>>();

	private readonly _onDidChangeSessionSubscriptions = this._register(new Emitter<ProtocolURI>());
	readonly onDidChangeSessionSubscriptions = this._onDidChangeSessionSubscriptions.event;

	getSessionSubscriptions(session: ProtocolURI): ReadonlySet<ProtocolURI> {
		return this._subscriptions.get(session) ?? EMPTY_SUBSCRIPTIONS;
	}

	addSubscription(session: ProtocolURI, changeset: ProtocolURI): void {
		let subscriptions = this._subscriptions.get(session);
		if (!subscriptions) {
			subscriptions = new Set();
			this._subscriptions.set(session, subscriptions);
		}
		subscriptions.add(changeset);
		if (subscriptions.size === 1) {
			this._onDidChangeSessionSubscriptions.fire(session);
		}
	}

	removeSubscription(session: ProtocolURI, changeset: ProtocolURI): void {
		const subscriptions = this._subscriptions.get(session);
		if (!subscriptions) {
			return;
		}

		subscriptions.delete(changeset);
		if (subscriptions.size === 0) {
			this._subscriptions.delete(session);
			this._onDidChangeSessionSubscriptions.fire(session);
		}
	}

	clearSessionSubscriptions(session: ProtocolURI): void {
		if (this._subscriptions.delete(session)) {
			this._onDidChangeSessionSubscriptions.fire(session);
		}
	}
}
