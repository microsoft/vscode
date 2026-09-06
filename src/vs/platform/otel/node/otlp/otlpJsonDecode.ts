/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICompletedSpanData, ISpanEventRecord, SpanStatusCode } from '../../common/spanData.js';
import {
	IOtlpAnyValue,
	IOtlpEvent,
	IOtlpExportTraceServiceRequest,
	IOtlpKeyValue,
	IOtlpSpan,
	OtlpStatusCode,
} from './otlpJsonTypes.js';

type AttrValue = string | number | boolean | string[];

const HEX_RE = /^[0-9a-fA-F]+$/;
const ALL_ZERO_TRACE_ID = '00000000000000000000000000000000';
const ALL_ZERO_SPAN_ID = '0000000000000000';

/**
 * Decode an OTLP/HTTP JSON `ExportTraceServiceRequest` into flat
 * {@link ICompletedSpanData} records.
 *
 * The decoder is intentionally lenient: malformed individual spans are skipped
 * and reported via `partialFailures`, so the receiver can return a 200 with
 * `partial_success` populated (per OTLP/HTTP spec) rather than failing the
 * whole batch.
 *
 * Resource attributes (e.g. `service.name`) are merged into each span's
 * attribute map. Span-level attributes win on key collision. This keeps the
 * SQLite schema flat and avoids a separate resource table.
 *
 * Unknown OTLP fields (e.g. `links`, `traceState`) are dropped silently.
 */
export interface IDecodeResult {
	readonly spans: readonly ICompletedSpanData[];
	readonly rejected: number;
	readonly errors: readonly string[];
}

export function decodeExportTraceRequest(request: IOtlpExportTraceServiceRequest | undefined): IDecodeResult {
	if (!request || !Array.isArray(request.resourceSpans)) {
		return { spans: [], rejected: 0, errors: [] };
	}

	const spans: ICompletedSpanData[] = [];
	const errors: string[] = [];
	let rejected = 0;

	for (const rs of request.resourceSpans) {
		if (!rs) {
			continue;
		}
		const resourceAttrs = decodeAttributes(rs.resource?.attributes);

		for (const ss of rs.scopeSpans ?? []) {
			if (!ss) {
				continue;
			}
			for (const span of ss.spans ?? []) {
				try {
					const decoded = decodeSpan(span, resourceAttrs);
					if (decoded) {
						spans.push(decoded);
					} else {
						rejected++;
					}
				} catch (e) {
					rejected++;
					errors.push(e instanceof Error ? e.message : String(e));
				}
			}
		}
	}

	return { spans, rejected, errors };
}

function decodeSpan(span: IOtlpSpan | undefined, resourceAttrs: Record<string, AttrValue>): ICompletedSpanData | undefined {
	if (!span) {
		return undefined;
	}

	const traceId = (span.traceId ?? '').toLowerCase();
	const spanId = (span.spanId ?? '').toLowerCase();
	if (!isValidHex(traceId, 32) || traceId === ALL_ZERO_TRACE_ID) {
		throw new Error(`invalid traceId: ${span.traceId}`);
	}
	if (!isValidHex(spanId, 16) || spanId === ALL_ZERO_SPAN_ID) {
		throw new Error(`invalid spanId: ${span.spanId}`);
	}

	let parentSpanId: string | undefined;
	if (span.parentSpanId) {
		const ps = span.parentSpanId.toLowerCase();
		if (isValidHex(ps, 16) && ps !== ALL_ZERO_SPAN_ID) {
			parentSpanId = ps;
		}
	}

	const startTime = nanosToMillis(span.startTimeUnixNano);
	const endTime = nanosToMillis(span.endTimeUnixNano);
	if (startTime === undefined || endTime === undefined) {
		throw new Error(`missing span time bounds`);
	}

	const attributes: Record<string, AttrValue> = { ...resourceAttrs };
	for (const kv of span.attributes ?? []) {
		setAttribute(attributes, kv);
	}

	const events: ISpanEventRecord[] = [];
	for (const ev of span.events ?? []) {
		const decoded = decodeEvent(ev);
		if (decoded) {
			events.push(decoded);
		}
	}

	const status = decodeStatus(span.status?.code, span.status?.message);

	return {
		name: span.name ?? '',
		traceId,
		spanId,
		parentSpanId,
		startTime,
		endTime,
		status,
		attributes,
		events,
	};
}

