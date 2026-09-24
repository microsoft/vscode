/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AssistantMessageData, AssistantServerToolProgressData } from '@github/copilot-sdk';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, type ToolCallCompletedState, type ToolCallRunningState, type ToolResultContent } from '../../common/state/sessionState.js';
import { CopilotToolName, getInvocationMessage, getPastTenseMessage, getToolDisplayName } from './copilotToolDisplay.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

function createToolCall(callId: string): ToolCallRunningState {
	const toolName = CopilotToolName.ImageGeneration;
	const displayName = getToolDisplayName(toolName);
	return {
		status: ToolCallStatus.Running,
		toolCallId: `hosted-image-${encodeURIComponent(callId)}`,
		toolName,
		displayName,
		invocationMessage: getInvocationMessage(toolName, displayName, undefined),
		confirmed: ToolCallConfirmationReason.NotNeeded,
	};
}

export function readHostedImageToolProgress(data: AssistantServerToolProgressData): ToolCallRunningState | undefined {
	if (data.kind !== CopilotToolName.ImageGeneration) {
		return undefined;
	}
	// Older runtimes have no response-scoped identity; their final result still renders.
	if (!isRecord(data) || typeof data.callId !== 'string' || !data.callId) {
		return undefined;
	}
	return createToolCall(data.callId);
}

function isSupportedImageMimeType(value: unknown): value is string {
	return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

function invalidResultMessage(): string {
	return localize('hostedImage.invalidResult', "The runtime returned an invalid image generation result.");
}

function readImageContent(blocks: readonly unknown[]): { content: ToolResultContent[]; error?: string } {
	const content: ToolResultContent[] = [];
	for (const block of blocks) {
		if (!isRecord(block)) {
			return { content, error: invalidResultMessage() };
		}
		if (block.type === 'text' && typeof block.text === 'string') {
			content.push({ type: ToolResultContentType.Text, text: block.text });
			continue;
		}
		if (!isSupportedImageMimeType(block.mimeType)) {
			return { content, error: invalidResultMessage() };
		}
		if (block.type === 'image' && typeof block.data === 'string' && block.data) {
			try {
				if (decodeBase64(block.data).byteLength === 0) {
					return { content, error: invalidResultMessage() };
				}
			} catch {
				return { content, error: invalidResultMessage() };
			}
			content.push({ type: ToolResultContentType.EmbeddedResource, data: block.data, contentType: block.mimeType });
			continue;
		}
		if (block.type === 'resource_link' && typeof block.uri === 'string' && block.uri) {
			try {
				URI.parse(block.uri, true);
			} catch {
				return { content, error: invalidResultMessage() };
			}
			if (block.size !== undefined && (typeof block.size !== 'number' || !Number.isFinite(block.size) || block.size < 0)) {
				return { content, error: invalidResultMessage() };
			}
			content.push({
				type: ToolResultContentType.Resource,
				uri: block.uri,
				contentType: block.mimeType,
				sizeHint: typeof block.size === 'number' ? block.size : undefined,
			});
			continue;
		}
		return { content, error: invalidResultMessage() };
	}
	return { content };
}

function readNativeImageContent(item: Record<string, unknown>): { content: ToolResultContent[]; error?: string } {
	let mimeType: string;
	switch (item.output_format) {
		case undefined:
		case 'png':
			mimeType = 'image/png';
			break;
		case 'jpeg':
			mimeType = 'image/jpeg';
			break;
		case 'webp':
			mimeType = 'image/webp';
			break;
		default:
			return { content: [], error: invalidResultMessage() };
	}
	return item.result === undefined
		? { content: [] }
		: readImageContent([{ type: 'image', data: item.result, mimeType }]);
}

function readNormalizedImageContent(content: unknown): { content: ToolResultContent[]; error?: string } {
	if (content === undefined) {
		return { content: [] };
	}
	return Array.isArray(content) ? readImageContent(content) : { content: [], error: invalidResultMessage() };
}

function completeToolCall(call: Record<string, unknown>, callId: string, normalized: boolean): ToolCallCompletedState {
	const toolCall = createToolCall(callId);
	const input = normalized ? call.input : call.revised_prompt;
	const result = normalized ? readNormalizedImageContent(call.content) : readNativeImageContent(call);
	const providerError = call.error === undefined || call.error === null
		? undefined
		: typeof call.error === 'string' && call.error
			? call.error
			: isRecord(call.error) && typeof call.error.message === 'string' && call.error.message ? call.error.message : invalidResultMessage();
	const hasImage = result.content.some(block => block.type === ToolResultContentType.EmbeddedResource || block.type === ToolResultContentType.Resource);
	const error = providerError || result.error || (normalized && (typeof call.callId !== 'string' || !call.callId) ? invalidResultMessage() : undefined)
		|| (call.status === 'completed'
			? hasImage ? undefined : localize('hostedImage.noImage', "Image generation completed without an image.")
			: call.status === 'cancelled'
				? localize('hostedImage.cancelled', "Image generation was cancelled.")
				: localize('hostedImage.incomplete', "Image generation did not complete."));
	const success = !error;
	return {
		...toolCall,
		status: ToolCallStatus.Completed,
		toolInput: typeof input === 'string' && input ? JSON.stringify({ prompt: input }) : undefined,
		success,
		pastTenseMessage: getPastTenseMessage(toolCall.toolName, toolCall.displayName, undefined, success),
		content: result.content.length ? result.content : undefined,
		error: error ? { code: 'imageGenerationFailed', message: error } : undefined,
	};
}

export function readHostedImageToolCalls(message: AssistantMessageData): ToolCallCompletedState[] {
	const serverTools = message.serverTools;
	if (!serverTools || serverTools.provider !== 'openai-responses') {
		return [];
	}
	// Read the additive contract structurally while retaining compatibility with the pinned SDK.
	if (isRecord(serverTools) && Array.isArray(serverTools.calls)) {
		const calls: readonly unknown[] = serverTools.calls;
		const images = calls.filter((call): call is Record<string, unknown> => isRecord(call) && call.kind === CopilotToolName.ImageGeneration);
		if (images.length) {
			return images.map((call, index) => completeToolCall(call,
				typeof call.callId === 'string' && call.callId ? call.callId : `${message.messageId}:${index}`, true));
		}
	}
	const result: ToolCallCompletedState[] = [];
	for (const [index, item] of (serverTools.items ?? []).entries()) {
		if (isRecord(item) && item.type === 'image_generation_call') {
			const callId = typeof item.id === 'string' && item.id ? item.id : `${message.messageId}:${index}`;
			result.push(completeToolCall(item, callId, false));
		}
	}
	return result;
}
