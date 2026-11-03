/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOTelConfig } from '../../common/otelConfig';
import type { TraceContext } from '../../common/otelService';
import { NodeOTelService } from '../otelServiceImpl';

/**
 * Tests for trace context propagation, specifically verifying that
 * subagent invoke_agent spans can be linked as children of the parent
 * agent's trace via storeTraceContext / getStoredTraceContext / parentTraceContext.
 */
describe('Trace Context Propagation', () => {
	let service: NodeOTelService;

	beforeAll(async () => {
		const config = resolveOTelConfig({
			env: {
				'COPILOT_OTEL_ENABLED': 'true',
				'COPILOT_OTEL_EXPORTER': 'console',
			},
			extensionVersion: '1.0.0',
			sessionId: 'test-session',
		});
		service = new NodeOTelService(config);
		// Wait for async SDK initialization — poll until _initialized
		for (let i = 0; i < 50; i++) {
			if ((service as any)._initialized) { break; }
			await new Promise(r => setTimeout(r, 50));
		}
	});

	afterAll(async () => {
		await service.shutdown();
	});

	describe('storeTraceContext / getStoredTraceContext', () => {
		it('round-trips a stored trace context', () => {
			const ctx: TraceContext = { traceId: 'aaaa0000bbbb1111cccc2222dddd3333', spanId: 'eeee4444ffff5555' };
			service.storeTraceContext('test-key', ctx);
			const retrieved = service.getStoredTraceContext('test-key');
			expect(retrieved).toEqual(ctx);
		});

		it('returns undefined for unknown key', () => {
			expect(service.getStoredTraceContext('nonexistent')).toBeUndefined();
		});

		it('deletes context after retrieval (single-use)', () => {
			const ctx: TraceContext = { traceId: 'aaaa0000bbbb1111cccc2222dddd3333', spanId: 'eeee4444ffff5555' };
			service.storeTraceContext('one-shot', ctx);
			service.getStoredTraceContext('one-shot');
			expect(service.getStoredTraceContext('one-shot')).toBeUndefined();
		});
	});

	describe('getActiveTraceContext', () => {
		it('returns undefined when no span is active', () => {
			expect(service.getActiveTraceContext()).toBeUndefined();
		});

		it('returns trace context inside startActiveSpan', async () => {
			let capturedCtx: TraceContext | undefined;
			await service.startActiveSpan('test-parent', { attributes: {} }, async () => {
				capturedCtx = service.getActiveTraceContext();
			});
			expect(capturedCtx).toBeDefined();
			expect(capturedCtx!.traceId).toMatch(/^[0-9a-f]{32}$/);
			expect(capturedCtx!.spanId).toMatch(/^[0-9a-f]{16}$/);
		});
	});

	describe('parentTraceContext links subagent to parent trace', () => {
		it('child span inherits traceId from parent via parentTraceContext', async () => {
			// Phase 1: Parent agent creates a span, captures context
			let parentCtx: TraceContext | undefined;
			await service.startActiveSpan('invoke_agent parent', { attributes: {} }, async () => {
				parentCtx = service.getActiveTraceContext();
			});
			expect(parentCtx).toBeDefined();

			// Phase 2: Subagent uses parentTraceContext (new async context, no active parent)
			let childCtx: TraceContext | undefined;
			await service.startActiveSpan('invoke_agent subagent', {
				attributes: {},
				parentTraceContext: parentCtx,
			}, async () => {
				childCtx = service.getActiveTraceContext();
			});

			// Same traceId (same distributed trace), different spanId
			expect(childCtx!.traceId).toBe(parentCtx!.traceId);
			expect(childCtx!.spanId).not.toBe(parentCtx!.spanId);
		});

		it('without parentTraceContext, spans get independent traceIds', async () => {
			let trace1: string | undefined;
			let trace2: string | undefined;

			await service.startActiveSpan('agent-1', { attributes: {} }, async () => {
				trace1 = service.getActiveTraceContext()!.traceId;
			});

			await service.startActiveSpan('agent-2', { attributes: {} }, async () => {
				trace2 = service.getActiveTraceContext()!.traceId;
			});

			expect(trace1).not.toBe(trace2);
		});

		it('full subagent flow: store in tool call, retrieve in subagent', async () => {
			let parentTraceId: string | undefined;
			let subagentTraceId: string | undefined;

			// Phase 1: Parent agent runs, tool calls runSubagent, stores context
			await service.startActiveSpan('invoke_agent main', { attributes: {} }, async () => {
				const ctx = service.getActiveTraceContext()!;
				parentTraceId = ctx.traceId;
				// Simulate execute_tool runSubagent storing the context
				service.storeTraceContext('subagent:req-abc', ctx);
			});

			// Phase 2: Subagent request arrives (new async context, no parent span active)
			const restoredCtx = service.getStoredTraceContext('subagent:req-abc');
			expect(restoredCtx).toBeDefined();

			await service.startActiveSpan('invoke_agent subagent', {
				attributes: {},
				parentTraceContext: restoredCtx,
			}, async () => {
				subagentTraceId = service.getActiveTraceContext()!.traceId;
			});

			// Both agents share the same traceId
			expect(subagentTraceId).toBe(parentTraceId);

			// The stored context was consumed (single-use)
			expect(service.getStoredTraceContext('subagent:req-abc')).toBeUndefined();
		});
	});
});
