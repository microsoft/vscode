/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Model provider identifiers
 */
export const enum DSpaceModelId {
	Online = 'dspace-online',
	Offline = 'dspace-local'
}

/**
 * Common message format for model providers
 */
export interface IDSpaceMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_calls?: IDSpaceToolCall[];
	tool_call_id?: string;
	name?: string;
}

/**
 * Tool definition format (OpenAI-compatible)
 */
export interface IDSpaceTool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: unknown;
	};
}

/**
 * Tool call format
 */
export interface IDSpaceToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

/**
 * Streaming chunk types
 */
export interface IDSpaceStreamChunk {
	type: 'text' | 'tool_calls' | 'done';
	content?: string;
	toolCalls?: IDSpaceToolCall[];
	finishReason?: string;
}

/**
 * Model provider interface
 * Both online and offline providers must implement this interface
 */
export interface IDSpaceModelProvider {
	/**
	 * Unique identifier for this provider
	 */
	readonly id: DSpaceModelId;

	/**
	 * Human-readable name for this provider
	 */
	readonly name: string;

	/**
	 * Check if this provider is currently available
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Generate a streaming response
	 * @param messages The conversation messages
	 * @param tools Available tools for the model to use
	 * @param token Cancellation token
	 * @returns Async iterable of stream chunks
	 */
	generateStream(
		messages: IDSpaceMessage[],
		tools: IDSpaceTool[],
		token: CancellationToken
	): AsyncIterable<IDSpaceStreamChunk>;
}

/**
 * Model provider service interface
 * Manages model providers and selection
 */
export interface IDSpaceModelProviderService {
	readonly _serviceBrand: undefined;

	/**
	 * Get all registered providers
	 */
	getProviders(): IDSpaceModelProvider[];

	/**
	 * Get the currently active provider
	 */
	getActiveProvider(): IDSpaceModelProvider;

	/**
	 * Set the active provider by ID
	 */
	setActiveProvider(id: DSpaceModelId): void;

	/**
	 * Get the active provider ID
	 */
	getActiveProviderId(): DSpaceModelId;

	/**
	 * Check if the system is currently online
	 */
	isOnline(): boolean;

	/**
	 * Auto-select the best provider based on connectivity
	 */
	autoSelectProvider(): void;
}

export const IDSpaceModelProviderService = createDecorator<IDSpaceModelProviderService>('dSpaceModelProviderService');

