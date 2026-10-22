/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'chai';
import { suite, test } from 'vitest';
import { getAgentFileContext, getAgentFileTarget } from '../promptFileContextService';

suite('PromptFileContextContribution', () => {
	const models = ['GPT-5.6 Sol'];
	const modelIds = ['gpt-5.6-sol'];

	test('provides only shared agent attributes without a target', () => {
		const context = getAgentFileContext(undefined, models, modelIds);
		const values = context.map(item => 'value' in item ? item.value : '').join('\n');

		assert.include(values, 'name, description, target, model, tools');
		assert.notInclude(values, 'argument-hint');
		assert.notInclude(values, 'mcp-servers');
		assert.notInclude(values, 'GPT-5.6 Sol');
		assert.notInclude(values, 'gpt-5.6-sol');
	});

	test('parses only supported explicit targets', () => {
		assert.deepEqual([
			getAgentFileTarget('---\ntarget: vscode\n---\nBody'),
			getAgentFileTarget('---\ntarget: github-copilot\n---\nBody'),
			getAgentFileTarget('---\ntarget: future-harness\n---\nBody'),
			getAgentFileTarget('Body without frontmatter'),
		], ['vscode', 'github-copilot', undefined, undefined]);
	});

	test('provides VS Code-specific agent context', () => {
		const context = getAgentFileContext('vscode', models, modelIds);
		const values = context.map(item => 'value' in item ? item.value : '').join('\n');

		assert.include(values, 'argument-hint');
		assert.include(values, 'handoffs');
		assert.include(values, 'GPT-5.6 Sol (copilot)');
		assert.notInclude(values, 'mcp-servers');
		assert.notInclude(values, 'gpt-5.6-sol');
	});

	test('provides GitHub Copilot-specific agent context', () => {
		const context = getAgentFileContext('github-copilot', models, modelIds);
		const values = context.map(item => 'value' in item ? item.value : '').join('\n');

		assert.include(values, 'mcp-servers');
		assert.include(values, 'model-policy');
		assert.include(values, 'gpt-5.6-sol');
		assert.include(values, 'github/*');
		assert.include(values, 'playwright/*');
		assert.notInclude(values, 'argument-hint');
		assert.notInclude(values, 'GPT-5.6 Sol (copilot)');
	});
});
