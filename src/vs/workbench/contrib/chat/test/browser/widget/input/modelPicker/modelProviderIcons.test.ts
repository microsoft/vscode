/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { getModelPickerIcon, getModelProviderIcon } from '../../../../../browser/widget/input/modelPicker/modelProviderIcons.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function createModel(id: string, name: string, vendor = 'copilot', metadata?: Partial<ILanguageModelChatMetadata>): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${vendor}-${id}`,
		metadata: {
			id,
			name,
			vendor,
			version: id,
			family: vendor,
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			...metadata,
		} as ILanguageModelChatMetadata,
	};
}

suite('ModelProviderIcons', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses provider-specific icons', () => {
		assert.deepStrictEqual([
			getModelProviderIcon(createModel('gpt-5.6-terra', 'GPT-5.6 Terra')).id,
			getModelProviderIcon(createModel('claude-sonnet-5', 'Claude Sonnet 5')).id,
			getModelProviderIcon(createModel('gemini-3.1-pro', 'Gemini 3.1 Pro')).id,
			getModelProviderIcon(createModel('kimi-k2.5', 'Kimi K2.5')).id,
			getModelProviderIcon(createModel('mai-ds-r1', 'MAI-DS-R1')).id,
			getModelProviderIcon(createModel('auto', 'Auto')).id,
			getModelProviderIcon(createModel('auto', 'Auto', 'anthropic')).id,
			getModelProviderIcon(createModel('custom', 'Custom Model', 'third-party')).id,
			getModelProviderIcon(createModel('claude-sonnet-5', 'Claude Sonnet 5', 'anthropic', { isBYOK: true })).id,
			getModelProviderIcon(createModel('gemini-3.1-pro', 'Gemini 3.1 Pro', 'google', { isBYOK: true })).id,
			getModelProviderIcon(createModel('auto', 'Auto', 'openai', { isBYOK: true })).id,
		], [
			'chat-model-provider-openai',
			'chat-model-provider-claude',
			'chat-model-provider-gemini',
			'chat-model-provider-kimi',
			'chat-model-provider-microsoft',
			'chat-model-provider-copilot',
			'chat-model-provider-copilot',
			'chat-model-provider-generic',
			'chat-model-provider-generic',
			'chat-model-provider-generic',
			'chat-model-provider-generic',
		]);
	});

	test('status icon wins, warning text keeps provider icon', () => {
		const model = createModel('gpt-5.6-terra', 'GPT-5.6 Terra');
		const modelWithStatusIcon = { ...model, metadata: { ...model.metadata, statusIcon: Codicon.info } };
		const modelWithWarningText = { ...model, metadata: { ...model.metadata, warningText: { degradation: 'Degraded' } } };

		assert.deepStrictEqual([
			getModelPickerIcon(modelWithStatusIcon).id,
			getModelPickerIcon(modelWithWarningText).id,
		], [
			Codicon.info.id,
			getModelProviderIcon(model).id,
		]);
	});
});
