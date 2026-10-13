/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { IAgentMetadataSource } from '../metadata.js';

const imageModelsMetaKey = 'vscode.imageModels';

/** Image-service catalog entries, never conversation-model selections. */
export interface IImageToolModel {
	readonly id: string;
	readonly name: string;
	readonly supportedOperations: readonly ('generate' | 'edit')[];
	readonly isDefault: boolean;
	readonly availability?: 'available' | 'unavailable';
	/** Text-token prices are not image-token rates or an estimated per-image cost. */
	readonly pricing?: {
		readonly batchSize: number;
		readonly textInputPrice?: number;
		readonly textOutputPrice?: number;
	};
}

function parseImageModelPricing(value: unknown): IImageToolModel['pricing'] {
	if (!isObject(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.batchSize !== 'number' || !Number.isSafeInteger(raw.batchSize) || raw.batchSize <= 0) {
		return undefined;
	}
	const batchSize = raw.batchSize;
	const price = (input: unknown): number | undefined => typeof input === 'number' && Number.isFinite(input)
		&& input >= 0 && Number.isFinite(input / batchSize * 1_000_000) ? input : undefined;
	const textInputPrice = price(raw.textInputPrice);
	const textOutputPrice = price(raw.textOutputPrice);
	return textInputPrice === undefined && textOutputPrice === undefined ? undefined : {
		batchSize,
		...(textInputPrice !== undefined ? { textInputPrice } : {}),
		...(textOutputPrice !== undefined ? { textOutputPrice } : {}),
	};
}

function parseImageModels(value: unknown): readonly IImageToolModel[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const models = new Map<string, IImageToolModel>();
	const entries: readonly unknown[] = value;
	for (const value of entries) {
		if (!isObject(value)) {
			continue;
		}
		const entry = value as Record<string, unknown>;
		if (typeof entry.id !== 'string' || !entry.id.trim()
			|| typeof entry.name !== 'string' || !entry.name.trim()
			|| !Array.isArray(entry.supportedOperations)
			|| typeof entry.isDefault !== 'boolean') {
			continue;
		}
		const operations: readonly unknown[] = entry.supportedOperations;
		const supportedOperations = operations.filter((operation): operation is 'generate' | 'edit' => operation === 'generate' || operation === 'edit');
		const availability = entry.availability === 'available' || entry.availability === 'unavailable' ? entry.availability : undefined;
		if (entry.availability !== undefined && availability === undefined) {
			continue;
		}
		if ((supportedOperations.length || availability === 'unavailable') && !models.has(entry.id)) {
			const pricing = parseImageModelPricing(entry.pricing);
			models.set(entry.id, {
				id: entry.id,
				name: entry.name,
				supportedOperations: [...new Set(supportedOperations)],
				isDefault: entry.isDefault,
				...(availability ? { availability } : {}),
				...(pricing ? { pricing } : {}),
			});
		}
	}
	return [...models.values()];
}

/** Reads an additive runtime field without requiring a newer SDK or assuming an older runtime supplies it. */
export function readCopilotImageModels(result: unknown): readonly IImageToolModel[] | undefined {
	return isObject(result)
		? parseImageModels((result as Record<string, unknown>).imageModels)
		: undefined;
}

export function readAgentImageModels(model: IAgentMetadataSource): readonly IImageToolModel[] | undefined {
	return parseImageModels(model._meta?.[imageModelsMetaKey]);
}

/** Carries the provider's auxiliary catalog without adding image models to AHP's chat-model list. */
export function withAgentImageModels(meta: Record<string, unknown> | undefined, models: readonly IImageToolModel[] | undefined): Record<string, unknown> | undefined {
	return models === undefined ? meta : { ...meta, [imageModelsMetaKey]: models };
}
