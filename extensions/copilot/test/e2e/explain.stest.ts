/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { getLanguage } from '../../src/util/common/languages';
import { ssuite, stest } from '../base/stest';
import { validate } from '../base/validate';
import { fetchConversationScenarios } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

ssuite({ title: 'explain', subtitle: 'expanded context', location: 'panel' }, (inputPath) => {

	const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-explain');
	const scenarios = fetchConversationScenarios(scenarioFolder);

	for (const scenario of scenarios) {
		const language = scenario[0].getState?.().activeTextEditor?.document.languageId;
		stest({ description: scenario[0].json.description ?? scenario[0].question.replace('/explain', ''), language: language ? getLanguage(language).languageId : undefined }, generateScenarioTestRunner(
			scenario,
			async (accessor, question, answer) => {
				// Answers should not contain speculation
				const containsSpeculation = validate(answer, [{ not: [{ anyOf: ['presumably', 'unclear'] }] }]);
				if (containsSpeculation) {
					return { success: false, errorMessage: 'Answer contained speculation about current selection' };
				}

				if (scenario[0].json.keywords !== undefined) {
					const err = validate(answer, scenario[0].json.keywords);
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
