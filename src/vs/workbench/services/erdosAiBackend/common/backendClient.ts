/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { BackendConfig, HealthResponse } from './types.js';
import { ConversationMessage } from '../../erdosAi/common/conversationTypes.js';
import { StreamData } from '../browser/streamingParser.js';

export const IBackendClient = createDecorator<IBackendClient>('backendClient');

export interface IBackendClient {
	readonly _serviceBrand: undefined;

	detectEnvironment(): Promise<BackendConfig>;
	getBackendConfig(): Promise<BackendConfig>;
	checkHealth(): Promise<HealthResponse>;
	sendStreamingQuery(
		messages: ConversationMessage[],
		provider: string,
		model: string,
		temperature: number,
		requestId: string,
		contextData: any,
		onData: (data: StreamData) => void,
		onError: (error: Error) => void,
		onComplete: () => void
	): Promise<void>;
	cancelStreaming(): void;
	cancelRequest(requestId: string): Promise<boolean>;
	getEnvironmentName(): Promise<string>;
	getUserProfile(): Promise<any>;
	getSubscriptionStatus(): Promise<any>;
	generateConversationName(conversation: any[], provider?: string, model?: string): Promise<string | null>;
	sendBackgroundSummarizationRequest(
		conversationPortion: ConversationMessage[],
		targetQueryNumber: number,
		previousSummary: any | null,
		requestId: string,
		onComplete: (result: { success: boolean; summary?: string; error?: string }) => void
	): void;
	getAvailableModels(): Promise<string[]>;
	checkBackendHealth(): Promise<boolean>;
	getBackendEnvironment(): Promise<string>;
}
