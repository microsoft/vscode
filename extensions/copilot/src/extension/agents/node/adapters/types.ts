/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import * as http from 'http';
import type { IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { APIUsage } from '../../../../platform/networking/common/openai';

export interface IParsedRequest {
	readonly model?: string;
	readonly messages: readonly Raw.ChatMessage[];
	readonly options?: IMakeChatRequestOptions['requestOptions'];
	readonly type?: string;
}

export interface IStreamEventData {
	readonly event: string;
	readonly data: string;
}

export interface IAgentTextBlock {
	readonly type: 'text';
	readonly content: string;
}

export interface IAgentToolCallBlock {
	readonly type: 'tool_call';
	readonly callId: string;
	readonly name: string;
	readonly input: object;
}

export type IAgentStreamBlock = IAgentTextBlock | IAgentToolCallBlock;

export interface IProtocolAdapter {
	/**
	 * The name of this protocol adapter
	 */
	readonly name: string;

	/**
	 * Parse the incoming request body and convert to VS Code format
	 */
	parseRequest(body: string): IParsedRequest;

	/**
	 * Convert raw streaming data to protocol-specific events
	 */
	formatStreamResponse(
		streamData: IAgentStreamBlock,
		context: IStreamingContext
	): readonly IStreamEventData[];

	/**
	 * Generate the final events to close the stream
	 */
	generateFinalEvents(context: IStreamingContext, usage?: APIUsage): readonly IStreamEventData[];

	/**
	 * Generate initial events to start the stream (optional, protocol-specific)
	 */
	generateInitialEvents?(context: IStreamingContext): readonly IStreamEventData[];

	/**
	 * Get the content type for responses
	 */
	getContentType(): string;

	/**
	 * Extract the authentication key/nonce from request headers
	 */
	extractAuthKey(headers: http.IncomingHttpHeaders): string | undefined;
}

export interface IProtocolAdapterFactory {
	/**
	 * Create a new adapter instance for a request
	 */
	createAdapter(): IProtocolAdapter;
}

export interface IStreamingContext {
	readonly requestId: string;
	readonly endpoint: {
		readonly modelId: string;
		readonly modelMaxPromptTokens: number;
	};
}
