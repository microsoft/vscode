/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { ContentStreamEvent, ProcessResult } from './streamingTypes.js';
import { ConversationMessage } from './conversationTypes.js';

export const ITextStreamHandler = createDecorator<ITextStreamHandler>('textStreamHandler');

export interface ITextStreamHandler {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when streaming data is available for UI
	 */
	readonly onStreamingData: Event<any>;

	/**
	 * Event fired when a message is added to conversation
	 */
	readonly onMessageAdded: Event<ConversationMessage>;

	/**
	 * Event fired when thinking message should be hidden
	 */
	readonly onThinkingMessageHide: Event<void>;

	/**
	 * Handle a content stream event
	 */
	handle(event: ContentStreamEvent): Promise<ProcessResult>;

	/**
	 * Reset handler state for new streaming session
	 */
	reset(): void;

	/**
	 * Complete any ongoing text message
	 */
	completeTextMessage(userMessageId?: number): Promise<void>;

	/**
	 * Check if handler has active streaming content
	 */
	hasActiveContent(): boolean;
}
