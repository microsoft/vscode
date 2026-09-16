/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { OpenAgentProjectBoardAction } from '../../electron-browser/agentSessions/agentSessionsActions.js';

suite('Project Board Editor handoff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('PB-06: sends only the board intent, without inferring a workspace or navigating a chat', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: IOpenAgentsWindowOptions[] = [];
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
			openAgentsWindow: async options => { calls.push(options ?? {}); },
		}));

		await instantiationService.invokeFunction(accessor => new OpenAgentProjectBoardAction().run(accessor));

		assert.deepStrictEqual(calls, [{ openProjectBoard: true }]);
	});

	test('PB-06: ordinary Editor command requires AI and is hidden in Agents', () => {
		const action = new OpenAgentProjectBoardAction();
		assert.strictEqual(typeof action.desc.title === 'string' ? action.desc.title : action.desc.title.value, 'Agents: Open Agents Hub');
		for (const [aiEnabled, isSessions, expected] of [
			[true, false, true],
			[false, false, false],
			[true, true, false],
			[false, true, false],
		]) {
			const context = new Context(0, null);
			context.setValue(ChatContextKeys.enabled.key, aiEnabled);
			context.setValue(IsSessionsWindowContext.key, isSessions);
			assert.strictEqual(action.desc.precondition?.evaluate(context), expected);
		}
	});
});
