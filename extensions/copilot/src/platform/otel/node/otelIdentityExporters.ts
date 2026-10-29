/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExportResult } from '@opentelemetry/core';
import type { Resource } from '@opentelemetry/resources';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { MetricData, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import { CopilotChatAttr, GenAiAttr } from '../common/genAiAttributes';
import { filterIdentityAttributes } from '../common/otelIdentity';

type FilterResource = (resource: Resource) => Resource;

// The local debug pipeline deliberately records these even with content export off.
const contentAttributes = new Set<string>([
	GenAiAttr.INPUT_MESSAGES, GenAiAttr.OUTPUT_MESSAGES, GenAiAttr.SYSTEM_INSTRUCTIONS,
	GenAiAttr.TOOL_DEFINITIONS, GenAiAttr.TOOL_DESCRIPTION, GenAiAttr.TOOL_CALL_ARGUMENTS, GenAiAttr.TOOL_CALL_RESULT,
	CopilotChatAttr.USER_REQUEST, CopilotChatAttr.REASONING_CONTENT, CopilotChatAttr.PROMPT_CONTEXT,
	CopilotChatAttr.PROMPT_INSTRUCTIONS, CopilotChatAttr.MARKDOWN_CONTENT,
	CopilotChatAttr.HOOK_INPUT, CopilotChatAttr.HOOK_OUTPUT,
	'content', 'toolDefinitions',
]);

/**
 * Recheck at export, not just span creation: queued and in-flight spans may outlive
 * a policy revocation. Every SDK exporter (including SQLite) uses this boundary.
 */
export class IdentitySpanExporter implements SpanExporter {
	constructor(
		private readonly _inner: SpanExporter,
		private readonly _allowed: () => boolean,
		private readonly _filterResource: FilterResource,
		private readonly _captureContent = true,
	) { }

	export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
		const allowed = this._allowed();
		this._inner.export(spans.map(span => ({
			name: span.name,
			kind: span.kind,
			spanContext: () => span.spanContext(),
			parentSpanContext: span.parentSpanContext,
			startTime: span.startTime,
			endTime: span.endTime,
			status: span.status,
			attributes: this._filterAttributes(span.attributes, allowed),
			events: span.events.map(event => ({ ...event, attributes: event.attributes && this._filterAttributes(event.attributes, allowed) })),
			links: span.links.map(link => ({ ...link, attributes: link.attributes && filterIdentityAttributes(link.attributes, allowed) })),
			duration: span.duration,
			ended: span.ended,
			resource: this._filterResource(span.resource),
			instrumentationScope: span.instrumentationScope,
			droppedAttributesCount: span.droppedAttributesCount,
			droppedEventsCount: span.droppedEventsCount,
			droppedLinksCount: span.droppedLinksCount,
		})), callback);
	}

	private _filterAttributes<T>(attributes: Readonly<Record<string, T>>, allowed: boolean): Record<string, T> {
		return Object.fromEntries(Object.entries(filterIdentityAttributes(attributes, allowed))
			.filter(([key]) => this._captureContent || !contentAttributes.has(key)));
	}

	shutdown(): Promise<void> { return this._inner.shutdown(); }
	forceFlush(): Promise<void> { return this._inner.forceFlush?.() ?? Promise.resolve(); }
}

export class IdentityLogExporter implements LogRecordExporter {
	constructor(
		private readonly _inner: LogRecordExporter,
		private readonly _allowed: () => boolean,
		private readonly _filterResource: FilterResource,
	) { }

	export(logs: ReadableLogRecord[], callback: (result: ExportResult) => void): void {
		const allowed = this._allowed();
		this._inner.export(logs.map(log => ({
			hrTime: log.hrTime,
			hrTimeObserved: log.hrTimeObserved,
			spanContext: log.spanContext,
			severityText: log.severityText,
			severityNumber: log.severityNumber,
			body: log.body,
			eventName: log.eventName,
			instrumentationScope: log.instrumentationScope,
			droppedAttributesCount: log.droppedAttributesCount,
			attributes: filterIdentityAttributes(log.attributes, allowed),
			resource: this._filterResource(log.resource),
		})), callback);
	}

	shutdown(): Promise<void> { return this._inner.shutdown(); }
}

export class IdentityMetricExporter implements PushMetricExporter {
	readonly selectAggregationTemporality: PushMetricExporter['selectAggregationTemporality'];
	readonly selectAggregation: PushMetricExporter['selectAggregation'];

	constructor(
		private readonly _inner: PushMetricExporter,
		private readonly _allowed: () => boolean,
		private readonly _filterResource: FilterResource,
	) {
		this.selectAggregationTemporality = _inner.selectAggregationTemporality && (type => _inner.selectAggregationTemporality!(type));
		this.selectAggregation = _inner.selectAggregation && (type => _inner.selectAggregation!(type));
	}

	export(metrics: ResourceMetrics, callback: (result: ExportResult) => void): void {
		const allowed = this._allowed();
		// Preserve the discriminated metric type while replacing each point's attributes.
		const scopeMetrics = metrics.scopeMetrics.map(scope => ({
			...scope,
			metrics: scope.metrics.map(metric => filterMetric(metric, allowed)),
		}));
		this._inner.export({ resource: this._filterResource(metrics.resource), scopeMetrics }, callback);
	}

	forceFlush(): Promise<void> { return this._inner.forceFlush(); }
	shutdown(): Promise<void> { return this._inner.shutdown(); }
}

function filterMetric<T extends MetricData>(metric: T, allowed: boolean): T {
	return {
		...metric,
		dataPoints: metric.dataPoints.map(point => ({
			...point, attributes: filterIdentityAttributes(point.attributes, allowed),
		})),
	};
}
