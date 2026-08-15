/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import { clearByokCompletionModelConfigs, getByokCompletionModelById, getByokCompletionModels, updateByokCompletionModelConfig } from '../byokCompletionModels';

describe('byokCompletionModels', () => {
	afterEach(() => {
		clearByokCompletionModelConfigs();
	});

	it('parses customendpoint groups with an explicit model completionsUrl', () => {
		updateByokCompletionModelConfig('customendpoint', 'Custom', {
			apiKey: 'sk-1',
			models: [
				{
					id: 'custom-model',
					name: 'Custom Model',
					url: 'https://custom.example.com/v1/chat/completions',
					completionsUrl: 'https://custom.example.com/v1/completions',
				},
			],
		});

		expect(getByokCompletionModels()).toEqual([
			{
				id: 'custom-model',
				label: 'Custom Model',
				vendor: 'customendpoint',
				groupName: 'Custom',
				completionsUrl: 'https://custom.example.com/v1/completions',
				apiKey: 'sk-1',
				model: 'custom-model',
			},
		]);
	});

	it('falls back to the group-level completionsUrl (used verbatim)', () => {
		updateByokCompletionModelConfig('customendpoint', 'Custom', {
			completionsUrl: 'https://custom.example.com/v1/completions',
			models: [
				{
					id: 'nested/model-id',
					name: 'Nested Model',
					url: 'https://custom.example.com/v1/chat/completions',
				},
			],
		});

		const model = getByokCompletionModels()[0];
		expect(model.completionsUrl).toBe('https://custom.example.com/v1/completions');
		expect(model.id).toBe('nested/model-id');
	});

	it('skips models without any completionsUrl (chat-only)', () => {
		updateByokCompletionModelConfig('customendpoint', 'ChatOnly', {
			models: [
				{
					id: 'chat-model',
					name: 'Chat Model',
					url: 'https://api.example.com/v1/chat/completions',
				},
			],
		});

		expect(getByokCompletionModels()).toEqual([]);
	});

	it('skips models with a non-http(s) completionsUrl', () => {
		updateByokCompletionModelConfig('customendpoint', 'Bad', {
			completionsUrl: 'file:///tmp/completions',
			models: [
				{
					id: 'bad-model',
					name: 'Bad Model',
					url: 'https://api.example.com/v1/chat/completions',
				},
			],
		});

		expect(getByokCompletionModels()).toEqual([]);
	});

	it('disambiguates duplicate model ids across groups', () => {
		updateByokCompletionModelConfig('customendpoint', 'A', {
			completionsUrl: 'https://a.example.com/v1/completions',
			models: [
				{
					id: 'm',
					name: 'M A',
					url: 'https://a.example.com/v1/chat/completions',
				},
			],
		});
		updateByokCompletionModelConfig('customendpoint', 'B', {
			completionsUrl: 'https://b.example.com/v1/completions',
			models: [
				{
					id: 'm',
					name: 'M B',
					url: 'https://b.example.com/v1/chat/completions',
				},
			],
		});

		const models = getByokCompletionModels();
		expect(models).toHaveLength(2);
		expect(models[0].id).toBe('m');
		expect(models[1].id).toBe('B/m');
		expect(getByokCompletionModelById('m')?.label).toBe('M A');
		expect(getByokCompletionModelById('B/m')?.label).toBe('M B');
	});

	it('ignores non-BYOK vendors such as openai', () => {
		updateByokCompletionModelConfig('openai', 'OpenAI', {
			completionsUrl: 'https://api.openai.com/v1/completions',
			models: [
				{
					id: 'gpt-4o',
					name: 'GPT-4o',
					url: 'https://api.openai.com/v1/chat/completions',
				},
			],
		});

		expect(getByokCompletionModels()).toEqual([]);
	});

	it('matches the id, group/id and vendor/group/id forms of a selected model', () => {
		updateByokCompletionModelConfig('customendpoint', 'Group-1', {
			completionsUrl: 'https://custom.example.com/v1/completions',
			models: [
				{
					id: 'model-flash',
					name: 'Model Flash',
					url: 'https://custom.example.com/v1/chat/completions',
				},
			],
		});

		// `github.copilot.selectedCompletionModel` may hold any of these forms: the
		// chat model picker writes the vendor/group/id form (`toModelIdentifier`),
		// while the completion model picker writes the bare id.
		expect(getByokCompletionModelById('model-flash')?.label).toBe('Model Flash');
		expect(getByokCompletionModelById('Group-1/model-flash')?.label).toBe('Model Flash');
		expect(getByokCompletionModelById('customendpoint/Group-1/model-flash')?.label).toBe('Model Flash');
		expect(getByokCompletionModelById('unknown-model')).toBeUndefined();
	});

	it('removes a group when its configuration is cleared', () => {
		updateByokCompletionModelConfig('customendpoint', 'Custom', {
			completionsUrl: 'https://custom.example.com/v1/completions',
			models: [
				{
					id: 'custom-model',
					name: 'Custom Model',
					url: 'https://custom.example.com/v1/chat/completions',
				},
			],
		});
		expect(getByokCompletionModels()).toHaveLength(1);

		updateByokCompletionModelConfig('customendpoint', 'Custom', undefined);
		expect(getByokCompletionModels()).toEqual([]);
	});

	it('reconciles groups per resolution pass (hot swap of chatLanguageModels.json)', () => {
		// Pass 1: two groups exist. The language models service calls the provider
		// once without a group before the per-group calls.
		updateByokCompletionModelConfig('customendpoint', undefined, undefined);
		updateByokCompletionModelConfig('customendpoint', 'A', {
			completionsUrl: 'https://a.example.com/v1/completions',
			models: [
				{
					id: 'a-model',
					name: 'Model A',
					url: 'https://a.example.com/v1/chat/completions',
				},
			],
		});
		updateByokCompletionModelConfig('customendpoint', 'B', {
			completionsUrl: 'https://b.example.com/v1/completions',
			models: [
				{
					id: 'b-model',
					name: 'Model B',
					url: 'https://b.example.com/v1/chat/completions',
				},
			],
		});
		expect(getByokCompletionModels()).toHaveLength(2);

		// Pass 2: group B was deleted from the file while the extension is running.
		// The pass-start call drops every stale group for the vendor; only the
		// groups that still exist are re-added.
		updateByokCompletionModelConfig('customendpoint', undefined, undefined);
		updateByokCompletionModelConfig('customendpoint', 'A', {
			completionsUrl: 'https://a.example.com/v1/completions',
			models: [
				{
					id: 'a-model',
					name: 'Model A',
					url: 'https://a.example.com/v1/chat/completions',
				},
			],
		});
		const models = getByokCompletionModels();
		expect(models).toHaveLength(1);
		expect(models[0].groupName).toBe('A');
		expect(getByokCompletionModelById('b-model')).toBeUndefined();
	});

	it('pass-start reconciliation only affects the given vendor', () => {
		updateByokCompletionModelConfig('customendpoint', 'A', {
			completionsUrl: 'https://a.example.com/v1/completions',
			models: [
				{
					id: 'a-model',
					name: 'Model A',
					url: 'https://a.example.com/v1/chat/completions',
				},
			],
		});
		updateByokCompletionModelConfig('customoai', 'B', {
			completionsUrl: 'https://b.example.com/v1/completions',
			models: [
				{
					id: 'b-model',
					name: 'Model B',
					url: 'https://b.example.com/v1/chat/completions',
				},
			],
		});
		expect(getByokCompletionModels()).toHaveLength(2);

		// A resolution pass for customendpoint alone must not drop customoai groups.
		updateByokCompletionModelConfig('customendpoint', undefined, undefined);
		updateByokCompletionModelConfig('customendpoint', 'A', {
			completionsUrl: 'https://a.example.com/v1/completions',
			models: [
				{
					id: 'a-model',
					name: 'Model A',
					url: 'https://a.example.com/v1/chat/completions',
				},
			],
		});

		const models = getByokCompletionModels();
		expect(models).toHaveLength(2);
		expect(models.some(m => m.vendor === 'customoai' && m.model === 'b-model')).toBe(true);
	});

	it('clears all models', () => {
		updateByokCompletionModelConfig('customendpoint', 'A', {
			completionsUrl: 'https://a.example.com/v1/completions',
			models: [
				{
					id: 'm',
					name: 'M',
					url: 'https://a.example.com/v1/chat/completions',
				},
			],
		});

		clearByokCompletionModelConfigs();
		expect(getByokCompletionModels()).toEqual([]);
	});
});
