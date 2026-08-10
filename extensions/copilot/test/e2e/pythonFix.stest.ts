/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ssuite, stest } from '../base/stest';
import { pythonFixEvaluators } from './evaluators/pythonFix';
import { Scenario, fetchConversationScenarios } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

(function () {
	ssuite({ title: 'fix', subtitle: 'python', location: 'panel' }, (inputPath) => {

		const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-scenario-fix-python');
		const scenarios: Scenario[] = fetchConversationScenarios(scenarioFolder);

		// Dynamically create a test case per each entry in the scenarios array
		for (let i = 0; i < scenarios.length; i++) {
			const name = scenarios[i][0].name;
			const label = name.replace('case', 'Case #').replace('.conversation.json', '');

			stest({ description: label, language: 'python' },
				generateScenarioTestRunner(
					scenarios[i],
					pythonFixEvaluators[scenarios[i][0].name]
				));
		}
	});
})();
