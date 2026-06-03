/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { AbstractMessageLogger, LogLevel } from '../../../log/common/log.js';

/**
 * Channel URI template advertised by an agent host that has an
 * {@link OtlpLogEmitter} attached. Clients expand `{level}` to one of the
 * short OTLP severity names (`trace`/`debug`/`info`/`warn`/`error`/`fatal`)
 * and subscribe to the resulting concrete URI.
 *
 * Kept as a constant so producer (host) and consumer (workbench) cannot
 * drift out of sync.
 */
export const OTLP_LOGS_CHANNEL_TEMPLATE = 'ahp-otlp://logs/{level}';

/**
 * Scheme used by every OTLP channel URI. Lets routers tell them apart from
 * `ahp-*` state channels by URI alone.
 */
export const OTLP_CHANNEL_SCHEME = 'ahp-otlp';

/**
 * Short OTLP severity names defined by the protocol's `{level}` template
 * variable. Listed in ascending order so a numeric index can act as a
 * coarse "minimum severity" bucket.
 */
export const OTLP_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type OtlpLogLevelName = typeof OTLP_LOG_LEVELS[number];

/**
 * Lowest [OTLP `SeverityNumber`](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber)
 * within each named severity band. A record is delivered when its
 * `severityNumber >= levelToSeverityNumber(subscribed level)`.
 */
export function levelToSeverityNumber(level: OtlpLogLevelName): number {
	switch (level) {
		case 'trace': return 1;
		case 'debug': return 5;
		case 'info': return 9;
		case 'warn': return 13;
		case 'error': return 17;
		case 'fatal': return 21;
	}
}

/**
 * Parse one of {@link OTLP_LOG_LEVELS} from an arbitrary (case-insensitive)
 * string. Returns `undefined` for anything that is not a recognised name so
 * callers can decide how to handle unknown levels.
 */
export function parseOtlpLogLevel(value: string): OtlpLogLevelName | undefined {
	const lower = value.toLowerCase();
	return (OTLP_LOG_LEVELS as readonly string[]).includes(lower) ? lower as OtlpLogLevelName : undefined;
}

/**
 * Map a VS Code {@link LogLevel} onto the corresponding OTLP
 * `SeverityNumber` and short name.
 */
export function logLevelToOtlpSeverity(level: LogLevel): { severityNumber: number; severityText: OtlpLogLevelName } {
	switch (level) {
		case LogLevel.Trace: return { severityNumber: 1, severityText: 'trace' };
		case LogLevel.Debug: return { severityNumber: 5, severityText: 'debug' };
		case LogLevel.Info: return { severityNumber: 9, severityText: 'info' };
		case LogLevel.Warning: return { severityNumber: 13, severityText: 'warn' };
		case LogLevel.Error: return { severityNumber: 17, severityText: 'error' };
		case LogLevel.Off:
			// `Off` is filtered out before we ever reach this function — but
			// pick a sentinel so callers can defend if they get here anyway.
			return { severityNumber: 0, severityText: 'trace' };
	}
}

/**
 * Map a VS Code {@link LogLevel} onto the matching OTLP level name used in
 * the protocol's `{level}` template. Returns `undefined` for
 * {@link LogLevel.Off} since "no logs" is represented by not subscribing
 * at all.
 */
export function logLevelToOtlpLevelName(level: LogLevel): OtlpLogLevelName | undefined {
	if (level === LogLevel.Off) {
		return undefined;
	}
	return logLevelToOtlpSeverity(level).severityText;
}

/**
 * Reverse of {@link logLevelToOtlpSeverity}: returns the closest VS Code
 * log level for a given OTLP `SeverityNumber`. Used on the client side to
 * pick which `ILogger.{trace,debug,...}` call to route an incoming record
 * through.
 */
export function severityNumberToLogLevel(severityNumber: number): LogLevel {
	if (severityNumber >= 17) { return LogLevel.Error; }
	if (severityNumber >= 13) { return LogLevel.Warning; }
	if (severityNumber >= 9) { return LogLevel.Info; }
	if (severityNumber >= 5) { return LogLevel.Debug; }
	return LogLevel.Trace;
}

/**
 * A single log record produced by an {@link OtlpEmitterLogger}. The shape
 * mirrors the relevant fields from the OTLP/JSON `LogRecord` spec but is
 * kept intentionally small — only what we need to populate a
 * spec-conformant `ExportLogsServiceRequest` envelope.
 */
