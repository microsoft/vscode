/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IProjectBoardCard } from '../../common/projectBoardModel.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { getProjectBoardConfigurationDetails } from '../../browser/projectBoardConfigurationDetails.js';
import { IProjectBoardInputConfiguration } from '../../browser/projectBoardMetadata.js';

suite('ProjectBoardConfigurationDetails', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const model: ILanguageModelChatMetadataAndIdentifier = {
		identifier: 'model-a',
		metadata: new class extends mock<ILanguageModelChatMetadata>() {
			override readonly id = 'a';
			override readonly name = 'Model A';
			override readonly maxInputTokens = 128000;
			override readonly configurationSchema: ILanguageModelChatMetadata['configurationSchema'] = { properties: {
				effort: { type: 'string', group: 'navigation', enum: ['low', 'high'], enumItemLabels: ['Low', 'High'], default: 'low' },
				context: { type: 'number', group: 'tokens', enum: [128000, 256000], enumItemLabels: ['128K', '256K'], default: 128000 },
			} };
		}(),
	};
	const card = new class extends mock<IProjectBoardCard>() {
		override readonly chat = new class extends mock<IChat>() {
			override readonly modelId = observableValue<string | undefined>('modelId', 'model-a');
			override readonly mode = observableValue('mode', { id: 'agent', kind: 'agent' });
		}();
		override readonly session = new class extends mock<ISession>() {
			override readonly sessionId = 'owner';
			override readonly sessionType = 'copilotcli';
		}();
	}();
	const input: IProjectBoardInputConfiguration = {
		selectedModel: model, modelConfiguration: { effort: 'high', context: 256000 },
		mode: { id: 'agent', kind: ChatModeKind.Agent },
	};
	const provider = new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly sessionTypes = [];
		override getModelsSnapshot(sessionId: string, desiredModelId?: string) {
			assert.strictEqual(sessionId, 'owner');
			assert.strictEqual(desiredModelId, 'model-a');
			return { models: [model], desiredModelResolution: { kind: 'available' as const, model }, modelTarget: 'agent-host-copilotcli' };
		}
		override getSessionConfig(sessionId: string) {
			assert.strictEqual(sessionId, 'owner');
			return {
				schema: { type: 'object' as const, properties: {
					mode: { title: 'Mode', type: 'string' as const, enum: ['interactive', 'autopilot'], enumLabels: ['Interactive', 'Autopilot'] },
					autoApprove: { title: 'Permissions', type: 'string' as const, enum: ['default', 'autoApprove'], enumLabels: ['Manual', 'Allow All'] },
				} },
				values: { mode: 'interactive', autoApprove: 'default' },
			};
		}
	}();

	test('PB-19 reads the represented chat model and schema labels with the owning session permissions', () => {
		const details = getProjectBoardConfigurationDetails(card, input, provider);
		assert.deepStrictEqual(details.model.map(field => `${field.label}: ${field.value}`), ['Model: Model A', 'Thinking: High', 'Context: 256K', 'Harness: copilotcli']);
		assert.deepStrictEqual(details.permissions.map(field => `${field.label}: ${field.value}`), ['Agent: agent', 'Mode: Interactive', 'Permissions: Manual']);
	});

	test('PB-19 missing input state does not invent configurable thinking or context defaults', () => {
		const details = getProjectBoardConfigurationDetails(card, undefined, provider);
		assert.strictEqual(details.model[1].value, 'Unavailable');
		assert.strictEqual(details.model[2].value, 'Unavailable');
		assert.strictEqual(details.permissions[2].value, 'Manual');
	});

	test('PB-19 another chat model configuration cannot supply this card settings', () => {
		const details = getProjectBoardConfigurationDetails(card, { ...input, selectedModel: { ...model, identifier: 'other-model' } }, provider);
		assert.strictEqual(details.model[0].value, 'Model A');
		assert.strictEqual(details.model[1].value, 'Unavailable');
		assert.strictEqual(details.model[2].value, 'Unavailable');
	});

	test('PB-19 absent providers remain explicit, without global configuration fallbacks', () => {
		const details = getProjectBoardConfigurationDetails(card, undefined, undefined);
		assert.strictEqual(details.model[0].value, 'model-a');
		assert.strictEqual(details.permissions[2].value, 'Unavailable');
	});
});
