/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';

/** A minimal bidirectional text-message socket over a tunnel byte stream. */
export interface ITunnelMessageSocket extends IDisposable {
	/** Send a text message. */
	send(data: string): void;
	/** Fires for each complete text message received. */
	readonly onDidReceiveMessage: Event<string>;
	/** Fires once when the socket closes, for any reason. */
	readonly onDidClose: Event<ITunnelSocketCloseEvent>;
	/** Initiate a clean close. */
	close(): void;
}

/** Describes why a tunnel message socket closed. */
export interface ITunnelSocketCloseEvent {
	readonly code?: number;
	readonly reason?: string;
	readonly error?: Error;
}

/** The subset of a tunnel relay duplex stream used to perform an HTTP upgrade. */
export interface ITunnelDuplexStream {
	on(event: 'data', listener: (chunk: Uint8Array) => void): void;
	on(event: 'error', listener: (err: Error) => void): void;
	on(event: 'close', listener: (hadError?: boolean) => void): void;
	on(event: 'end', listener: () => void): void;
	removeListener(event: 'data', listener: (chunk: Uint8Array) => void): void;
	removeListener(event: 'error', listener: (err: Error) => void): void;
	removeListener(event: 'close', listener: (hadError?: boolean) => void): void;
	removeListener(event: 'end', listener: () => void): void;
	write(chunk: Uint8Array | string): boolean;
	end(): void;
	destroy(): void;
}
