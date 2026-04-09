/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { extractCodeBlocks } from '../../src/util/common/markdown';
import { ssuite, stest } from '../base/stest';
import { fetchConversationScenarios, Scenario } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';


interface IExtendedTestData {
	contentInOutput: string;
}

(function () {
	ssuite({ title: 'fix', subtitle: 'typescript', location: 'panel' }, (inputPath) => {

		const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-scenario-fix-typescript');
		const scenarios: Scenario[] = fetchConversationScenarios(scenarioFolder);

		// Dynamically create a test case per each entry in the scenarios array
		for (let i = 0; i < scenarios.length; i++) {
			const scenario = scenarios[i][0];
			stest({ description: scenario.name, language: 'typescript' },
				generateScenarioTestRunner(
					scenarios[i],
					async (accessor, question, response) => {
						const codeBlock = extractCodeBlocks(response).at(0);
						if (!codeBlock || codeBlock.language !== 'typescript') {
							return { success: false, errorMessage: 'No typescript code block found in response' };
						}
						const contentInOutput = (scenario.json as IExtendedTestData).contentInOutput;
						if (!codeBlock.code.includes(contentInOutput)) {
							return { success: false, errorMessage: `Typescript code block does not contain ${contentInOutput}` };
						}
						return { success: true };
					}
				)
			);
		}
	});
})();
