/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelSource } from '../../common/agent.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, type IByokEndpointsDefinition } from '../../common/byokModelSource.js';
import { describeCopilotModelSource, getCopilotModelSourceModels } from '../../node/copilot/copilotModelSources.js';

suite('Copilot model sources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const definition: IByokEndpointsDefinition = {
		requiresCredential: true,
		models: [
			{ id: 'gpt-x', name: 'GPT X', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1' }, toolCalling: true, maxInputTokens: 100, reasoningEfforts: ['low', 'high'] },
			{ id: 'claude', endpoint: { type: 'anthropic', baseUrl: 'https://anthropic.example.test' }, vision: true },
			{ id: 'azure', endpoint: { type: 'azure', wireApi: 'responses', baseUrl: 'https://res.openai.azure.com/openai/v1' } },
		],
	};
	const source: IAgentModelSource = { id: 'vscode.byok/copilotcli/customendpoint/Example', format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, definition, credential: 'key-1' };

	test('maps each model to a runtime provider that calls its endpoint with the source\'s key', () => {
		const [gpt, claude] = getCopilotModelSourceModels(source);
		assert.deepStrictEqual({
			description: describeCopilotModelSource(source),
			gpt: { idIsSelectionId: gpt.id === `${gpt.runtimeProvider.name}/gpt-x`, servable: gpt.servable, provider: { ...gpt.runtimeProvider, name: undefined }, model: { ...gpt.runtimeModel, provider: undefined } },
			claude: { provider: { ...claude.runtimeProvider, name: undefined }, model: { ...claude.runtimeModel, provider: undefined } },
		}, {
			description: { credentialResource: { resource: 'https://models.example.test/v1' } },
			gpt: {
				idIsSelectionId: true,
				servable: true,
				provider: { name: undefined, type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1', apiKey: 'key-1' },
				// Vision is unknown, so it stays unset rather than `false`.
				model: { id: 'gpt-x', provider: undefined, modelId: 'gpt-x', name: 'GPT X', maxPromptTokens: 100, capabilities: { supports: { toolCalls: true, reasoningEffort: true } } },
			},
			claude: {
				provider: { name: undefined, type: 'anthropic', baseUrl: 'https://anthropic.example.test', apiKey: 'key-1' },
				model: { id: 'claude', provider: undefined, modelId: 'claude', capabilities: { supports: { vision: true } } },
			},
		});
	});

	test('a model whose source needs a key it doesn\'t have is not servable', () => {
		const keyless: IByokEndpointsDefinition = { requiresCredential: false, models: [definition.models[0]] };
		assert.deepStrictEqual({
			awaitingKey: getCopilotModelSourceModels({ ...source, credential: undefined }).map(model => ({ servable: model.servable, apiKey: model.runtimeProvider.apiKey })),
			keyless: getCopilotModelSourceModels({ ...source, definition: keyless, credential: undefined }).map(model => model.servable),
		}, {
			awaitingKey: [{ servable: false, apiKey: undefined }, { servable: false, apiKey: undefined }, { servable: false, apiKey: undefined }],
			keyless: [true],
		});
	});

	test('binds each model id to its registration, endpoint, and upstream model', () => {
		const ids = (candidate: IAgentModelSource) => getCopilotModelSourceModels(candidate).map(model => model.id);
		const original = ids(source);
		const moved: IByokEndpointsDefinition = { ...definition, models: [{ ...definition.models[0], endpoint: { ...definition.models[0].endpoint, baseUrl: 'https://moved.example.test/v1' } }, ...definition.models.slice(1)] };
		const renamed: IByokEndpointsDefinition = { ...definition, models: [{ ...definition.models[0], name: 'Renamed' }, ...definition.models.slice(1)] };
		assert.deepStrictEqual({
			newKey: ids({ ...source, credential: 'key-2' }),
			renamedModel: ids({ ...source, definition: renamed }),
			movedEndpoint: ids({ ...source, definition: moved }).map((id, index) => id === original[index]),
			otherRegistration: ids({ ...source, id: 'vscode.byok/copilotcli/customendpoint/Other' }).map((id, index) => id === original[index]),
		}, {
			newKey: original,
			renamedModel: original,
			movedEndpoint: [false, true, true],
			otherRegistration: [false, false, false],
		});
	});
});
