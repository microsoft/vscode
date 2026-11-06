/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lightweight parser for OSC 633 (VS Code shell integration) sequences in raw
 * PTY output. Designed for the agent host where we don't have a full xterm.js
 * instance - it scans data chunks for the sequences, extracts events, and
 * removes the sequences from the data stream.
 *
 * Handles partial sequences that span across data chunk boundaries.
 */

/** OSC 633 event types we care about. */
export const enum Osc633EventType {
	/** 633;A - Prompt start. Used to detect shell integration is active. */
	PromptStart,
	/** 633;B - Command start (where user inputs command). */
	CommandStart,
	/** 633;C - Command executed (output begins). */
	CommandExecuted,
	/** 633;D[;exitCode] - Command finished. */
	CommandFinished,
	/** 633;E;commandLine[;nonce] - Explicit command line. */
	CommandLine,
	/** 633;P;Key=Value - Property (e.g. Cwd). */
	Property,
}

export interface IOsc633PromptStartEvent {
	type: Osc633EventType.PromptStart;
}

export interface IOsc633CommandStartEvent {
	type: Osc633EventType.CommandStart;
}

export interface IOsc633CommandExecutedEvent {
	type: Osc633EventType.CommandExecuted;
}

export interface IOsc633CommandFinishedEvent {
	type: Osc633EventType.CommandFinished;
	exitCode: number | undefined;
}

export interface IOsc633CommandLineEvent {
	type: Osc633EventType.CommandLine;
	commandLine: string;
	nonce: string | undefined;
}

export interface IOsc633PropertyEvent {
	type: Osc633EventType.Property;
	key: string;
	value: string;
}

export type Osc633Event =
	| IOsc633PromptStartEvent
	| IOsc633CommandStartEvent
	| IOsc633CommandExecutedEvent
	| IOsc633CommandFinishedEvent
	| IOsc633CommandLineEvent
	| IOsc633PropertyEvent;

export interface IOsc633ParseResult {
	/** Data with all OSC 633 sequences stripped. */
	cleanedData: string;
	/** Parsed events in order of appearance. */
	events: Osc633Event[];
}

/**
 * A single segment of parsed PTY data: either a run of cleaned output data or
 * an OSC 633 event. Segments are emitted in stream order so that output which
 * arrives before an event (e.g. a `CommandFinished` marker) can be attributed
 * to the command before the event is handled — see {@link Osc633Parser.parseSegments}.
 */
export type Osc633ParseSegment =
	| { readonly kind: 'data'; readonly data: string }
	| { readonly kind: 'event'; readonly event: Osc633Event };

/**
 * Decode escaped values in OSC 633 messages.
 * Handles `\\` -> `\` and `\xAB` -> character with code 0xAB.
 */
function deserializeOscMessage(message: string): string {
	if (message.indexOf('\\') === -1) {
		return message;
	}
	return message.replaceAll(
		/\\(\\|x([0-9a-f]{2}))/gi,
		(_match: string, op: string, hex?: string) => hex ? String.fromCharCode(parseInt(hex, 16)) : op,
	);
}

