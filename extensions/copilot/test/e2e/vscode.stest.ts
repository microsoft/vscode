/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ssuite, stest } from '../base/stest';
import { validate } from '../base/validate';
import { discoverScenarios } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

ssuite({ title: '@vscode', location: 'panel' }, (inputPath) => {
	if (!inputPath) {
		return;
	}

	const scenarios = discoverScenarios(inputPath);

	for (const scenario of scenarios) {
		const fileName = scenario[0].name;
		const testName = inputPath ? fileName.substring(0, fileName.indexOf('.')) : scenario[0].question.replace('@vscode', '');
		stest({ description: testName }, generateScenarioTestRunner(
			scenario,
			async (accessor, question, answer, rawResponse, turn, scenarioIndex, commands) => {
				if (scenario[0].json.keywords !== undefined) {
					const err = validate(rawResponse, scenario[0].json.keywords);
					if (err) {
						return { success: false, errorMessage: err };
					}
					const showCommands = scenario[0].json.showCommand as boolean ?? true;
					if (showCommands && commands.length === 0) {
						return { success: false, errorMessage: 'Response is missing required commands.' };
					} else if (!showCommands && commands.length > 0) {
						return { success: false, errorMessage: 'Response includes commands that should not be present.' };
					}
					return { success: true, errorMessage: answer };
				}

				return { success: true, errorMessage: 'No requirements set for test.' };
			}
		));
	}
});
