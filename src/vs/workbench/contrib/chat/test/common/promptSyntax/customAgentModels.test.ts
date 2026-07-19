/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { customAgentModelEntriesEqual, getCustomAgentModelConfiguration, isCustomAgentModelEntries, resolveCustomAgentModel } from '../../../common/promptSyntax/customAgentModels.js';

suite('CustomAgentModels', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(name: string, configurationSchema?: ILanguageModelChatMetadata['configurationSchema']): ILanguageModelChatMetadataAndIdentifier {
		return {
			identifier: `test/${name}`,
			metadata: {
				extension: new ExtensionIdentifier('test.extension'),
				name,
				id: name,
				vendor: 'test',
				version: '1',
				family: name,
				maxInputTokens: 300_000,
				maxOutputTokens: 10_000,
				isDefaultForLocation: {},
				capabilities: { toolCalling: true },
				configurationSchema,
			}
		};
	}

	test('resolves the first available entry with its provider-specific configuration', () => {
		const model = createModel('Available', {
			properties: {
				thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
				maxPromptTokens: { type: 'number', enum: [100_000], group: 'tokens' },
			}
		});

		assert.deepStrictEqual(resolveCustomAgentModel([
			{ name: 'Missing (test)', reasoningEffort: 'low', contextSize: 50_000 },
			{ name: 'Available (test)', reasoningEffort: 'high', contextSize: 200_000 },
		], [model]), {
			entry: { name: 'Available (test)', reasoningEffort: 'high', contextSize: 200_000 },
			model,
			modelConfiguration: { thinkingLevel: 'high', maxPromptTokens: 200_000 },
		});
	});

	test('omits unsupported reasoning values while retaining arbitrary context caps', () => {
		const metadata = createModel('Configured', {
			properties: {
				effort: { type: 'string', enum: ['low'], group: 'navigation' },
				tokens: { type: 'integer', enum: [100_000], group: 'tokens' },
			}
		}).metadata;

		assert.deepStrictEqual(
			getCustomAgentModelConfiguration({ name: 'Configured (test)', reasoningEffort: 'high', contextSize: 222_222 }, metadata),
			{ tokens: 222_222 },
		);
	});

	test('validates cached entries and compares structured entries by value', () => {
		const first = ['Legacy', { name: 'Configured', reasoningEffort: 'high', contextSize: 200_000 }] as const;
		const equivalent = ['Legacy', { name: 'Configured', reasoningEffort: 'high', contextSize: 200_000 }] as const;
		const changed = ['Legacy', { name: 'Configured', reasoningEffort: 'low', contextSize: 200_000 }] as const;

		assert.deepStrictEqual({
			valid: isCustomAgentModelEntries(first),
			invalidContext: isCustomAgentModelEntries([{ name: 'Configured', contextSize: 1.5 }]),
			unsafeContext: isCustomAgentModelEntries([{ name: 'Configured', contextSize: Number.MAX_SAFE_INTEGER + 1 }]),
			unknownProperty: isCustomAgentModelEntries([{ name: 'Configured', extra: true }]),
			equivalent: customAgentModelEntriesEqual(first, equivalent),
			changed: customAgentModelEntriesEqual(first, changed),
		}, {
			valid: true,
			invalidContext: false,
			unsafeContext: false,
			unknownProperty: false,
			equivalent: true,
			changed: false,
		});
	});
});
