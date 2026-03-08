/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { TraceExporter } from '../src/trace/TraceExporter';

suite('TraceExporter', () => {
	let exporter: TraceExporter;

	setup(() => {
		exporter = new TraceExporter();
	});

	test('generates a session ID', () => {
		assert.strictEqual(exporter.getSessionId().length, 16);
	});

	test('recordLlmCall creates a span', () => {
		const span = exporter.recordLlmCall({
			model: 'sonnet',
			inputTokens: 1000,
			outputTokens: 500,
			cachedTokens: 200,
			latencyMs: 1500,
		});

		assert.strictEqual(span.name, 'llm.call');
		assert.strictEqual(span.attributes['model'], 'sonnet');
		assert.strictEqual(span.attributes['inputTokens'], 1000);
		assert.strictEqual(span.status, 'OK');
	});

	test('recordMcpToolCall creates a span', () => {
		const span = exporter.recordMcpToolCall({
			server: 'code-graph',
			toolName: 'file_summary',
			latencyMs: 200,
		});

		assert.strictEqual(span.name, 'mcp.tool');
		assert.strictEqual(span.attributes['server'], 'code-graph');
		assert.strictEqual(span.attributes['toolName'], 'file_summary');
	});

	test('recordFileChange creates a span', () => {
		const span = exporter.recordFileChange({
			path: 'src/main.ts',
			changeType: 'modify',
			linesChanged: 42,
		});

		assert.strictEqual(span.name, 'file.change');
		assert.strictEqual(span.attributes['changeType'], 'modify');
	});

	test('recordHookExecution creates a span', () => {
		const span = exporter.recordHookExecution({
			hookName: 'security-scan',
			trigger: 'preCommit',
			agent: 'anton-security',
			blocking: true,
			success: true,
			durationMs: 3000,
		});

		assert.strictEqual(span.name, 'hook.execute');
		assert.strictEqual(span.attributes['hookName'], 'security-scan');
		assert.strictEqual(span.attributes['blocking'], true);
	});

	test('recordSandboxExec creates a span with correct status', () => {
		const successSpan = exporter.recordSandboxExec({
			command: 'npm test',
			exitCode: 0,
			durationMs: 5000,
		});
		assert.strictEqual(successSpan.status, 'OK');

		const failSpan = exporter.recordSandboxExec({
			command: 'npm test',
			exitCode: 1,
			durationMs: 2000,
		});
		assert.strictEqual(failSpan.status, 'ERROR');
	});

	test('recordAgentLifecycle creates spans for each phase', () => {
		exporter.recordAgentLifecycle('start', {
			agentName: 'anton-code',
			taskDescription: 'Generate tests',
		});

		exporter.recordAgentLifecycle('complete', {
			agentName: 'anton-code',
			taskDescription: 'Generate tests',
			durationMs: 10000,
		});

		exporter.recordAgentLifecycle('fail', {
			agentName: 'anton-test',
			taskDescription: 'Run tests',
			error: 'Tests failed',
		});

		const spans = exporter.getSpans();
		assert.strictEqual(spans.length, 3);
		assert.strictEqual(spans[0].name, 'agent.start');
		assert.strictEqual(spans[1].name, 'agent.complete');
		assert.strictEqual(spans[2].name, 'agent.fail');
		assert.strictEqual(spans[2].status, 'ERROR');
	});

	test('recordReviewCheck creates a span', () => {
		const span = exporter.recordReviewCheck({
			checkName: 'type-safety',
			passed: true,
			details: 'All types are correct',
		});

		assert.strictEqual(span.name, 'review.check');
		assert.strictEqual(span.attributes['passed'], true);
		assert.strictEqual(span.status, 'OK');
	});

	test('all spans share the same traceId', () => {
		exporter.recordLlmCall({ model: 'sonnet', inputTokens: 0, outputTokens: 0, cachedTokens: 0, latencyMs: 0 });
		exporter.recordMcpToolCall({ server: 's', toolName: 't', latencyMs: 0 });
		exporter.recordFileChange({ path: 'f', changeType: 'create', linesChanged: 0 });

		const spans = exporter.getSpans();
		const traceIds = new Set(spans.map(s => s.traceId));
		assert.strictEqual(traceIds.size, 1);
	});

	test('importSpans converts AgentManager spans', () => {
		exporter.importSpans([{
			id: 'span-1',
			taskId: 'task-1',
			name: 'llm-sonnet',
			type: 'llm_call',
			startTime: 1000,
			endTime: 2000,
			attributes: { model: 'sonnet' },
		}]);

		const spans = exporter.getSpans();
		assert.strictEqual(spans.length, 1);
		assert.strictEqual(spans[0].name, 'llm.call');
	});
});
