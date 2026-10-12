/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { isAhpChatChannel } from '../common/state/sessionState.js';
import { parseCanvasChatUri } from '../common/canvasUri.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';

export class AgentHostSubscriptionService implements IAgentHostSubscriptionService {
	declare readonly _serviceBrand: undefined;

	private readonly _subscribers = new ResourceMap<Set<string>>();
	/** Owning session of each subscribed chat (or chat-scoped canvas), keyed by chat. */
	private readonly _chatOwners = new Map<string, string>();

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
		const chat = this._chatOf(resource);
		if (chat !== undefined && ![...this._subscribers.keys()].some(other => this._chatOf(other) === chat)) {
			this._chatOwners.delete(chat);
		}
		return true;
	}

	setSubscriptionOwner(resource: URI, session: string): void {
		const chat = this._chatOf(resource);
		if (chat !== undefined && this._subscribers.has(resource)) {
			this._chatOwners.set(chat, session);
		}
	}

	recordChatOwner(chat: string, session: string): void {
		if ([...this._subscribers.keys()].some(resource => this._chatOf(resource) === chat)) {
			this._chatOwners.set(chat, session);
		}
	}

	resolveSubscribedSession(resource: URI): URI | undefined {
		return resolveAgentHostSession(resource, chat => this._chatOwners.get(chat));
	}

	private _chatOf(resource: URI): string | undefined {
		const canvasChat = parseCanvasChatUri(resource);
		if (canvasChat) {
			return canvasChat.toString();
		}
		const key = resource.toString();
		return isAhpChatChannel(key) ? key : undefined;
	}

	hasSubscribers(resource: URI): boolean {
		return this._subscribers.has(resource);
	}

	hasSessionSubscribers(session: URI): boolean {
		const sessionKey = this.resolveSubscribedSession(session)?.toString();
		if (sessionKey === undefined) {
			return false;
		}
		for (const subscribedResource of this._subscribers.keys()) {
			if (this.resolveSubscribedSession(subscribedResource)?.toString() === sessionKey) {
				return true;
			}
		}
		return false;
	}
}
