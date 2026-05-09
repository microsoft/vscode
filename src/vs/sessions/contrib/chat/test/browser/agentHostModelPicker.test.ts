/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import type { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { agentHostModelPickerStorageKey, resolveAgentHostModel } from '../../browser/agentHost/agentHostModelPicker.js';

function makeModel(identifier: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: {
			extension: new ExtensionIdentifier('test.ext'),
			id: identifier,
			name: identifier,
			vendor: 'copilot',
			version: '1.0',
			family: 'copilot',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			isUserSelectable: true,
			modelPickerCategory: undefined,
			targetChatSessionType: 'agent-host-copilotcli',
		},
	};
}

suite('AgentHostModelPicker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses resource-scheme-scoped storage keys', () => {
		assert.strictEqual(
			agentHostModelPickerStorageKey('agent-host-copilotcli'),
			'workbench.agentsession.agentHostModelPicker.agent-host-copilotcli.selectedModelId',
		);
		assert.strictEqual(
			agentHostModelPickerStorageKey('remote-localhost__4321-copilotcli'),
			'workbench.agentsession.agentHostModelPicker.remote-localhost__4321-copilotcli.selectedModelId',
		);
	});

	test('uses the current session model from session state', () => {
		const models = [
			makeModel('agent-host-copilotcli:other'),
			makeModel('agent-host-copilotcli:session'),
		];

		assert.strictEqual(
			resolveAgentHostModel(models, 'agent-host-copilotcli:session', 'agent-host-copilotcli:other'),
			models[1],
		);
	});

	test('does not synthesize a model for existing sessions without one in state', () => {
		const models = [
			makeModel('agent-host-copilotcli:first'),
		];

		assert.strictEqual(resolveAgentHostModel(models, undefined, undefined), undefined);
	});

	test('uses the stored model for new untitled sessions with no model yet', () => {
		const models = [
			makeModel('agent-host-copilotcli:first'),
			makeModel('agent-host-copilotcli:stored'),
		];

		assert.strictEqual(resolveAgentHostModel(models, undefined, 'agent-host-copilotcli:stored'), models[1]);
	});

	test('does not fall back to the first model for new untitled sessions without stored state', () => {
		const models = [
			makeModel('agent-host-copilotcli:first'),
		];

		assert.strictEqual(resolveAgentHostModel(models, undefined, undefined), undefined);
	});
});
