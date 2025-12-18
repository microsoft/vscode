/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMessage } from '../../../contrib/chat/common/languageModels.js';
import { ILocalAIGenerationOptions } from './localAI.js';

/**
 * Protocol for communication between main thread and inference worker
 */

// Messages from main thread to worker
export interface ILocalAIInferenceWorker {
	/**
	 * Test ping method
	 */
	$ping(): Promise<string>;

	/**
	 * Load and initialize the worker with a specific model
	 */
	$loadModel(modelId: string, huggingFaceId: string): Promise<string>;

	/**
	 * Generate text from messages
	 * @param requestId Unique identifier for this generation request (used for streaming callbacks)
	 * @returns Promise that resolves when generation is complete
	 */
	$generateText(
		requestId: string,
		messages: IChatMessage[],
		options: ILocalAIGenerationOptions
	): Promise<void>;

	/**
	 * Estimate token count for text
	 */
	$estimateTokens(text: string): Promise<number>;

	/**
	 * Cleanup and dispose resources
	 */
	$dispose(): Promise<void>;
}

// Messages from worker to main thread
export abstract class LocalAIInferenceWorkerHost {
	public static CHANNEL_NAME = 'localAIInferenceWorkerHost';

	public static getChannel(workerServer: { getChannel(name: string): LocalAIInferenceWorkerHost }): LocalAIInferenceWorkerHost {
		return workerServer.getChannel(LocalAIInferenceWorkerHost.CHANNEL_NAME);
	}

	/**
	 * Log a message from the worker
	 */
	abstract $logMessage(level: 'info' | 'warn' | 'error', message: string): Promise<void>;

	/**
	 * Report model loading progress
	 * @param phase The loading phase ('tokenizer' or 'model')
	 * @param status The progress status ('initiate', 'download', 'progress', 'done', 'ready')
	 * @param file The file being loaded
	 * @param progress Progress percentage (0-100) if status is 'progress'
	 * @param loaded Number of bytes loaded if status is 'progress'
	 * @param total Total number of bytes if status is 'progress'
	 */
	abstract $onLoadProgress(
		phase: 'tokenizer' | 'model',
		status: string,
		file?: string,
		progress?: number,
		loaded?: number,
		total?: number
	): Promise<void>;

	/**
	 * Receive a token chunk from streaming generation
	 * @param requestId The request ID this chunk belongs to
	 * @param chunk The text chunk (delta)
	 */
	abstract $onGeneratedToken(requestId: string, chunk: string): Promise<void>;

	/**
	 * Notify that generation is complete
	 * @param requestId The request ID that completed
	 */
	abstract $onGenerationComplete(requestId: string): Promise<void>;

	/**
	 * Notify that generation failed
	 * @param requestId The request ID that failed
	 * @param error The error message
	 */
	abstract $onGenerationError(requestId: string, error: string): Promise<void>;
}
