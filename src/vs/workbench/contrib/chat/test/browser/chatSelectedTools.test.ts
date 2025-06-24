/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../browser/languageModelToolsService.js';
import { IChatService } from '../../common/chatService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../common/languageModelToolsService.js';
import { MockChatService } from '../common/mockChatService.js';
import { ChatSelectedTools } from '../../browser/chatSelectedTools.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ChatMode } from '../../common/constants.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('ChatSelectedTools', () => {

	let store: DisposableStore;

	let toolsService: ILanguageModelToolsService;
	let selectedTools: ChatSelectedTools;

	setup(() => {

		store = new DisposableStore();

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService)),
		}, store);
		instaService.stub(IChatService, new MockChatService());
		instaService.stub(ILanguageModelToolsService, instaService.createInstance(LanguageModelToolsService));

		store.add(instaService);
		toolsService = instaService.get(ILanguageModelToolsService);
		selectedTools = store.add(instaService.createInstance(ChatSelectedTools, constObservable(ChatMode.Agent)));
	});

	teardown(function () {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Can\'t enable/disable MCP tools directly #18161', () => {

		return runWithFakedTimers({}, async () => {

			const toolData1: IToolData = {
				id: 'testTool1',
				modelDescription: 'Test Tool 1',
				displayName: 'Test Tool 1',
				canBeReferencedInPrompt: true,
				toolReferenceName: 't1',
				source: ToolDataSource.Internal,
			};

			const toolData2: IToolData = {
				id: 'testTool2',
				modelDescription: 'Test Tool 2',
				displayName: 'Test Tool 2',
				source: ToolDataSource.Internal,
				canBeReferencedInPrompt: true,
				toolReferenceName: 't2',
			};

			const toolData3: IToolData = {
				id: 'testTool3',
				modelDescription: 'Test Tool 3',
				displayName: 'Test Tool 3',
				source: ToolDataSource.Internal,
				canBeReferencedInPrompt: true,
				toolReferenceName: 't3',
			};

			const toolset = toolsService.createToolSet(
				ToolDataSource.Internal,
				'mcp', 'mcp'
			);

			store.add(toolsService.registerToolData(toolData1));
			store.add(toolsService.registerToolData(toolData2));
			store.add(toolsService.registerToolData(toolData3));

			store.add(toolset);
			store.add(toolset.addTool(toolData1));
			store.add(toolset.addTool(toolData2));
			store.add(toolset.addTool(toolData3));

			assert.strictEqual(Iterable.length(toolsService.getTools()), 3);

			const size = Iterable.length(toolset.getTools());
			assert.strictEqual(size, 3);

			await timeout(1000); // UGLY the tools service updates its state sync but emits the event async (750ms) delay. This affects the observable that depends on the event

			assert.strictEqual(selectedTools.entriesMap.size, 4); // 1 toolset, 3 tools

			selectedTools.disable([], [toolData2, toolData3], false);

			const map = selectedTools.asEnablementMap();
			assert.strictEqual(map.size, 3); // 3 tools

			assert.strictEqual(map.get(toolData1), true);
			assert.strictEqual(map.get(toolData2), false);
			assert.strictEqual(map.get(toolData3), false);
		});
	});
});
