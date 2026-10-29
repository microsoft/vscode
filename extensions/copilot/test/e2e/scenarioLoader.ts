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

export interface IConversationTestCase {
	name: string;
	question: string;
	scenarioFolderPath: string;
	stateFile?: string;
	getState?: () => IDeserializedWorkspaceState;
	answer?: string;
	applyChatCodeBlocks?: boolean;
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
