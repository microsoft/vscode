/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { type LanguageModelChatInformation, type LanguageModelConfigurationSchema } from 'vscode';
import { BYOKKnownModels, BYOKModelCapabilities, byokKnownModelToAPIInfo, resolveBYOKThinkingOptions } from '../common/byokProvider';
import { buildReasoningEffortSchemaProperty } from '../../conversation/common/languageModelAccess';

/**
 * Wraps {@link byokKnownModelToAPIInfo} and enriches the model entry with
 * a localized configurationSchema for the "Thinking Effort" picker when the
 * model's capabilities include `supportsReasoningEffort`.
 */
export function byokKnownModelToAPIInfoWithEffort(providerName: string, id: string, capabilities: BYOKModelCapabilities): LanguageModelChatInformation {
	const model = byokKnownModelToAPIInfo(providerName, id, capabilities);
	const resolved = resolveBYOKThinkingOptions(capabilities, model.family, {});
	const properties: NonNullable<LanguageModelConfigurationSchema['properties']> = {};
	const effortLevels = capabilities.supportsReasoningEffort;
	if (effortLevels?.length) {
		properties.reasoningEffort = buildReasoningEffortSchemaProperty(effortLevels, model.family, resolved.reasoningEffort);
	}
	if (resolved.enableThinking && (capabilities.supportsThinkingDisable ?? (!!capabilities.thinkingToggle || !!effortLevels?.includes('none')))) {
		properties.enableThinking = { type: 'boolean', title: l10n.t('Enable Thinking'), default: true, group: 'navigation' };
	}
	return Object.keys(properties).length ? { ...model, configurationSchema: { properties } } : model;
}

/**
 * Like {@link byokKnownModelToAPIInfoWithEffort} but for a map of known models.
 */
export function byokKnownModelsToAPIInfoWithEffort(providerName: string, knownModels: BYOKKnownModels | undefined): LanguageModelChatInformation[] {
	if (!knownModels) {
		return [];
	}
	return Object.entries(knownModels).map(([id, capabilities]) => byokKnownModelToAPIInfoWithEffort(providerName, id, capabilities));
}
