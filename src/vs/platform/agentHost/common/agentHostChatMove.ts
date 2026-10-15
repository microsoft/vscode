/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { ChatInteractivity, ChatOriginKind, type ChatOrigin } from './state/protocol/channels-chat/state.js';

/** Host root config keys for moving chats between sessions. */
export const ChatMoveConfigKey = {
	Enabled: 'chatMoves.enabled',
} as const;

/** Workbench settings mirrored into {@link ChatMoveConfigKey}. */
export const ChatMoveSettingId = {
	Enabled: 'chat.agentHost.moveChats.enabled',
} as const;

export const chatMoveRootConfigSchema = createSchema({
	[ChatMoveConfigKey.Enabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('chatMoves.config.enabled', "Move Chats"),
		default: false,
	}),
});

/** What decides whether a chat may be the source of a move. */
export interface IChatMoveEligibility {
	/** Whether moving chats is enabled. */
	readonly enabled: boolean;
	/** Whether the chat is its owning session's default chat. */
	readonly isDefault: boolean;
	readonly origin: ChatOrigin | undefined;
	readonly interactivity: ChatInteractivity | undefined;
}

/**
 * Whether a chat is structurally eligible to be moved (`ChatSummary.movable`). A session's default chat never
 * is (AHP), nor a chat spawned by a tool call (it moves with its parent) or a hidden chat. Request-time
 * conditions (running conversions, worktree folders, folders, archived sessions, ...) are validated per move.
 */
export function isChatMovable(eligibility: IChatMoveEligibility): boolean {
	return eligibility.enabled
		&& !eligibility.isDefault
		&& eligibility.origin?.kind !== ChatOriginKind.Tool
		&& eligibility.interactivity !== ChatInteractivity.Hidden;
}
