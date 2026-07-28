/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ssuite, stest } from '../base/stest';
import { fetchConversationScenarios, Scenario } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

(function () {
	ssuite.skip({ title: 'newNotebook', subtitle: 'e2e', location: 'panel' }, (inputPath) => { //@Yoyokrazy, refactor for tool - debt

		const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-new-notebooks');
		const scenarios: Scenario[] = fetchConversationScenarios(scenarioFolder);

		for (const scenario of scenarios) {
			stest({ description: scenario[0].question.replace('/newNotebook ', ''), language: 'python' },
				generateScenarioTestRunner(
					scenario,
					(accessor, question, userVisibleAnswer, rawResponse, index, turn, commands) => {
						// TODO@rebornix: test if response contains the outline for notebook in a code block
						for (const command of commands) {
							if (command.command === 'github.copilot.newNotebook') {
								return Promise.resolve({ success: true, errorMessage: '' });
							}
						}
						return Promise.resolve({ success: false, errorMessage: 'Fail to parse newNotebook response' });
					}
				));
		}
	});
})();