function parseOsc633Payload(payload: string): Osc633Event | undefined {
	const semiIdx = payload.indexOf(';');
	if ((semiIdx === -1 ? payload.length : semiIdx) !== 1) {
		return undefined;
	}

	const command = payload[0];
	const argsRaw = semiIdx === -1 ? '' : payload.substring(semiIdx + 1);

	switch (command) {
		case 'A':
			return { type: Osc633EventType.PromptStart };
		case 'B':
			return { type: Osc633EventType.CommandStart };
		case 'C':
			return { type: Osc633EventType.CommandExecuted };
		case 'D': {
			const exitCode = argsRaw.length > 0 ? parseInt(argsRaw, 10) : undefined;
			return {
				type: Osc633EventType.CommandFinished,
				exitCode: exitCode !== undefined && !isNaN(exitCode) ? exitCode : undefined,
			};
		}
		case 'E': {
			const nonceIdx = argsRaw.indexOf(';');
			const commandLine = deserializeOscMessage(nonceIdx === -1 ? argsRaw : argsRaw.substring(0, nonceIdx));
			const nonce = nonceIdx === -1 ? undefined : argsRaw.substring(nonceIdx + 1);
			return { type: Osc633EventType.CommandLine, commandLine, nonce };
		}
		case 'P': {
			const deserialized = deserializeOscMessage(argsRaw);
			const eqIdx = deserialized.indexOf('=');
			if (eqIdx === -1) {
				return undefined;
			}
			return {
				type: Osc633EventType.Property,
				key: deserialized.substring(0, eqIdx),
				value: deserialized.substring(eqIdx + 1),
			};
		}
		default:
			return undefined;
	}
}

// OSC introducer is ESC ] (0x1b 0x5d)
const ESC = '\x1b';
const OSC_START = ESC + ']';
// Terminators: BEL (0x07) or ST (ESC \)
const BEL = '\x07';
const ST = ESC + '\\';

/**
 * Stateful parser that handles data chunks, correctly dealing with
 * partial sequences that span multiple chunks.
 */
export class Osc633Parser {
	/** Buffer for an incomplete OSC sequence (from ESC] up to but not including the terminator). */
	private _pendingOsc = '';
	/** Whether we are currently accumulating an OSC sequence. */
	private _inOsc = false;
	/** Set when the previous chunk ended with ESC inside an OSC body (potential ST start). */
	private _pendingEscInOsc = false;

	/**
	 * Parse a chunk of PTY data.
	 * Returns cleaned data (all OSC 633 sequences removed) and extracted events.
	 *
	 * This is a convenience view over {@link parseSegments} that concatenates the
	 * cleaned-data segments and collects the events. Callers that need to know
	 * whether a run of output arrived before or after an event (for correct
	 * command-output attribution) should use {@link parseSegments} instead.
	 */
	parse(data: string): IOsc633ParseResult {
		const events: Osc633Event[] = [];
		let cleanedData = '';
		for (const segment of this.parseSegments(data)) {
			if (segment.kind === 'data') {
				cleanedData += segment.data;
			} else {
				events.push(segment.event);
			}
		}
		return { cleanedData, events };
	}

