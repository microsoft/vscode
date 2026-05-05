/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { RequestMetadata } from '@vscode/copilot-api';
import type { LanguageModelChat } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { TokenizerType } from '../../../util/common/tokenizer';
import { Event } from '../../../util/vs/base/common/event';
import type { ChatRequest } from '../../../vscodeTypes';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../networking/common/networking';

export type CustomModel = {
	key_name: string;
	owner_name: string;
};

export type EndpointEditToolName = 'find-replace' | 'multi-find-replace' | 'apply-patch' | 'code-rewrite';

const allEndpointEditToolNames: ReadonlySet<EndpointEditToolName> = new Set([
	'find-replace',
	'multi-find-replace',
	'apply-patch',
	'code-rewrite'
]);

export function isEndpointEditToolName(toolName: string): toolName is EndpointEditToolName {
	return allEndpointEditToolNames.has(toolName as EndpointEditToolName);
}

export type IChatModelCapabilities = {
	type: 'chat';
	family: string;
	tokenizer: TokenizerType;
	limits?: {
		max_prompt_tokens?: number;
		max_output_tokens?: number;
		max_context_window_tokens?: number;
		vision?: {
			max_prompt_images?: number;
		};
	};
	supports: {
		parallel_tool_calls?: boolean;
		tool_calls?: boolean;
		// Whether or not the model supports streaming, if not explicitly true we will try to parse the response as not streamed
		streaming: boolean | undefined;
		vision?: boolean;
		prediction?: boolean;
		thinking?: boolean;
		adaptive_thinking?: boolean;
		max_thinking_budget?: number;
		min_thinking_budget?: number;
		reasoning_effort?: string[];
		tool_search?: boolean;
		context_editing?: boolean;
	};
};

export type IEmbeddingModelCapabilities = {
	type: 'embeddings';
	family: string;
	tokenizer: TokenizerType;
	limits?: { max_inputs?: number };
};

type ICompletionModelCapabilities = {
	type: 'completion';
	family: string;
	tokenizer: TokenizerType;
};

export enum ModelSupportedEndpoint {
	ChatCompletions = '/chat/completions',
	Responses = '/responses',
	WebSocketResponses = 'ws:/responses',
	Messages = '/v1/messages'
}

export interface IModelTokenPrices {
	batch_size: number;
	cache_price: number;
	input_price: number;
	output_price: number;
}

export interface IModelBilling {
	is_premium?: boolean;
	multiplier?: number;
	restricted_to?: string[];
	token_prices?: IModelTokenPrices;
}

export interface IModelAPIResponse {
	id: string;
	vendor: string;
	name: string;
	model_picker_enabled: boolean;
	preview?: boolean;
	is_chat_default: boolean;
	is_chat_fallback: boolean;
	version: string;
	warning_messages?: { code: string; message: string }[];
	info_messages?: { code: string; message: string }[];
	billing?: IModelBilling;
	capabilities: IChatModelCapabilities | ICompletionModelCapabilities | IEmbeddingModelCapabilities;
	supported_endpoints?: ModelSupportedEndpoint[];
	custom_model?: CustomModel;
}

export type IChatModelInformation = IModelAPIResponse & {
	capabilities: IChatModelCapabilities;
	urlOrRequestMetadata?: string | RequestMetadata;
	requestHeaders?: Readonly<Record<string, string>>;
	zeroDataRetentionEnabled?: boolean;
};

export function isChatModelInformation(model: IModelAPIResponse): model is IChatModelInformation {
	return model.capabilities.type === 'chat';
}

export function isEmbeddingModelInformation(model: IModelAPIResponse): model is IEmbeddingModelInformation {
	return model.capabilities.type === 'embeddings';
}

export type IEmbeddingModelInformation = IModelAPIResponse & { capabilities: IEmbeddingModelCapabilities };

export type ICompletionModelInformation = IModelAPIResponse & {
	capabilities: ICompletionModelCapabilities;
};

export function isCompletionModelInformation(model: IModelAPIResponse): model is ICompletionModelInformation {
	return model.capabilities.type === 'completion';
}

export type ChatEndpointFamily = 'copilot-base' | 'copilot-fast';
export type EmbeddingsEndpointFamily = 'text3small' | 'metis';

export interface IEndpointProvider {
	readonly _serviceBrand: undefined;

	/**
	 * Fires whenever model metadata is refreshed from the server.
	 * Does not always indicate there is a change, just that the data is fresh.
	 */
	readonly onDidModelsRefresh: Event<void>;

	/**
	 * Gets all the completion models known by the endpoint provider.
	 */
	getAllCompletionModels(forceRefresh?: boolean): Promise<ICompletionModelInformation[]>;

	/**
	 * Gets all the chat endpoints known by the endpoint provider. Mainly used by language model access
	 */
	getAllChatEndpoints(): Promise<IChatEndpoint[]>;

	/**
	 * Given a chat request returns the appropriate chat endpoint to serve that request
	 * @param requestOrFamily The chat request to get the endpoint for, the family you want the endpoint for, or the LanguageModelChat.
	 */
	getChatEndpoint(requestOrFamily: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint>;

	/**
	 * Get the CAPI embedding endpoint information
	 */
	getEmbeddingsEndpoint(family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint>;
}

export const IEndpointProvider = createServiceIdentifier<IEndpointProvider>('IEndpointProvider');
