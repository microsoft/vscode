/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { getCompactModelPickerIcon, getModelPickerIcon, getModelProviderIcon } from '../../../../../browser/widget/input/modelPicker/modelProviderIcons.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService, LanguageModelProviderIcon } from '../../../../../common/languageModels.js';

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

function createLanguageModelsService(vendors: readonly Partial<ILanguageModelProviderDescriptor>[] = [], models: readonly ILanguageModelChatMetadataAndIdentifier[] = []): ILanguageModelsService {
	return upcastPartial<ILanguageModelsService>({
		getVendors: () => vendors.map(vendor => upcastPartial<ILanguageModelProviderDescriptor>(vendor)),
		lookupLanguageModel: identifier => models.find(model => model.identifier === identifier)?.metadata,
	});
}

suite('ModelProviderIcons', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const noVendors = createLanguageModelsService();

	test('uses provider-specific icons', () => {
		assert.deepStrictEqual([
			getModelProviderIcon(createModel('gpt-5.6-terra', 'GPT-5.6 Terra')).id,
			getModelProviderIcon(createModel('claude-sonnet-5', 'Claude Sonnet 5')).id,
			getModelProviderIcon(createModel('gemini-3.1-pro', 'Gemini 3.1 Pro')).id,
			getModelProviderIcon(createModel('kimi-k2.5', 'Kimi K2.5')).id,
			getModelProviderIcon(createModel('grok-4.5', 'Grok 4.5')).id,
			getModelProviderIcon(createModel('grok-code-fast-1', 'Grok Code Fast 1', 'agent-host-copilot')).id,
			getModelProviderIcon(createModel('grok-4', 'Grok 4', 'xai', { isBYOK: true })).id,
			getModelProviderIcon(createModel('mai-ds-r1', 'MAI-DS-R1')).id,
			getModelProviderIcon(createModel('deepseek-v4-pro', 'DeepSeek V4 Pro')).id,
			getModelProviderIcon(createModel('auto', 'Auto')).id,
			getModelProviderIcon(createModel('auto', 'Auto', 'anthropic')).id,
			getModelProviderIcon(createModel('hydrafusion', 'HydraFusion', 'agent-host-copilot', { modelGroup: { id: 'copilotcli' } })).id,
			getModelProviderIcon(createModel('custom', 'Custom Model', 'third-party')).id,
			getModelProviderIcon(createModel('claude-sonnet-5', 'Claude Sonnet 5', 'anthropic', { isBYOK: true })).id,
			getModelProviderIcon(createModel('gemini-3.1-pro', 'Gemini 3.1 Pro', 'google', { isBYOK: true })).id,
			getModelProviderIcon(createModel('auto', 'Auto', 'openai', { isBYOK: true })).id,
		], [
			'chat-model-provider-openai',
			'chat-model-provider-claude',
			'chat-model-provider-gemini',
			'chat-model-provider-kimi',
			'chat-model-provider-xai',
			'chat-model-provider-xai',
			'chat-model-provider-xai',
			'chat-model-provider-microsoft',
			'chat-model-provider-generic',
			'chat-model-provider-copilot',
			'chat-model-provider-copilot',
			'chat-model-provider-copilot',
			'chat-model-provider-generic',
			'chat-model-provider-generic',
			'chat-model-provider-generic',
			'chat-model-provider-generic',
		]);
	});

	test('status icon wins, warning and info text keep the provider icon', () => {
		const model = createModel('gpt-5.6-terra', 'GPT-5.6 Terra');
		const modelWithStatusIcon = { ...model, metadata: { ...model.metadata, statusIcon: Codicon.info } };
		const modelWithWarningText = { ...model, metadata: { ...model.metadata, warningText: { degradation: 'Degraded' } } };
		const modelWithInfoText = { ...model, metadata: { ...model.metadata, infoText: { model_relocated: 'Now served from a new region.' } } };

		assert.deepStrictEqual([
			getModelPickerIcon(modelWithStatusIcon, noVendors),
			getModelPickerIcon(modelWithWarningText, noVendors),
			getModelPickerIcon(modelWithInfoText, noVendors),
		].map(icon => ThemeIcon.isThemeIcon(icon) && icon.id), [
			Codicon.info.id,
			getModelProviderIcon(model).id,
			getModelProviderIcon(model).id,
		]);
	});

	test('a declared icon comes first, then a recognised one, then the provider\'s', () => {
		const image = (name: string) => ({ light: URI.file(`/${name}-light.svg`), dark: URI.file(`/${name}-dark.svg`) });
		const service = createLanguageModelsService([
			{ vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true, icon: Codicon.copilot },
			{ vendor: 'openrouter', displayName: 'OpenRouter', isDefault: false, icon: image('openrouter') },
		], [
			createModel('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'openrouter', { isBYOK: true, icon: ThemeIcon.fromId('chat-model-provider-claude') }),
			createModel('amazon/nova-micro', 'Nova Micro', 'openrouter', { isBYOK: true }),
		]);
		// An agent host relays an extension's models under its own vendor, pointing back at the original.
		const relayed = (original: string) => createModel(original, original, 'agent-host-copilotcli', { isBYOK: true, byokModelIdentifier: `openrouter-${original}`, modelGroup: { id: 'openrouter' } });
		const describe = (icon: LanguageModelProviderIcon) => ThemeIcon.isThemeIcon(icon) ? icon.id : icon.light.path;

		assert.deepStrictEqual({
			declaredThemeIcon: describe(getModelPickerIcon(createModel('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'openrouter', { isBYOK: true, icon: ThemeIcon.fromId('chat-model-provider-claude') }), service)),
			declaredImage: describe(getModelPickerIcon(createModel('acme-1', 'Acme 1', 'openrouter', { isBYOK: true, icon: image('acme') }), service)),
			statusIconStillWins: describe(getModelPickerIcon(createModel('acme-1', 'Acme 1', 'openrouter', { isBYOK: true, icon: image('acme'), statusIcon: Codicon.warning }), service)),
			relayedDeclared: describe(getModelPickerIcon(relayed('anthropic/claude-sonnet-5'), service)),
			relayedUndeclared: describe(getModelPickerIcon(relayed('amazon/nova-micro'), service)),
			providerIcon: describe(getModelPickerIcon(createModel('amazon/nova-micro', 'Nova Micro', 'openrouter', { isBYOK: true }), service)),
			// A built-in provider's icon is for its tab: its models keep their own brands.
			recognisedOverProvider: describe(getModelPickerIcon(createModel('claude-sonnet-5', 'Claude Sonnet 5'), service)),
			nothingDeclared: describe(getModelPickerIcon(createModel('custom', 'Custom Model', 'third-party', { isBYOK: true }), service)),
			compactImage: describe(getCompactModelPickerIcon(createModel('acme-1', 'Acme 1', 'openrouter', { isBYOK: true, icon: image('acme') }), service)),
		}, {
			declaredThemeIcon: 'chat-model-provider-claude',
			declaredImage: '/acme-light.svg',
			statusIconStillWins: Codicon.warning.id,
			relayedDeclared: 'chat-model-provider-claude',
			relayedUndeclared: '/openrouter-light.svg',
			providerIcon: '/openrouter-light.svg',
			recognisedOverProvider: 'chat-model-provider-claude',
			nothingDeclared: 'chat-model-provider-generic',
			compactImage: '/acme-light.svg',
		});
	});

	test('uses compact variants in the picker trigger', () => {
		const genericModel = createModel('custom', 'Custom Model', 'third-party');
		const modelWithWarning = createModel('custom', 'Custom Model', 'third-party', { statusIcon: Codicon.warning });
		const modelWithInfo = createModel('custom', 'Custom Model', 'third-party', { statusIcon: Codicon.info });

		assert.deepStrictEqual([
			getCompactModelPickerIcon(genericModel, noVendors),
			getCompactModelPickerIcon(modelWithWarning, noVendors),
			getCompactModelPickerIcon(modelWithInfo, noVendors),
		].map(icon => ThemeIcon.isThemeIcon(icon) && icon.id), [
			'chat-model-provider-generic-compact',
			Codicon.warningCompact.id,
			Codicon.info.id,
		]);
	});
});
