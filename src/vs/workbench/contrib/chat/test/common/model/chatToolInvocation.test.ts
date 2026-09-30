/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfirmedReason, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('ChatToolInvocation permission provenance', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const tool: IToolData = { id: 'tool', displayName: 'Tool', modelDescription: 'Tool', source: ToolDataSource.Internal };
	const prepared = { invocationMessage: 'Run tool', confirmationMessages: { title: 'Allow tool?', message: 'Run tool?' } };

	test('preserves explicit human denial without attributing legacy or automatic denial', async () => {
		const reasons: ConfirmedReason[] = [
			{ type: ToolConfirmKind.Denied, isUserAction: true },
			{ type: ToolConfirmKind.Skipped, isUserAction: true },
			{ type: ToolConfirmKind.Denied },
			{ type: ToolConfirmKind.Skipped },
		];
		const results: ConfirmedReason[] = [];
		for (const reason of reasons) {
			const invocation = new ChatToolInvocation(prepared, tool, 'call', undefined, {});
			const confirmation = IChatToolInvocation.awaitConfirmation(invocation);
			IChatToolInvocation.confirmWith(invocation, reason);
			results.push(await confirmation);
		}
		assert.deepStrictEqual(results, reasons);
	});

	test('token cancellation and hook denial have no human provenance', async () => {
		const invocation = new ChatToolInvocation(prepared, tool, 'call', undefined, {});
		const token = disposables.add(new CancellationTokenSource());
		const confirmation = IChatToolInvocation.awaitConfirmation(invocation, token.token);
		token.cancel();
		const hookDenied = ChatToolInvocation.createCancelled({ toolCallId: 'hook', toolId: tool.id, toolData: tool }, {}, ToolConfirmKind.Denied);
		const streaming = ChatToolInvocation.createStreaming({ toolCallId: 'streaming', toolId: tool.id, toolData: tool });
		streaming.cancelFromStreaming(ToolConfirmKind.Denied);
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