function decodeEvent(ev: IOtlpEvent | undefined): ISpanEventRecord | undefined {
	if (!ev) {
		return undefined;
	}
	const timestamp = nanosToMillis(ev.timeUnixNano);
	if (timestamp === undefined) {
		return undefined;
	}
	const attributes: Record<string, AttrValue> = {};
	for (const kv of ev.attributes ?? []) {
		setAttribute(attributes, kv);
	}
	return {
		name: ev.name ?? '',
		timestamp,
		attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
	};
}

function decodeStatus(code: OtlpStatusCode | undefined, message: string | undefined): ICompletedSpanData['status'] {
	switch (code) {
		case OtlpStatusCode.OK:
			return { code: SpanStatusCode.OK, message };
		case OtlpStatusCode.ERROR:
			return { code: SpanStatusCode.ERROR, message };
		case OtlpStatusCode.UNSET:
		default:
			return { code: SpanStatusCode.UNSET, message };
	}
}

function decodeAttributes(kvs: readonly IOtlpKeyValue[] | undefined): Record<string, AttrValue> {
	const out: Record<string, AttrValue> = {};
	if (!kvs) {
		return out;
	}
	for (const kv of kvs) {
		setAttribute(out, kv);
	}
	return out;
}

function setAttribute(target: Record<string, AttrValue>, kv: IOtlpKeyValue | undefined): void {
	if (!kv || typeof kv.key !== 'string' || kv.key.length === 0) {
		return;
	}
	const value = decodeAnyValue(kv.value);
	if (value !== undefined) {
		target[kv.key] = value;
	}
}

function decodeAnyValue(v: IOtlpAnyValue | undefined): AttrValue | undefined {
	if (!v) {
		return undefined;
	}
	if (typeof v.stringValue === 'string') {
		return v.stringValue;
	}
	if (typeof v.boolValue === 'boolean') {
		return v.boolValue;
	}
	if (v.intValue !== undefined) {
		// intValue is a stringified int64; precision beyond Number.MAX_SAFE_INTEGER is lost
		const n = typeof v.intValue === 'string' ? Number(v.intValue) : v.intValue;
		return Number.isFinite(n) ? n : undefined;
	}
	if (typeof v.doubleValue === 'number') {
		return v.doubleValue;
	}
	if (v.arrayValue?.values) {
		// Only flat arrays of strings are first-class in ICompletedSpanData.attributes.
		// For mixed/numeric/nested arrays, fall back to JSON for fidelity.
		const items = v.arrayValue.values.map(decodeAnyValue);
		if (items.every((x): x is string => typeof x === 'string')) {
			return items;
		}
		return JSON.stringify(items);
	}
	if (v.kvlistValue?.values) {
		// Rare; preserve as JSON.
		const obj: Record<string, AttrValue | undefined> = {};
		for (const kv of v.kvlistValue.values) {
			if (kv && typeof kv.key === 'string') {
				obj[kv.key] = decodeAnyValue(kv.value);
			}
		}
		return JSON.stringify(obj);
	}
	if (typeof v.bytesValue === 'string') {
		return v.bytesValue;
	}
	return undefined;
}

function nanosToMillis(s: string | undefined): number | undefined {
	if (s === undefined || s === '' || s === '0') {
		return undefined;
	}
	// Avoid BigInt churn: parse as decimal string, truncate the last 6 digits (ns → ms).
	// `s` is a non-negative integer per the spec.
	const trimmed = s.length <= 6 ? '0' : s.slice(0, -6);
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : undefined;
}

function isValidHex(s: string, len: number): boolean {
	return s.length === len && HEX_RE.test(s);
}
