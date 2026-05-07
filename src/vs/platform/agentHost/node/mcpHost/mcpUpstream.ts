/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../../base/common/event.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { IObservable } from '../../../../base/common/observable.js';
import type { JsonRpcMessage } from '../../../../base/common/jsonRpcProtocol.js';
import type { McpServerStatus } from '../../common/state/protocol/state.js';

/**
 * Transport-agnostic upstream MCP connection. Wraps either a stdio
 * child process or a remote HTTP endpoint behind a uniform JSON-RPC
 * message bus.
 *
 * Lifecycle:
 *  - constructed in `Stopped` state
 *  - `start()` transitions to `Starting`; on success → `Ready`; on
 *    auth failure → `AuthRequired`; on hard failure → `Error`.
 *  - `send()` is rejected unless state is `Ready`.
 *  - `dispose()` initiates graceful shutdown and resolves to `Stopped`.
 */
export interface IMcpUpstream extends IDisposable {
	/** Current upstream status (mirrors what the proxy publishes to AHP). */
	readonly status: IObservable<McpServerStatus>;

	/** Fires when a message arrives from the upstream MCP server. */
	readonly onMessage: Event<JsonRpcMessage>;

	/**
	 * Begin connecting. Idempotent: a second call after `Ready` is a no-op,
	 * after `AuthRequired` retries the handshake with the current token.
	 * Resolves once the upstream reaches a terminal handshake state
	 * (`Ready`, `AuthRequired`, or `Error`).
	 */
	start(): Promise<McpServerStatus>;

	/**
	 * Send a JSON-RPC message to the upstream. Rejects if state is not
	 * `Ready`.
	 */
	send(message: JsonRpcMessage): Promise<void>;

	/**
	 * Set the bearer token used for HTTP requests. Stdio implementations
	 * MAY ignore this. After updating, call `start()` to retry.
	 */
	setBearerToken(token: string | undefined): void;
}
