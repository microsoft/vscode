/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ssuite, stest } from '../base/stest';
import { discoverScenarios } from './scenarioLoader';
import { generateScenarioTestRunner, shouldSkip } from './scenarioTest';

function getFiles(answer: string): string[] {
	const regex = /\#\#\s+(.*)\n/g;
	let match;
	const titles = [];
	while ((match = regex.exec(answer)) !== null) {
		titles.push(match[1].trim());
	}
	return [...new Set(titles)];
}

function expectedFileDoesMatch(files: string[], target: string): boolean {
	return files.some(e => {
		return e.trim().endsWith(target);
	});
}
function assertFilesMatch(expected: string[], actual: string[]) {
	expected.forEach(e => {
		if (!expectedFileDoesMatch(actual, e)) {
			throw Error(`Cannot find match for expected file: ${e}. Instead got the following: \n-${actual.join('\n')}`);
		}
	});
}


ssuite({ title: 'semanticSearch', location: 'panel' }, (inputPath) => {

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
					if (scenario[0].json.expectedRetrieval !== undefined) {
						const expected: string[] = scenario[0].json.expectedRetrieval;
						const actual = getFiles(answer);

						try {
							assertFilesMatch(expected, actual);
							return { success: true, errorMessage: answer };
						} catch (e) {
							return { success: false, errorMessage: e.message };
						}
						// TODO: incorporate `keywords` into the test.
						// They should already be on the tests, but to test solely file retrieval first, we can ignore them for now.
					}
					return { success: false, errorMessage: 'expectedRetrieval not defined' };
				}));
	}
});