	/**
	 * Parse a chunk of PTY data into an ordered list of segments, preserving the
	 * relative order of cleaned output data and OSC 633 events as they appear in
	 * the stream. Handles partial sequences that span multiple chunks.
	 *
	 * Preserving order matters because a single PTY read frequently contains a
	 * command's output immediately followed by its `CommandFinished` marker;
	 * consumers must append that output to the command before handling the
	 * finished event, otherwise the output is lost from the command result.
	 */
	parseSegments(data: string): Osc633ParseSegment[] {
		const segments: Osc633ParseSegment[] = [];
		let pending = '';

		const appendData = (value: string): void => {
			pending += value;
		};
		const flushData = (): void => {
			if (pending.length > 0) {
				segments.push({ kind: 'data', data: pending });
				pending = '';
			}
		};
		const emitEvent = (event: Osc633Event): void => {
			flushData();
			segments.push({ kind: 'event', event });
		};

		if (!this._inOsc && data.indexOf(OSC_START) === -1) {
			appendData(data);
			flushData();
			return segments;
		}

		let i = 0;

		while (i < data.length) {
			if (this._inOsc) {
				// Handle ESC that was pending from the previous chunk.
				if (this._pendingEscInOsc) {
					this._pendingEscInOsc = false;
					if (data[i] === '\\') {
						// ESC \ = ST terminator, sequence is complete.
						i++;
						this._inOsc = false;
						const payload = this._pendingOsc;
						this._pendingOsc = '';
						this._handleOscPayload(payload, emitEvent, appendData, ST);
						continue;
					}
					// ESC was not followed by \, malformed: complete the OSC anyway.
					this._inOsc = false;
					const payload = this._pendingOsc;
					this._pendingOsc = '';
					this._handleOscPayload(payload, emitEvent, appendData);
					continue;
				}

				// We're inside an OSC sequence, look for the terminator.
				const result = this._consumeOscBody(data, i);
				i = result.nextIndex;
				if (result.complete) {
					this._inOsc = false;
					const payload = this._pendingOsc;
					this._pendingOsc = '';
					this._handleOscPayload(payload, emitEvent, appendData, result.terminator);
				} else if (result.pendingEsc) {
					this._pendingEscInOsc = true;
				}
				// If not complete, _pendingOsc has been extended, and we're at end of data.
				continue;
			}

			// Look for the next ESC ] which starts an OSC sequence
			const escIdx = data.indexOf(OSC_START, i);
			if (escIdx === -1) {
				appendData(data.substring(i));
				i = data.length;
				continue;
			}

			// Copy everything before the OSC start to cleaned output.
			appendData(data.substring(i, escIdx));

			// Start of OSC: check if it's 633.
			i = escIdx + 2; // skip past ESC ]
			this._pendingOsc = '';
			this._inOsc = true;

			// Try to consume the OSC body in this same chunk.
			const result = this._consumeOscBody(data, i);
			i = result.nextIndex;
			if (result.complete) {
				this._inOsc = false;
				const payload = this._pendingOsc;
				this._pendingOsc = '';
				// If it's a 633 sequence, extract event; otherwise put it back in cleaned.
				this._handleOscPayload(payload, emitEvent, appendData, result.terminator);
			} else if (result.pendingEsc) {
				this._pendingEscInOsc = true;
			}
			// If not complete, we're at end of data and _pendingOsc is buffered.
		}

		flushData();
		return segments;
	}

	/**
	 * Consume characters from the OSC body, appending to _pendingOsc until a
	 * terminator (BEL or ST) is found.
	 */
	private _consumeOscBody(data: string, startIdx: number): { nextIndex: number; complete: boolean; pendingEsc?: boolean; terminator?: string } {
		const belIdx = data.indexOf(BEL, startIdx);
		const escIdx = data.indexOf(ESC, startIdx);

		if (belIdx !== -1 && (escIdx === -1 || belIdx < escIdx)) {
			this._pendingOsc += data.substring(startIdx, belIdx);
			return { nextIndex: belIdx + 1, complete: true, terminator: BEL };
		}

		if (escIdx !== -1) {
			if (escIdx + 1 >= data.length) {
				this._pendingOsc += data.substring(startIdx, escIdx);
				return { nextIndex: data.length, complete: false, pendingEsc: true };
			}

			this._pendingOsc += data.substring(startIdx, escIdx);
			if (data[escIdx + 1] === '\\') {
				return { nextIndex: escIdx + 2, complete: true, terminator: ST };
			}

			return { nextIndex: escIdx, complete: true };
		}

		this._pendingOsc += data.substring(startIdx);
		return { nextIndex: data.length, complete: false };
	}

	/**
	 * Process a complete OSC payload. If it's a 633; sequence, extract the
	 * event via {@link emitEvent}. Otherwise, reconstruct the original bytes and
	 * pass them through to the cleaned output via {@link appendData}.
	 */
	private _handleOscPayload(
		payload: string,
		emitEvent: (event: Osc633Event) => void,
		appendData: (data: string) => void,
		terminator = BEL,
	): void {
		if (payload.startsWith('633;')) {
			const oscContent = payload.substring(4); // strip "633;"
			const event = parseOsc633Payload(oscContent);
			if (event) {
				emitEvent(event);
			}
			// 633 sequences are always stripped from output
		} else {
			// Non-633 OSC: put back the original bytes.
			appendData(OSC_START + payload + terminator);
		}
	}
}
