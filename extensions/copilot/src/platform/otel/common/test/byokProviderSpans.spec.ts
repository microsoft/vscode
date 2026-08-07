/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { GenAiAttr, GenAiOperationName } from '../genAiAttributes';
import { emitInferenceDetailsEvent } from '../genAiEvents';
import { SpanKind, SpanStatusCode } from '../otelService';
import { CapturingOTelService } from './capturingOTelService';

/**
 * Tests BYOK-style span emission patterns — verifying that chat spans
 * are created with correct kind, attributes, status codes, and that
 * content capture is properly gated on config.captureContent.
 *
 * These validate the instrumentation patterns used in anthropicProvider,
 * geminiNativeProvider, and chatMLFetcher.
 */
describe('BYOK Provider Span Emission', () => {
	it('creates chat span with CLIENT kind and model attributes', () => {
		const otel = new CapturingOTelService();

		const span = otel.startSpan('chat claude-sonnet-4-20250514', {
			kind: SpanKind.CLIENT,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
				[GenAiAttr.PROVIDER_NAME]: 'anthropic',
				[GenAiAttr.REQUEST_MODEL]: 'claude-sonnet-4-20250514',
				[GenAiAttr.AGENT_NAME]: 'AnthropicBYOK',
			},
		});
		span.setAttributes({
			[GenAiAttr.USAGE_INPUT_TOKENS]: 2000,
			[GenAiAttr.USAGE_OUTPUT_TOKENS]: 500,
			[GenAiAttr.RESPONSE_MODEL]: 'claude-sonnet-4-20250514',
			[GenAiAttr.RESPONSE_ID]: 'msg_abc123',
		});
		span.setStatus(SpanStatusCode.OK);
		span.end();

		expect(otel.spans).toHaveLength(1);
		const s = otel.spans[0];
		expect(s.kind).toBe(SpanKind.CLIENT);
		expect(s.attributes[GenAiAttr.OPERATION_NAME]).toBe('chat');
		expect(s.attributes[GenAiAttr.PROVIDER_NAME]).toBe('anthropic');
		expect(s.attributes[GenAiAttr.USAGE_INPUT_TOKENS]).toBe(2000);
		expect(s.attributes[GenAiAttr.USAGE_OUTPUT_TOKENS]).toBe(500);
		expect(s.statusCode).toBe(SpanStatusCode.OK);
		expect(s.ended).toBe(true);
	});

	it('sets ERROR status and error.type on failure', () => {
		const otel = new CapturingOTelService();

		const span = otel.startSpan('chat gemini-2.0-flash', {
			kind: SpanKind.CLIENT,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
				[GenAiAttr.PROVIDER_NAME]: 'gemini',
				[GenAiAttr.REQUEST_MODEL]: 'gemini-2.0-flash',
			},
		});
		span.setStatus(SpanStatusCode.ERROR, 'Rate limit exceeded');
		span.setAttribute('error.type', 'RateLimitError');
		span.recordException(new Error('Rate limit exceeded'));
		span.end();

		const s = otel.spans[0];
		expect(s.statusCode).toBe(SpanStatusCode.ERROR);
		expect(s.statusMessage).toBe('Rate limit exceeded');
		expect(s.attributes['error.type']).toBe('RateLimitError');
		expect(s.exceptions).toHaveLength(1);
	});

	it('does NOT capture content when captureContent is false', () => {
		const otel = new CapturingOTelService({ captureContent: false });

		// Simulate the input capture gating pattern used in BYOK providers
		const span = otel.startSpan('chat gpt-4o', { kind: SpanKind.CLIENT, attributes: {} });
		if (otel.config.captureContent) {
			span.setAttribute(GenAiAttr.INPUT_MESSAGES, 'should not appear');
		}
		span.end();

		expect(otel.spans[0].attributes[GenAiAttr.INPUT_MESSAGES]).toBeUndefined();
	});

	it('captures content when captureContent is true', () => {
		const otel = new CapturingOTelService({ captureContent: true });

		const span = otel.startSpan('chat gpt-4o', { kind: SpanKind.CLIENT, attributes: {} });
		if (otel.config.captureContent) {
			span.setAttribute(GenAiAttr.INPUT_MESSAGES, '[{"role":"user","parts":[{"type":"text","content":"hello"}]}]');
			span.setAttribute(GenAiAttr.OUTPUT_MESSAGES, '[{"role":"assistant","parts":[{"type":"text","content":"hi"}]}]');
		}
		span.end();

		expect(otel.spans[0].attributes[GenAiAttr.INPUT_MESSAGES]).toBeDefined();
		expect(otel.spans[0].attributes[GenAiAttr.OUTPUT_MESSAGES]).toBeDefined();
	});

	it('emits inference details event with request/response data', () => {
		const otel = new CapturingOTelService();

		emitInferenceDetailsEvent(
			otel,
			{ model: 'claude-sonnet-4-20250514', temperature: 0.1, maxTokens: 4096 },
			{ id: 'msg_123', model: 'claude-sonnet-4-20250514', finishReasons: ['stop'], inputTokens: 2000, outputTokens: 500 },
		);

		expect(otel.logRecords).toHaveLength(1);
		const attrs = otel.logRecords[0].attributes!;
		expect(attrs['event.name']).toBe('gen_ai.client.inference.operation.details');
		expect(attrs[GenAiAttr.REQUEST_MODEL]).toBe('claude-sonnet-4-20250514');
		expect(attrs[GenAiAttr.USAGE_INPUT_TOKENS]).toBe(2000);
		expect(attrs[GenAiAttr.USAGE_OUTPUT_TOKENS]).toBe(500);
	});

	it('uses parentTraceContext for CAPI → BYOK trace linking', () => {
		const otel = new CapturingOTelService();
		const parentCtx = { traceId: '11112222333344445555666677778888', spanId: 'aabbccddeeff0011' };

		const span = otel.startSpan('chat gpt-4o', {
			kind: SpanKind.CLIENT,
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT },
			parentTraceContext: parentCtx,
		});
		span.end();

		expect(otel.spans[0].parentTraceContext).toEqual(parentCtx);
	});
});
