/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { registerIcon } from '../../../../../../../platform/theme/common/iconRegistry.js';
import { ILanguageModelChatMetadataAndIdentifier, isAutoLanguageModel } from '../../../../common/languageModels.js';
import { getCompactCodicon } from '../../../chatIcons.js';

const copilotModelProviderIcon = registerIcon('chat-model-provider-copilot', Codicon.copilotCompact, localize('chatModelProviderCopilotIcon', "Icon for Copilot models."));
const openAIModelProviderIcon = registerIcon('chat-model-provider-openai', Codicon.openai, localize('chatModelProviderOpenAIIcon', "Icon for OpenAI models."));
const claudeModelProviderIcon = registerIcon('chat-model-provider-claude', Codicon.claude, localize('chatModelProviderClaudeIcon', "Icon for Claude models."));
const geminiModelProviderIcon = registerIcon('chat-model-provider-gemini', Codicon.googleGemini, localize('chatModelProviderGeminiIcon', "Icon for Gemini models."));
const kimiModelProviderIcon = registerIcon('chat-model-provider-kimi', Codicon.kimi, localize('chatModelProviderKimiIcon', "Icon for Kimi models."));
const microsoftModelProviderIcon = registerIcon('chat-model-provider-microsoft', Codicon.microsoft, localize('chatModelProviderMicrosoftIcon', "Icon for Microsoft models."));
const xAIModelProviderIcon = registerIcon('chat-model-provider-xai', Codicon.xai, localize('chatModelProviderXAIIcon', "Icon for xAI models."));
const genericModelProviderIcon = registerIcon('chat-model-provider-generic', Codicon.sparkle, localize('chatModelProviderGenericIcon', "Icon for other model providers."));
const genericModelProviderCompactIcon = registerIcon('chat-model-provider-generic-compact', Codicon.sparkleCompact, localize('chatModelProviderGenericCompactIcon', "Compact icon for other model providers."));

/**
 * The provider icon matching a free-form identity string (vendor, family, model
 * or provider name). Falls back to a generic icon when nothing matches.
 */
export function getProviderIconForIdentity(identity: string, copilotIdentity: string = identity): ThemeIcon {
	const normalized = identity.toLowerCase();
	if (normalized.includes('grok') || normalized.includes('xai')) {
		return xAIModelProviderIcon;
	}
	if (normalized.includes('claude') || normalized.includes('anthropic')) {
		return claudeModelProviderIcon;
	}
	if (normalized.includes('gemini') || normalized.includes('google')) {
		return geminiModelProviderIcon;
	}
	if (normalized.includes('kimi') || normalized.includes('moonshot')) {
		return kimiModelProviderIcon;
	}
	if (normalized.includes('microsoft') || /\bmai\b/.test(normalized)) {
		return microsoftModelProviderIcon;
	}
	if (normalized.includes('openai') || normalized.includes('chatgpt') || normalized.includes('gpt') || normalized.includes('codex') || /\bo[134]\b/.test(normalized)) {
		return openAIModelProviderIcon;
	}
	// Checked last, so a more specific match always wins.
	if (copilotIdentity.toLowerCase().includes('copilot')) {
		return copilotModelProviderIcon;
	}
	return genericModelProviderIcon;
}

export function getModelProviderIcon(model: ILanguageModelChatMetadataAndIdentifier): ThemeIcon {
	const identity = `${model.metadata.vendor} ${model.metadata.family} ${model.metadata.id} ${model.metadata.name}`;
	if (/grok|xai/i.test(identity)) {
		return xAIModelProviderIcon;
	}
	if (model.metadata.isBYOK) {
		return genericModelProviderIcon;
	}
	if (isAutoLanguageModel(model)) {
		return copilotModelProviderIcon;
	}
	// The Copilot fallback reads the model's own name only: the vendor is `copilot` for
	// every first-party model, so including it would brand the whole catalogue.
	return getProviderIconForIdentity(identity, `${model.metadata.id} ${model.metadata.name}`);
}

export function getModelPickerIcon(model: ILanguageModelChatMetadataAndIdentifier): ThemeIcon {
	return model.metadata.statusIcon ?? getModelProviderIcon(model);
}

export function getCompactModelPickerIcon(model: ILanguageModelChatMetadataAndIdentifier): ThemeIcon {
	const icon = getModelPickerIcon(model);
	return icon.id === genericModelProviderIcon.id ? genericModelProviderCompactIcon : getCompactCodicon(icon);
}