export interface IOtlpLogRecord {
	/**
	 * Time the record was produced, in nanoseconds since the Unix epoch.
	 * Encoded as a string because JS numbers cannot losslessly represent
	 * 64-bit nanosecond timestamps (this matches the OTLP/JSON wire format).
	 */
	readonly timeUnixNano: string;
	/** OTLP `SeverityNumber` in the range 1..24 (see {@link levelToSeverityNumber}). */
	readonly severityNumber: number;
	/** Short severity name (`trace`/`debug`/...) matching the protocol's `{level}` vocabulary. */
	readonly severityText: OtlpLogLevelName;
	/**
	 * Pre-formatted log body. We send the same string the existing
	 * `ILogger` printed to the file logger — the OTLP spec models this as
	 * `body: { stringValue }`.
	 */
	readonly body: string;
}

/**
 * Connection-process-wide hub that {@link OtlpEmitterLogger} writes to and
 * the protocol server reads from. Decouples log production (which happens
 * via {@link ILogger}) from protocol broadcast (which needs awareness of
 * connected clients and their subscribed severity).
 */
export class OtlpLogEmitter extends Disposable {

	private readonly _onDidLog = this._register(new Emitter<IOtlpLogRecord>());
	readonly onDidLog: Event<IOtlpLogRecord> = this._onDidLog.event;

	emit(record: IOtlpLogRecord): void {
		this._onDidLog.fire(record);
	}
}

/**
 * `AbstractMessageLogger` that converts each `log(level, message)` call
 * into an {@link IOtlpLogRecord} and emits it on the shared
 * {@link OtlpLogEmitter}. Designed to be installed alongside the regular
 * file logger via `new LogService(primary, [otlpLogger])` so every log
 * call is mirrored to OTLP subscribers without duplicating call sites.
 */
export class OtlpEmitterLogger extends AbstractMessageLogger {

	constructor(
		private readonly _emitter: OtlpLogEmitter,
		initialLevel: LogLevel = LogLevel.Trace,
	) {
		super();
		// Default to `Trace` so the parent `LogService`'s level check is
		// the single source of truth and we don't accidentally drop
		// records the file logger printed. The protocol's `{level}`
		// filter is applied per-subscriber later on.
		this.setLevel(initialLevel);
	}

	protected override log(level: LogLevel, message: string): void {
		if (level === LogLevel.Off) {
			return;
		}
		const { severityNumber, severityText } = logLevelToOtlpSeverity(level);
		this._emitter.emit({
			timeUnixNano: msToUnixNano(Date.now()),
			severityNumber,
			severityText,
			body: message,
		});
	}
}

/**
 * Build an OTLP/JSON `ExportLogsServiceRequest` envelope from a single
 * record. The payload is the minimum the spec allows: one `ResourceLogs` →
 * one `ScopeLogs` → one `LogRecord`.
 *
 * Callers that want to batch multiple records can use
 * {@link toResourceLogsPayloadBatch}.
 */
export function toResourceLogsPayload(record: IOtlpLogRecord): Record<string, unknown> {
	return toResourceLogsPayloadBatch([record]);
}

/**
 * Build an OTLP/JSON `ExportLogsServiceRequest` envelope from a batch of
 * records. All records share the same `ResourceLogs`/`ScopeLogs` parent —
 * which is fine since this emitter only ever runs inside a single agent
 * host process and instrumentation scope.
 */
export function toResourceLogsPayloadBatch(records: readonly IOtlpLogRecord[]): Record<string, unknown> {
	return {
		resourceLogs: [
			{
				resource: { attributes: [] },
				scopeLogs: [
					{
						scope: { name: 'vscode.agentHost' },
						logRecords: records.map(r => ({
							timeUnixNano: r.timeUnixNano,
							observedTimeUnixNano: r.timeUnixNano,
							severityNumber: r.severityNumber,
							severityText: r.severityText,
							body: { stringValue: r.body },
						})),
					},
				],
			},
		],
	};
}

/**
 * Walk an OTLP/JSON `ExportLogsServiceRequest` payload and yield each
 * embedded `LogRecord` in a shape matching {@link IOtlpLogRecord}. Used by
 * clients to decode incoming `otlp/exportLogs` notifications without
 * dragging in an OpenTelemetry SDK.
 *
 * Anything that does not look like a log record is silently skipped —
 * the OTLP spec gives hosts considerable freedom and we don't want a
 * malformed nested object to bring down the entire batch.
 */
