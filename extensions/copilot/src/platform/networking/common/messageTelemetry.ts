/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ThinkingDataInMessage } from '../../thinking/common/thinking';

/**
 * Structural view of provider messages used only for restricted telemetry. Provider-specific
 * fields are retained by the serializer, not translated into model request parameters.
 */
export interface TelemetryMessage extends ThinkingDataInMessage {
	readonly role: string;
	readonly content?: string | readonly TelemetryContentPart[] | null;
	readonly type?: string;
	readonly phase?: string | null;
	readonly summary?: readonly { readonly type: string; readonly text: string }[];
	readonly encrypted_content?: string | null;
	readonly tool_calls?: readonly { readonly id?: string; readonly function?: { readonly name?: string; readonly arguments?: string } }[];
	readonly content_metadata?: readonly TelemetryContentMetadata[];
}

interface TelemetryContentPart {
	readonly type: string;
	readonly text?: string;
	readonly thinking?: string;
	readonly signature?: string;
	readonly data?: string;
}

/**
 * `path` is a JSON pointer into the serialized message. Visibility describes known intended
 * presentation, not whether a UI actually rendered it. Unknown provenance stays unknown.
 * Text is never parsed as JSON or classified by a prefix such as "Reasoning summary:".
 * `json` identifies an already-structured value; it does not instruct consumers to parse a string.
 */
interface TelemetryContentMetadata {
	readonly path: string;
	readonly purpose: 'answer' | 'assistant_response' | 'context' | 'prompt' | 'reasoning' | 'reasoning_summary' | 'conversation_summary' | 'tool_call' | 'tool_result' | 'unknown';
	readonly visibility: 'user_visible' | 'model_only' | 'opaque' | 'unknown';
	readonly format: 'text' | 'json' | 'opaque';
}

/** Adds classification without changing or parsing any provider-authored content. */
export function withMessageContentMetadata(message: TelemetryMessage): TelemetryMessage {
	const metadata: TelemetryContentMetadata[] = [];
	const contentPurpose = message.type === 'compaction' ? 'conversation_summary'
		: message.type === 'reasoning' ? 'reasoning'
		: message.role === 'system' || message.role === 'developer' ? 'context'
			: message.role === 'user' ? 'prompt'
				: message.role === 'tool' || message.role === 'function' ? 'tool_result'
					: message.role === 'assistant' ? message.phase === 'final_answer' ? 'answer' : 'assistant_response'
						: 'unknown';
	const contentVisibility = message.role === 'system' || message.role === 'developer' ? 'model_only'
		: message.role === 'assistant' && message.phase === 'final_answer' ? 'user_visible' : 'unknown';
	if (typeof message.content === 'string') {
		metadata.push({ path: '/content', purpose: contentPurpose, visibility: contentVisibility, format: 'text' });
	} else if (message.content) {
		message.content.forEach((part, index) => {
			const path = `/content/${index}`;
			switch (part.type) {
				case 'reasoning_text':
					metadata.push({ path: `${path}/text`, purpose: 'reasoning', visibility: 'unknown', format: 'text' });
					break;
				case 'thinking':
					metadata.push({ path: `${path}/thinking`, purpose: 'reasoning', visibility: 'unknown', format: 'text' });
					if (part.signature !== undefined) {
						metadata.push({ path: `${path}/signature`, purpose: 'reasoning', visibility: 'opaque', format: 'opaque' });
					}
					break;
				case 'redacted_thinking':
					metadata.push({ path: `${path}/data`, purpose: 'reasoning', visibility: 'opaque', format: 'opaque' });
					break;
				case 'tool_use':
					metadata.push({ path, purpose: 'tool_call', visibility: 'model_only', format: 'json' });
					break;
				case 'tool_result':
					metadata.push({ path, purpose: 'tool_result', visibility: 'unknown', format: 'json' });
					break;
				default:
					metadata.push({
						path: part.text !== undefined ? `${path}/text` : path,
						purpose: contentPurpose,
						visibility: contentVisibility,
						format: part.text !== undefined ? 'text' : 'json',
					});
			}
		});
	}
	for (const field of ['reasoning_text', 'reasoning_content', 'reasoning', 'cot_summary'] as const) {
		if (message[field] !== undefined) {
			metadata.push({ path: `/${field}`, purpose: field === 'cot_summary' ? 'reasoning_summary' : 'reasoning', visibility: 'unknown', format: 'text' });
		}
	}
	for (const field of ['reasoning_opaque', 'cot_id', 'encrypted_content'] as const) {
		if (message[field] !== undefined && message[field] !== null) {
			metadata.push({ path: `/${field}`, purpose: message.type === 'compaction' ? 'conversation_summary' : 'reasoning', visibility: 'opaque', format: 'opaque' });
		}
	}
	message.summary?.forEach((part, index) => {
		metadata.push({ path: `/summary/${index}/text`, purpose: 'reasoning_summary', visibility: 'unknown', format: 'text' });
	});
	if (message.tool_calls?.length) {
		metadata.push({ path: '/tool_calls', purpose: 'tool_call', visibility: 'model_only', format: 'json' });
	}
	return { ...message, content_metadata: metadata };
}
