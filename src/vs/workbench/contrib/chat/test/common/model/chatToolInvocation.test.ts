/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind, ToolDeniedReason } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IToolData, IToolResultInputOutputDetails, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('ChatToolInvocation permission provenance', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const tool: IToolData = { id: 'tool', displayName: 'Tool', modelDescription: 'Tool', source: ToolDataSource.Internal };
	const prepared = { invocationMessage: 'Run tool', confirmationMessages: { title: 'Allow tool?', message: 'Run tool?' } };

	for (const initialState of ['executing', 'streaming', 'confirmation']) {
		test(`records image generation duration after execution begins and persists it (${initialState})`, async () => {
			const clock = useFakeTimers({ toFake: ['Date'] });
			try {
				const invocation = initialState === 'streaming'
					? ChatToolInvocation.createStreaming({ toolCallId: 'image', toolId: tool.id, toolData: tool })
					: new ChatToolInvocation(initialState === 'confirmation' ? prepared : undefined, tool, 'image', undefined, {});
				if (initialState !== 'executing') {
					clock.tick(10_000);
					if (initialState === 'streaming') {
						invocation.transitionFromStreaming(undefined, {}, undefined);
					} else {
						IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
					}
				}
				clock.tick(43_500);
				await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage' } });
				clock.tick(1000);
				await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage' } });
				assert.deepStrictEqual([invocation.toolSpecificData, invocation.toJSON().toolSpecificData], [
					{ kind: 'generatedImage', durationMs: 43_500 },
					{ kind: 'generatedImage', durationMs: 43_500 },
				]);
			} finally {
				clock.restore();
			}
		});
	}

	for (const waitingFor of ['confirmation', 'authentication']) {
		test(`image duration accumulates execution across repeated ${waitingFor} waits`, async () => {
			const clock = useFakeTimers({ toFake: ['Date'] });
			try {
				const invocation = new ChatToolInvocation(undefined, tool, 'image', undefined, {});
				for (const executingDuration of [1000, 2000]) {
					clock.tick(executingDuration);
					for (let refresh = 0; refresh < 2; refresh++) {
						if (waitingFor === 'confirmation') {
							invocation.requestConfirmation(prepared);
						} else {
							invocation.setAuthenticationRequired({ id: 'server', name: 'Server', resource: 'https://example.com/mcp' });
						}
						clock.tick(10_000);
					}
					if (waitingFor === 'confirmation') {
						IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
					} else {
						invocation.setAuthenticationResolved();
					}
				}
				clock.tick(3000);
				await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage' } });

				assert.deepStrictEqual([invocation.toolSpecificData, invocation.toJSON().toolSpecificData], [
					{ kind: 'generatedImage', durationMs: 6000 },
					{ kind: 'generatedImage', durationMs: 6000 },
				]);
			} finally {
				clock.restore();
			}
		});
	}

	test('image duration remains unknown if execution never starts', async () => {
		const invocation = ChatToolInvocation.createStreaming({ toolCallId: 'image', toolId: tool.id, toolData: tool });
		await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage' } });
		assert.deepStrictEqual(invocation.toJSON().toolSpecificData, { kind: 'generatedImage' });
	});

	test('image duration excludes post-approval time', async () => {
		const clock = useFakeTimers({ toFake: ['Date'] });
		try {
			const invocation = new ChatToolInvocation({ confirmationMessages: { confirmResults: true } }, tool, 'image', undefined, {});
			clock.tick(3000);
			await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage' } });
			clock.tick(10_000);
			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
			assert.deepStrictEqual(invocation.toJSON().toolSpecificData, { kind: 'generatedImage', durationMs: 3000 });
		} finally {
			clock.restore();
		}
	});

	test('provider image duration takes precedence over the renderer clock', async () => {
		const invocation = new ChatToolInvocation(undefined, tool, 'image', undefined, {});
		await invocation.didExecuteTool({ content: [], toolSpecificData: { kind: 'generatedImage', durationMs: 43_500 } });
		assert.deepStrictEqual(invocation.toJSON().toolSpecificData, { kind: 'generatedImage', durationMs: 43_500 });
	});

	test('records when invocations appear and settle, and persists the times it knows', async () => {
		const clock = useFakeTimers({ now: 1000, toFake: ['Date'] });
		try {
			const completed = ChatToolInvocation.createStreaming({ toolCallId: 'completed', toolId: tool.id, toolData: tool });
			const denied = new ChatToolInvocation(prepared, tool, 'denied', undefined, {});
			const cancelled = new ChatToolInvocation(undefined, tool, 'cancelled', undefined, {});
			const blocked = ChatToolInvocation.createCancelled({ toolCallId: 'blocked', toolId: tool.id, toolData: tool }, {}, { type: ToolConfirmKind.Denied, source: 'hook' });
			const pending = new ChatToolInvocation(prepared, tool, 'pending', undefined, {});
			const rebuilt = new ChatToolInvocation(undefined, tool, 'rebuilt', undefined, {});
			rebuilt.forgetTiming();
			clock.tick(500);
			completed.transitionFromStreaming(undefined, {}, undefined);
			clock.tick(1500);
			await completed.didExecuteTool({ content: [] });
			IChatToolInvocation.confirmWith(denied, { type: ToolConfirmKind.Denied, source: 'user' });
			clock.tick(1000);
			cancelled.didCancelTool({ type: ToolConfirmKind.Skipped });
			rebuilt.didCancelTool({ type: ToolConfirmKind.Skipped });

			assert.deepStrictEqual([completed, denied, cancelled, blocked, pending, rebuilt].map(invocation => ({
				live: [invocation.startedAt, invocation.completedAt],
				serialized: Object.fromEntries(Object.entries(invocation.toJSON()).filter(([key]) => key === 'startedAt' || key === 'completedAt')),
			})), [
				{ live: [1000, 3000], serialized: { startedAt: 1000, completedAt: 3000 } },
				{ live: [1000, 3000], serialized: { startedAt: 1000, completedAt: 3000 } },
				{ live: [1000, 4000], serialized: { startedAt: 1000, completedAt: 4000 } },
				{ live: [1000, 1000], serialized: { startedAt: 1000, completedAt: 1000 } },
				{ live: [1000, undefined], serialized: { startedAt: 1000 } },
				{ live: [undefined, undefined], serialized: {} },
			]);
		} finally {
			clock.restore();
		}
	});

	test('preserves explicit denial sources through confirmation and serialization', async () => {
		const reasons: ToolDeniedReason[] = [
			{ type: ToolConfirmKind.Denied, source: 'user' },
			{ type: ToolConfirmKind.Skipped, source: 'user' },
			{ type: ToolConfirmKind.Denied, source: 'hook' },
			{ type: ToolConfirmKind.Skipped, source: 'riskAssessment' },
			{ type: ToolConfirmKind.Denied },
			{ type: ToolConfirmKind.Skipped },
		];
		const results = [];
		for (const reason of reasons) {
			const invocation = new ChatToolInvocation(prepared, tool, 'call', undefined, {});
			const confirmation = IChatToolInvocation.awaitConfirmation(invocation);
			IChatToolInvocation.confirmWith(invocation, reason);
			results.push([await confirmation, IChatToolInvocation.executionConfirmedOrDenied(invocation.toJSON())]);
		}
		assert.deepStrictEqual(results, reasons.map(reason => [reason, reason]));
	});

	test('automatic streaming and initially cancelled invocations preserve their source', () => {
		const results = [];
		for (const source of ['hook', 'riskAssessment', undefined] as const) {
			const reason: ToolDeniedReason = { type: ToolConfirmKind.Denied, ...(source ? { source } : {}) };
			const cancelled = ChatToolInvocation.createCancelled({ toolCallId: 'initial', toolId: tool.id, toolData: tool }, {}, reason);
			const streaming = ChatToolInvocation.createStreaming({ toolCallId: 'streaming', toolId: tool.id, toolData: tool });
			streaming.cancelFromStreaming(reason);
			results.push([
				IChatToolInvocation.executionConfirmedOrDenied(cancelled.toJSON()),
				IChatToolInvocation.executionConfirmedOrDenied(streaming.toJSON()),
			]);
		}
		assert.deepStrictEqual(results, [
			[{ type: ToolConfirmKind.Denied, source: 'hook' }, { type: ToolConfirmKind.Denied, source: 'hook' }],
			[{ type: ToolConfirmKind.Denied, source: 'riskAssessment' }, { type: ToolConfirmKind.Denied, source: 'riskAssessment' }],
			[{ type: ToolConfirmKind.Denied }, { type: ToolConfirmKind.Denied }],
		]);
	});

	test('post-execution denial preserves its explicit source', async () => {
		const reasons: ToolDeniedReason[] = [
			{ type: ToolConfirmKind.Denied, source: 'user' },
			{ type: ToolConfirmKind.Skipped, source: 'riskAssessment' },
			{ type: ToolConfirmKind.Denied },
		];
		const results: ConfirmedReason[] = [];
		for (const reason of reasons) {
			const invocation = new ChatToolInvocation({ invocationMessage: 'Run tool', confirmationMessages: { confirmResults: true } }, tool, 'post', undefined, {});
			await invocation.didExecuteTool({ content: [] });
			const confirmation = IChatToolInvocation.awaitPostConfirmation(invocation);
			IChatToolInvocation.confirmWith(invocation, reason);
			results.push(await confirmation);
		}
		assert.deepStrictEqual(results, reasons);
	});

	test('provider cancellation retains details and cannot be overwritten by a late completion', async () => {
		const invocation = new ChatToolInvocation({ invocationMessage: 'Run tool' }, tool, 'running', undefined, { prompt: 'Draw a puppy' });
		const reason = { type: ToolConfirmKind.Skipped, source: 'user' } as const;
		const details: IToolResultInputOutputDetails = {
			input: '{"prompt":"Draw a puppy"}',
			output: [{ type: 'embed', value: 'Stopped by the user', isText: true }],
			isError: true,
		};
		invocation.didCancelTool(reason, 'Stopped by the user', details);
		const cancelledState = invocation.state.get();
		await invocation.didExecuteTool({ content: [] });
		invocation.didCancelTool({ type: ToolConfirmKind.Denied });
		assert.deepStrictEqual({
			state: invocation.state.get().type,
			sameState: invocation.state.get() === cancelledState,
			confirmation: IChatToolInvocation.executionConfirmedOrDenied(invocation),
			details: IChatToolInvocation.resultDetails(invocation),
			serializedDetails: invocation.toJSON().resultDetails,
		}, {
			state: IChatToolInvocation.StateKind.Cancelled,
			sameState: true,
			confirmation: reason,
			details,
			serializedDetails: details,
		});
	});

	test('token cancellation and legacy denials remain unattributed', async () => {
		const invocation = new ChatToolInvocation(prepared, tool, 'call', undefined, {});
		const token = disposables.add(new CancellationTokenSource());
		const confirmation = IChatToolInvocation.awaitConfirmation(invocation, token.token);
		token.cancel();
		const hookDenied = ChatToolInvocation.createCancelled({ toolCallId: 'hook', toolId: tool.id, toolData: tool }, {}, { type: ToolConfirmKind.Denied });
		const streaming = ChatToolInvocation.createStreaming({ toolCallId: 'streaming', toolId: tool.id, toolData: tool });
		streaming.cancelFromStreaming({ type: ToolConfirmKind.Denied });
		assert.deepStrictEqual([
			await confirmation,
			IChatToolInvocation.executionConfirmedOrDenied(hookDenied),
			IChatToolInvocation.executionConfirmedOrDenied(streaming),
		], [
			{ type: ToolConfirmKind.Denied },
			{ type: ToolConfirmKind.Denied },
			{ type: ToolConfirmKind.Denied },
		]);
	});
});
