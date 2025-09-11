/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { StreamEvent } from './streamingTypes.js';

export const IStreamingOrchestrator = createDecorator<IStreamingOrchestrator>('streamingOrchestrator');

export interface IStreamingOrchestrator {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when streaming data is available for UI
	 */
	readonly onStreamingData: Event<any>;

	/**
	 * Event fired when a message is added to conversation
	 */
	readonly onMessageAdded: Event<any>;

	/**
	 * Event fired when function call display message is available
	 */
	readonly onFunctionCallDisplayMessage: Event<{ id: number; function_call: any; timestamp: string }>;

	/**
	 * Event fired when streaming widget is requested (bypasses normal widget creation)
	 */
	readonly onStreamingWidgetRequested: Event<any>;

	/**
	 * Event fired when widget streaming update is available
	 */
	readonly onWidgetStreamingUpdate: Event<any>;

	/**
	 * Event fired when widget button action is triggered
	 */
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }>;

	/**
	 * Event fired when widget content is updated asynchronously (for run_file widgets)
	 */
	readonly onWidgetContentUpdated: Event<{ messageId: number; content: string; functionType: string }>;

	/**
	 * Check if widget streaming is complete
	 */
	isWidgetStreamingComplete(messageId: number): boolean;

	/**
	 * Event fired when thinking message should be hidden
	 */
	readonly onThinkingMessageHide: Event<void>;

	/**
	 * Event fired when orchestrator processing state changes
	 */
	readonly onOrchestratorStateChange: Event<{isProcessing: boolean}>;

	/**
	 * Event fired when a batch completes (all functions in batch finished)
	 */
	readonly onBatchCompleted: Event<{batchId: string; status: string}>;

	/**
	 * Process a single stream event and orchestrate the appropriate response
	 */
	processStreamEvent(event: StreamEvent): Promise<void>;


	/**
	 * Cancel current orchestration
	 */
	cancel(): void;

	/**
	 * Set the current user message ID for orchestration context
	 */
	setCurrentUserMessageId(messageId: number): void;

	/**
	 * Set the current request ID for orchestration context
	 */
	setCurrentRequestId(requestId: string): void;

	/**
	 * Clear the function queue - used when switching conversations
	 */
	clearFunctionQueue(): void;

	/**
	 * Clear current batch - called before each API call to start fresh
	 */
	clearCurrentBatch(): void;

	/**
	 * Check if all processing is complete (no active batches)
	 */
	isProcessingComplete(): boolean;

	/**
	 * Get the current batch status for decision making
	 */
	getCurrentBatchStatus(): 'pending' | 'continue_silent' | 'done' | 'error' | null;

	/**
	 * Get the current batch ID
	 */
	getCurrentBatchId(): string | null;

	/**
	 * Check if there are active widgets waiting for user interaction
	 */
	hasActiveWidgets(): boolean;

	/**
	 * Get widget by messageId for checking async content updates
	 */
	getWidget(messageId: number): any;

}
