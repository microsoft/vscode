/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';
import type { ChatResponseFileTree } from 'vscode';
import { INewWorkspacePreviewContentManager } from '../../src/extension/intents/node/newIntent';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { IQualifiedFile, getLanguageForFile } from '../../src/platform/test/node/simulationWorkspace';
import { looksLikeDirectory } from '../../src/util/common/fileSystem';
import { ChatResponseFileTreePart, Uri } from '../../src/vscodeTypes';
import { ssuite, stest } from '../base/stest';
import { validate } from '../base/validate';
import { compileTSWorkspace } from '../simulation/diagnosticProviders/tsc';
import { cleanTempDir, createTempDir } from '../simulation/stestUtil';
import { Scenario, fetchConversationScenarios } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

(function () {

	ssuite.skip({ title: 'newWorkspace', subtitle: 'e2e', location: 'panel' }, (inputPath) => {

		const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-new-workspace');
		const scenarios: Scenario[] = fetchConversationScenarios(scenarioFolder);

		for (const scenario of scenarios) {
			stest({ description: scenario[0].question.replace('/new ', '') },
				generateScenarioTestRunner(
					scenario,
					async (accessor, question, answer, _rawResponse, _index, _turn, commands) => {
						const files: IQualifiedFile[] = [];
						for (const command of commands) {
							if (command.command === 'github.copilot.createProject') {
								// validate project structure and contents in files
								const projectItems: ChatResponseFileTreePart = command.arguments?.[0];
								if (!projectItems || projectItems.value?.length === 0) {
									return Promise.resolve({ success: false, errorMessage: 'Invalid projectItems' });
								}
								if (scenario[0].json.keywords) {
									const err = validate(_rawResponse, scenario[0].json.keywords);
									if (err) {
										return { success: false, errorMessage: err };
									}
								}

								const contentManager = accessor.get(INewWorkspacePreviewContentManager);

								async function traverseFileTree(parentPath: string, fileTree: ChatResponseFileTree, baseUri: Uri): Promise<void | { success: boolean; errorMessage: string }> {
									const itemPath = path.posix.join(parentPath, fileTree.name);
									if (fileTree.children?.length || !looksLikeDirectory(fileTree.name)) {
										files.push({ kind: 'qualifiedFile', uri: Uri.joinPath(baseUri, itemPath), fileContents: 'DIR' });
										for (const item of fileTree.children ?? []) {
											await traverseFileTree(itemPath, item, baseUri);
										}
									} else {
										const result = await contentManager.get(Uri.joinPath(baseUri, itemPath))?.content;
										const decoder = new TextDecoder();
										const decodedString = decoder.decode(result);
										if (!decodedString) {
											return { success: false, errorMessage: `Content not found for ${itemPath}` };
										}
										files.push({ kind: 'qualifiedFile', uri: Uri.joinPath(baseUri, itemPath), fileContents: decodedString });
									}
									return;
								}

								for (const projectItem of projectItems.value) {
									await traverseFileTree('', projectItem, projectItems.baseUri);
								}

								const tempDirPath = await createTempDir();
								const projectRoot = path.join(tempDirPath, projectItems.baseUri.path);
								await createTempWorkspace(tempDirPath, files);
								const result = await compileWorkspace(accessor, projectRoot, files);
								await cleanTempDir(tempDirPath);
								return result;

							}
						}
						return Promise.resolve({ success: false, errorMessage: 'Failed to parse new response' });
					}
				));
		}
	});
})();

// TODO @aiday-mar add possibility to execute python files and find the diagnostics or errors upon execution
async function compileWorkspace(accessor: ITestingServicesAccessor, projectRoot: string, files: IQualifiedFile[]): Promise<{ success: boolean; errorMessage?: string }> {
	for (const file of files) {
		const language = getLanguageForFile(file);
		switch (language.languageId) {
			case 'typescript':
				{
					// compute diagnostics
					const tsDiagnostics = await compileTSWorkspace(accessor, projectRoot);
					if (tsDiagnostics.length === 0) {
						return { success: true };
					}
					const errors = tsDiagnostics.map(diagnostic => diagnostic.file + ' ' + diagnostic.code + ' : ' + diagnostic.message).join('\n');
					return { success: false, errorMessage: 'Typescript diagnostics errors: \n' + errors };
				}
		}
	}
	return { success: true };
}

async function createTempWorkspace(tempDirPath: string, files: IQualifiedFile[]): Promise<void> {
	await fs.promises.rm(tempDirPath, { recursive: true, force: true });
	await fs.promises.mkdir(tempDirPath, { recursive: true });
	for (const file of files) {
		const tmpPath = path.join(tempDirPath, file.uri.path);
		if (file.fileContents !== 'DIR') {
			await fs.promises.writeFile(tmpPath, file.fileContents);
		}
		else {
			await fs.promises.mkdir(tmpPath, { recursive: true });
		}
	}
}
