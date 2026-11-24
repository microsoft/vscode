/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelSource } from '../../common/agent.js';
import { CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT, type CustomEndpointModelSourceDefinition } from '../../common/byokCustomEndpoint.js';
import { describeCopilotModelSource, getCopilotModelSourceModels } from '../../node/copilot/copilotModelSources.js';

suite('Copilot model sources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const definition: CustomEndpointModelSourceDefinition = {
		requiresApiKey: true,
		models: [
			{ id: 'gpt-x', name: 'GPT X', url: 'https://models.example.test/v1/chat/completions', toolCalling: true, maxInputTokens: 100, reasoningEfforts: ['low', 'high'] },
			{ id: 'claude', url: 'https://anthropic.example.test/v1/messages', vision: true },
		],
	};
	const source: IAgentModelSource = { id: 'vscode.customendpoint/copilotcli/Example', format: CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT, definition, credential: 'key-1' };

	test('maps each model to a runtime provider that calls its endpoint with the source\'s key', () => {
		const [gpt, claude] = getCopilotModelSourceModels(source);
		assert.deepStrictEqual({
			description: describeCopilotModelSource(source),
			gpt: { idIsSelectionId: gpt.id === `${gpt.runtimeProvider.name}/gpt-x`, provider: { ...gpt.runtimeProvider, name: undefined }, model: { ...gpt.runtimeModel, provider: undefined } },
			claude: { provider: { ...claude.runtimeProvider, name: undefined }, model: { ...claude.runtimeModel, provider: undefined } },
			withoutCredential: getCopilotModelSourceModels({ ...source, credential: undefined }).map(model => model.runtimeProvider.apiKey),
		}, {
			description: { credentialResource: { resource: 'https://models.example.test/v1/chat/completions' } },
			gpt: {
				idIsSelectionId: true,
				provider: { name: undefined, type: 'openai', wireApi: 'completions', baseUrl: 'https://models.example.test/v1', apiKey: 'key-1' },
				// Vision is unknown, so it stays unset rather than `false`.
				model: { id: 'gpt-x', provider: undefined, modelId: 'gpt-x', name: 'GPT X', maxPromptTokens: 100, capabilities: { supports: { toolCalls: true, reasoningEffort: true } } },
			},
			claude: {
				provider: { name: undefined, type: 'anthropic', baseUrl: 'https://anthropic.example.test', apiKey: 'key-1' },
				model: { id: 'claude', provider: undefined, modelId: 'claude', capabilities: { supports: { vision: true } } },
			},
			withoutCredential: [undefined, undefined],
		});
	});

	test('binds each model id to its registration, endpoint, and upstream model', () => {
		const ids = (candidate: IAgentModelSource) => getCopilotModelSourceModels(candidate).map(model => model.id);
		const original = ids(source);
		const moved: CustomEndpointModelSourceDefinition = { ...definition, models: [{ ...definition.models[0], url: 'https://moved.example.test/v1/chat/completions' }, definition.models[1]] };
		const renamed: CustomEndpointModelSourceDefinition = { ...definition, models: [{ ...definition.models[0], name: 'Renamed' }, definition.models[1]] };
		assert.deepStrictEqual({
			newKey: ids({ ...source, credential: 'key-2' }),
			renamedModel: ids({ ...source, definition: renamed }),
			movedEndpoint: ids({ ...source, definition: moved }).map((id, index) => id === original[index]),
			otherRegistration: ids({ ...source, id: 'vscode.customendpoint/copilotcli/Other' }).map((id, index) => id === original[index]),
		}, {
			newKey: original,
			renamedModel: original,
			movedEndpoint: [false, true],
			otherRegistration: [false, false],
		});
	});
});
