/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildModelTooltip } from '../../browser/modelPicker/modelPickerActionItem.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';

suite('ModelPickerActionItem', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildModelTooltip', () => {
		test('basic model with name only', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Test Model',
				id: 'test-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 0,
				maxOutputTokens: 0,
				modelPickerCategory: undefined
			};

			const tooltip = buildModelTooltip(metadata);
			assert.strictEqual(tooltip, 'Test Model');
		});

		test('model with custom tooltip', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Test Model',
				tooltip: 'Custom tooltip message',
				id: 'test-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 0,
				maxOutputTokens: 0,
				modelPickerCategory: undefined
			};

			const tooltip = buildModelTooltip(metadata);
			assert.strictEqual(tooltip, 'Custom tooltip message');
		});

		test('model with context window information', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Test Model',
				id: 'test-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 4096,
				maxOutputTokens: 2048,
				modelPickerCategory: undefined
			};

			const tooltip = buildModelTooltip(metadata);
			assert.ok(tooltip.includes('Test Model'));
			assert.ok(tooltip.includes('Input: 4096 tokens'));
			assert.ok(tooltip.includes('Output: 2048 tokens'));
		});

		test('model with only input tokens', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Test Model',
				id: 'test-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 8192,
				maxOutputTokens: 0,
				modelPickerCategory: undefined
			};

			const tooltip = buildModelTooltip(metadata);
			assert.ok(tooltip.includes('Input: 8192 tokens'));
			assert.ok(!tooltip.includes('Output'));
		});

		test('model with capabilities', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Test Model',
				id: 'test-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 4096,
				maxOutputTokens: 2048,
				modelPickerCategory: undefined,
				capabilities: {
					vision: true,
					toolCalling: true
				}
			};

			const tooltip = buildModelTooltip(metadata);
			assert.ok(tooltip.includes('Test Model'));
			assert.ok(tooltip.includes('Capabilities'));
			assert.ok(tooltip.includes('Vision'));
			assert.ok(tooltip.includes('Tool Calling'));
		});

		test('model with all capabilities', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Advanced Model',
				id: 'advanced-model',
				vendor: 'test-vendor',
				version: '2.0',
				family: 'test-family',
				maxInputTokens: 16384,
				maxOutputTokens: 4096,
				modelPickerCategory: undefined,
				capabilities: {
					vision: true,
					toolCalling: true,
					agentMode: true
				}
			};

			const tooltip = buildModelTooltip(metadata);
			assert.ok(tooltip.includes('Advanced Model'));
			assert.ok(tooltip.includes('Input: 16384 tokens'));
			assert.ok(tooltip.includes('Output: 4096 tokens'));
			assert.ok(tooltip.includes('Capabilities'));
			assert.ok(tooltip.includes('Vision'));
			assert.ok(tooltip.includes('Tool Calling'));
			assert.ok(tooltip.includes('Agent Mode'));
		});

		test('model with only vision capability', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Vision Model',
				id: 'vision-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 2048,
				maxOutputTokens: 1024,
				modelPickerCategory: undefined,
				capabilities: {
					vision: true
				}
			};

			const tooltip = buildModelTooltip(metadata);
			assert.ok(tooltip.includes('Vision Model'));
			assert.ok(tooltip.includes('Capabilities: Vision'));
			assert.ok(!tooltip.includes('Tool Calling'));
			assert.ok(!tooltip.includes('Agent Mode'));
		});

		test('model with custom tooltip and capabilities', () => {
			const metadata: ILanguageModelChatMetadata = {
				extension: new ExtensionIdentifier('test.extension'),
				name: 'Full Featured Model',
				tooltip: 'A powerful AI model',
				id: 'full-model',
				vendor: 'test-vendor',
				version: '1.0',
				family: 'test-family',
				maxInputTokens: 32768,
				maxOutputTokens: 8192,
				modelPickerCategory: undefined,
				capabilities: {
					vision: true,
					toolCalling: true,
					agentMode: true
				}
			};

			const tooltip = buildModelTooltip(metadata);
			const lines = tooltip.split('\n');
			assert.strictEqual(lines.length, 3); // custom tooltip, context window, capabilities
			assert.strictEqual(lines[0], 'A powerful AI model');
			assert.ok(lines[1].includes('Input: 32768 tokens'));
			assert.ok(lines[1].includes('Output: 8192 tokens'));
			assert.ok(lines[2].includes('Capabilities'));
			assert.ok(lines[2].includes('Vision'));
			assert.ok(lines[2].includes('Tool Calling'));
			assert.ok(lines[2].includes('Agent Mode'));
		});
	});
});
