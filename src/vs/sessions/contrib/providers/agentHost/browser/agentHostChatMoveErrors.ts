/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { SessionMoveRefusedError } from '../../../../services/sessions/common/sessionsProvider.js';

const refusals: ReadonlySet<string> = new Set<string>([
	AgentChatMoveRefusal.Disabled,
	AgentChatMoveRefusal.NotMovable,
	AgentChatMoveRefusal.DestinationNotFound,
	AgentChatMoveRefusal.InvalidAnchor,
	AgentChatMoveRefusal.DifferentProvider,
	AgentChatMoveRefusal.SessionArchived,
	AgentChatMoveRefusal.SessionNotReady,
	AgentChatMoveRefusal.SessionQuarantined,
	AgentChatMoveRefusal.ConversionInProgress,
	AgentChatMoveRefusal.WorktreeFolder,
	AgentChatMoveRefusal.Workspaceless,
	AgentChatMoveRefusal.AgentMergeOwner,
	AgentChatMoveRefusal.DestinationSingleFolder,
	AgentChatMoveRefusal.LegacyCatalog,
	AgentChatMoveRefusal.Conflict,
	AgentChatMoveRefusal.Unsupported,
	AgentChatMoveRefusal.NotSingleChat,
	AgentChatMoveRefusal.NotStarted,
	AgentChatMoveRefusal.DifferentCredentialOwner,
]);

/**
 * The reason a host refused a chat or session move: an {@link AgentChatMoveRefusedError}, or a protocol error whose
 * `data.reason` names an {@link AgentChatMoveRefusal}. `undefined` for any other failure.
 */
export function getChatMoveRefusal(error: unknown): AgentChatMoveRefusal | undefined {
	if (error instanceof AgentChatMoveRefusedError) {
		return error.reason;
	}
	if (error instanceof ProtocolError && typeof error.data === 'object' && error.data !== null) {
		const reason = (error.data as { readonly reason?: unknown }).reason;
		if (typeof reason === 'string' && refusals.has(reason)) {
			return reason as AgentChatMoveRefusal;
		}
	}
	return undefined;
}

/** A user-facing explanation of why a host refused a move. */
export function getChatMoveRefusalMessage(reason: AgentChatMoveRefusal): string {
	switch (reason) {
		case AgentChatMoveRefusal.Disabled:
			return localize('chatMoveRefusal.disabled', "Moving chats is turned off.");
		case AgentChatMoveRefusal.NotMovable:
			return localize('chatMoveRefusal.notMovable', "This chat can't be moved.");
		case AgentChatMoveRefusal.DestinationNotFound:
			return localize('chatMoveRefusal.destinationNotFound', "The destination session is not available.");
		case AgentChatMoveRefusal.InvalidAnchor:
			return localize('chatMoveRefusal.invalidAnchor', "The chat can't be placed at that position.");
		case AgentChatMoveRefusal.DifferentProvider:
			return localize('chatMoveRefusal.differentProvider', "Chats can only move between sessions of the same agent.");
		case AgentChatMoveRefusal.SessionArchived:
			return localize('chatMoveRefusal.sessionArchived', "Chats can't be moved into or out of an archived session.");
		case AgentChatMoveRefusal.SessionNotReady:
			return localize('chatMoveRefusal.sessionNotReady', "The session isn't ready yet. Try again in a moment.");
		case AgentChatMoveRefusal.SessionQuarantined:
			return localize('chatMoveRefusal.sessionQuarantined', "The session is changing its workspace or can't run requests right now.");
		case AgentChatMoveRefusal.ConversionInProgress:
			return localize('chatMoveRefusal.conversionInProgress', "The chat is changing its workspace. Try again when it finishes.");
		case AgentChatMoveRefusal.WorktreeFolder:
			return localize('chatMoveRefusal.worktreeFolder', "Chats that work in a worktree of their session can't be moved.");
		case AgentChatMoveRefusal.Workspaceless:
			return localize('chatMoveRefusal.workspaceless', "Chats without a workspace folder can't be moved.");
		case AgentChatMoveRefusal.AgentMergeOwner:
			return localize('chatMoveRefusal.agentMergeOwner', "This chat runs Agent Merge for the session and can't be moved.");
		case AgentChatMoveRefusal.DestinationSingleFolder:
			return localize('chatMoveRefusal.destinationSingleFolder', "The destination session can't take another folder.");
		case AgentChatMoveRefusal.LegacyCatalog:
			return localize('chatMoveRefusal.legacyCatalog', "This session can't reorder or move its chats yet.");
		case AgentChatMoveRefusal.Conflict:
			return localize('chatMoveRefusal.conflict', "The chats changed while moving. Try again.");
		case AgentChatMoveRefusal.Unsupported:
			return localize('chatMoveRefusal.unsupported', "This chat can't be moved there.");
		case AgentChatMoveRefusal.NotSingleChat:
			return localize('chatMoveRefusal.notSingleChat', "Only a session with a single chat can be moved into another session.");
		case AgentChatMoveRefusal.NotStarted:
			return localize('chatMoveRefusal.notStarted', "Send a message in this chat before moving it to its own session.");
		case AgentChatMoveRefusal.DifferentCredentialOwner:
			return localize('chatMoveRefusal.differentCredentialOwner', "This chat uses a different account's credentials than the destination session.");
	}
}

/** Replaces a host refusal by a {@link SessionMoveRefusedError} explaining it; other errors are returned unchanged. */
export function toChatMoveError(error: unknown): unknown {
	const reason = getChatMoveRefusal(error);
	return reason === undefined ? error : new SessionMoveRefusedError(getChatMoveRefusalMessage(reason));
}
