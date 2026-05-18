/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { l10n, type LanguageModelChatInformation, type LanguageModelConfigurationSchema } from 'vscode';
import { BYOKKnownModels, BYOKModelCapabilities, byokKnownModelToAPIInfo } from '../common/byokProvider';

/**
 * Wraps {@link byokKnownModelToAPIInfo} and enriches the model entry with
 * a localized configurationSchema for the "Thinking Effort" picker when the
 * model's capabilities include `supportsReasoningEffort`.
 */
export function byokKnownModelToAPIInfoWithEffort(providerName: string, id: string, capabilities: BYOKModelCapabilities): LanguageModelChatInformation {
	const model = byokKnownModelToAPIInfo(providerName, id, capabilities);
	const effortLevels = capabilities.supportsReasoningEffort;
	if (!effortLevels || effortLevels.length === 0) {
		return model;
	}
	return {
		...model,
		...buildEffortConfigurationSchema(effortLevels, model.family),
	};
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

function buildEffortConfigurationSchema(effortLevels: readonly string[], family: string): { configurationSchema?: LanguageModelConfigurationSchema } {
	const lowerFamily = family.toLowerCase();
	const preferred = lowerFamily.startsWith('claude') ? 'high' : 'medium';
	const defaultEffort = effortLevels.includes(preferred) ? preferred : undefined;

	return {
		configurationSchema: {
			properties: {
				reasoningEffort: {
					type: 'string',
					title: l10n.t('Thinking Effort'),
					enum: effortLevels,
					enumItemLabels: effortLevels.map(level => level.charAt(0).toUpperCase() + level.slice(1)),
					enumDescriptions: effortLevels.map(level => {
						switch (level) {
							case 'none': return l10n.t('No reasoning applied');
							case 'minimal': return l10n.t('Minimal reasoning for fastest responses');
							case 'low': return l10n.t('Faster responses with less reasoning');
							case 'medium': return l10n.t('Balanced reasoning and speed');
							case 'high': return l10n.t('Maximum reasoning depth');
							case 'max': return l10n.t('Absolute maximum capability with no constraints');
							default: return level;
						}
					}),
					default: defaultEffort,
					group: 'navigation',
				}
			}
		}
	};
}
