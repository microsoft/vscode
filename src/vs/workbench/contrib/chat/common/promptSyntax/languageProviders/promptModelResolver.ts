/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICustomizationHarnessService, type IHarnessDescriptor } from '../../customizationHarnessService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../languageModels.js';
import { Target } from '../promptTypes.js';
import { localize } from '../../../../../../nls.js';

export interface IAgentModelPreferences {
	readonly models: readonly string[];
	readonly required: boolean;
}

/** Resolves every authored alternative against this chat's model pool. */
export function resolveAgentModelPreferences(preferences: readonly string[], models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier[] {
	const catalogue = models.map(model => ({ id: model.metadata.id, metadata: model.metadata }));
	const matches = new Set(preferences.flatMap(preference => {
		const resolved = resolveAgentFileModelIdentifiers(preference, catalogue);
		return resolved.length ? resolved.map(model => model.metadata)
			: models.filter(model => model.metadata.vendor !== 'copilot' && ILanguageModelChatMetadata.matchesQualifiedName(preference, model.metadata)).map(model => model.metadata);
	}));
	return models.filter(model => matches.has(model.metadata));
}

export function getAgentModelPolicyError(preferences: IAgentModelPreferences | undefined, modelId: string | undefined, models: readonly ILanguageModelChatMetadataAndIdentifier[]): string | undefined {
	if (!preferences?.required || preferences.models.length === 0) {
		return undefined;
	}
	const allowed = resolveAgentModelPreferences(preferences.models, models);
	if (allowed.length === 0) {
		return localize('agent.requiredModelsUnavailable', "No model required by the selected agent is currently available. Wait for models to load or select a different agent.");
	}
	if (!allowed.some(model => model.identifier === modelId)) {
		return localize('agent.requiredModelNotSelected', "Select one of the models required by the selected agent before sending.");
	}
	return undefined;
}

export interface IAgentFileModel {
	readonly id: string;
	readonly metadata: ILanguageModelChatMetadata;
	readonly harnessId: string;
}

export interface IAgentFileModelCatalogue {
	readonly models: readonly IAgentFileModel[];
	readonly isResolved: boolean;
}

/** Resolves authored preferences against the current input's pool, preserving their order. */
export function resolveAgentModelPreference(preferences: readonly string[], models: readonly ILanguageModelChatMetadataAndIdentifier[]): ILanguageModelChatMetadataAndIdentifier | undefined {
	const catalogue = models.map(model => ({ id: model.metadata.id, metadata: model.metadata }));
	for (const preference of preferences) {
		const resolved = resolveAgentFileModelIdentifier(preference, catalogue);
		const model = (resolved && models.find(model => model.metadata === resolved.metadata))
			?? models.find(model => model.metadata.vendor !== 'copilot' && ILanguageModelChatMetadata.matchesQualifiedName(preference, model.metadata));
		if (model) {
			return model;
		}
	}
	return undefined;
}

/** Uses the provider's configuration key and only offers reasoning values the model supports. */
export function resolveAgentReasoningEffort(effort: string | undefined, metadata: ILanguageModelChatMetadata): Record<string, string> | undefined {
	if (effort) {
		for (const key of ['reasoningEffort', 'thinkingLevel']) {
			const property = metadata.configurationSchema?.properties?.[key];
			if (!property?.readOnly && property?.enum?.includes(effort)) {
				return { [key]: effort };
			}
		}
	}
	return undefined;
}

export function resolveAgentFileModels(
	target: Target,
	harnessService: ICustomizationHarnessService,
	languageModelsService: ILanguageModelsService,
): IAgentFileModelCatalogue {
	const descriptors = resolveMatchingAgentFileHarnesses(target, harnessService);
	const harnessIds = new Set(descriptors.map(descriptor => descriptor.id));
	const models: IAgentFileModel[] = [];

	for (const identifier of languageModelsService.getLanguageModelIds()) {
		const metadata = languageModelsService.lookupLanguageModel(identifier);
		const harnessId = metadata?.targetChatSessionType;
		if (!metadata || !harnessId || !harnessIds.has(harnessId) || metadata.isUserSelectable === false) {
			continue;
		}

		models.push({ id: metadata.id, metadata, harnessId });
	}

	return {
		models,
		isResolved: descriptors.length > 0 && descriptors.every(descriptor => descriptor.modelCatalogueStatus?.get() === 'ready'),
	};
}

export function resolveMatchingAgentFileHarnesses(target: Target, harnessService: ICustomizationHarnessService): readonly IHarnessDescriptor[] {
	const activeDescriptor = harnessService.getActiveDescriptor();
	return activeDescriptor.customAgentTarget === target
		? [activeDescriptor]
		: harnessService.availableHarnesses.get().filter(descriptor => descriptor.customAgentTarget === target);
}

export function getAgentFileModelReasoningEfforts(model: IAgentFileModel): readonly string[] {
	const schema = model.metadata.configurationSchema?.properties;
	for (const key of ['reasoningEffort', 'thinkingLevel']) {
		const values = schema?.[key]?.enum;
		if (values) {
			return values.filter((value): value is string => typeof value === 'string');
		}
	}
	return [];
}

export function resolveAgentFileModelIdentifier<T extends Pick<IAgentFileModel, 'id' | 'metadata'>>(authoredValue: string, models: readonly T[]): T | undefined {
	return resolveAgentFileModelIdentifiers(authoredValue, models)[0];
}

export function resolveAgentFileModelIdentifiers<T extends Pick<IAgentFileModel, 'id' | 'metadata'>>(authoredValue: string, models: readonly T[]): readonly T[] {
	const reference = parseAgentFileModelReference(authoredValue);
	if (reference.qualifier && reference.qualifier !== 'copilot' && reference.qualifier !== 'auto') {
		return [];
	}

	const exactMatches: T[] = [];
	const aliasMatches: T[] = [];
	for (const model of models) {
		if (!reference.qualifier && (model.id === reference.identifier || model.id === reference.normalizedIdentifier)) {
			exactMatches.push(model);
		}
		if (model.id === reference.normalizedIdentifier || model.metadata.name.toLowerCase() === reference.normalizedIdentifier) {
			aliasMatches.push(model);
		}
	}
	if (exactMatches.length > 0) {
		return exactMatches;
	}

	return aliasMatches.filter(model => !isByokModel(model));
}

interface IAgentFileModelReference {
	readonly identifier: string;
	readonly normalizedIdentifier: string;
	readonly qualifier?: string;
}

function parseAgentFileModelReference(authoredValue: string): IAgentFileModelReference {
	const colonIndex = authoredValue.lastIndexOf(':');
	const model = colonIndex !== -1 && authoredValue.substring(colonIndex + 1).includes('=')
		? authoredValue.substring(0, colonIndex)
		: authoredValue;
	const trimmed = model.trim();
	const qualified = /^(?<identifier>.+?)\s*\((?<qualifier>[^)]+)\)\s*$/.exec(trimmed);
	const identifier = qualified?.groups?.identifier?.trim() ?? trimmed;
	return {
		identifier,
		normalizedIdentifier: identifier.toLowerCase(),
		qualifier: qualified?.groups?.qualifier?.toLowerCase(),
	};
}

function isByokModel(model: Pick<IAgentFileModel, 'metadata'>): boolean {
	return model.metadata.isBYOK === true || model.metadata.byokModelIdentifier !== undefined;
}
