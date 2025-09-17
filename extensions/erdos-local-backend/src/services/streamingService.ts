/*---------------------------------------------------------------------------------------------
 * Copyright (c) Lotas Inc. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { StreamData, IStreamingService } from '../types.js';

export class StreamingService implements IStreamingService {

	constructor() {
	}

	/**
	 * Send error event - matches SseErrorEvent format
	 * Format: {"request_id":"req_123","error":"Error message","isComplete":true}
	 */
	public sendErrorEvent(onData: (data: StreamData) => void, request_id: string, errorMessage: string): void {
		const event: StreamData = {
			type: 'error',
			request_id: request_id,
			error: { message: errorMessage, type: 'error', details: {} },
			isComplete: true
		};
		onData(event);
	}

	/**
	 * Send end_turn event - matches SseEndTurnEvent format  
	 * Format: {"request_id":"req_123","end_turn":true,"isComplete":true}
	 */
	public sendEndTurnEvent(onData: (data: StreamData) => void, request_id: string): void {
		const event: StreamData = {
			type: 'end_turn',
			request_id: request_id,
			end_turn: true,
			isComplete: true
		};
		onData(event);
	}

	/**
	 * Send complete event - matches SseTextEvent format and custom field format
	 * For response field: {"request_id":"req_123","response":"Complete text","isComplete":true}
	 * For other fields: {"request_id":"req_123","field_name":"value","isComplete":true}
	 */
	public sendCompleteEvent(onData: (data: StreamData) => void, request_id: string, field: string, value: string): void {
		const event: any = {
			request_id: request_id,
			isComplete: true
		};

		// Handle special case for action field (function calls)
		if (field === 'action') {
			// Parse the JSON value for function calls
			try {
				const parsedAction = JSON.parse(value);
				Object.assign(event, parsedAction);
			} catch (e) {
				// If parsing fails, treat as regular field
				event[field] = value;
			}
		} else {
			// Regular field assignment
			event[field] = value;
		}

		onData(event as StreamData);
	}

	/**
	 * Send delta event - matches SseDeltaEvent format
	 * Format: {"request_id":"req_123","delta":"partial text","field":"response","isComplete":false}
	 */
	public sendDeltaEvent(onData: (data: StreamData) => void, request_id: string, field: string, delta: string): void {
		const event = {
			request_id: request_id,
			delta: delta,
			field: field,
			isComplete: false
		};
		onData(event as StreamData);
	}

}
