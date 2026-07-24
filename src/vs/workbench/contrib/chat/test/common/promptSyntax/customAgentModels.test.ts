/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { customAgentModelEntriesEqual, getCustomAgentModelConfiguration, getCustomAgentModelInvocationConfiguration, isCustomAgentModelEntries, resolveCustomAgentModel } from '../../../common/promptSyntax/customAgentModels.js';

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
				maxPromptTokens: { type: 'number', enum: [100_000, 300_000], group: 'tokens' },
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

	test('omits unsupported reasoning values and caps context size to the model range', () => {
		const metadata = createModel('Configured', {
			properties: {
				effort: { type: 'string', enum: ['low'], group: 'navigation' },
				tokens: { type: 'integer', enum: [100_000, 200_000], group: 'tokens' },
			}
		}).metadata;

		assert.deepStrictEqual({
			below: getCustomAgentModelConfiguration({ name: 'Configured (test)', contextSize: 1 }, metadata),
			within: getCustomAgentModelConfiguration({ name: 'Configured (test)', reasoningEffort: 'high', contextSize: 150_000 }, metadata),
			above: getCustomAgentModelConfiguration({ name: 'Configured (test)', contextSize: 222_222 }, metadata),
		}, {
			below: { tokens: 10_000 },
			within: { tokens: 150_000 },
			above: { tokens: 200_000 },
		});
	});

	test('strict invocation overrides use provider properties and accept custom context sizes within bounds', () => {
		const metadata = createModel('Configured', {
			properties: {
				thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
				maxPromptTokens: { type: 'integer', minimum: 20_000, maximum: 250_000, enum: [100_000, 200_000], group: 'tokens' },
			}
		}).metadata;

		assert.deepStrictEqual(getCustomAgentModelInvocationConfiguration({
			reasoningEffort: 'high',
			contextSize: 175_000,
		}, metadata), {
			thinkingLevel: 'high',
			maxPromptTokens: 175_000,
		});
	});

	test('strict invocation overrides report unsupported properties and values', () => {
		const withoutConfiguration = createModel('Unconfigured').metadata;
		const configured = createModel('Configured', {
			properties: {
				thinkingLevel: { type: 'string', enum: ['low', 'high'], group: 'navigation' },
				maxPromptTokens: { type: 'integer', minimum: 20_000, maximum: 250_000, group: 'tokens' },
			}
		}).metadata;
		const errorMessage = (callback: () => void) => {
			try {
				callback();
				return undefined;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		};

		assert.deepStrictEqual({
			unsupportedEffort: errorMessage(() => getCustomAgentModelInvocationConfiguration({ reasoningEffort: 'high' }, withoutConfiguration)),
			emptyEffort: errorMessage(() => getCustomAgentModelInvocationConfiguration({ reasoningEffort: '' }, configured)),
			invalidEffort: errorMessage(() => getCustomAgentModelInvocationConfiguration({ reasoningEffort: 'medium' }, configured)),
			unsupportedContext: errorMessage(() => getCustomAgentModelInvocationConfiguration({ contextSize: 100_000 }, withoutConfiguration)),
			invalidContext: errorMessage(() => getCustomAgentModelInvocationConfiguration({ contextSize: 1.5 }, configured)),
			contextBelowRange: errorMessage(() => getCustomAgentModelInvocationConfiguration({ contextSize: 19_999 }, configured)),
			contextAboveRange: errorMessage(() => getCustomAgentModelInvocationConfiguration({ contextSize: 250_001 }, configured)),
		}, {
			unsupportedEffort: "Resolved model 'Unconfigured (test)' does not support reasoningEffort overrides.",
			emptyEffort: "reasoningEffort must be a non-empty string for resolved model 'Configured (test)'.",
			invalidEffort: "reasoningEffort 'medium' is not supported by resolved model 'Configured (test)'. Supported values: low, high.",
			unsupportedContext: "Resolved model 'Unconfigured (test)' does not support contextSize overrides.",
			invalidContext: "contextSize must be a positive integer for resolved model 'Configured (test)'.",
			contextBelowRange: "contextSize 19999 is outside the supported range for resolved model 'Configured (test)'. Supported range: 20000-250000.",
			contextAboveRange: "contextSize 250001 is outside the supported range for resolved model 'Configured (test)'. Supported range: 20000-250000.",
		});
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
