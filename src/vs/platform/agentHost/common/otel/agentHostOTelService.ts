/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';

/**
 * Structural mirror of `@github/copilot-sdk`'s `TelemetryConfig` (kept in
 * sync manually). Mirroring rather than importing keeps this file free of
 * Node-only dependencies and lets it live in the `common/` layer.
 */
export interface IAgentHostSdkTelemetryConfig {
	/** OTLP HTTP endpoint URL for trace/metric export. */
	readonly otlpEndpoint?: string;
	/** File path for JSON-lines trace output. */
	readonly filePath?: string;
	/** Exporter backend type: "otlp-http" or "file". */
	readonly exporterType?: string;
	/** Instrumentation scope name. */
	readonly sourceName?: string;
	/** Whether to capture message content (prompts, responses). */
	readonly captureContent?: boolean;
}

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
	getSdkTelemetryConfig(): Promise<IAgentHostSdkTelemetryConfig | undefined>;

	/**
	 * Path of the SQLite span store, or `undefined` when DB mode is off.
	 */
	getSpansDbPath(): URI | undefined;

	/**
	 * Drain any in-flight outbound forwarding. Safe to call concurrently with
	 * ongoing ingestion.
	 */
	flush(): Promise<void>;
}

export const IAgentHostOTelService = createDecorator<IAgentHostOTelService>('agentHostOTelService');
