/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	OTelSqliteStore,
	SpanEventRow,
	SpanRow,
	TraceRow,
} from '../../../platform/otel/node/sqlite/otelSqliteStore';

/**
 * Message protocol between the trace viewer webview and the extension host.
 * Kept as plain string literals + records so it serializes across postMessage.
 */

export interface IListTracesQuery {
	readonly type: 'listTraces';
	readonly limit?: number;
	readonly agent?: string;        // agent_name exact match
	readonly status?: 'ok' | 'error';
	readonly sessionId?: string;
	readonly search?: string;       // free-text on root_name/model/tool
}

export interface IGetTraceQuery {
	readonly type: 'getTrace';
	readonly traceId: string;
}

export interface IGetSpanDetailsQuery {
	readonly type: 'getSpanDetails';
	readonly spanId: string;
}

export type IViewerQuery = IListTracesQuery | IGetTraceQuery | IGetSpanDetailsQuery;

export interface IListTracesResult {
	readonly type: 'listTraces';
	readonly traces: readonly TraceRow[];
	readonly agents: readonly string[]; // distinct agent_name values for filter chips
}

export interface IGetTraceResult {
	readonly type: 'getTrace';
	readonly traceId: string;
	readonly spans: readonly SpanRow[];
}

export interface IGetSpanDetailsResult {
	readonly type: 'getSpanDetails';
	readonly spanId: string;
	readonly attributes: ReadonlyArray<{ key: string; value: string | null }>;
	readonly events: readonly SpanEventRow[];
}

export type IViewerResult = IListTracesResult | IGetTraceResult | IGetSpanDetailsResult;

/**
 * Typed query facade over the raw SQLite store. The webview never sees the store
 * directly; everything goes through this layer so we can redact / sanitize values
 * before they cross the postMessage boundary.
 */
export class OTelViewerQueries {
	constructor(private readonly _store: OTelSqliteStore) { }

	listTraces(q: IListTracesQuery): IListTracesResult {
		let traces = this._store.getTraces(q.limit ?? 500);

		if (q.agent) {
			traces = traces.filter(t => t.agent_name === q.agent);
		}
		if (q.status === 'error') {
			traces = traces.filter(t => t.error_count > 0);
		} else if (q.status === 'ok') {
			traces = traces.filter(t => t.error_count === 0);
		}
		if (q.sessionId) {
			traces = traces.filter(t => t.session_id === q.sessionId);
		}
		if (q.search) {
			const needle = q.search.toLowerCase();
			traces = traces.filter(t =>
				(t.root_name ?? '').toLowerCase().includes(needle) ||
				(t.model ?? '').toLowerCase().includes(needle) ||
				(t.agent_name ?? '').toLowerCase().includes(needle) ||
				t.trace_id.toLowerCase().startsWith(needle),
			);
		}

		const agents = Array.from(new Set(
			this._store.getTraces(500).map(t => t.agent_name).filter((a): a is string => !!a),
		)).sort();

		return { type: 'listTraces', traces, agents };
	}

	getTrace(q: IGetTraceQuery): IGetTraceResult {
		return {
			type: 'getTrace',
			traceId: q.traceId,
			spans: this._store.getSpansByTraceId(q.traceId),
		};
	}

	getSpanDetails(q: IGetSpanDetailsQuery): IGetSpanDetailsResult {
		return {
			type: 'getSpanDetails',
			spanId: q.spanId,
			attributes: this._store.getSpanAttributes(q.spanId),
			events: this._store.getSpanEvents(q.spanId),
		};
	}

	handle(query: IViewerQuery): IViewerResult {
		switch (query.type) {
			case 'listTraces': return this.listTraces(query);
			case 'getTrace': return this.getTrace(query);
			case 'getSpanDetails': return this.getSpanDetails(query);
		}
	}
}
