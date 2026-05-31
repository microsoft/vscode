/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parser for Server-Sent Events (SSE) streams according to the HTML specification.
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */

/**
 * Represents an event dispatched from an SSE stream.
 */
export interface ISSEEvent {
	/**
	 * The event type. If not specified, the type is "message".
	 */
	type: string;

	/**
	 * The event data.
	 */
	data: string;

	/**
	 * The last event ID, used for reconnection.
	 */
	id?: string;

	/**
	 * Reconnection time in milliseconds.
	 */
	retry?: number;
}

/**
 * Callback function type for event dispatch.
 */
export type SSEEventHandler = (event: ISSEEvent) => void;

const enum Chr {
	CR = 13, // '\r'
	LF = 10, // '\n'
	COLON = 58, // ':'
	SPACE = 32, // ' '
}

/**
 * Parser for Server-Sent Events (SSE) streams.
 */
export class SSEParser {
	private dataBuffer = '';
	private eventTypeBuffer = '';
	private currentEventId?: string;
	private lastEventIdBuffer?: string;
	private reconnectionTime?: number;
	private buffer: Uint8Array[] = [];
	private endedOnCR = false;
	private readonly onEventHandler: SSEEventHandler;
	private readonly decoder: TextDecoder;
	/**
	 * Creates a new SSE parser.
	 * @param onEvent The callback to invoke when an event is dispatched.
	 */
	constructor(onEvent: SSEEventHandler) {
		this.onEventHandler = onEvent;
		this.decoder = new TextDecoder('utf-8');
	}

	/**
	 * Gets the last event ID received by this parser.
	 */
	public getLastEventId(): string | undefined {
		return this.lastEventIdBuffer;
	}
	/**
	 * Gets the reconnection time in milliseconds, if one was specified by the server.
	 */
	public getReconnectionTime(): number | undefined {
		return this.reconnectionTime;
	}

	/**
	 * Feeds a chunk of the SSE stream to the parser.
	 * @param chunk The chunk to parse as a Uint8Array of UTF-8 encoded data.
	 */
	public feed(chunk: Uint8Array): void {
		if (chunk.length === 0) {
			return;
		}

		let offset = 0;

		// If the data stream was bifurcated between a CR and LF, avoid processing the CR as an extra newline
		if (this.endedOnCR && chunk[0] === Chr.LF) {
			offset++;
		}
		this.endedOnCR = false;

		// Process complete lines from the buffer
		while (offset < chunk.length) {
			const indexCR = chunk.indexOf(Chr.CR, offset);
			const indexLF = chunk.indexOf(Chr.LF, offset);
			const index = indexCR === -1 ? indexLF : (indexLF === -1 ? indexCR : Math.min(indexCR, indexLF));
			if (index === -1) {
				break;
			}

			let str = '';
			for (const buf of this.buffer) {
				str += this.decoder.decode(buf, { stream: true });
			}
			str += this.decoder.decode(chunk.subarray(offset, index));
			this.processLine(str);

			this.buffer.length = 0;
			offset = index + (chunk[index] === Chr.CR && chunk[index + 1] === Chr.LF ? 2 : 1);
		}


		if (offset < chunk.length) {
			this.buffer.push(chunk.subarray(offset));
		} else {
			this.endedOnCR = chunk[chunk.length - 1] === Chr.CR;
		}
	}
	/**
	 * Processes a single line from the SSE stream.
	 */
	private processLine(line: string): void {
		if (!line.length) {
			this.dispatchEvent();
			return;
		}

		if (line.startsWith(':')) {
			return;
		}

		// Parse the field name and value
		let field: string;
		let value: string;

		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) {
			// Line with no colon - the entire line is the field name, value is empty
			field = line;
			value = '';
		} else {
			// Line with a colon - split into field name and value
			field = line.substring(0, colonIndex);
			value = line.substring(colonIndex + 1);

			// If value starts with a space, remove it
			if (value.startsWith(' ')) {
				value = value.substring(1);
			}
		}

		this.processField(field, value);
	}
	/**
	 * Processes a field with the given name and value.
	 */
	private processField(field: string, value: string): void {
		switch (field) {
			case 'event':
				this.eventTypeBuffer = value;
				break;

			case 'data':
				// Append the value to the data buffer, followed by a newline
				this.dataBuffer += value;
				this.dataBuffer += '\n';
				break;

			case 'id':
				// If the field value doesn't contain NULL, set the last event ID buffer
				if (!value.includes('\0')) {
					this.currentEventId = this.lastEventIdBuffer = value;
				} else {
					this.currentEventId = undefined;
				}
				break;

			case 'retry':
				// If the field value consists only of ASCII digits, set the reconnection time
				if (/^\d+$/.test(value)) {
					this.reconnectionTime = parseInt(value, 10);
				}
				break;

			// Ignore any other fields
		}
	}
	/**
	 * Dispatches the event based on the current buffer states.
	 */
	private dispatchEvent(): void {
		// If the data buffer is empty, reset the buffers and return
		if (this.dataBuffer === '') {
			this.dataBuffer = '';
			this.eventTypeBuffer = '';
			return;
		}

		// If the data buffer's last character is a newline, remove it
		if (this.dataBuffer.endsWith('\n')) {
			this.dataBuffer = this.dataBuffer.substring(0, this.dataBuffer.length - 1);
		}

		// Create and dispatch the event
		const event: ISSEEvent = {
			type: this.eventTypeBuffer || 'message',
			data: this.dataBuffer,
		};

		// Add optional fields if they exist
		if (this.currentEventId !== undefined) {
			event.id = this.currentEventId;
		}

		if (this.reconnectionTime !== undefined) {
			event.retry = this.reconnectionTime;
		}

		// Dispatch the event
		this.onEventHandler(event);

		// Reset the data and event type buffers
		this.reset();
	}

	/**
	 * Resets the parser state.
	 */
	public reset(): void {
		this.dataBuffer = '';
		this.eventTypeBuffer = '';
		this.currentEventId = undefined;
		// Note: lastEventIdBuffer is not reset as it's used for reconnection
	}
}


