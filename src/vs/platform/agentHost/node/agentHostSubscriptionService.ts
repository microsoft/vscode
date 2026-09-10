/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';

export class AgentHostSubscriptionService implements IAgentHostSubscriptionService {
	declare readonly _serviceBrand: undefined;

	private readonly _subscribers = new ResourceMap<Set<string>>();

	get subscribedResources(): Iterable<URI> {
		return this._subscribers.keys();
	}

	addSubscriber(resource: URI, clientId: string): boolean {
		let subscribers = this._subscribers.get(resource);
		const firstForResource = !subscribers || subscribers.size === 0;
		if (!subscribers) {
			subscribers = new Set();
			this._subscribers.set(resource, subscribers);
		}
		subscribers.add(clientId);
		return firstForResource;
	}

	removeSubscriber(resource: URI, clientId: string): boolean {
		const subscribers = this._subscribers.get(resource);
		if (!subscribers) {
			return false;
		}
		subscribers.delete(clientId);
		if (subscribers.size > 0) {
			return false;
		}
		this._subscribers.delete(resource);
		return true;
	}

	hasSubscribers(resource: URI): boolean {
		return this._subscribers.has(resource);
	}

	hasSessionSubscribers(resource: URI): boolean {
		const sessionKey = resolveAgentHostSession(resource).toString();
		for (const subscribedResource of this._subscribers.keys()) {
			if (resolveAgentHostSession(subscribedResource).toString() === sessionKey) {
				return true;
			}
		}
		return false;
	}
}
