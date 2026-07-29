/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import type { TextSearchMatch2 } from 'vscode';
import { SemanticSearchTextSearchProvider } from '../../src/extension/workspaceSemanticSearch/node/semanticSearchTextSearchProvider';
import { IConversationOptions } from '../../src/platform/chat/common/conversationOptions';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';
import { discoverScenarios } from './scenarioLoader';
import { fetchConversationOptions } from './scenarioTest';

ssuite({ title: 'semanticSearchView', location: 'panel' }, (inputPath) => {
	// No default cases checked in at the moment
	if (!inputPath) {
		return;
	}

	if (inputPath.endsWith('tests')) {
		inputPath = path.join(inputPath, 'semantic-search-view');
	}

	const scenariosFolder = inputPath;
	const scenarios = discoverScenarios(scenariosFolder);

	for (const scenario of scenarios) {
		for (const testCase of scenario) {
			stest({ description: 'Semantic search view: ' + testCase.question }, async (testingServiceCollection: TestingServiceCollection) => {
				const workspaceState = testCase.getState ? testCase.getState() : undefined;
				testingServiceCollection.define(IConversationOptions, fetchConversationOptions());
				const simulationWorkspace = new SimulationWorkspace();
				simulationWorkspace.setupServices(testingServiceCollection);
				simulationWorkspace.resetFromDeserializedWorkspaceState(workspaceState);
				const accessor = testingServiceCollection.createTestingAccessor();
				const question = testCase.question;
				const instantiationService = accessor.get(IInstantiationService);
				const provider = instantiationService.createInstance(SemanticSearchTextSearchProvider);

				const results: TextSearchMatch2[] = [];
				await provider.provideAITextSearchResults(question, {
					folderOptions: [],
					maxResults: 1000,
					previewOptions: {
						matchLines: 100,
						charsPerLine: 100
					},
					maxFileSize: undefined,
					surroundingContext: 0
				}, {
					report: (value: TextSearchMatch2) => {
						results.push(value);
					}
				}, CancellationToken.None);

				if (testCase.json.keywords) {
					for (const r of results) {
						const matched = testCase.json.keywords.some((keyword: string) => r.previewText.includes(keyword));
						if (matched) {
							return { success: true };
						}
					}
				}

				assert.fail('No keywords found in results');
			});
		}
	}
});
