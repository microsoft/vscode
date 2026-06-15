/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { isMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TaskCompleteTool } from '../../../../common/tools/builtinTools/taskCompleteTool.js';
import { ToolInvocationPresentation } from '../../../../common/tools/languageModelToolsService.js';

suite('TaskCompleteTool', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getMessageText(value: string | { value: string } | undefined): string | undefined {
		if (value === undefined) {
			return undefined;
		}
		return typeof value === 'string' ? value : value.value;
	}

	test('prepareToolInvocation hides the invocation when no summary is provided', async () => {
		const tool = new TaskCompleteTool();
		const result = await tool.prepareToolInvocation({
			parameters: {},
			toolCallId: 'call-1',
			chatSessionResource: undefined,
		}, CancellationToken.None);
		assert.strictEqual(result?.presentation, ToolInvocationPresentation.Hidden);
	});

	test('prepareToolInvocation hides the invocation when summary is an empty string', async () => {
		const tool = new TaskCompleteTool();
		const result = await tool.prepareToolInvocation({
			parameters: { summary: '   ' },
			toolCallId: 'call-1',
			chatSessionResource: undefined,
		}, CancellationToken.None);
		assert.strictEqual(result?.presentation, ToolInvocationPresentation.Hidden);
	});

	test('prepareToolInvocation surfaces the summary so the user sees what was done', async () => {
		const tool = new TaskCompleteTool();
		const summary = 'Refactored the auth flow and added regression tests.';
		const result = await tool.prepareToolInvocation({
			parameters: { summary },
			toolCallId: 'call-1',
			chatSessionResource: undefined,
		}, CancellationToken.None);

		assert.deepStrictEqual({
			presentation: result?.presentation,
			invocation: getMessageText(result?.invocationMessage as string | { value: string } | undefined),
			pastTense: getMessageText(result?.pastTenseMessage as string | { value: string } | undefined),
			invocationIsMarkdown: isMarkdownString(result?.invocationMessage),
			pastTenseIsMarkdown: isMarkdownString(result?.pastTenseMessage),
		}, {
			presentation: undefined,
			invocation: summary,
			pastTense: summary,
			invocationIsMarkdown: true,
			pastTenseIsMarkdown: true,
		});
	});

	test('invoke returns the provided summary as the tool result', async () => {
		const tool = new TaskCompleteTool();
		const result = await tool.invoke({
			callId: 'call-1',
			toolId: 'task_complete',
			parameters: { summary: 'All tests pass.' },
			context: undefined,
		}, async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual(result.content, [{ kind: 'text', value: 'All tests pass.' }]);
	});

	test('invoke falls back to "All done!" when no summary is provided', async () => {
		const tool = new TaskCompleteTool();
		const result = await tool.invoke({
			callId: 'call-1',
			toolId: 'task_complete',
			parameters: {},
			context: undefined,
		}, async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual(result.content, [{ kind: 'text', value: 'All done!' }]);
	});
});
