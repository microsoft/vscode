/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { ToolName } from '../../src/extension/tools/common/toolNames';
import { ICodebaseToolParams } from '../../src/extension/tools/node/codebaseTool';
import { IReadFileParamsV1 } from '../../src/extension/tools/node/readFileTool';
import { deserializeWorkbenchState } from '../../src/platform/test/node/promptContextModel';
import { ssuite, stest } from '../base/stest';
import { generateToolTestRunner } from './toolSimTest';
import { shouldSkipAgentTests } from './tools.stest';


ssuite.optional(shouldSkipAgentTests, { title: 'edit', subtitle: 'toolCalling', location: 'panel' }, () => {
	const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-tools');
	const getState = () => deserializeWorkbenchState(scenarioFolder, path.join(scenarioFolder, 'chatSetup.state.json'));

	stest('does not read', generateToolTestRunner({
		question: 'This code fails because whenLanguageModelReady waits for any model, not the correct model. From doInvokeWithoutSetup, wait for the model with id IChatAgentRequest.userSelectedModelId to be registered',
		scenarioFolderPath: '',
		getState,
		tools: {
		},
	}, {
		allowParallelToolCalls: true,
		toolCallValidators: {
			[ToolName.ReadFile]: (toolCalls) => {
				assert.ok(!toolCalls.some(tc => (tc.input as IReadFileParamsV1).filePath.endsWith('chatSetup.ts')), 'Should not read_file the attached file');
			},
			[ToolName.Codebase]: (toolCalls) => {
				assert.ok(!toolCalls.some(tc => {
					const query = (tc.input as ICodebaseToolParams).query;
					return query.includes('doForwardRequestToCopilotWhenReady') || query.includes('whenLanguageModelReady');
				}), 'Should not do semantic_search for something that is in the attached file');
			}
		}
	}));
});
