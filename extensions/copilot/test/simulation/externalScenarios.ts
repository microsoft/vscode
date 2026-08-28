/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Intent } from '../../src/extension/common/constants';
import { ILanguageFeaturesService } from '../../src/platform/languages/common/languageFeaturesService';
import { IDeserializedWorkspaceState } from '../../src/platform/test/node/promptContextModel';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { ITestProvider } from '../../src/platform/testing/common/testProvider';
import { assertType } from '../../src/util/vs/base/common/types';
import { URI } from '../../src/util/vs/base/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { Range } from '../../src/vscodeTypes';
import { ISimulationTestRuntime, SimulationSuite, SimulationTest, SimulationTestFunction, SimulationTestRuntime } from '../base/stest';
import { fetchConversationScenarios, IConversationTestCase, Scenario } from '../e2e/scenarioLoader';
import { generateScenarioTestRunner } from '../e2e/scenarioTest';
import { simulateInlineChat } from './inlineChatSimulator';
import { LSIFLanguageFeaturesService } from './language/lsifLanguageFeatureService';
import { simulatePanelCodeMapper } from './panelCodeMapperSimulator';
import { INLINE_CHANGED_DOC_TAG, SIDEBAR_RAW_RESPONSE_TAG } from './shared/sharedTypes';
import { SimulationTestProvider } from './simulationTestProvider';
import { EditTestStrategy, IDeserializedWorkspaceStateBasedScenario } from './types';

export interface ITestDiscoveryOptions {
	chatKind: 'inline' | 'panel';
	applyChatCodeBlocks?: boolean;
}

/**
 * Discovers test scenarios in a given root folder.
 *
 * This function recursively searches through the root folder and its subfolders to find any '.conversation.json' files.
 * If a '.conversation.json' file is found in a folder, a simulation suite is created for that folder.
 * If no '.conversation.json' file is found, the function will recursively search through the subfolders.
 *
 * @param rootFolder - The root folder to start the search from.
 * @param chatKind - The type of chat to be simulated, either 'inline' or 'panel'.
 *
 * @returns A promise that resolves to an array of SimulationSuite objects, each representing a test scenario.
 */
export async function discoverTests(rootFolder: string, options: ITestDiscoveryOptions): Promise<SimulationSuite[]> {

	const rootFolderContents = await fs.promises.readdir(rootFolder, { withFileTypes: true });

	const containsConversationFile = rootFolderContents.some(f => f.isFile() && f.name.endsWith('.conversation.json'));

	if (containsConversationFile) {
		return [createSimulationSuite(rootFolder, options)];
	} else {
		const foldersWithScenarios = rootFolderContents.filter(f => f.isDirectory()).map(f => path.join(rootFolder, f.name));
		if (foldersWithScenarios.length === 0) {
			return [];
		}
		const scenarios = await Promise.all(foldersWithScenarios.map(f => discoverTests(f, options)));
		return scenarios.flat();
	}
}

function createSimulationSuite(folderWithScenarios: string, options: ITestDiscoveryOptions): SimulationSuite {
	const suiteName = path.basename(folderWithScenarios);
	const chatKind = options.chatKind ?? 'panel';
	const suite = new SimulationSuite({ title: suiteName, location: chatKind });
	const scenarios = fetchConversationScenarios(folderWithScenarios);

	for (const scenario of scenarios) {
		if (chatKind === 'inline') {
			for (const conversation of scenario) {
				const runner = generateInlineScenarioTestRunner(conversation);
				const testName = conversation.name.replace(/.conversation\.json$/, '');
				const conversationPath = path.join(conversation.scenarioFolderPath, conversation.name);
				suite.tests.push(new SimulationTest({ description: testName }, { conversationPath, scenarioFolderPath: conversation.scenarioFolderPath, stateFile: conversation.stateFile }, suite, runner));
			}
		} else {
			const isSlashEdit = scenario[0].question.startsWith(`/${Intent.Edit}`) || scenario[0].question.startsWith(`/${Intent.Agent}`);
			const testName = scenario[0].name.replace(/.conversation\.json$/, '');
			const conversationPath = path.join(scenario[0].scenarioFolderPath, scenario[0].name);
			let runner: SimulationTestFunction;

			for (const conversation of scenario) {
				if (options.applyChatCodeBlocks) {
					conversation.applyChatCodeBlocks = true;
				}
			}

			if (isSlashEdit) {
				// /edit in the sidebar needs more special handling
				runner = generateSlashEditScenarioTestRunner(scenario);
			} else {
				runner = generateScenarioTestRunner(scenario, async (accessor, question, userVisibleAnswer, rawResponse) => {
					accessor.get(ISimulationTestRuntime).writeFile(`${testName}.md`, rawResponse, SIDEBAR_RAW_RESPONSE_TAG);
					return { success: true };
				});
			}

			suite.tests.push(new SimulationTest({ description: testName }, { conversationPath, scenarioFolderPath: scenario[0].scenarioFolderPath, stateFile: scenario[0].stateFile, }, suite, runner));
		}
	}

	return suite;
}

