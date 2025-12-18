/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatMessage } from '../../../contrib/chat/common/languageModels.js';

export const ILocalAIService = createDecorator<ILocalAIService>('localAIService');

export interface ILocalAIService {
	readonly _serviceBrand: undefined;

	/**
	 * Check if WebGPU is available in the current environment
	 */
	isWebGPUAvailable(): Promise<boolean>;

	/**
	 * Generate text using a local model
	 * @param modelId The model identifier
	 * @param messages The chat messages
	 * @param options Generation options
	 * @param token Cancellation token
	 * @returns Async iterable of generated text chunks
	 */
	generateText(
		modelId: string,
		messages: IChatMessage[],
		options: ILocalAIGenerationOptions,
		token: CancellationToken
	): AsyncIterable<string>;

	/**
	 * Estimate the number of tokens in a text
	 */
	estimateTokens(text: string): number;
}

export interface ILocalAIGenerationOptions {
	maxTokens?: number;
	temperature?: number;
	topP?: number;
}

export enum LocalAIModelId {
	Qwen3_0_6B = 'qwen3-0.6b',
	Phi2 = 'phi-2'
}

export interface ILocalAIModelMetadata {
	readonly id: string;
	readonly name: string;
	readonly huggingFaceId: string;
	readonly description: string;
	readonly maxInputTokens: number;
	readonly maxOutputTokens: number;
	readonly capabilities: {
		readonly vision: boolean;
		readonly toolCalling: boolean;
	};
}

export const LOCAL_AI_MODELS: Record<string, ILocalAIModelMetadata> = {
	[LocalAIModelId.Qwen3_0_6B]: {
		id: LocalAIModelId.Qwen3_0_6B,
		name: 'Qwen3 0.6B',
		huggingFaceId: 'onnx-community/Qwen3-0.6B-ONNX',
		description: 'Local AI model running in your browser (WebGPU)',
		maxInputTokens: 8192,
		maxOutputTokens: 2048,
		capabilities: {
			vision: false,
			toolCalling: true,
		}
	},
	[LocalAIModelId.Phi2]: {
		id: LocalAIModelId.Phi2,
		name: 'Phi-2',
		huggingFaceId: 'Xenova/phi-2',
		description: 'Local AI model running in your browser (WebGPU)',
		maxInputTokens: 2048,
		maxOutputTokens: 1024,
		capabilities: {
			vision: false,
			toolCalling: true,
		}
	}
};
