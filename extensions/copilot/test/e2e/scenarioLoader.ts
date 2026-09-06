/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as jsoncParser from 'jsonc-parser';
import * as path from 'path';
import type { ChatResponseFileTreePart, Command } from 'vscode';
import { Turn } from '../../src/extension/prompt/common/conversation';
import { deserializeWorkbenchState, IDeserializedWorkspaceState } from '../../src/platform/test/node/promptContextModel';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';

export interface IConversationTestCase {
	name: string;
	question: string;
	scenarioFolderPath: string;
	stateFile?: string;
	setupCase?: (accessor: ITestingServicesAccessor, workspace: SimulationWorkspace) => void | Promise<void>;
	getState?: () => IDeserializedWorkspaceState;
	answer?: string;
	applyChatCodeBlocks?: boolean;
	json?: any;
	/**
	 * A map of all tools that should (`true`) and should not (`false`) be used in this request.
	 * For agent mode, these selections are layered on top of the default agent tools.
	 */
	tools?: Record<string, boolean>;
}



export type ScenarioEvaluator = (
	accessor: ITestingServicesAccessor,
	question: string,
	userVisibleAnswer: string,
	rawResponse: string,
	turn: Turn | undefined,
	scenarioIndex: number,
	commands: Command[],
	confirmations: { title: string; buttons?: string[] }[],
	fileTrees: ChatResponseFileTreePart[]
) => Promise<{ success: boolean; errorMessage?: string }>;

export type Scenario = IConversationTestCase[];

function createTestNameFromPath(folderName: string, fileName: string): string {
	// Test file is <number>.conversation.json
	if (/^\d+\.conversation\.json$/.test(fileName)) {
		return `${folderName}.${fileName}`;
	}
	// Test file contains scenario information
	return fileName;
}

export function fetchConversationScenarios(scenarioFolderPath: string): Scenario[] {
	// Test files are only in the root so don't have to worry about nested folders
	const testFiles = fs.readdirSync(scenarioFolderPath).filter(f => f.endsWith('.conversation.json'));

	const scenarios: Scenario[] = [];

	for (const testFile of testFiles) {

		const fileContents = fs.readFileSync(path.join(scenarioFolderPath, testFile), 'utf8');
		const parsedFile = jsoncParser.parse(fileContents) as unknown;

		assert(parsedFile instanceof Array, 'Expected an array of test cases');
		assert(parsedFile.every((testCase: any) => typeof testCase === 'object' && typeof testCase.question === 'string'), 'Expected an array of objects with a question property');
		assert(parsedFile.every((testCase: any) => !testCase.stateFile || typeof testCase.stateFile === 'string'), 'Expected an array of objects with a stateFile property of type string');
		assert(parsedFile.every((testCase: any) => !testCase.applyChatCodeBlocks || typeof testCase.applyChatCodeBlocks === 'boolean'), 'Expected an array of objects with a applyChatCodeBlocks property of type boolean');
		const scenario: Scenario = [];
		for (const testCase of parsedFile) {
			scenario.push({
				question: testCase.question,
				name: createTestNameFromPath(path.basename(scenarioFolderPath), testFile),
				json: testCase,
				scenarioFolderPath,
				stateFile: testCase.stateFile,
				applyChatCodeBlocks: testCase.applyChatCodeBlocks,
				getState: testCase.stateFile
					? () => deserializeWorkbenchState(scenarioFolderPath, path.join(scenarioFolderPath, testCase.stateFile))
					: undefined,
			});
		}
		scenarios.push(scenario);
	}
	return scenarios;
}

export function discoverScenarios(rootFolder: string): Scenario[] {
	const rootFolderContents = fs.readdirSync(rootFolder, { withFileTypes: true });
	const containsConversationFile = rootFolderContents.some(f => f.isFile() && f.name.endsWith('.conversation.json'));

	if (containsConversationFile) {
		return fetchConversationScenarios(rootFolder);
	} else {
		const foldersWithScenarios = rootFolderContents.filter(f => f.isDirectory()).map(f => path.join(rootFolder, f.name));
		if (foldersWithScenarios.length === 0) {
			return [];
		}
		const scenarios = foldersWithScenarios.map(f => discoverScenarios(f));
		return scenarios.flat();
	}
}


export interface IToolArgsTestCaseInput {
	tool: string;
	args?: any;
}

export interface IToolCallScenarioJson {
	toolArgs: IToolArgsTestCaseInput;
	name: string;
	stateFile?: string;
	outputPath?: string;
}
export interface IToolCallScenarioTestCase {
	name: string;
	scenarioFolderPath: string;
	getState?: () => IDeserializedWorkspaceState;
	json: IToolCallScenarioJson;
	stateFilePath?: string;
}


function fetchToolCallScenarios(scenarioFolderPath: string): IToolCallScenarioTestCase[] {
	const testFiles = fs.readdirSync(scenarioFolderPath).filter(f => f.endsWith('.toolcall.json'));

	const scenarios: IToolCallScenarioTestCase[] = [];

	for (const testFile of testFiles) {
		const fileContents = fs.readFileSync(path.join(scenarioFolderPath, testFile), 'utf8');
		const testCase: IToolCallScenarioJson = jsoncParser.parse(fileContents) as IToolCallScenarioJson;
		assert(testCase instanceof Object, 'Expected an object with toolArgs property');
		assert(typeof testCase.toolArgs === 'object', 'Expected toolArgs to be an object');
		assert(typeof testCase.name === 'string', 'Expected name to be a string');
		assert(testCase.toolArgs.tool, 'Expected toolArgs to have a tool property');
		assert(typeof testCase.toolArgs.tool === 'string', 'Expected toolArgs.tool to be a string');
		let stateFile = testCase.stateFile;
		if (testCase.stateFile) {
			assert(typeof testCase.stateFile === 'string', 'Expected stateFile to be a string');
			stateFile = path.join(scenarioFolderPath, testCase.stateFile);
		}
		scenarios.push({
			name: createTestNameFromPath(path.basename(scenarioFolderPath), testFile),
			json: testCase,
			scenarioFolderPath,
			getState: stateFile
				? () => deserializeWorkbenchState(scenarioFolderPath, stateFile)
				: undefined,
			stateFilePath: stateFile,
		});
	}
	return scenarios;
}

export function discoverToolsCalls(rootFolder: string): IToolCallScenarioTestCase[] {
	const rootFolderContents = fs.readdirSync(rootFolder, { withFileTypes: true });
	const containsToolArgsFile = rootFolderContents.some(f => f.isFile() && f.name.endsWith('.toolcall.json'));
	if (containsToolArgsFile) {
		return fetchToolCallScenarios(rootFolder);
	}
	return [];
}
