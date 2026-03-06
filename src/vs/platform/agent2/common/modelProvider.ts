/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model provider interface.
 *
 * A model provider is a pluggable adapter that speaks the loop's internal
 * conversation format and translates to a specific wire API. Providers handle
 * all wire-format serialization, auth, retry, and streaming.
 *
 * See {@link AnthropicModelProvider} for the Anthropic Messages API implementation.
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IConversationMessage, IModelIdentity } from './conversation.js';
import { IAgentToolDefinition } from './tools.js';

// -- Model response chunks ----------------------------------------------------

export interface ITextDeltaChunk {
	readonly type: 'text-delta';
	readonly text: string;
}

export interface IToolCallStartChunk {
	readonly type: 'tool-call-start';
	readonly toolCallId: string;
	readonly toolName: string;
}

export interface IToolCallDeltaChunk {
	readonly type: 'tool-call-delta';
	readonly toolCallId: string;
	readonly argumentsDelta: string;
}

export interface IToolCallCompleteChunk {
	readonly type: 'tool-call-complete';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly arguments: string; // Raw JSON string
}

export interface IThinkingDeltaChunk {
	readonly type: 'thinking-delta';
	readonly text: string;
}

export interface IThinkingSignatureChunk {
	readonly type: 'thinking-signature';
	readonly signature: string;
}

export interface IUsageChunk {
	readonly type: 'usage';
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly reasoningTokens?: number;
	readonly cacheReadTokens?: number;
	readonly cacheCreationTokens?: number;
}

export interface IProviderMetadataChunk {
	readonly type: 'provider-metadata';
	readonly metadata: Record<string, unknown>;
}

export type ModelResponseChunk =
	| ITextDeltaChunk
	| IToolCallStartChunk
	| IToolCallDeltaChunk
	| IToolCallCompleteChunk
	| IThinkingDeltaChunk
	| IThinkingSignatureChunk
	| IUsageChunk
	| IProviderMetadataChunk;

// -- Model configuration ------------------------------------------------------

/**
 * Configuration passed to the model provider. Provider-specific options
 * (reasoning effort, thinking budget, etc.) are passed via the
 * `providerOptions` bag.
 */
export interface IModelRequestConfig {
	/** Maximum tokens in the response. */
	readonly maxOutputTokens?: number;
	/** Temperature for sampling (0-1). */
	readonly temperature?: number;
	/**
	 * Named quality tier that maps to provider-specific reasoning config.
	 * E.g., 'low', 'medium', 'high'.
	 */
	readonly reasoningEffort?: string;
	/**
	 * Provider-specific options. The provider interprets these; the loop
	 * passes them through opaquely.
	 */
	readonly providerOptions?: Record<string, unknown>;
}

// -- Model info ---------------------------------------------------------------

export interface IModelInfo {
	readonly identity: IModelIdentity;
	readonly displayName: string;
	readonly maxContextWindow: number;
	readonly maxOutputTokens: number;
	readonly supportsVision: boolean;
	readonly supportsReasoning: boolean;
	readonly supportedReasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
}

// -- Provider interface -------------------------------------------------------

/**
 * A pluggable model provider that translates between the internal conversation
 * format and a specific wire API.
 */
export interface IModelProvider {
	/** Provider identifier (e.g., 'anthropic', 'openai'). */
	readonly providerId: string;

	/**
	 * Send a request to the model and return a stream of response chunks.
	 *
	 * @param systemPrompt - System-level instructions.
	 * @param messages - Conversation messages in internal format (excludes system).
	 * @param tools - Available tool definitions.
	 * @param config - Request configuration.
	 * @param token - Cancellation token for aborting the request.
	 * @returns An async iterable of response chunks.
	 */
	sendRequest(
		systemPrompt: string,
		messages: readonly IConversationMessage[],
		tools: readonly IAgentToolDefinition[],
		config: IModelRequestConfig,
		token: CancellationToken,
	): AsyncIterable<ModelResponseChunk>;

	/** List available models from this provider. */
	listModels(): Promise<readonly IModelInfo[]>;
}
