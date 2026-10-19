/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { URI } from '../../../base/common/uri.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { ChatInteractivity, ChatOriginKind, type ChatOrigin } from './state/protocol/channels-chat/state.js';

/** Host root config keys for moving chats between sessions. */
export const ChatMoveConfigKey = {
	Enabled: 'chatMoves.enabled',
} as const;

/** Workbench settings for moving chats. `Enabled` is mirrored into {@link ChatMoveConfigKey}. */
export const ChatMoveSettingId = {
	Enabled: 'chat.agentHost.moveChats.enabled',
	/** Whether moving a chat or session by drag and drop asks for confirmation; a workbench preference only. */
	ConfirmDragAndDrop: 'chat.agentHost.moveChats.confirmDragAndDrop',
} as const;

export const chatMoveRootConfigSchema = createSchema({
	[ChatMoveConfigKey.Enabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('chatMoves.config.enabled', "Move Chats"),
		default: false,
	}),
});

/** What makes a chat structurally eligible to be the source of a move, whatever its state. */
export interface IChatMoveStructuralEligibility {
	/** Whether moving chats is enabled. */
	readonly enabled: boolean;
	/** Whether the chat is its owning session's default chat. */
	readonly isDefault: boolean;
	readonly origin: ChatOrigin | undefined;
	readonly interactivity: ChatInteractivity | undefined;
}

/**
 * What decides whether a chat may be the source of a move: its structural eligibility and every condition of the chat
 * or its own session for which a move would be refused, whatever its destination.
 */
export interface IChatMoveEligibility extends IChatMoveStructuralEligibility {
	/** Its session is archived ({@link AgentChatMoveRefusal.SessionArchived}). */
	readonly sessionArchived: boolean;
	/** Its session has no workspace, or the chat no folder ({@link AgentChatMoveRefusal.Workspaceless}). */
	readonly workspaceless: boolean;
	/** Its session is quarantined, or it or a descendant is changing its workspace ({@link AgentChatMoveRefusal.SessionQuarantined}, {@link AgentChatMoveRefusal.ConversionInProgress}). */
	readonly converting: boolean;
	/** It works in an additional worktree recorded for it that a chat staying in its session also uses ({@link AgentChatMoveRefusal.WorktreeFolder}). */
	readonly worktreeFolder: boolean;
	/** It or a descendant runs Agent Merge for a folder of its session ({@link AgentChatMoveRefusal.AgentMergeOwner}). */
	readonly agentMergeOwner: boolean;
	/** Its session's legacy chat catalog can't be converted for now: its conversion is parked ({@link AgentChatMoveRefusal.LegacyCatalog}). */
	readonly legacyCatalog: boolean;
}

/**
 * Whether a chat is structurally eligible to be moved. A session's default chat never is (AHP), nor a chat spawned by
 * a tool call (it moves with its parent) or a hidden chat.
 */
export function isChatStructurallyMovable(eligibility: IChatMoveStructuralEligibility): boolean {
	return eligibility.enabled
		&& !eligibility.isDefault
		&& eligibility.origin?.kind !== ChatOriginKind.Tool
		&& eligibility.interactivity !== ChatInteractivity.Hidden;
}

/**
 * Whether a chat may be moved now (`ChatSummary.movable`): it is structurally eligible and nothing about the chat or
 * its own session would refuse its move. Refusals that depend on the destination (its provider, folders or state,
 * whether its session is a single chat) or on the kind of move (a promotion needs a started chat) are only decided per
 * request, which also validates everything again.
 */
export function isChatMovable(eligibility: IChatMoveEligibility): boolean {
	return isChatStructurallyMovable(eligibility)
		&& !eligibility.sessionArchived
		&& !eligibility.workspaceless
		&& !eligibility.converting
		&& !eligibility.worktreeFolder
		&& !eligibility.agentMergeOwner
		&& !eligibility.legacyCatalog;
}

/** Where a chat moves: another position in its own session, another existing session, or a new session. */
export type AgentChatMoveDestination =
	| { readonly kind: 'session'; readonly session: URI; readonly after: URI | undefined }
	| { readonly kind: 'newSession' };

/** Why a host refused a chat move. Stable, for clients to explain the refusal. */
export const enum AgentChatMoveRefusal {
	Disabled = 'disabled',
	NotMovable = 'notMovable',
	DestinationNotFound = 'destinationNotFound',
	InvalidAnchor = 'invalidAnchor',
	DifferentProvider = 'differentProvider',
	SessionArchived = 'sessionArchived',
	SessionNotReady = 'sessionNotReady',
	SessionQuarantined = 'sessionQuarantined',
	ConversionInProgress = 'conversionInProgress',
	WorktreeFolder = 'worktreeFolder',
	Workspaceless = 'workspaceless',
	AgentMergeOwner = 'agentMergeOwner',
	DestinationSingleFolder = 'destinationSingleFolder',
	LegacyCatalog = 'legacyCatalog',
	Conflict = 'conflict',
	Unsupported = 'unsupported',
	/** A session moves under another session only while its default chat is its only chat (Block 4, VS Code-internal). */
	NotSingleChat = 'notSingleChat',
	/** A chat becomes its own session only once its first turn started, which is when every agent persists its conversation. */
	NotStarted = 'notStarted',
	/**
	 * The chat's session and the destination session are sponsored by different credential owners, or only one of them is.
	 * Credentials never cross owners, so such sessions can't be combined. Client text: "This chat uses a different account's
	 * credentials than the destination session."
	 */
	DifferentCredentialOwner = 'differentCredentialOwner',
}

/** A chat move the host refused before changing anything. */
export class AgentChatMoveRefusedError extends Error {
	constructor(readonly reason: AgentChatMoveRefusal, message: string) {
		super(message);
		this.name = 'AgentChatMoveRefusedError';
	}
}
