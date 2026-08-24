/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ssuite, stest } from '../base/stest';
import { validate } from '../base/validate';
import { discoverScenarios } from './scenarioLoader';
import { generateScenarioTestRunner, shouldSkip } from './scenarioTest';

ssuite({ title: 'workspace', subtitle: 'e2e', location: 'panel' }, (inputPath) => {
	// No default cases checked in at the moment
	if (!inputPath) {
		return;
	}

	const scenariosFolder = inputPath;
	const scenarios = discoverScenarios(scenariosFolder);
	for (const scenario of scenarios) {
		const fileName = scenario[0].name;
		const testName = fileName.substring(0, fileName.indexOf('.'));
		stest.optional(shouldSkip.bind(undefined, scenario), { description: testName },
			generateScenarioTestRunner(
				scenario,
				async (accessor, question, answer) => {
					if (scenario[0].json.keywords !== undefined) {
						const err = validate(answer, scenario[0].json.keywords);
						if (err) {
							return { success: false, errorMessage: err };
						}

						return { success: true, errorMessage: answer };
					}

					return { success: true, errorMessage: 'No requirements set for test.' };
				}));
	}
});
