/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * # Terminal Data Monitor Service (STC Background Monitoring Hooks)
 *
 * This service implements the background monitoring hook described in the
 * Stateful Terminal Continuity (STC) design:
 *
 * > "Experimental `onDidWriteTerminalData` API to trigger callbacks even when
 * >  the Chat panel is closed."
 *
 * ## Problem
 * The VS Code extension API's `window.onDidWriteTerminalData` only delivers
 * data while at least one ext-host listener is registered AND the main-thread
 * is forwarding data events (`$startSendingDataEvents`). If the Chat/Agent
 * panel is closed, that listener is disposed and no more data flows through.
 *
 * ## Solution
 * `TerminalDataMonitorService` subscribes to `ITerminalService.onAnyInstanceData`
 * — a multiplexed event that fires for **every** write to any terminal,
 * regardless of UI visibility. It:
 *
 * 1. Filters to daemon-backed (STC) terminals (those with a `daemonId`).
 * 2. Maintains a per-terminal circular ring-buffer of the last N bytes of raw
 *    output (default: ~400 KB per terminal ≈ 5000 lines × 80 chars).
 * 3. Exposes an `onDidReceiveData` event that fires for every buffered chunk,
 *    allowing AI agents and future consumers to subscribe without needing an
 *    active terminal panel.
 *
 * ## Usage (workbench-side, e.g. from a chat/agent service)
 * ```ts
 * const monitor = accessor.get(ITerminalDataMonitorService);
 *
 * // Subscribe for new data (fires even when terminal panel is hidden)
 * monitor.onDidReceiveData(({ terminal, data, timestamp }) => {
 *   myAgent.processChunk(terminal.instanceId, data);
 * });
 *
 * // Read accumulated scrollback for a specific terminal
 * const scrollback = monitor.getBufferedData(myInstance.resource);
 * ```
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalService, ITerminalInstance } from './terminal.js';
import { URI } from '../../../../base/common/uri.js';

// ---------------------------------------------------------------------------
// Service identifier
// ---------------------------------------------------------------------------

export const ITerminalDataMonitorService = createDecorator<ITerminalDataMonitorService>('terminalDataMonitorService');

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Payload for each buffered data chunk. */
export interface ITerminalDataChunk {
	/** The terminal instance the data came from. */
	readonly terminal: ITerminalInstance;
	/** Raw VT data string (may include ANSI escape sequences). */
	readonly data: string;
	/** Wall-clock timestamp of the write (ms since Unix epoch). */
	readonly timestamp: number;
}

export interface ITerminalDataMonitorService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires for every data chunk written to any **daemon-backed** terminal,
	 * regardless of whether the terminal panel or Chat view is currently visible.
	 *
	 * This is the workbench-layer equivalent of the extension API's
	 * `window.onDidWriteTerminalData` but without the ext-host round-trip and
	 * without stopping when the last listener is removed.
	 */
	readonly onDidReceiveData: Event<ITerminalDataChunk>;

	/**
	 * Returns the accumulated ring-buffer for a specific terminal, identified
	 * by its `resource` URI. Returns an empty string if:
	 * - the terminal is not daemon-backed, or
	 * - no data has been received yet.
	 */
	getBufferedData(terminalResource: URI): string;

	/**
	 * Clears the ring-buffer for a specific terminal.
	 * @param terminalResource The `ITerminalInstance.resource` URI.
	 */
	clearBuffer(terminalResource: URI): void;
}

// ---------------------------------------------------------------------------
// Ring-buffer implementation
// ---------------------------------------------------------------------------

/**
 * A byte-size-capped append-only string buffer.
 * Oldest chunks are evicted when the total byte count exceeds `_maxBytes`.
 */
class RingBuffer {
	private _chunks: string[] = [];
	private _totalBytes = 0;

	constructor(private readonly _maxBytes: number) { }

	push(data: string): void {
		this._chunks.push(data);
		this._totalBytes += data.length;
		// Evict from the front until we're within the cap
		while (this._totalBytes > this._maxBytes && this._chunks.length > 1) {
			const evicted = this._chunks.shift()!;
			this._totalBytes -= evicted.length;
		}
	}

	toString(): string {
		return this._chunks.join('');
	}

	clear(): void {
		this._chunks = [];
		this._totalBytes = 0;
	}
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/** Default ring-buffer cap: ~400 KB (≈ 5000 lines × 80 chars). */
const DEFAULT_BUFFER_MAX_BYTES = 400_000;

export class TerminalDataMonitorService extends Disposable implements ITerminalDataMonitorService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReceiveData = this._register(new Emitter<ITerminalDataChunk>());
	readonly onDidReceiveData = this._onDidReceiveData.event;

	/** resource.toString() → ring-buffer */
	private readonly _buffers = new Map<string, RingBuffer>();

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		// Use the multiplexed `onAnyInstanceData` event — fires for EVERY
		// terminal write regardless of whether the panel or Chat view is open.
		this._register(
			this._terminalService.onAnyInstanceData(({ instance, data }) => {
				// Only track daemon-backed STC terminals
				if (!instance.daemonId) {
					return;
				}

				const key = instance.resource.toString();

				// Lazily create a buffer for this terminal
				let buffer = this._buffers.get(key);
				if (!buffer) {
					buffer = new RingBuffer(DEFAULT_BUFFER_MAX_BYTES);
					this._buffers.set(key, buffer);

					// Clean up the buffer when the terminal is disposed
					const sub = instance.onDisposed(() => {
						this._buffers.delete(key);
						sub.dispose();
					});
					this._register(sub);
				}

				buffer.push(data);
				this._onDidReceiveData.fire({
					terminal: instance,
					data,
					timestamp: Date.now()
				});
			})
		);
	}

	getBufferedData(terminalResource: URI): string {
		return this._buffers.get(terminalResource.toString())?.toString() ?? '';
	}

	clearBuffer(terminalResource: URI): void {
		this._buffers.get(terminalResource.toString())?.clear();
	}
}
