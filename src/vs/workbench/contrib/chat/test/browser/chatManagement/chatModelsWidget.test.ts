/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { getModelHoverContent } from '../../../browser/chatManagement/chatModelsWidget.js';
import { ILanguageModel } from '../../../browser/chatManagement/chatModelsViewModel.js';
import { ChatAgentLocation } from '../../../common/constants.js';

function createModel(overrides: Partial<ILanguageModelChatMetadata> = {}): ILanguageModel {
	return {
		metadata: {
			extension: new ExtensionIdentifier('github.copilot'),
			id: 'gpt-4',
			name: 'GPT-4',
			family: 'gpt-4',
			version: '1.0',
			vendor: 'copilot',
			maxInputTokens: 8192,
			maxOutputTokens: 4096,
			isUserSelectable: true,
			isDefaultForLocation: {
				[ChatAgentLocation.Chat]: false
			},
			...overrides
		},
		identifier: 'copilot-gpt-4',
		provider: {
			vendor: { vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true },
			group: { name: 'GitHub Copilot' }
		},
	} as ILanguageModel;
}

suite('ChatModelsWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getModelHoverContent', () => {

		test('includes cost fields when all three are present', () => {
			const model = createModel({
				inputCost: 4,
				outputCost: 14,
				cacheCost: 1
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('4 credits per 1M tokens'));
			assert.ok(value.includes('Output Cost'));
			assert.ok(value.includes('14 credits per 1M tokens'));
			assert.ok(value.includes('Cache Cost'));
			assert.ok(value.includes('1 credit per 1M tokens'));
		});

		test('includes only present cost fields', () => {
			const model = createModel({
				inputCost: 3,
				outputCost: 12
				// cacheCost intentionally omitted
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('3 credits per 1M tokens'));
			assert.ok(value.includes('Output Cost'));
			assert.ok(value.includes('12 credits per 1M tokens'));
			assert.ok(!value.includes('Cache Cost'));
		});

		test('omits cost section when no cost fields are set', () => {
			const model = createModel({});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(!value.includes('Input Cost'));
			assert.ok(!value.includes('Output Cost'));
			assert.ok(!value.includes('Cache Cost'));
			assert.ok(!value.includes('credits per 1M tokens'));
			assert.ok(!value.includes('credit per 1M tokens'));
		});

		test('includes pricing text when set', () => {
			const model = createModel({ pricing: '1x' });

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Pricing'));
			assert.ok(value.includes('1x'));
		});

		test('includes both pricing and cost fields when both are present', () => {
			const model = createModel({
				pricing: '1x',
				inputCost: 4,
				outputCost: 14,
				cacheCost: 1
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Pricing'));
			assert.ok(value.includes('1x'));
			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('4 credits per 1M tokens'));
		});

		test('handles zero cost values', () => {
			const model = createModel({
				inputCost: 0,
				outputCost: 0,
				cacheCost: 0
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('0 credits per 1M tokens'));
		});
	});
});
