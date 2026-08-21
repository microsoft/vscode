/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatInputRequest } from '../state/protocol/channels-chat/state.js';

/**
 * Why the agent requested chat input.
 *
 * AHP no longer models this on {@link ChatInputRequest}; VS Code keeps the
 * classification for telemetry and UI by carrying it in the request's open
 * metadata bag.
 */
export const enum ChatInputRequestPurpose {
	AskUser = 'askUser',
	Elicitation = 'elicitation',
	PlanReview = 'planReview',
}

/**
 * {@link ChatInputRequest} has no declared `_meta` field. The request is
 * carried verbatim through the protocol as JSON, so an extra bag survives the
 * round-trip.
 */
type ChatInputRequestWithMeta = ChatInputRequest & { _meta?: Record<string, unknown> };

const PURPOSE_META_KEY = 'purpose';

function isChatInputRequestPurpose(value: unknown): value is ChatInputRequestPurpose {
	return value === ChatInputRequestPurpose.AskUser
		|| value === ChatInputRequestPurpose.Elicitation
		|| value === ChatInputRequestPurpose.PlanReview;
}

/** Reads the purpose an input request was created with, if it was classified. */
export function readChatInputRequestPurpose(request: ChatInputRequest): ChatInputRequestPurpose | undefined {
	const meta = (request as ChatInputRequestWithMeta)._meta;
	if (!meta) {
		return undefined;
	}
	const purpose = meta[PURPOSE_META_KEY];
	return isChatInputRequestPurpose(purpose) ? purpose : undefined;
}

/** Returns a copy of `request` classified with `purpose`. */
export function withChatInputRequestPurpose<T extends ChatInputRequest>(request: T, purpose: ChatInputRequestPurpose): T {
	const meta = (request as ChatInputRequestWithMeta)._meta;
	return {
		...request,
		_meta: { ...meta, [PURPOSE_META_KEY]: purpose },
	};
}
