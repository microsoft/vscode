/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { Emitter, Event } from '../../../../../base/common/event.js';

/**
 * AI Stream Data Event - 
 * 
 */
export interface AiStreamDataEventData {
	messageId: string;
	delta: string;
	isComplete: boolean;
	sequence: number;
	isCancelled: boolean;
	isFunctionCall: boolean;
	requestId?: string;
}

/**
 * AI Stream Data Event class 
 */
export class AiStreamDataEvent {
	constructor(private data: AiStreamDataEventData) {}

	getMessageId(): string {
		return this.data.messageId;
	}

	getDelta(): string {
		return this.data.delta;
	}

	isComplete(): boolean {
		return this.data.isComplete;
	}



	getSequence(): number {
		return this.data.sequence;
	}

	isCancelled(): boolean {
		return this.data.isCancelled;
	}

	isFunctionCall(): boolean {
		return this.data.isFunctionCall;
	}



	getRequestId(): string | undefined {
		return this.data.requestId;
	}

	setRequestId(requestId: string): void {
		this.data.requestId = requestId;
	}

	getData(): AiStreamDataEventData {
		return { ...this.data };
	}
}

/**
 * AI Stream Data Event Handler interface 
 */
export interface AiStreamDataEventHandler {
	onAiStreamData(event: AiStreamDataEvent): void;
}

/**
 * AI Stream Data Event Bus - manages streaming events
 */
export class AiStreamDataEventBus {
	private readonly _onStreamData = new Emitter<AiStreamDataEvent>();
	public readonly onStreamData: Event<AiStreamDataEvent> = this._onStreamData.event;

	private sequenceNumber = 0;
	private handlers: Set<AiStreamDataEventHandler> = new Set();

	/**
	 * Get next sequence number for streaming events 
	 */
	getNextSequence(): number {
		return ++this.sequenceNumber;
	}

	/**
	 * Dispatch a stream data event 
	 */
	dispatchStreamData(eventData: Omit<AiStreamDataEventData, 'sequence'>): void {
		const fullEventData: AiStreamDataEventData = {
			...eventData,
			sequence: this.getNextSequence()
		};

		const event = new AiStreamDataEvent(fullEventData);
		
		// Fire to event listeners
		this._onStreamData.fire(event);
		
		// Fire to registered handlers
		for (const handler of this.handlers) {
			try {
				handler.onAiStreamData(event);
			} catch (error) {
				console.error('Error in stream data handler:', error);
			}
		}
	}

	/**
	 * Register a stream data handler 
	 */
	addHandler(handler: AiStreamDataEventHandler): void {
		this.handlers.add(handler);
	}

	/**
	 * Unregister a stream data handler
	 */
	removeHandler(handler: AiStreamDataEventHandler): void {
		this.handlers.delete(handler);
	}



	/**
	 * Create a function call completion event 
	 */
	createFunctionCallCompletionEvent(messageId: string): void {
		this.dispatchStreamData({
			messageId,
			delta: '',
			isComplete: true,
			isCancelled: false,
			isFunctionCall: true
		});
	}
}

// Export singleton instance 
export const aiStreamDataEventBus = new AiStreamDataEventBus();
