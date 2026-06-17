/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as assert from 'assert';
import { CHAT_MODEL } from '../../src/platform/configuration/common/configurationService';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { ssuite, stest } from '../base/stest';
import { assertFileContent, assertNoElidedCodeComments, getWorkspaceDiagnostics } from '../simulation/outcomeValidators';
import { EditTestStrategyPanel, simulatePanelCodeMapper } from '../simulation/panelCodeMapperSimulator';
import { assertWorkspaceEdit, fromFixture } from '../simulation/stestUtil';
import { EditTestStrategy, IScenario } from '../simulation/types';

function executeEditTest(
	strategy: EditTestStrategyPanel,
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario
): Promise<void> {
	return simulatePanelCodeMapper(testingServiceCollection, scenario, strategy);
}

function forAgent(callback: (model: string | undefined) => void): void {
	callback(undefined);
	callback(CHAT_MODEL.CLAUDE_SONNET);
}

const skipAgentTests = true;

forAgent((model) => {
	const title = model ? `edit-agent-${model}` : 'edit-agent';
	ssuite.optional(() => skipAgentTests, { title, location: 'panel' }, () => {
		stest({ description: 'issue #8098: extract function to unseen file', language: 'typescript', model }, (testingServiceCollection) => {
			return executeEditTest(EditTestStrategy.Agent, testingServiceCollection, {
				files: [
					fromFixture('multiFileEdit/issue-8098/debugUtils.ts'),
					fromFixture('multiFileEdit/issue-8098/debugTelemetry.ts'),
				],
				queries: [
					{
						query: 'Extract filterExceptionsFromTelemetry to debugTelemetry.ts',
						validate: async (outcome, workspace, accessor) => {
							assertWorkspaceEdit(outcome);
							assert.ok(outcome.files.length === 2, 'Expected two files to be edited');

							const utilsTs = assertFileContent(outcome.files, 'debugUtils.ts');
							assert.ok(!utilsTs.includes('function filterExceptionsFromTelemetry'), 'Expected filterExceptionsFromTelemetry to be extracted');
							const telemetryFile = assertFileContent(outcome.files, 'debugTelemetry.ts');
							assert.ok(telemetryFile.includes('filterExceptionsFromTelemetry'), 'Expected filterExceptionsFromTelemetry to be extracted');

							assert.strictEqual((await getWorkspaceDiagnostics(accessor, workspace, 'tsc')).filter(d => d.kind === 'syntactic').length, 0);
							assertNoElidedCodeComments(outcome);
						}
					}
				]
			});
		});
	});
});
