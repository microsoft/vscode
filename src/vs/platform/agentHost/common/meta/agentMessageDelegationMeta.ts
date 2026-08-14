/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MESSAGE_DELEGATION_META_KEY = 'vscode.chat.delegation';

interface IHasMessageDelegationMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentMessageDelegationMeta {
	readonly sourceThreadId: string;
}

/** Reads recognized Agent Host message-delegation metadata. */
export function readAgentMessageDelegationMeta(source: IHasMessageDelegationMeta): IAgentMessageDelegationMeta | undefined {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced delegation slot; validated below.
	const value = source._meta?.[MESSAGE_DELEGATION_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const sourceThreadId = (value as Record<string, unknown>)['sourceThreadId'];
	return typeof sourceThreadId === 'string' && sourceThreadId.length > 0 ? { sourceThreadId } : undefined;
}

/** Serializes Agent Host message-delegation metadata for the open protocol bag. */
export function toAgentMessageDelegationMeta(meta: IAgentMessageDelegationMeta): Record<string, unknown> {
	return { [MESSAGE_DELEGATION_META_KEY]: { sourceThreadId: meta.sourceThreadId } };
}
