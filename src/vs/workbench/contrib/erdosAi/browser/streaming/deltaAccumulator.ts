/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Stream Context - maintains streaming context
 */
interface StreamContext {
	requestId: string;
	lastActivityTime: number;
	assistantMessageId: string | null;
	capturedResponseId: string | null;
}

/**
 * Delta Accumulator Service - basic streaming support only
 * All widget functionality has been removed
 */
export class DeltaAccumulator {
	private streamContext: StreamContext | null = null;
	private sequenceNumber = 0;

	/**
	 * Initialize streaming context 
	 */
	initializeStreamContext(requestId: string): void {
		this.streamContext = {
			requestId,
			lastActivityTime: Date.now(),
			assistantMessageId: null,
			capturedResponseId: null
		};

		this.sequenceNumber = 0;
	}

	/**
	 * Get next sequence number 
	 */
	getNextSequence(): number {
		return ++this.sequenceNumber;
	}

	/**
	 * Get stream context
	 */
	getStreamContext(): StreamContext | null {
		return this.streamContext;
	}

	/**
	 * Update last activity time
	 */
	updateActivity(): void {
		if (this.streamContext) {
			this.streamContext.lastActivityTime = Date.now();
		}
	}

	/**
	 * Set assistant message ID
	 */
	setAssistantMessageId(messageId: string): void {
		if (this.streamContext) {
			this.streamContext.assistantMessageId = messageId;
		}
	}
}

// Export singleton instance
export const deltaAccumulator = new DeltaAccumulator();