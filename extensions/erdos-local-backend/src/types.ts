/*---------------------------------------------------------------------------------------------
 * Copyright (c) Lotas Inc. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Import and re-export from conversationTypes for compatibility
import { ConversationMessage, FunctionCall } from './conversationTypes.js';
export { ConversationMessage, FunctionCall };

export interface StreamData {
    type: 'content' | 'function_call' | 'error' | 'done' | 'function_delta' | 'function_complete' | 'thinking' | 'end_turn' | 'ai_stream_data';
    content?: string;
    functionCall?: FunctionCall;
    error?: { message: string; type?: string; details?: any };
    delta?: string;
    field?: string;
    call_id?: string;
    response?: string;
    isComplete?: boolean;
    thinking?: boolean;
    end_turn?: boolean;
    messageId?: string;
    request_id?: string;
    sequence?: number;
    isCancelled?: boolean;
    isFunctionCall?: boolean;
}

// Service interfaces for extension context
export interface IFunctionDefinitionService {
    getFunctionsByNames(functionNames: string[]): any[];
    loadDeveloperInstructions(model: string): Promise<string>;
}

export interface IStreamingService {
    sendErrorEvent(onData: (data: StreamData) => void, request_id: string, errorMessage: string): void;
    sendEndTurnEvent(onData: (data: StreamData) => void, request_id: string): void;
    sendCompleteEvent(onData: (data: StreamData) => void, request_id: string, field: string, value: string): void;
    sendDeltaEvent(onData: (data: StreamData) => void, request_id: string, field: string, delta: string): void;
}

export interface ILocalBackendService {
    processStreamingQuery(
        messages: ConversationMessage[],
        provider: string,
        model: string,
        temperature: number,
        request_id: string,
        contextData: any,
        onData: (data: StreamData) => void,
        onError: (error: Error) => void,
        onComplete: () => void,
        webSearchEnabled?: boolean
    ): Promise<void>;
}

// Extension service interface for global access from workbench
export interface IErdosLocalBackendExtensionService {
    context: any; // VSCode ExtensionContext
    getApiKey(provider: 'anthropic' | 'openai' | 'sagemaker'): Promise<string | undefined>;
    isBYOKEnabled(provider: 'anthropic' | 'openai' | 'sagemaker'): Promise<boolean>;
    processStreamingQuery(
        messages: ConversationMessage[],
        provider: string,
        model: string,
        temperature: number,
        request_id: string,
        contextData: any,
        onData: (data: StreamData) => void,
        onError: (error: Error) => void,
        onComplete: () => void,
        webSearchEnabled?: boolean
    ): Promise<void>;
}