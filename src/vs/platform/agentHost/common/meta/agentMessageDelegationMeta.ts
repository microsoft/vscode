/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import type { Message, PendingMessage } from '../state/sessionState.js';

const MESSAGE_DELEGATION_META_KEY = 'vscode.chat.delegation';

interface IHasMessageDelegationMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentMessageThreadDelegationMeta {
	readonly sourceThreadId: string;
}

export interface IAgentMessageSessionDelegationMeta {
	readonly sourceSession: string;
	readonly sourceChat?: string;
	readonly sourceTurnId?: string;
}

export type IAgentMessageDelegationMeta = IAgentMessageThreadDelegationMeta | IAgentMessageSessionDelegationMeta;

/** Parses recognized Agent Host message-delegation metadata. */
export function parseAgentMessageDelegationMeta(value: unknown): IAgentMessageDelegationMeta | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	const sourceThreadId = candidate['sourceThreadId'];
	if (typeof sourceThreadId === 'string' && sourceThreadId.length > 0) {
		return { sourceThreadId };
	}
	const sourceSession = candidate['sourceSession'];
	if (typeof sourceSession !== 'string' || sourceSession.length === 0) {
		return undefined;
	}
	return {
		sourceSession,
		...(typeof candidate['sourceChat'] === 'string' ? { sourceChat: candidate['sourceChat'] } : {}),
		...(typeof candidate['sourceTurnId'] === 'string' ? { sourceTurnId: candidate['sourceTurnId'] } : {}),
	};
}

/** Reads recognized Agent Host message-delegation metadata. */
export function readAgentMessageDelegationMeta(source: IHasMessageDelegationMeta): IAgentMessageDelegationMeta | undefined {
	return parseAgentMessageDelegationMeta(source._meta?.[MESSAGE_DELEGATION_META_KEY]);
}

/** Serializes Agent Host message-delegation metadata for the open protocol bag. */
export function toAgentMessageDelegationMeta(meta: IAgentMessageDelegationMeta): Record<string, unknown> {
	return { [MESSAGE_DELEGATION_META_KEY]: meta };
}

/** Reads the chat that sent a message from another session's chat, if any. */
export function readAgentMessageSourceChat(source: IHasMessageDelegationMeta): string | undefined {
	const meta = readAgentMessageDelegationMeta(source);
	return meta && hasKey(meta, { sourceSession: true }) ? meta.sourceChat : undefined;
}

/**
 * Finds the queued message {@link sourceChat} sent that the chat has not started
 * yet. Sessions keep one current message per sender in a chat, so a follow-up
 * from {@link sourceChat} replaces this message rather than queuing another.
 */
export function findUndeliveredDelegatedMessage(queuedMessages: readonly PendingMessage[] | undefined, sourceChat: string): PendingMessage | undefined {
	return queuedMessages?.findLast(queued => readAgentMessageSourceChat(queued.message) === sourceChat);
}

/**
 * Replaces the text of an undelivered delegated message, keeping everything
 * else on it (origin, model, agent, attachments) and recording the latest
 * delegation in {@link delegationMeta}.
 */
export function replaceDelegatedMessage(previous: Message, text: string, delegationMeta: Record<string, unknown> | undefined): Message {
	// Attachment ranges point into the replaced text, so keep the attachments but drop their ranges.
	const attachments = previous.attachments?.map(attachment => attachment.range ? { ...attachment, range: undefined } : attachment);
	return {
		...previous,
		text,
		...(attachments ? { attachments } : {}),
		_meta: { ...previous._meta, ...delegationMeta },
	};
}
