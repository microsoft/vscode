/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal, SDK-agnostic types for completed OTel spans.
 *
 * These mirror the shape used by the Copilot extension (kept in sync with
 * `extensions/copilot/src/platform/otel/common/otelService.ts`) so the same
 * bridge processor can be ported to the Agent Host without dragging in the
 * extension's full `IOTelService` surface.
 */

export const enum SpanStatusCode {
	UNSET = 0,
	OK = 1,
	ERROR = 2,
}

/**
 * Serializable snapshot of a completed span.
 * Contains all in-memory attributes (including content attributes regardless of captureContent).
 */
export interface ICompletedSpanData {
	readonly name: string;
	readonly spanId: string;
	readonly traceId: string;
	readonly parentSpanId?: string;
	readonly startTime: number; // milliseconds since epoch
	readonly endTime: number; // milliseconds since epoch
	readonly status: { readonly code: SpanStatusCode; readonly message?: string };
	readonly attributes: Readonly<Record<string, string | number | boolean | string[]>>;
	readonly events: readonly ISpanEventRecord[];
}

/**
 * A single event on a span.
 */
export interface ISpanEventRecord {
	readonly name: string;
	readonly timestamp: number; // milliseconds since epoch
	readonly attributes?: Readonly<Record<string, string | number | boolean | string[]>>;
}
