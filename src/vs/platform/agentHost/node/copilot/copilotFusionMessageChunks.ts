/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEventPayload } from '@github/copilot-sdk';

export function isLastAssistantMessageChunk(event: SessionEventPayload<'assistant.message'>): boolean {
	return event.data.chunkCount === undefined
		|| event.data.chunkCount <= 1
		|| event.data.chunkIndex === event.data.chunkCount - 1;
}

/** Groups complete Fusion messages so live and restored chats classify every chunk of a model call together. */
export class CopilotFusionMessageChunks {
	private readonly _pending = new Map<string, SessionEventPayload<'assistant.message'>[]>();

	accept(event: SessionEventPayload<'assistant.message'>, phaseToolCallId: string): { messages: readonly SessionEventPayload<'assistant.message'>[]; hasToolRequests: boolean } | undefined {
		// Calls within a phase are sequential, so the phase also correlates chunks without a model call id.
		const key = JSON.stringify([phaseToolCallId, event.data.apiCallId ?? event.data.clientRequestId]);
		const messages = this._pending.get(key) ?? [];
		messages.push(event);
		if (!isLastAssistantMessageChunk(event)) {
			this._pending.set(key, messages);
			return undefined;
		}
		this._pending.delete(key);
		return { messages, hasToolRequests: messages.some(message => !!message.data.toolRequests?.length) };
	}

	clear(): void {
		this._pending.clear();
	}
}
