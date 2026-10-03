/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind, ToolDeniedReason } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('ChatToolInvocation permission provenance', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const tool: IToolData = { id: 'tool', displayName: 'Tool', modelDescription: 'Tool', source: ToolDataSource.Internal };
	const prepared = { invocationMessage: 'Run tool', confirmationMessages: { title: 'Allow tool?', message: 'Run tool?' } };

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
