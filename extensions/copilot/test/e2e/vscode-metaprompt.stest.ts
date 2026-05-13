/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChatVariablesCollection } from '../../src/extension/prompt/common/chatVariablesCollection';
import { VscodePrompt } from '../../src/extension/prompts/node/panel/vscode';
import { IEndpointProvider } from '../../src/platform/endpoint/common/endpointProvider';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';

ssuite.skip({ title: 'vscode', subtitle: 'metaprompt', location: 'panel' }, async (_) => {

	const scenarios = [
		{
			question: 'how to opne command pallete',
			keywords: ['open', 'command palette'],
			excludedKeywords: ['how',]
		},
		{
			question: 'how do I change font size setting',
			keywords: ['setting', 'font size'],
			excludedKeywords: ['how',]
		},
		{
			question: 'enable word wrap in editer',
			keywords: ['enable', 'editor', 'word wrap'],
			excludedKeywords: []
		},
	];

	for (const scenario of scenarios) {
		stest({ description: scenario.question },
			async (testingServiceCollection) => {
				const accessor = testingServiceCollection.createTestingAccessor();
				const instantiationService = accessor.get(IInstantiationService);

				const endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
				const vscodePrompt = instantiationService.createInstance(VscodePrompt, {
					promptContext: {
						chatVariables: new ChatVariablesCollection([]),
						history: [],
						query: scenario.question,
					},
					endpoint
				});

				const tokenizer = endpoint.acquireTokenizer();
				const countTokens = (text: string) => tokenizer.tokenLength(text);

				const prompt = await vscodePrompt.prepare({ tokenBudget: 2048, endpoint, countTokens }, undefined, CancellationToken.None);
				assert.notEqual(prompt.query, scenario.question);

				for (const keyword of scenario.keywords) {
					assert.ok(prompt.query.toLowerCase().includes(keyword.toLowerCase()), `${keyword} not found in prompt query`);
				}
				for (const keyword of scenario.excludedKeywords) {
					assert.ok(!prompt.query.toLowerCase().includes(keyword.toLowerCase()), `prompt query should not include "${keyword}"`);
				}
			});
	}
});
