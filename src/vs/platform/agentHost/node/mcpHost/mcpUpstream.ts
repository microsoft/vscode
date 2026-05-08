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
 * Server-side MCP capabilities advertised by the upstream in its
 * `initialize` result. Loosely typed — the proxy treats the value
 * opaquely except when checking for specific extension keys (e.g.
 * `extensions['io.modelcontextprotocol/ui']`). The shape mirrors
 * MCP's `InitializeResult.capabilities`.
 */
export interface IMcpUpstreamCapabilities {
	readonly extensions?: { readonly [key: string]: unknown };
	readonly [key: string]: unknown;
}

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
	 * Capabilities the upstream advertised in its `initialize` result.
	 * `undefined` until the SDK's `initialize` round-trip has completed
	 * through the proxy. Updated each time a fresh `initialize` is
	 * observed (e.g. on session refresh).
	 */
	readonly upstreamCapabilities: IObservable<IMcpUpstreamCapabilities | undefined>;

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

	/**
	 * Called by the proxy when it observes a successful `initialize`
	 * response from the upstream. Exposed because the route, not the
	 * upstream, is the layer that pairs SDK requests with their replies.
	 * Pass `undefined` to clear (e.g. on a re-handshake).
	 */
	setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void;
}
