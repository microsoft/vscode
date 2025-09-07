/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EventStore } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types';

/**
 * Simple in-memory implementation of the EventStore interface for resumability
 * This is primarily intended for examples and testing, not for production use
 * where a persistent storage solution would be more appropriate.
 */
export class InMemoryEventStore implements EventStore {
	private events: Map<string, { streamId: string; message: JSONRPCMessage }> = new Map();

	/**
	 * Generates a unique event ID for a given stream ID
	 */
	private generateEventId(streamId: string): string {
		return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
	}

	/**
	 * Extracts the stream ID from an event ID
	 */
	private getStreamIdFromEventId(eventId: string): string {
		const parts = eventId.split('_');
		return parts.length > 0 ? parts[0] : '';
	}

	/**
	 * Stores an event with a generated event ID
	 * Implements EventStore.storeEvent
	 */
	async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
		const eventId = this.generateEventId(streamId);
		this.events.set(eventId, { streamId, message });
		return eventId;
	}

	/**
	 * Replays events that occurred after a specific event ID
	 * Implements EventStore.replayEventsAfter
	 */
	async replayEventsAfter(lastEventId: string,
		{ send }: { send: (eventId: string, message: JSONRPCMessage) => Promise<void> }
	): Promise<string> {
		if (!lastEventId || !this.events.has(lastEventId)) {
			return '';
		}

		// Extract the stream ID from the event ID
		const streamId = this.getStreamIdFromEventId(lastEventId);
		if (!streamId) {
			return '';
		}

		let foundLastEvent = false;

		// Sort events by eventId for chronological ordering
		const sortedEvents = [...this.events.entries()].sort((a, b) => a[0].localeCompare(b[0]));

		for (const [eventId, { streamId: eventStreamId, message }] of sortedEvents) {
			// Only include events from the same stream
			if (eventStreamId !== streamId) {
				continue;
			}

			// Start sending events after we find the lastEventId
			if (eventId === lastEventId) {
				foundLastEvent = true;
				continue;
			}

			if (foundLastEvent) {
				await send(eventId, message);
			}
		}
		return streamId;
	}
}
