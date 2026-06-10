/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetryConfig } from '@github/copilot-sdk';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import type { IAgentHostOTelSpanConsumer } from './agentHostOTelSpanConsumer.js';


/**
 * Lean service that wires the @github/copilot-sdk telemetry hook to either:
 *
 *  - **External-only mode**: pass user-configured exporter settings straight through
 *    so the SDK's spawned CLI exports OTel data directly to the user's sink.
 *  - **DB mode** (`COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED=true`): point the SDK at a
 *    loopback OTLP/HTTP receiver, persist all spans into a local SQLite store, and
 *    optionally fan-out to a user-configured external sink as well.
 *
 * The interface lives in `common/` so consumers (DI registration, tests, callers
 * in other layers) can import it without pulling in the node-only concrete
 * implementation and its transitive native dependencies (`node:sqlite`).
 */
export interface IAgentHostOTelService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the telemetry config to hand to `new CopilotClient({ telemetry })`,
	 * starting the loopback receiver + store on first call when in DB mode.
	 * Resolves to `undefined` when telemetry is disabled.
	 */
	getSdkTelemetryConfig(): Promise<TelemetryConfig | undefined>;

	/**
	 * Path of the SQLite span store, or `undefined` when DB mode is off.
	 */
	getSpansDbPath(): URI | undefined;

	/**
	 * Drain any in-flight outbound forwarding. Safe to call concurrently with
	 * ongoing ingestion.
	 */
	flush(): Promise<void>;

	/**
	 * Register an in-process consumer for decoded spans. When at least one
	 * consumer is registered, the loopback OTLP/HTTP receiver is started
	 * unconditionally so the SDK's spans flow through process-local inspection
	 * regardless of whether `dbSpanExporter` is on. Dispose the returned handle
	 * to remove the consumer; the receiver stays up so the SDK does not see a
	 * mid-flight endpoint change.
	 */
	registerSpanConsumer(consumer: IAgentHostOTelSpanConsumer): IDisposable;
}

export const IAgentHostOTelService = createDecorator<IAgentHostOTelService>('agentHostOTelService');
