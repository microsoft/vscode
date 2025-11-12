/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { GetTerminalOutputTool, type IGetTerminalOutputInputParams } from '../../browser/tools/getTerminalOutputTool.js';
import { RunInTerminalTool } from '../../browser/tools/runInTerminalTool.js';
import { IToolInvocation, type ToolProgress } from '../../../../chat/common/languageModelToolsService.js';

suite('GetTerminalOutputTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let getTerminalOutputTool: GetTerminalOutputTool;

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		getTerminalOutputTool = store.add(instantiationService.createInstance(GetTerminalOutputTool));
	});

	test('should return error message when terminal ID is invalid', async () => {
		const invocation: IToolInvocation = {
			callId: 'test-call-1',
			toolId: 'get_terminal_output',
			parameters: {
				id: 'nonexistent-terminal-id',
			} as IGetTerminalOutputInputParams,
			context: undefined,
		} as IToolInvocation;

		const mockProgress: ToolProgress = { report: () => { } };
		const result = await getTerminalOutputTool.invoke(invocation, async () => 0, mockProgress, CancellationToken.None);

		ok(result.content, 'Result should have content');
		strictEqual(result.content.length, 1, 'Result should have one content item');
		strictEqual(result.content[0].kind, 'text', 'Content should be text');
		ok((result.content[0]).value.includes('Error'), 'Error message should be present');
		ok((result.content[0]).value.includes('Invalid terminal ID'), 'Error should mention invalid terminal ID');
	});

	test('should return error message when terminal is disposed', async () => {
		// Create a mock disposed terminal
		const mockTerminal: any = {
			isDisposed: true,
			instanceId: 1,
		};

		const termId = 'disposed-terminal-test-id';

		// Manually add a background execution with disposed terminal
		(RunInTerminalTool as unknown as { _backgroundExecutions: Map<string, any> })._backgroundExecutions.set(termId, {
			instance: mockTerminal,
			getOutput: () => 'some output',
			dispose: () => { }
		});

		const invocation: IToolInvocation = {
			callId: 'test-call-2',
			toolId: 'get_terminal_output',
			parameters: {
				id: termId,
			} as IGetTerminalOutputInputParams,
			context: undefined,
		} as IToolInvocation;

		const mockProgress: ToolProgress = { report: () => { } };
		const result = await getTerminalOutputTool.invoke(invocation, async () => 0, mockProgress, CancellationToken.None);

		// Clean up
		(RunInTerminalTool as unknown as { _backgroundExecutions: Map<string, any> })._backgroundExecutions.delete(termId);

		ok(result.content, 'Result should have content');
		strictEqual(result.content.length, 1, 'Result should have one content item');
		strictEqual(result.content[0].kind, 'text', 'Content should be text');
		ok((result.content[0]).value.includes('Error'), 'Error message should be present');
		ok((result.content[0]).value.includes('Terminal has been closed'), 'Error should mention terminal is closed');
	});
});
