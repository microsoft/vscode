/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICompletedSpanData } from '../../../otel/common/spanData.js';

/**
 * A pluggable consumer of decoded OTel spans flowing through the agent-host
 * loopback receiver. Used by {@link IAgentHostOTelService} to fan completed
 * spans out to additional in-process sinks (telemetry routing, in-memory
 * inspection, etc.) alongside the SQLite store and outbound forwarder.
 *
 * Consumers MUST NOT throw — implementations should swallow and log their own
 * errors so a single misbehaving consumer cannot stall the receiver pipeline.
 *
 * Consumers MUST be cheap and non-blocking. The receiver invokes them on the
 * HTTP handler hot path; any heavy work (network I/O, disk I/O, etc.) must be
 * scheduled asynchronously.
 */
export interface IAgentHostOTelSpanConsumer {
	/**
	 * Called once per decoded span, in the order spans arrive on the loopback
	 * receiver. The receiver decodes OTLP batches into flat `ICompletedSpanData`
	 * records before dispatching; consumers see spans individually rather than
	 * as a batch.
	 */
	onSpan(span: ICompletedSpanData): void;
}
