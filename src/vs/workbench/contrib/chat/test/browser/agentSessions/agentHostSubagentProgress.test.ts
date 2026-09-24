/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostSubagentProgress } from '../../../browser/agentSessions/agentHost/agentHostSubagentProgress.js';
import { IChatProgress } from '../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('AgentHostSubagentProgress', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const toolData = { id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal };

	test('waits for actual start through preparation, launch completion and repeated updates', async () => {
		const received: IChatProgress[] = [];
		const publisher = store.add(new AgentHostSubagentProgress(parts => received.push(...parts)));
		const invocation = new ChatToolInvocation({
			invocationMessage: 'Delegating work',
			toolSpecificData: { kind: 'subagent', hasStarted: false },
		}, toolData, 'task', undefined, {});
		publisher.publish([invocation]);
		invocation.toolSpecificData = { kind: 'subagent', description: 'Prepared work' };
		await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background.' }] });
		const beforeStart = received.length;
		invocation.toolSpecificData = { kind: 'subagent', hasStarted: true, isActive: true };
		invocation.notifyToolSpecificDataChanged();
		invocation.notifyToolSpecificDataChanged();

		assert.deepStrictEqual({ beforeStart, received }, { beforeStart: 0, received: [invocation] });
	});

	test('does not publish an unstarted subagent after disposal', () => {
		const received: IChatProgress[] = [];
		const publisher = store.add(new AgentHostSubagentProgress(parts => received.push(...parts)));
		const invocation = new ChatToolInvocation({
			toolSpecificData: { kind: 'subagent', hasStarted: false },
		}, toolData, 'task', undefined, {});
		publisher.publish([invocation]);
		publisher.dispose();
		invocation.toolSpecificData = { kind: 'subagent', hasStarted: true };
		invocation.notifyToolSpecificDataChanged();

		assert.deepStrictEqual(received, []);
	});

	test('publishes a pending launch when it requires confirmation', () => {
		const received: IChatProgress[] = [];
		const publisher = store.add(new AgentHostSubagentProgress(parts => received.push(...parts)));
		const invocation = new ChatToolInvocation({
			toolSpecificData: { kind: 'subagent', hasStarted: false },
		}, toolData, 'task', undefined, {});
		publisher.publish([invocation]);
		const beforeConfirmation = received.length;
		invocation.requestConfirmation({
			confirmationMessages: { title: 'Approve work', message: 'Continue?' },
			toolSpecificData: { kind: 'subagent', hasStarted: false },
		});
		invocation.notifyToolSpecificDataChanged();

		assert.deepStrictEqual({ beforeConfirmation, received }, { beforeConfirmation: 0, received: [invocation] });
	});

	test('preserves required confirmations and legacy subagent publication', () => {
		const received: IChatProgress[] = [];
		const publisher = store.add(new AgentHostSubagentProgress(parts => received.push(...parts)));
		const confirmation = new ChatToolInvocation({
			toolSpecificData: { kind: 'subagent', hasStarted: false },
			confirmationMessages: { title: 'Approve work', message: 'Continue?' },
		}, toolData, 'confirmation', undefined, {});
		const legacy = new ChatToolInvocation({
			toolSpecificData: { kind: 'subagent' },
		}, toolData, 'legacy', undefined, {});
		publisher.publish([confirmation, legacy]);

		assert.deepStrictEqual(received, [confirmation, legacy]);
	});
});
