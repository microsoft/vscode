/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile } from 'node:fs/promises';

import { evaluateDeferredUpdateRecovery, evaluateDeniedMetadataRecovery, evaluateUpdateScenario } from './resolve-by-updating-vscode.evaluator.mjs';

/** Reads one deterministic transcript fixture relative to this demo runner. */
async function readScenario(fileName) {
	return JSON.parse(await readFile(new URL(fileName, import.meta.url), 'utf8'));
}

const evaluations = [
	['approved update', await readScenario('./resolve-by-updating-vscode.scenario.json'), evaluateUpdateScenario],
	['metadata denied', await readScenario('./resolve-by-updating-vscode-metadata-denied.scenario.json'), evaluateDeniedMetadataRecovery],
	['install deferred', await readScenario('./resolve-by-updating-vscode-install-deferred.scenario.json'), evaluateDeferredUpdateRecovery]
].map(([name, scenario, evaluate]) => ({ name, ...evaluate(scenario) }));

console.log(JSON.stringify(evaluations, undefined, 2));
if (evaluations.some(evaluation => !evaluation.passed)) {
	process.exitCode = 1;
}
