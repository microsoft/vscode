/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	readonly messageId?: string;
	readonly revision?: number;
}

export type IAgentMessageDelegationMeta = IAgentMessageThreadDelegationMeta | IAgentMessageSessionDelegationMeta;

/** Parses recognized Agent Host message-delegation metadata. */
export function parseAgentMessageDelegationMeta(value: unknown): IAgentMessageDelegationMeta | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	const sourceThreadId = candidate.sourceThreadId;
	if (typeof sourceThreadId === 'string' && sourceThreadId.length > 0) {
		return { sourceThreadId };
	}
	const sourceSession = candidate.sourceSession;
	if (typeof sourceSession !== 'string' || sourceSession.length === 0) {
		return undefined;
	}
	return {
		sourceSession,
		...(typeof candidate.sourceChat === 'string' ? { sourceChat: candidate.sourceChat } : {}),
		...(typeof candidate.sourceTurnId === 'string' ? { sourceTurnId: candidate.sourceTurnId } : {}),
		...(typeof candidate.messageId === 'string' && candidate.messageId.length > 0 ? { messageId: candidate.messageId } : {}),
		...(typeof candidate.revision === 'number' && Number.isInteger(candidate.revision) && candidate.revision > 0 ? { revision: candidate.revision } : {}),
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

/** Removes Agent Host message-delegation metadata while preserving unrelated metadata. */
export function withoutAgentMessageDelegationMeta(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, MESSAGE_DELEGATION_META_KEY)) {
		return metadata;
	}
	const result = { ...metadata };
	delete result[MESSAGE_DELEGATION_META_KEY];
	return Object.keys(result).length > 0 ? result : undefined;
}
