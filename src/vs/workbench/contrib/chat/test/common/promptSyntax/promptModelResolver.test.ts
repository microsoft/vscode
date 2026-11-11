/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { getAgentModelPolicyError, resolveAgentModelPreference, resolveAgentModelPreferences } from '../../../common/promptSyntax/languageProviders/promptModelResolver.js';

suite('Agent model preferences', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const models: ILanguageModelChatMetadataAndIdentifier[] = ['sonnet', 'opus', 'other'].map(id => ({
		identifier: `copilot/${id}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({ id, name: id, vendor: 'copilot' }),
	}));

	test('resolves all authored alternatives while preserving selection preference order', () => {
		const preferences = ['missing', 'opus:defaultReasoningEffort=high', 'Sonnet (copilot)'];
		assert.deepStrictEqual({
			first: resolveAgentModelPreference(preferences, models)?.identifier,
			allowed: resolveAgentModelPreferences(preferences, models).map(model => model.identifier),
		}, { first: 'copilot/opus', allowed: ['copilot/sonnet', 'copilot/opus'] });
	});

	test('only required nonempty lists restrict requests', () => {
		assert.deepStrictEqual([
			getAgentModelPolicyError(undefined, 'copilot/other', models),
			getAgentModelPolicyError({ models: ['sonnet'], required: false }, 'copilot/other', models),
			getAgentModelPolicyError({ models: [], required: true }, 'copilot/other', models),
			getAgentModelPolicyError({ models: ['missing', 'sonnet'], required: true }, 'copilot/sonnet', models),
			!!getAgentModelPolicyError({ models: ['sonnet'], required: true }, 'copilot/other', models),
			!!getAgentModelPolicyError({ models: ['missing'], required: true }, undefined, models),
			!!getAgentModelPolicyError({ models: ['sonnet'], required: true }, 'copilot/sonnet', []),
		], [undefined, undefined, undefined, undefined, true, true, true]);
	});

	test('qualified Copilot preferences do not admit a BYOK alias', () => {
		const byok = { identifier: 'byok/sonnet', metadata: { ...models[0].metadata, id: 'custom-id', vendor: 'custom', isBYOK: true } };
		assert.deepStrictEqual(resolveAgentModelPreferences(['Sonnet (copilot)'], [...models, byok]).map(model => model.identifier), ['copilot/sonnet']);
	});

	test('exact IDs take precedence over other models with the same display name', () => {
		const alias = { identifier: 'copilot/alias', metadata: { ...models[0].metadata, id: 'alias' } };
		assert.deepStrictEqual(resolveAgentModelPreferences(['sonnet'], [alias, ...models]).map(model => model.identifier), ['copilot/sonnet']);
	});
});
