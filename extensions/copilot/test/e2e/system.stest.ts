/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { ssuite, stest } from '../base/stest';
import { validate } from '../base/validate';
import { fetchConversationScenarios } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

ssuite({ title: 'system', subtitle: 'identity', location: 'panel' }, (inputPath) => {

	const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-system');
	const scenarios = fetchConversationScenarios(scenarioFolder);

	for (const scenario of scenarios) {
		stest({ description: scenario[0].question, language: undefined }, generateScenarioTestRunner(
			scenario,
			async (accessor, question, answer) => {
				const expectedKeywords = scenario.find((s) => s.question === question)?.json.keywords;
				if (expectedKeywords !== undefined) {
					const err = validate(answer, expectedKeywords);
					if (err) {
						return { success: false, errorMessage: err };
					}

					return { success: true, errorMessage: answer };
				}

				return { success: true, errorMessage: 'No requirements set for test.' };
			}
		));
	}
});
