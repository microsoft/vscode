/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';

export const IAIAssistantService = createDecorator<IAIAssistantService>('aiAssistantService');

export interface IAIProvider {
	readonly id: string;
	readonly name: string;
	readonly apiKey?: string;
	readonly endpoint?: string;
	readonly model?: string;
	readonly maxTokens?: number;
	readonly temperature?: number;
}

export interface IAICompletionRequest {
	readonly prompt: string;
	readonly context?: string;
	readonly language?: string;
	readonly maxTokens?: number;
	readonly temperature?: number;
	readonly stopSequences?: string[];
}

export interface IAICompletionResponse {
	readonly text: string;
	readonly confidence?: number;
	readonly tokens?: number;
}

export interface IAIChatMessage {
	readonly role: 'user' | 'assistant' | 'system';
	readonly content: string;
	readonly timestamp?: Date;
}

export interface IAIChatRequest {
	readonly messages: IAIChatMessage[];
	readonly context?: {
		readonly files?: URI[];
		readonly selection?: { uri: URI; range: Range };
		readonly workspace?: URI;
	};
	readonly maxTokens?: number;
	readonly temperature?: number;
}

export interface IAIChatResponse {
	readonly message: IAIChatMessage;
	readonly tokens?: number;
	readonly references?: URI[];
}

export interface IAICodeGenerationRequest {
	readonly instruction: string;
	readonly context?: {
		readonly file?: URI;
		readonly position?: Position;
		readonly selection?: Range;
		readonly surroundingCode?: string;
	};
	readonly language?: string;
	readonly style?: 'function' | 'class' | 'snippet' | 'complete';
}

export interface IAICodeGenerationResponse {
	readonly code: string;
	readonly explanation?: string;
	readonly confidence?: number;
}

export interface IAIRefactoringRequest {
	readonly code: string;
	readonly instruction: string;
	readonly language?: string;
	readonly context?: {
		readonly file?: URI;
		readonly range?: Range;
	};
}

export interface IAIRefactoringResponse {
	readonly refactoredCode: string;
	readonly explanation?: string;
	readonly changes?: Array<{
		readonly range: Range;
		readonly newText: string;
		readonly description?: string;
	}>;
}

export interface IAIExplanationRequest {
	readonly code: string;
	readonly language?: string;
	readonly context?: {
		readonly file?: URI;
		readonly range?: Range;
	};
	readonly type?: 'explain' | 'document' | 'comment';
}

export interface IAIExplanationResponse {
	readonly explanation: string;
	readonly documentation?: string;
	readonly comments?: Array<{
		readonly position: Position;
		readonly text: string;
	}>;
}

export interface IAIAssistantService {
	readonly _serviceBrand: undefined;

	// Events
	readonly onDidChangeProvider: Event<IAIProvider | undefined>;
	readonly onDidReceiveCompletion: Event<IAICompletionResponse>;
	readonly onDidReceiveChatResponse: Event<IAIChatResponse>;

	// Provider management
	readonly currentProvider: IAIProvider | undefined;
	setProvider(provider: IAIProvider): void;
	getAvailableProviders(): IAIProvider[];
	registerProvider(provider: IAIProvider): IDisposable;

	// Core AI capabilities
	generateCompletion(request: IAICompletionRequest, token?: CancellationToken): Promise<IAICompletionResponse>;
	generateChat(request: IAIChatRequest, token?: CancellationToken): Promise<IAIChatResponse>;
	generateCode(request: IAICodeGenerationRequest, token?: CancellationToken): Promise<IAICodeGenerationResponse>;
	refactorCode(request: IAIRefactoringRequest, token?: CancellationToken): Promise<IAIRefactoringResponse>;
	explainCode(request: IAIExplanationRequest, token?: CancellationToken): Promise<IAIExplanationResponse>;

	// Utility methods
	isAvailable(): boolean;
	getConfiguration(): any;
	updateConfiguration(config: any): void;
}
