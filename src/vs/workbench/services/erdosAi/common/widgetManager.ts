/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { FunctionBranch } from '../browser/parallelFunctionBranchManager.js';

export const IWidgetManager = createDecorator<IWidgetManager>('widgetManager');

/**
 * Information about an active widget
 */
export interface ActiveWidget {
	messageId: number;
	callId: string;
	functionType: string;
	requestId: string;
	isStreaming: boolean;
	accumulatedContent: string;
	streamedContent: string;
	isStreamingComplete: boolean;
	onStreamingCompleteCallback?: () => void;

	/**
	 * Append delta to accumulated content
	 */
	appendDelta(delta: string): void;

	/**
	 * Mark widget as complete
	 */
	markComplete(): void;
}

/**
 * Widget streaming update data
 */
export interface WidgetStreamingUpdate {
	messageId: number;
	delta: string;
	isComplete: boolean;
	replaceContent?: boolean;
	isSearchReplace?: boolean;
	field?: string;
	filename?: string;
	language?: 'python' | 'r';
	requestId?: string;
	diffData?: {
		diff_data: any[];
		added: number;
		deleted: number;
		clean_filename?: string;
	};
}


export interface IWidgetManager {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when a widget is requested
	 */
	readonly onWidgetRequested: Event<any>;

	/**
	 * Event fired when widget content is updated
	 */
	readonly onWidgetStreamingUpdate: Event<WidgetStreamingUpdate>;

	/**
	 * Event fired when widget button action is triggered
	 */
	readonly onWidgetButtonAction: Event<{ messageId: number; action: string }>;

	/**
	 * Event fired when widget content is updated asynchronously (for run_file widgets)
	 */
	readonly onWidgetContentUpdated: Event<{ messageId: number; content: string; functionType: string }>;

	/**
	 * Event fired when a widget is created and ready for streaming
	 */
	readonly onWidgetCreated: Event<string>;

	/**
	 * Create a widget for a function branch
	 */
	createWidgetFromBranch(branch: FunctionBranch): Promise<ActiveWidget | null>;

	/**
	 * Create a synchronous streaming widget immediately (for streaming functions that start with deltas)
	 */
	createSynchronousStreamingWidget(callId: string, messageId: number, functionType: string, requestId: string): ActiveWidget;

	/**
	 * Get active widget by call ID
	 */
	getActiveWidget(callId: string): ActiveWidget | null;

	/**
	 * Check if widget streaming is complete by messageId
	 */
	isWidgetStreamingComplete(messageId: number): boolean;

	/**
	 * Mark widget as complete and clean up
	 */
	markWidgetComplete(callId: string): void;

	/**
	 * Start streaming buffered data to a widget
	 */
	startStreaming(widget: ActiveWidget, bufferedData: string[]): Promise<void>;

	/**
	 * Stream delta to widget
	 */
	streamDelta(callId: string, delta: string, field?: string): void;

	/**
	 * Mark widget streaming as complete
	 */
	completeWidgetStreaming(callId: string): void;

	/**
	 * Fire widget button action
	 */
	fireWidgetButtonAction(messageId: number, action: string): void;

	/**
	 * Check if widget exists and is streaming
	 */
	isWidgetStreaming(callId: string): boolean;

	/**
	 * Check if there are any active widgets waiting for user interaction
	 */
	hasPendingInteractiveWidgets(): boolean;

	/**
	 * Generate diff data for search_replace
	 */
	generateSearchReplaceDiff(callId: string, messageId: number, completeArguments: string, requestId: string, userMessageId: number): Promise<{success: boolean, errorMessage?: string}>;

	/**
	 * Get widget by messageId for checking async content updates
	 */
	getWidget(messageId: number): any;
}
