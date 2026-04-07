/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { l10n, type LanguageModelChatInformation, type LanguageModelConfigurationSchema } from 'vscode';
import { BYOKKnownModels, byokKnownModelsToAPIInfo } from '../common/byokProvider';

/**
 * Wraps {@link byokKnownModelsToAPIInfo} and enriches each model entry with
 * a localized configurationSchema for the "Thinking Effort" picker when the
 * model's capabilities include `supportsReasoningEffort`.
 */
export function byokKnownModelsToAPIInfoWithEffort(providerName: string, knownModels: BYOKKnownModels | undefined): LanguageModelChatInformation[] {
	const models = byokKnownModelsToAPIInfo(providerName, knownModels);
	if (!knownModels) {
		return models;
	}

	return models.map(model => {
		const capabilities = knownModels[model.id];
		const effortLevels = capabilities?.supportsReasoningEffort;
		if (!effortLevels || effortLevels.length === 0) {
			return model;
		}
		return {
			...model,
			...buildEffortConfigurationSchema(effortLevels, model.family),
		};
	});
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
