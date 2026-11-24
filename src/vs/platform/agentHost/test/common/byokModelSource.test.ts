/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getByokEndpointsCredentialResource, getByokEndpointsNonce, getByokModelSourceId, parseByokModelSourceId, readByokEndpointsDefinition, type IByokEndpointsDefinition } from '../../common/byokModelSource.js';

suite('BYOK endpoints model source definition', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const model = { id: 'gpt-x', endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v1' } } as const;

	test('reads a valid definition back, and names its first endpoint as the credential resource', () => {
		const definition: IByokEndpointsDefinition = {
			models: [
				{ ...model, name: 'GPT X', toolCalling: true, maxInputTokens: 100, reasoningEfforts: ['low'], aliases: ['customendpoint/G/gpt-x'] },
				{ id: 'claude', endpoint: { type: 'anthropic', baseUrl: 'https://anthropic.example.test' } },
				{ id: 'azure', endpoint: { type: 'azure', wireApi: 'responses', baseUrl: 'https://res.openai.azure.com/openai', azureApiVersion: '2025-04-01-preview' } },
			],
			requiresCredential: true,
		};

		assert.deepStrictEqual({
			read: readByokEndpointsDefinition(definition),
			credentialResource: getByokEndpointsCredentialResource(definition),
			keyless: getByokEndpointsCredentialResource({ models: [model], requiresCredential: false }),
		}, {
			read: definition,
			credentialResource: { resource: 'https://api.example.test/v1' },
			keyless: undefined,
		});
	});

	test('rejects anything that could change where requests go or what they carry', () => {
		const invalid: Record<string, unknown> = {
			notAnObject: 'models',
			noModels: { models: [], requiresCredential: false },
			noCredentialDeclaration: { models: [model] },
			unknownDefinitionKey: { models: [model], requiresCredential: false, headers: {} },
			duplicateIds: { models: [model, model], requiresCredential: false },
			unknownModelKey: { models: [{ ...model, modelOptions: { temperature: 0 } }], requiresCredential: false },
			unknownEndpointKey: { models: [{ ...model, endpoint: { ...model.endpoint, headers: { 'x-api-key': 'k' } } }], requiresCredential: false },
			badTokenCount: { models: [{ ...model, maxInputTokens: -1 }], requiresCredential: false },
			unknownType: { models: [{ ...model, endpoint: { ...model.endpoint, type: 'gemini' } }], requiresCredential: false },
			anthropicWireApi: { models: [{ ...model, endpoint: { type: 'anthropic', wireApi: 'responses', baseUrl: 'https://a.test' } }], requiresCredential: false },
			openAiApiVersion: { models: [{ ...model, endpoint: { ...model.endpoint, azureApiVersion: '1' } }], requiresCredential: false },
			urlQuery: { models: [{ ...model, endpoint: { ...model.endpoint, baseUrl: 'https://api.example.test/v1?key=1' } }], requiresCredential: false },
			urlCredentials: { models: [{ ...model, endpoint: { ...model.endpoint, baseUrl: 'https://user:pass@api.example.test/v1' } }], requiresCredential: false },
			nonHttpUrl: { models: [{ ...model, endpoint: { ...model.endpoint, baseUrl: 'file:///etc/passwd' } }], requiresCredential: false },
			// The runtime authenticates a keyless Azure endpoint with the machine's Azure identity.
			keylessAzure: { models: [{ id: 'azure', endpoint: { type: 'azure', baseUrl: 'https://res.openai.azure.com/openai/v1' } }], requiresCredential: false },
		};
		const rejected = Object.entries(invalid).filter(([, definition]) => {
			try {
				readByokEndpointsDefinition(definition);
				return false;
			} catch {
				return true;
			}
		}).map(([name]) => name);

		assert.deepStrictEqual(rejected, Object.keys(invalid));
	});

	test('registration IDs come from the group\'s configuration, and the nonce from the definition', () => {
		const id = getByokModelSourceId('copilotcli', { vendor: 'customendpoint', group: 'My/Group' });
		const definition: IByokEndpointsDefinition = { models: [model], requiresCredential: true };
		const reordered = JSON.parse(`{"requiresCredential":true,"models":[{"endpoint":{"baseUrl":"https://api.example.test/v1","wireApi":"completions","type":"openai"},"id":"gpt-x"}]}`);

		assert.deepStrictEqual({
			id,
			parsed: parseByokModelSourceId(id),
			foreign: parseByokModelSourceId('example.com/source'),
			// Key order doesn't matter, so windows and devices compute the same nonce.
			sameNonce: getByokEndpointsNonce(reordered) === getByokEndpointsNonce(definition),
			changedNonce: getByokEndpointsNonce({ ...definition, requiresCredential: false }) === getByokEndpointsNonce(definition),
		}, {
			id: 'vscode.byok/copilotcli/customendpoint/My%2FGroup',
			parsed: { vendor: 'customendpoint', group: 'My/Group' },
			foreign: undefined,
			sameNonce: true,
			changedNonce: false,
		});
	});
});
