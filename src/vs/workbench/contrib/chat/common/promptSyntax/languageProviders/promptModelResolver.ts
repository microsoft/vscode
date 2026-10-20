/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICustomizationHarnessService } from '../../customizationHarnessService.js';
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
	const activeDescriptor = harnessService.getActiveDescriptor();
	const descriptors = activeDescriptor.customAgentTarget === target
		? [activeDescriptor]
		: harnessService.availableHarnesses.get().filter(descriptor => descriptor.customAgentTarget === target);
	const harnessIds = new Set(descriptors.map(descriptor => descriptor.id));
	const models = new Map<string, IAgentFileModel>();

	for (const identifier of languageModelsService.getLanguageModelIds()) {
		const metadata = languageModelsService.lookupLanguageModel(identifier);
		const harnessId = metadata?.targetChatSessionType;
		if (!metadata || !harnessId || !harnessIds.has(harnessId) || metadata.isUserSelectable === false || models.has(metadata.id)) {
			continue;
		}
		models.set(metadata.id, { id: metadata.id, metadata, harnessId });
	}

	return {
		models: Array.from(models.values()),
		isResolved: descriptors.length > 0 && descriptors.every(descriptor => languageModelsService.hasResolvedVendor(descriptor.id)),
	};
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
	const reference = parseAgentFileModelReference(authoredValue);
	if (reference.qualifier && reference.qualifier !== 'copilot' && reference.qualifier !== 'auto') {
		return undefined;
	}

	const byId = new Map<string, IAgentFileModel>();
	const byDisplayName = new Map<string, IAgentFileModel>();
	for (const model of models) {
		if (!byId.has(model.id)) {
			byId.set(model.id, model);
		}
		const displayName = model.metadata.name.toLowerCase();
		if (!byDisplayName.has(displayName)) {
			byDisplayName.set(displayName, model);
		}
	}
	const model = byId.get(reference.identifier) ?? byDisplayName.get(reference.identifier);
	if (!model) {
		return undefined;
	}

	const isAlias = reference.qualifier !== undefined || reference.identifier !== model.id;
	return isAlias && model.metadata.isBYOK ? undefined : model;
}

interface IAgentFileModelReference {
	readonly identifier: string;
	readonly qualifier?: string;
}

function parseAgentFileModelReference(authoredValue: string): IAgentFileModelReference {
	const colonIndex = authoredValue.lastIndexOf(':');
	const model = colonIndex !== -1 && authoredValue.substring(colonIndex + 1).includes('=')
		? authoredValue.substring(0, colonIndex)
		: authoredValue;
	const normalized = model.trim().toLowerCase();
	const qualified = /^(?<identifier>.+?)\s*\((?<qualifier>[^)]+)\)\s*$/.exec(normalized);
	return {
		identifier: qualified?.groups?.identifier ?? normalized,
		qualifier: qualified?.groups?.qualifier,
	};
}
