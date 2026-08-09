/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ISessionConversationGroupRegistry, SESSION_CONVERSATION_CHATS_GROUP, SESSION_CONVERSATION_SIDE_CHATS_GROUP, SESSION_CONVERSATION_SUBAGENTS_GROUP, SessionConversationExtensions } from '../../../browser/sessionConversationGroups.js';

const conversationGroups = Registry.as<ISessionConversationGroupRegistry>(SessionConversationExtensions.Groups);

conversationGroups.register({
	id: SESSION_CONVERSATION_CHATS_GROUP,
	label: localize('sessionConversationGroup.chats', "Chats"),
	order: 1,
});

conversationGroups.register({
	id: SESSION_CONVERSATION_SIDE_CHATS_GROUP,
	label: localize('sessionConversationGroup.sideChats', "Side chats"),
	order: 2,
});

conversationGroups.register({
	id: SESSION_CONVERSATION_SUBAGENTS_GROUP,
	label: localize('sessionConversationGroup.subagents', "Subagents"),
	order: 3,
});