function generateSlashEditScenarioTestRunner(scenario: Scenario): SimulationTestFunction {
	return async (testingServiceCollection) => {

		assert(scenario.length > 0, 'Expected at least 1 conversation in the scenario');
		assertType(scenario[0].getState !== undefined, 'Expected state to be defined in the first conversation test case');
		for (let i = 1; i < scenario.length; i++) {
			assertType(scenario[i].getState === undefined, 'Expected state to be undefined in subsequent conversations');
		}

		const state = scenario[0].getState();

		const scenario2: IDeserializedWorkspaceStateBasedScenario = {
			workspaceState: state,
			scenarioFolderPath: scenario[0].scenarioFolderPath,
			queries: scenario.map((conversation, index) => {
				return {
					query: conversation.question,
					expectedIntent: undefined,
					validate: async (outcome, workspace, accessor) => assert.ok(true),
				};
			}),
			extraWorkspaceSetup: (workspace) => extraWorkspaceSetup(testingServiceCollection, state, workspace),
		};

		await simulatePanelCodeMapper(testingServiceCollection, scenario2, EditTestStrategy.Edits);
	};
}

function generateInlineScenarioTestRunner(conversation: IConversationTestCase): (testingServiceCollection: TestingServiceCollection) => Promise<void> {
	return async (testingServiceCollection) => {

		assertType(conversation.getState !== undefined, 'Expected state to be defined in conversation test case');

		const state = conversation.getState();

		const scenario: IDeserializedWorkspaceStateBasedScenario = {
			workspaceState: state,
			scenarioFolderPath: conversation.scenarioFolderPath,
			queries: [{
				query: conversation.question,
				expectedIntent: undefined,
				validate: async (outcome, workspace, accessor) => assert.ok(true),
			}],
			extraWorkspaceSetup: (workspace) => extraWorkspaceSetup(testingServiceCollection, state, workspace),
			onBeforeStart: async (accessor) => {
				const testContext = accessor.get(ISimulationTestRuntime);
				const dataToLog = [
					`The conversation input contained the following data.`,
					`Name: ${conversation.name}`,
					`Query: ${conversation.question}`,
					`State: \n${JSON.stringify(state)}`
				].join('\n');
				testContext.log(dataToLog);
			}
		};

		await simulateInlineChat(testingServiceCollection, scenario);
	};
}

function extraWorkspaceSetup(testingServiceCollection: TestingServiceCollection, state: IDeserializedWorkspaceState, workspace: SimulationWorkspace): void {
	if (state.lsifIndex) {
		testingServiceCollection.define(ILanguageFeaturesService, new SyncDescriptor(
			LSIFLanguageFeaturesService,
			[
				workspace,
				path.join(state.workspaceFolders![0].fsPath, state.lsifIndex),
			]
		));
	}
	if (state.testFailures && state.workspaceFolders) {
		testingServiceCollection.define(ITestProvider, new SimulationTestProvider(state.testFailures.map(f => ({
			message: f.message,
			testRange: new Range(f.line, f.column, f.line, f.column),
			uri: URI.file(path.join(state.workspaceFolders![0].fsPath, f.file_path))
		}))));
	}
}

export class ExternalSimulationTestRuntime extends SimulationTestRuntime {

	constructor(
		baseDir: string,
		testOutcomeDir: string,
		runNumber: number
	) {
		super(baseDir, testOutcomeDir, runNumber);
	}

	override async writeFile(filename: string, contents: Uint8Array | string, tag: string): Promise<string> {
		if (tag === INLINE_CHANGED_DOC_TAG) {
			// This is a write file for a workspace file, we'll rename it to <basename>.post.<ext>
			const ext = path.extname(filename);
			const basename = path.basename(filename, ext);
			filename = `${basename}.post${ext}`;
		}
		return super.writeFile(filename, contents, tag);
	}

	protected override massageFilename(filename: string): string {
		const ext = path.extname(filename);
		const basename = path.basename(filename, ext);
		return `${basename}-${this.runNumber}${ext}`;
	}
}
