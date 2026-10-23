/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICustomizationHarnessService, type IHarnessDescriptor } from '../../customizationHarnessService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { Target } from '../promptTypes.js';

export interface IAgentFileModel {
	readonly id: string;
	readonly metadata: ILanguageModelChatMetadata;
	readonly harnessId: string;
}

export interface IAgentFileModelCatalogue {
	readonly models: readonly IAgentFileModel[];
	readonly isResolved: boolean;
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

export function resolveAgentFileModelIdentifier(authoredValue: string, models: readonly IAgentFileModel[]): IAgentFileModel | undefined {
	return resolveAgentFileModelIdentifiers(authoredValue, models)[0];
}

export function resolveAgentFileModelIdentifiers(authoredValue: string, models: readonly IAgentFileModel[]): readonly IAgentFileModel[] {
	const reference = parseAgentFileModelReference(authoredValue);
	if (reference.qualifier && reference.qualifier !== 'copilot' && reference.qualifier !== 'auto') {
		return [];
	}

	const exactMatches: IAgentFileModel[] = [];
	const aliasMatches: IAgentFileModel[] = [];
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

function isByokModel(model: IAgentFileModel): boolean {
	return model.metadata.isBYOK === true || model.metadata.byokModelIdentifier !== undefined;
}
