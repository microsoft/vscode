/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../browser/tools/languageModelToolsService.js';
import { addContributedToolSetMembers } from '../../../common/tools/languageModelToolsContribution.js';
import { IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('LanguageModelToolsContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createToolsService(): LanguageModelToolsService {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService())),
		}, store);
		return store.add(instaService.createInstance(LanguageModelToolsService));
	}

	function makeTool(toolReferenceName: string, id: string): IToolData {
		return { id, toolReferenceName, modelDescription: toolReferenceName, displayName: toolReferenceName, source: ToolDataSource.Internal };
	}

	test('adds tool set members that register after the tool set, even when none resolved initially', () => {
		const toolsService = createToolsService();
		const readToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, 'test-read', 'testRead'));
		const editToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, 'test-edit', 'testEdit'));
		store.add(toolsService.registerToolData(makeTool('rename', 'core_rename')));

		store.add(addContributedToolSetMembers(toolsService, readToolSet, ['readFile', 'problems']));
		store.add(addContributedToolSetMembers(toolsService, editToolSet, ['rename', 'createFile']));
		const membersBefore = {
			read: Array.from(readToolSet.getTools(), tool => tool.id),
			edit: Array.from(editToolSet.getTools(), tool => tool.id),
		};

		store.add(toolsService.registerToolData(makeTool('readFile', 'copilot_readFile')));
		store.add(toolsService.registerToolData(makeTool('problems', 'copilot_getErrors')));
		store.add(toolsService.registerToolData(makeTool('createFile', 'copilot_createFile')));
		toolsService.flushToolUpdates();

		assert.deepStrictEqual({
			before: membersBefore,
			after: {
				read: Array.from(readToolSet.getTools(), tool => tool.id),
				edit: Array.from(editToolSet.getTools(), tool => tool.id),
			},
		}, {
			before: { read: [], edit: ['core_rename'] },
			after: { read: ['copilot_readFile', 'copilot_getErrors'], edit: ['core_rename', 'copilot_createFile'] },
		});
	});
});
