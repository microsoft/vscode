/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as path from 'path';
import type { ChatResponseFileTree } from 'vscode';
import { createTextDocumentData } from '../../src/util/common/test/shims/textDocument';
import { URI } from '../../src/util/vs/base/common/uri';
import { rubric } from '../base/rubric';
import { ssuite, stest } from '../base/stest';
import { validate } from '../base/validate';
import { discoverScenarios } from '../e2e/scenarioLoader';
import { generateScenarioTestRunner } from '../e2e/scenarioTest';

ssuite({ title: 'setupTests - recommend', location: 'panel' }, () => {
	const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-setupTestRecommend');
	const scenarios = discoverScenarios(scenarioFolder);
	for (const scenario of scenarios) {
		stest({ description: scenario[0].json.name }, collection => {
			const runner = generateScenarioTestRunner(
				scenario.map(tcase => ({
					...tcase,
					setupCase(accessor, workspace) {
						const files = (tcase.json as any).files || [];
						for (const file of files) {
							workspace.addDocument(createTextDocumentData(
								URI.joinPath(workspace.workspaceFolders[0], file),
								'',
								''
							));
						}
					},
				})),
				async (accessor, question, answer, rawResponse, turn, scenarioIndex, commands, confirmations) => {
					assert.ok(scenario[0].json.keywords, 'expected test case to have keywords');
					assert.ok(confirmations.length, 'expected to have a confirmation part');
					const err = validate(confirmations[0].buttons!.join(' ').toLowerCase(), scenario[0].json.keywords);
					if (err) {
						return { success: false, errorMessage: err };
					}

					return { success: true, errorMessage: answer };
				}
			);

			return runner(collection);
		});
	}
});

ssuite({ title: 'setupTests - invoke', location: 'panel' }, () => {
	const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-setupTest');
	const scenarios = discoverScenarios(scenarioFolder);
	for (const scenario of scenarios) {
		stest({ description: scenario[0].json.name }, collection => {
			const runner = generateScenarioTestRunner(
				scenario.map(tcase => ({
					...tcase,
					setupCase(accessor, workspace) {
						const files = (tcase.json as any).files || [];
						for (const file of files) {
							workspace.addDocument(createTextDocumentData(
								URI.joinPath(workspace.workspaceFolders[0], file),
								'',
								''
							));
						}
					},
				})),
				async (accessor, question, answer, rawResponse, turn, scenarioIndex, commands, confirmations, fileTree) => {
					const e: {
						filePatterns: string[];
						installCommandPattern: string;
						runCommandPattern: string;
					} = (scenario[0].json as any).expectations;

					const files: string[] = [];
					const serializeFileTree = (node: ChatResponseFileTree, path: string = ''): void => {
						if (node.children) {
							node.children.forEach(child => serializeFileTree(child, `${path}${node.name}/`));
						} else {
							files.push(path + node.name);
						}
					};
					fileTree[0].value.forEach(v => serializeFileTree(v));

					rubric(accessor,
						() => {
							for (const pattern of e.filePatterns) {
								assert.ok(files.some(f => f.match(pattern)), `expected file to match ${pattern}`);
							}
						},
						() => assert.ok(rawResponse.match(e.installCommandPattern), 'expected to have an install command pattern'),
						() => assert.ok(rawResponse.match(e.runCommandPattern), 'expected to have a run command pattern'),
					);

					return { success: true };
				}
			);

			return runner(collection);
		});
	}
});
