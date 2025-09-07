/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionCall } from './conversationTypes.js';

/**
 * Base streaming event interface
 */
export interface StreamEvent {
	type: 'content' | 'function_call' | 'function_delta' | 'function_complete' | 'done';
}

/**
 * Text content streaming event
 */
export interface ContentStreamEvent extends StreamEvent {
	type: 'content';
	delta: string;
}

/**
 * Function call received event
 */
export interface FunctionCallStreamEvent extends StreamEvent {
	type: 'function_call';
	functionCall: FunctionCall;
}

/**
 * Function delta streaming event (interactive functions)
 */
export interface FunctionDeltaStreamEvent extends StreamEvent {
	type: 'function_delta';
	call_id: string;
	field: string;
	delta: string;
}

/**
 * Function streaming complete event
 */
export interface FunctionCompleteStreamEvent extends StreamEvent {
	type: 'function_complete';
	call_id: string;
	field: string;
}

/**
 * Stream complete event
 */
export interface StreamCompleteEvent extends StreamEvent {
	type: 'done';
	isComplete: boolean;
}

/**
 * Result from processing a stream event
 */
export interface ProcessResult {
	type: 'TEXT_STREAMING' | 'FUNCTION_RECEIVED' | 'FUNCTION_READY' | 'STREAM_COMPLETE';
	data?: any;
	functionCall?: FunctionCall;
	callId?: string;
	delta?: string;
}

/**
 * Result from executing an action
 */
export interface ExecutionResult {
	type: 'FUNCTION_COMPLETE' | 'WIDGET_CREATED' | 'ERROR' | 'CONTINUE';
	data?: any;
	widget?: any;
	error?: string;
}

/**
 * Orchestration context for actions
 */
export interface OrchestrationContext {
	userMessageId: number;
	requestId: string;
	conversationManager: any; // IConversationManager - keeping as any to avoid circular imports
	widgetManager: any; // IWidgetManager - keeping as any to avoid circular imports
}

