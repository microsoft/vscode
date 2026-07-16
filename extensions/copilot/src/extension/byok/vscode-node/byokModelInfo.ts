/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { type LanguageModelChatInformation } from 'vscode';
import { BYOKKnownModels, BYOKModelCapabilities, byokKnownModelToAPIInfo } from '../common/byokProvider';
import { buildReasoningEffortSchemaProperty } from '../../conversation/common/languageModelAccess';

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
		configurationSchema: {
			properties: {
				reasoningEffort: buildReasoningEffortSchemaProperty(effortLevels, model.family),
			},
		},
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

