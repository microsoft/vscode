/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITextStreamHandler } from '../common/textStreamHandler.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { IThinkingProcessor } from '../common/thinkingProcessor.js';
import { ContentStreamEvent, ProcessResult } from '../common/streamingTypes.js';
import { ConversationMessage } from '../common/conversationTypes.js';

export class TextStreamHandler extends Disposable implements ITextStreamHandler {
	readonly _serviceBrand: undefined;

	private assistantMessageId: number | null = null;
	private hasStartedStreaming = false;
	private accumulatedResponse = '';

	private readonly _onStreamingData = this._register(new Emitter<any>());
	readonly onStreamingData: Event<any> = this._onStreamingData.event;

	private readonly _onMessageAdded = this._register(new Emitter<ConversationMessage>());
	readonly onMessageAdded: Event<ConversationMessage> = this._onMessageAdded.event;

	private readonly _onThinkingMessageHide = this._register(new Emitter<void>());
	readonly onThinkingMessageHide: Event<void> = this._onThinkingMessageHide.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@IThinkingProcessor private readonly thinkingProcessor: IThinkingProcessor
	) {
		super();
	}

	async handle(event: ContentStreamEvent): Promise<ProcessResult> {
		// Ensure we have an assistant message ID for streaming
		if (!this.assistantMessageId) {
			this.assistantMessageId = this.conversationManager.getNextMessageId();
		}

		// Accumulate the response
		this.accumulatedResponse += event.delta;

		// Process thinking tags with buffer
		const processedDelta = this.thinkingProcessor.processThinkingTagsWithBuffer(event.delta);

		// Start streaming if not already started
		if (!this.hasStartedStreaming && this.assistantMessageId) {
			// Hide thinking message when streaming starts (like original code)
			this._onThinkingMessageHide.fire();
			this.conversationManager.startStreamingMessageWithId(this.assistantMessageId);
			this.hasStartedStreaming = true;
		}

		// Update streaming message
		this.conversationManager.updateStreamingMessage(processedDelta, true);

		// Fire streaming data event for UI
		this._onStreamingData.fire({
			type: 'content',
			delta: processedDelta,
			content: processedDelta
		});

		return { type: 'TEXT_STREAMING' };
	}

	reset(): void {
		this.assistantMessageId = null;
		this.hasStartedStreaming = false;
		this.accumulatedResponse = '';
	}

	async completeTextMessage(userMessageId?: number): Promise<void> {
		if (!this.assistantMessageId || this.accumulatedResponse.length === 0) {
			return;
		}

		// Use provided user message ID or error if not available
		if (!userMessageId) {
			this.logService.error('[TEXT STREAM HANDLER] No user message ID provided for completing text message');
			return;
		}

		const textMessageId = this.conversationManager.completeStreamingMessage({
			related_to: userMessageId
		}, this.thinkingProcessor.processThinkingTagsComplete.bind(this.thinkingProcessor));

		if (textMessageId > 0) {
			const finalConversation = this.conversationManager.getCurrentConversation();
			const completedTextMessage = finalConversation?.messages.find((m: ConversationMessage) => m.id === textMessageId);
			if (completedTextMessage) {
				this._onMessageAdded.fire(completedTextMessage);
			}
		}

        // Reset state
        this.accumulatedResponse = '';
        this.assistantMessageId = null;
        this.hasStartedStreaming = false;
	}

	/**
	 * Check if handler has active streaming content
	 */
	public hasActiveContent(): boolean {
		return this.assistantMessageId !== null && this.accumulatedResponse.length > 0;
	}

	/**
	 * Get current accumulated response length
	 */
	public getAccumulatedResponseLength(): number {
		return this.accumulatedResponse.length;
	}
}
