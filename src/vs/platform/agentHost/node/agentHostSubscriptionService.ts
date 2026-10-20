/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession, resourceChat } from '../common/agentHostSubscriptionService.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

export class AgentHostSubscriptionService extends Disposable implements IAgentHostSubscriptionService {
	declare readonly _serviceBrand: undefined;

	private readonly _subscribers = new ResourceMap<Set<string>>();
	/** Owning session of each subscribed chat (or chat-scoped canvas), keyed by chat. */
	private readonly _chatOwners = new Map<string, string>();
	/** Subscribed resources addressing each chat: the chat itself and its chat-scoped canvases. */
	private readonly _resourcesByChat = new Map<string, Set<string>>();

	constructor(
		@IAgentHostChatOwnershipService chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();
		// A chat subscribed before it registered (e.g. a reconnect fast path) gets its owner now.
		this._register(chatOwnership.onDidRegisterChat(({ chat, session }) => this._recordChatOwner(chat, session)));
		this._register(chatOwnership.onDidChangeChatOwner(({ chat, current }) => this._recordChatOwner(chat, current)));
	}

	get subscribedResources(): Iterable<URI> {
		return this._subscribers.keys();
	}

	addSubscriber(resource: URI, clientId: string): boolean {
		let subscribers = this._subscribers.get(resource);
		const firstForResource = !subscribers || subscribers.size === 0;
		if (!subscribers) {
			subscribers = new Set();
			this._subscribers.set(resource, subscribers);
			const chat = this._chatOf(resource);
			if (chat !== undefined) {
				let resources = this._resourcesByChat.get(chat);
				if (!resources) {
					resources = new Set();
					this._resourcesByChat.set(chat, resources);
				}
				resources.add(resource.toString());
			}
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
		const resources = chat === undefined ? undefined : this._resourcesByChat.get(chat);
		if (chat !== undefined && resources) {
			resources.delete(resource.toString());
			if (resources.size === 0) {
				this._resourcesByChat.delete(chat);
				this._chatOwners.delete(chat);
			}
		}
		return true;
	}

	setSubscriptionOwner(resource: URI, session: string): void {
		const chat = this._chatOf(resource);
		if (chat !== undefined && this._subscribers.has(resource)) {
			this._chatOwners.set(chat, session);
		}
	}

	private _recordChatOwner(chat: string, session: string): void {
		if (this._resourcesByChat.has(chat)) {
			this._chatOwners.set(chat, session);
		}
	}

	resolveSubscribedSession(resource: URI): URI | undefined {
		return resolveAgentHostSession(resource, chat => this._chatOwners.get(chat));
	}

	private _chatOf(resource: URI): string | undefined {
		const key = resource.toString();
		const changeset = parseChangesetUri(key);
		if (changeset) {
			// Session- and folder-owned changesets carry their session; a chat-owned one belongs to its chat.
			return changeset.sessionUri === undefined ? changeset.ownerUri : undefined;
		}
		return resourceChat(resource);
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