export function* iterateOtlpLogRecords(payload: unknown): IterableIterator<IOtlpLogRecord> {
	if (!payload || typeof payload !== 'object') {
		return;
	}
	const resourceLogs = (payload as { resourceLogs?: unknown }).resourceLogs;
	if (!Array.isArray(resourceLogs)) {
		return;
	}
	for (const resourceLog of resourceLogs) {
		if (!resourceLog || typeof resourceLog !== 'object') {
			continue;
		}
		const scopeLogs = (resourceLog as { scopeLogs?: unknown }).scopeLogs;
		if (!Array.isArray(scopeLogs)) {
			continue;
		}
		for (const scopeLog of scopeLogs) {
			if (!scopeLog || typeof scopeLog !== 'object') {
				continue;
			}
			const logRecords = (scopeLog as { logRecords?: unknown }).logRecords;
			if (!Array.isArray(logRecords)) {
				continue;
			}
			for (const raw of logRecords) {
				const record = coerceLogRecord(raw);
				if (record) {
					yield record;
				}
			}
		}
	}
}

function coerceLogRecord(raw: unknown): IOtlpLogRecord | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const r = raw as Record<string, unknown>;
	const severityNumber = typeof r.severityNumber === 'number' ? r.severityNumber : 0;
	const severityTextRaw = typeof r.severityText === 'string' ? r.severityText.toLowerCase() : '';
	const severityText = parseOtlpLogLevel(severityTextRaw) ?? severityNameFromNumber(severityNumber);
	const timeUnixNano = typeof r.timeUnixNano === 'string'
		? r.timeUnixNano
		: typeof r.observedTimeUnixNano === 'string' ? r.observedTimeUnixNano : '0';
	const body = extractBody(r.body);
	return { timeUnixNano, severityNumber, severityText, body };
}

function severityNameFromNumber(n: number): OtlpLogLevelName {
	if (n >= 21) { return 'fatal'; }
	if (n >= 17) { return 'error'; }
	if (n >= 13) { return 'warn'; }
	if (n >= 9) { return 'info'; }
	if (n >= 5) { return 'debug'; }
	return 'trace';
}

function extractBody(body: unknown): string {
	if (typeof body === 'string') {
		return body;
	}
	if (body && typeof body === 'object') {
		const value = (body as { stringValue?: unknown }).stringValue;
		if (typeof value === 'string') {
			return value;
		}
	}
	return '';
}

/**
 * Convert a millisecond Unix timestamp to a string-encoded nanosecond
 * Unix timestamp (the OTLP/JSON wire format). We don't have sub-millisecond
 * precision on the producer side, so we just pad with `'000000'`.
 */
function msToUnixNano(ms: number): string {
	// Avoid `BigInt` so this works in renderers and worker environments
	// that block `bigint` in JSON serialization paths.
	return `${ms}000000`;
}

/**
 * Parse an `ahp-otlp:` channel URI string and extract the `{level}` path
 * segment (if present). Returns the parsed level — or `undefined` if the
 * URI does not encode one or the encoded value is not a recognised name.
 *
 * The URI shape advertised by this host implementation is
 * `ahp-otlp://logs/<level>` where `<level>` is one of {@link OTLP_LOG_LEVELS}.
 */
export function extractLevelFromOtlpLogsUri(uri: string): OtlpLogLevelName | undefined {
	// Strip the scheme + authority prefix; the level is the last path
	// segment. We avoid `URI.parse` here so this helper can run in
	// environments that haven't pulled in the URI module (e.g. tests).
	const match = /^ahp-otlp:\/\/logs\/([^/?#]+)/i.exec(uri);
	if (!match) {
		return undefined;
	}
	return parseOtlpLogLevel(match[1]);
}

/**
 * Build the concrete `ahp-otlp:` channel URI a client subscribes to for a
 * given minimum severity. Used both by clients deciding which URI to send
 * with `subscribe` and by hosts deciding which URI to put on outbound
 * notifications.
 */
export function buildOtlpLogsChannelUri(level: OtlpLogLevelName): string {
	return `ahp-otlp://logs/${level}`;
}
