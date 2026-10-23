/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { ToolName } from '../../src/extension/tools/common/toolNames';
import { IFindFilesToolParams } from '../../src/extension/tools/node/findFilesTool';
import { deserializeWorkbenchState } from '../../src/platform/test/node/promptContextModel';
import { ssuite, stest } from '../base/stest';
import { generateToolTestRunner } from './toolSimTest';
import { shouldSkipAgentTests } from './tools.stest';

ssuite.optional(shouldSkipAgentTests, { title: 'findFilesTool', subtitle: 'toolCalling', location: 'panel' }, () => {
	const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-tools');
	const getState = () => deserializeWorkbenchState(scenarioFolder, path.join(scenarioFolder, 'tools.state.json'));

	stest('proper glob patterns', generateToolTestRunner({
		question: 'which folder are my tsx and jsx files in?',
		scenarioFolderPath: '',
		getState,
		expectedToolCalls: ToolName.FindFiles,
		tools: {
			[ToolName.FindFiles]: true,
			[ToolName.FindTextInFiles]: true,
			[ToolName.ReadFile]: true,
			[ToolName.EditFile]: true,
			[ToolName.Codebase]: true,
			[ToolName.ListDirectory]: true,
			[ToolName.SearchWorkspaceSymbols]: true,
		},
	}, {
		allowParallelToolCalls: true,
		toolCallValidators: {
			[ToolName.FindFiles]: async (toolCalls) => {
				if (toolCalls.length === 1) {
					const input = toolCalls[0].input as IFindFilesToolParams;
					assert.ok(input.query.includes('**/'), 'should match **/');
					assert.ok(input.query.includes('tsx') && input.query.includes('jsx'), 'should match *.tsx and *.jsx');
				} else if (toolCalls.length === 2) {
					const input1 = toolCalls[0].input as IFindFilesToolParams;
					const input2 = toolCalls[1].input as IFindFilesToolParams;
					const queries = `${input1.query}, ${input2.query}`;
					assert.ok(queries.includes('**/'), 'should match **/');
					assert.ok(queries.includes('.tsx') && queries.includes('.jsx'), 'should match *.tsx and *.jsx');
				} else {
					throw new Error('Too many tool calls');
				}
			}
		}
	}));
});
