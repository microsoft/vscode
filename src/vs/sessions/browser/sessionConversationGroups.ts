/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { IExtUri } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { ChatOriginKind, IChat } from '../services/sessions/common/session.js';

export const SESSION_CONVERSATION_CHATS_GROUP = '1_chats';
export const SESSION_CONVERSATION_SIDE_CHATS_GROUP = '2_sideChats';
export const SESSION_CONVERSATION_SUBAGENTS_GROUP = '3_subagents';

/** Describes a labeled action-widget section contributed to the Chats dropdown. */
export interface ISessionConversationGroup {
	readonly id: string;
	readonly label: string;
	readonly order: number;
}

/** Registry for contributed Chats dropdown groups. */
export interface ISessionConversationGroupRegistry {
	register(group: ISessionConversationGroup): IDisposable;
	getGroups(): readonly ISessionConversationGroup[];
}

/** Returns the contributed menu group for a chat in the scoped session. */
export function getSessionConversationGroupId(chat: IChat, activeChatResource: URI, extUri: IExtUri): string | undefined {
	if (chat.origin?.kind === ChatOriginKind.Tool) {
		return chat.origin.parentChat && extUri.isEqual(chat.origin.parentChat, activeChatResource)
			? SESSION_CONVERSATION_SUBAGENTS_GROUP
			: undefined;
	}
	if (chat.origin?.kind === ChatOriginKind.SideChat) {
		return SESSION_CONVERSATION_SIDE_CHATS_GROUP;
	}
	return SESSION_CONVERSATION_CHATS_GROUP;
}

export const SessionConversationExtensions = {
	Groups: 'sessions.conversationGroups',
} as const;

class SessionConversationGroupRegistry implements ISessionConversationGroupRegistry {

	private readonly _groups = new Map<string, ISessionConversationGroup>();

	register(group: ISessionConversationGroup): IDisposable {
		if (this._groups.has(group.id)) {
			throw new Error(`Session conversation group '${group.id}' is already registered.`);
		}

		this._groups.set(group.id, group);
		return toDisposable(() => this._groups.delete(group.id));
	}

	getGroups(): readonly ISessionConversationGroup[] {
		return Array.from(this._groups.values()).sort((a, b) => a.order - b.order);
	}
}

Registry.add(SessionConversationExtensions.Groups, new SessionConversationGroupRegistry());
