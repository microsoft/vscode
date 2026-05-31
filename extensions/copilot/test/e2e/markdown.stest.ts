/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { extractCodeBlocks } from '../../src/util/common/markdown';
import { ssuite, stest } from '../base/stest';
import { fetchConversationScenarios, Scenario } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';



(function () {
	ssuite({ title: 'generate', subtitle: 'markdown', location: 'panel' }, (inputPath) => {

		const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-generate-markdown');
		const scenarios: Scenario[] = fetchConversationScenarios(scenarioFolder);

		// Dynamically create a test case per each entry in the scenarios array
		for (let i = 0; i < scenarios.length; i++) {
			const scenario = scenarios[i][0];
			stest({ description: scenario.name, language: 'markdown' },
				generateScenarioTestRunner(
					scenarios[i],
					async (accessor, question, response) => {
						const codeBlock = extractCodeBlocks(response).at(0);
						if (!codeBlock || codeBlock.language !== 'markdown') {
							return { success: false, errorMessage: 'No markdown code block found in response' };
						}
						if (codeBlock.startMarkup !== '````') {
							return { success: false, errorMessage: 'Did not use 4 backticks' };
						}
						return { success: true };
					}
				)
			);
		}
	});
})();
