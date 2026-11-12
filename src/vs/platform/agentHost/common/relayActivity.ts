/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Well inside the protocol client's 5 s ping interval, at about one IPC event per second. */
export const RELAY_ACTIVITY_INTERVAL_MS = 1_000;

/**
 * Throttles one relay connection's inbound-bytes signal. Bytes shortly after a
 * relayed message aren't reported, since the message already proves liveness.
 */
export class RelayActivityReporter {

	private _lastSignalTime: number | undefined;

	constructor(private readonly _report: () => void) { }

	messageReceived(): void {
		this._lastSignalTime = Date.now();
	}

	dataReceived(): void {
		const now = Date.now();
		// Report after a backwards clock jump rather than staying quiet until the clock catches up.
		if (this._lastSignalTime === undefined || now < this._lastSignalTime || now - this._lastSignalTime >= RELAY_ACTIVITY_INTERVAL_MS) {
			this._lastSignalTime = now;
			this._report();
		}
	}
}
