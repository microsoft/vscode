/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import path from 'path';
import { ssuite, stest } from '../base/stest';
import { fetchToolScenarios, generateToolTestRunner } from './toolSimTest';

export function shouldSkipAgentTests(): boolean {
	return process.env.AGENT_TESTS !== '1';
}

ssuite.optional(shouldSkipAgentTests, { title: 'toolCalling', location: 'panel' }, (inputPath) => {
	const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-tools');
	const scenarios = fetchToolScenarios(scenarioFolder);

	for (const scenario of scenarios) {
		stest(scenario[0].question,
			generateToolTestRunner(scenario));
	}
});
