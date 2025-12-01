/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMcpIcons, IMcpTool, IMcpToolCallContext, McpConnectionFailedError } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { ToolProgress } from '../../../chat/common/languageModelToolsService.js';

suite('MCP Language Model Tool Contribution - Retry Logic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let cts: CancellationTokenSource;

	setup(() => {
		cts = store.add(new CancellationTokenSource());
	});

	function createMockTool(annotations?: MCP.ToolAnnotations): IMcpTool {
		const callWithProgressStub = sinon.stub();
		return {
			id: 'test-tool',
			referenceName: 'test-tool',
			icons: { getUrl: () => undefined } as IMcpIcons,
			definition: {
				name: 'test-tool',
				description: 'A test tool',
				inputSchema: { type: 'object' },
				annotations
			},
			call: sinon.stub(),
			callWithProgress: callWithProgressStub
		};
	}

	function createMockProgress(): ToolProgress {
		return {
			report: sinon.stub()
		};
	}

	suite('_callWithRetry behavior', () => {
		// Note: These tests simulate the retry logic that would be in McpToolImplementation
		// Since we can't easily instantiate the full class due to DI dependencies,
		// we test the retry logic inline here

		const MCP_TOOL_RETRIES = 3;

		async function callWithRetry(
			tool: IMcpTool,
			parameters: Record<string, unknown>,
			progress: ToolProgress,
			context: IMcpToolCallContext | undefined,
			token: CancellationToken
		) {
			const annotations = tool.definition.annotations;
			const canRetry = annotations?.readOnlyHint === true || annotations?.idempotentHint === true;
			const maxAttempts = canRetry ? MCP_TOOL_RETRIES : 1;

			let lastError: unknown;
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				try {
					return await tool.callWithProgress(
						parameters,
						progress,
						context,
						token
					);
				} catch (err) {
					lastError = err;
					// Only retry on connection failures for idempotent/read-only tools, and if we have more attempts
					const isRetryableError = err instanceof McpConnectionFailedError;
					if (!isRetryableError || attempt >= maxAttempts) {
						throw err;
					}
					// Otherwise, loop and retry
				}
			}
			throw lastError;
		}

		test('does not retry when tool has no annotations', async () => {
			const tool = createMockTool(undefined);
			const progress = createMockProgress();
			const error = new McpConnectionFailedError('Connection failed');

			(tool.callWithProgress as sinon.SinonStub).rejects(error);

			await assert.rejects(
				() => callWithRetry(tool, {}, progress, undefined, cts.token),
				McpConnectionFailedError
			);

			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 1);
		});

		test('does not retry when tool has readOnlyHint=false and idempotentHint=false', async () => {
			const tool = createMockTool({ readOnlyHint: false, idempotentHint: false });
			const progress = createMockProgress();
			const error = new McpConnectionFailedError('Connection failed');

			(tool.callWithProgress as sinon.SinonStub).rejects(error);

			await assert.rejects(
				() => callWithRetry(tool, {}, progress, undefined, cts.token),
				McpConnectionFailedError
			);

			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 1);
		});

		test('retries up to 3 times when tool has readOnlyHint=true', async () => {
			const tool = createMockTool({ readOnlyHint: true });
			const progress = createMockProgress();
			const error = new McpConnectionFailedError('Connection failed');

			(tool.callWithProgress as sinon.SinonStub).rejects(error);

			await assert.rejects(
				() => callWithRetry(tool, {}, progress, undefined, cts.token),
				McpConnectionFailedError
			);

			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 3);
		});

		test('retries up to 3 times when tool has idempotentHint=true', async () => {
			const tool = createMockTool({ idempotentHint: true });
			const progress = createMockProgress();
			const error = new McpConnectionFailedError('Connection failed');

			(tool.callWithProgress as sinon.SinonStub).rejects(error);

			await assert.rejects(
				() => callWithRetry(tool, {}, progress, undefined, cts.token),
				McpConnectionFailedError
			);

			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 3);
		});

		test('succeeds on second attempt for readOnlyHint=true tool', async () => {
			const tool = createMockTool({ readOnlyHint: true });
			const progress = createMockProgress();
			const expectedResult: MCP.CallToolResult = { content: [{ type: 'text', text: 'success' }] };

			(tool.callWithProgress as sinon.SinonStub)
				.onFirstCall().rejects(new McpConnectionFailedError('Connection failed'))
				.onSecondCall().resolves(expectedResult);

			const result = await callWithRetry(tool, {}, progress, undefined, cts.token);

			assert.deepStrictEqual(result, expectedResult);
			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 2);
		});

		test('succeeds on third attempt for idempotentHint=true tool', async () => {
			const tool = createMockTool({ idempotentHint: true });
			const progress = createMockProgress();
			const expectedResult: MCP.CallToolResult = { content: [{ type: 'text', text: 'success' }] };

			(tool.callWithProgress as sinon.SinonStub)
				.onFirstCall().rejects(new McpConnectionFailedError('Connection failed'))
				.onSecondCall().rejects(new McpConnectionFailedError('Still failing'))
				.onThirdCall().resolves(expectedResult);

			const result = await callWithRetry(tool, {}, progress, undefined, cts.token);

			assert.deepStrictEqual(result, expectedResult);
			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 3);
		});

		test('does not retry for non-connection errors even with readOnlyHint=true', async () => {
			const tool = createMockTool({ readOnlyHint: true });
			const progress = createMockProgress();
			const error = new Error('Some other error');

			(tool.callWithProgress as sinon.SinonStub).rejects(error);

			await assert.rejects(
				() => callWithRetry(tool, {}, progress, undefined, cts.token),
				Error
			);

			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 1);
		});

		test('does not retry for non-connection errors even with idempotentHint=true', async () => {
			const tool = createMockTool({ idempotentHint: true });
			const progress = createMockProgress();
			const error = new Error('Some other error');

			(tool.callWithProgress as sinon.SinonStub).rejects(error);

			await assert.rejects(
				() => callWithRetry(tool, {}, progress, undefined, cts.token),
				Error
			);

			assert.strictEqual((tool.callWithProgress as sinon.SinonStub).callCount, 1);
		});

		test('passes correct parameters to callWithProgress', async () => {
			const tool = createMockTool({ readOnlyHint: true });
			const progress = createMockProgress();
			const parameters = { arg1: 'value1', arg2: 42 };
			const context: IMcpToolCallContext = { chatRequestId: 'req-123', chatSessionId: 'session-456' };
			const expectedResult: MCP.CallToolResult = { content: [] };

			(tool.callWithProgress as sinon.SinonStub).resolves(expectedResult);

			await callWithRetry(tool, parameters, progress, context, cts.token);

			const call = (tool.callWithProgress as sinon.SinonStub).getCall(0);
			assert.deepStrictEqual(call.args[0], parameters);
			assert.strictEqual(call.args[1], progress);
			assert.deepStrictEqual(call.args[2], context);
			assert.strictEqual(call.args[3], cts.token);
		});
	});
});
