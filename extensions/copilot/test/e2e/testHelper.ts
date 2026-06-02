/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatLanguageModelToolReference, ChatPromptReference } from 'vscode';
import { IToolsService } from '../../src/extension/tools/common/toolsService';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { basename } from '../../src/util/vs/base/common/resources';
import { Location, Uri } from '../../src/vscodeTypes';
import { IConversationTestCase } from './scenarioLoader';

export interface IParsedQuery {
	query: string;
	participantName: string | undefined;
	command?: string;
	variables: ChatPromptReference[];
	toolReferences: ChatLanguageModelToolReference[];
}

/**
 * This has to recreate some of the variable parsing logic in VS Code so that we can write tests easily with variables
 * as strings, but then provide the extension code with the parsed variables in the extension API format.
*/
export async function parseQueryForScenarioTest(accessor: ITestingServicesAccessor, testCase: IConversationTestCase, simulationWorkspace: SimulationWorkspace): Promise<IParsedQuery> {
	const query = await parseQueryForTest(accessor, testCase.question, simulationWorkspace);

	// Simulate implicit context enablement
	const activeTextEditor = simulationWorkspace.activeTextEditor;
	if (activeTextEditor) {
		const selection = activeTextEditor.selections?.[0];
		if (selection) {
			query.variables.push({
				id: 'vscode.implicit',
				name: `file:${basename(activeTextEditor.document.uri)}`,
				value: new Location(activeTextEditor.document.uri, selection),
				modelDescription: `User's active selection`
			});
		} else {
			query.variables.push({
				id: 'vscode.implicit',
				name: `file:${basename(activeTextEditor.document.uri)}`,
				value: activeTextEditor.document.uri,
				modelDescription: `User's active file`
			});
		}
	}

	return query;
}

export function createWorkingSetFileVariable(uri: Uri) {
	return {
		id: 'copilot.file',
		name: `file:${basename(uri)}`,
		value: uri,
	};
}

export function parseQueryForTest(accessor: ITestingServicesAccessor, query: string, simulationWorkspace: SimulationWorkspace): IParsedQuery {
	const variableReg = /#([\w_\-]+)(?::(\S+))?(?=(\s|$|\b))/ig;

	const toolsService = accessor.get(IToolsService);

	const match = query.match(/(?:@(\S+))?\s*(?:\/(\S+))?(.*)/);
	let command: string | undefined;
	let participantName: string | undefined;
	if (match) {
		participantName = match[1];
		command = match[2];
		query = match[3]?.trim() || '';
	}

	const variables: ChatPromptReference[] = [];
	const toolReferences: ChatLanguageModelToolReference[] = [];
	let varMatch: RegExpMatchArray | null;
	while (varMatch = variableReg.exec(query)) {
		const [_, varName, arg] = varMatch;
		const range: [number, number] = [varMatch.index!, varMatch.index! + varMatch[0].length];
		if (varName === 'file') {
			const value = parseFileVariables(simulationWorkspace, arg);
			const varWithArg = `${varName}:${arg}`;
			variables.push({ id: `copilot.${varName}`, name: varWithArg, range, value });
		} else {
			const tool = toolsService.getToolByToolReferenceName(varName);
			if (tool) {
				toolReferences.push(tool);
			}
		}
	}

	variables.sort((a, b) => (b.range?.[0] ?? 0) - (a.range?.[0] ?? 0));

	return {
		query,
		participantName,
		command,
		variables,
		toolReferences
	};
}

function parseFileVariables(simulationWorkspace: SimulationWorkspace, filePath: string): Uri {
	for (const doc of simulationWorkspace.documents) {
		if (basename(doc.document.uri) === filePath) {
			return doc.document.uri;
		}
	}
	return Uri.joinPath(simulationWorkspace.workspaceFolders[0], filePath);
}
