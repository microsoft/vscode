/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../vs/base/common/uuid';

/**
 * Tracks a chain of calls for telemetry purposes.
 *
 * The list of callers is printed in reverse order, so the most recent caller is at the start.
 */
export class CallTracker {
	private static readonly joiner = ' <- ';

	public readonly value: string;

	constructor(...parts: string[]) {
		this.value = parts.join(CallTracker.joiner);
	}

	public toString(): string {
		return this.value;
	}

	public toAscii(): string {
		return this.value.replace(/[\u{0080}-\u{FFFF}]/gu, '');
	}

	public add(...parts: string[]): CallTracker {
		return new CallTracker(...parts, this.value);
	}
}

export class TelemetryCorrelationId {
	public readonly callTracker: CallTracker;
	public readonly correlationId: string;

	constructor(caller: CallTracker | string | readonly string[], correlationId?: string) {
		if (caller instanceof CallTracker) {
			this.callTracker = caller;
		} else {
			this.callTracker = typeof caller === 'string' ? new CallTracker(caller) : new CallTracker(...caller);
		}

		this.correlationId = correlationId || generateUuid();
	}

	public addCaller(...parts: string[]): TelemetryCorrelationId {
		return new TelemetryCorrelationId(this.callTracker.add(...parts), this.correlationId);
	}
}
