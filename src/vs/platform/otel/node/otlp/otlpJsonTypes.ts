/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal OTLP/HTTP JSON wire types for the trace export request body.
 *
 * Reference:
 * - opentelemetry-proto/opentelemetry/proto/trace/v1/trace.proto
 * - opentelemetry-proto/opentelemetry/proto/common/v1/common.proto
 * - opentelemetry-proto/opentelemetry/proto/resource/v1/resource.proto
 * - opentelemetry-proto/docs/specification.md#json-protobuf-encoding
 *
 * JSON encoding rules used here:
 *   - field names are camelCase (NOT snake_case)
 *   - `traceId`/`spanId`/`parentSpanId` are lower-hex strings
 *     (32 hex chars / 16 hex chars; parentSpanId may be empty)
 *   - `startTimeUnixNano`/`endTimeUnixNano`/`timeUnixNano` are stringified
 *     unsigned 64-bit decimal integers (string fits int64 without precision loss)
 *   - `intValue` on AnyValue is a stringified int64; other numeric fields are JSON numbers
 *   - bytesValue is base64-encoded
 *   - all fields are technically optional in proto3; producers MAY omit defaults
 *
 * Only the subset of fields we currently consume is modeled here. Unknown
 * fields are ignored by the decoder (forwards-compatible).
 */


/** Status code as defined by the OTLP trace status enum. */
export const enum OtlpStatusCode {
	UNSET = 0,
	OK = 1,
	ERROR = 2,
}

/** Span kind as defined by the OTLP trace span_kind enum. */
export const enum OtlpSpanKind {
	UNSPECIFIED = 0,
	INTERNAL = 1,
	SERVER = 2,
	CLIENT = 3,
	PRODUCER = 4,
	CONSUMER = 5,
}

/**
 * A single attribute value. Exactly one of the optional fields is set, except
 * for empty values which may be entirely absent (proto3 defaults).
 */
export interface IOtlpAnyValue {
	readonly stringValue?: string;
	readonly boolValue?: boolean;
	/** Stringified int64. */
	readonly intValue?: string | number;
	readonly doubleValue?: number;
	readonly arrayValue?: { readonly values?: readonly IOtlpAnyValue[] };
	readonly kvlistValue?: { readonly values?: readonly IOtlpKeyValue[] };
	/** Base64-encoded bytes. */
	readonly bytesValue?: string;
}

export interface IOtlpKeyValue {
	readonly key: string;
	readonly value?: IOtlpAnyValue;
}

export interface IOtlpStatus {
	readonly code?: OtlpStatusCode;
	readonly message?: string;
}

export interface IOtlpEvent {
	readonly timeUnixNano?: string;
	readonly name?: string;
	readonly attributes?: readonly IOtlpKeyValue[];
	readonly droppedAttributesCount?: number;
}

export interface IOtlpLink {
	readonly traceId?: string;
	readonly spanId?: string;
	readonly traceState?: string;
	readonly attributes?: readonly IOtlpKeyValue[];
	readonly droppedAttributesCount?: number;
	readonly flags?: number;
}

export interface IOtlpSpan {
	readonly traceId: string;
	readonly spanId: string;
	readonly traceState?: string;
	readonly parentSpanId?: string;
	readonly flags?: number;
	readonly name?: string;
	readonly kind?: OtlpSpanKind;
	readonly startTimeUnixNano?: string;
	readonly endTimeUnixNano?: string;
	readonly attributes?: readonly IOtlpKeyValue[];
	readonly droppedAttributesCount?: number;
	readonly events?: readonly IOtlpEvent[];
	readonly droppedEventsCount?: number;
	readonly links?: readonly IOtlpLink[];
	readonly droppedLinksCount?: number;
	readonly status?: IOtlpStatus;
}

export interface IOtlpInstrumentationScope {
	readonly name?: string;
	readonly version?: string;
	readonly attributes?: readonly IOtlpKeyValue[];
	readonly droppedAttributesCount?: number;
}

export interface IOtlpScopeSpans {
	readonly scope?: IOtlpInstrumentationScope;
	readonly spans?: readonly IOtlpSpan[];
	readonly schemaUrl?: string;
}

export interface IOtlpResource {
	readonly attributes?: readonly IOtlpKeyValue[];
	readonly droppedAttributesCount?: number;
}

export interface IOtlpResourceSpans {
	readonly resource?: IOtlpResource;
	readonly scopeSpans?: readonly IOtlpScopeSpans[];
	readonly schemaUrl?: string;
}

/** The body shape of `POST /v1/traces`. */
export interface IOtlpExportTraceServiceRequest {
	readonly resourceSpans?: readonly IOtlpResourceSpans[];
}

/**
 * The response shape from `POST /v1/traces`.
 *
 * On full success: `{}` is acceptable (per spec).
 * On partial success: `partialSuccess` is set; the request is NOT retried.
 */
export interface IOtlpExportTraceServiceResponse {
	readonly partialSuccess?: {
		readonly rejectedSpans?: number;
		readonly errorMessage?: string;
	};
}
