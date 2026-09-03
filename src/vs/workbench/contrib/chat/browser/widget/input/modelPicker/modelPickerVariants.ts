/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';

/**
 * The suffix the provider adds to a model id to name its faster twin, e.g.
 * `example-2.5` and `example-2.5-fast`.
 */
const FAST_VARIANT_SUFFIX = '-fast';

/** A model and the faster twin of it that the provider also offers. */
export interface IModelSpeedVariants {
	readonly standard: ILanguageModelChatMetadataAndIdentifier;
	readonly fast: ILanguageModelChatMetadataAndIdentifier;
}

/**
 * Pairs each model with its faster twin, keyed by both of their identifiers.
 *
 * The pairing reads model ids rather than display names: the id is the provider's own
 * identifier, while the name states the difference differently from model to model.
 * A stopgap until models describe the relationship themselves.
 */
export function buildSpeedVariants(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
): ReadonlyMap<string, IModelSpeedVariants> {
	// Keyed by vendor as well, so two providers offering the same model id are not paired.
	const key = (model: ILanguageModelChatMetadataAndIdentifier, id: string) => `${model.metadata.vendor}/${id}`;
	const byModelId = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
	for (const model of models) {
		byModelId.set(key(model, model.metadata.id), model);
	}

	const pairs = new Map<string, IModelSpeedVariants>();
	for (const model of models) {
		const id = model.metadata.id;
		if (!id.endsWith(FAST_VARIANT_SUFFIX)) {
			continue;
		}
		const standard = byModelId.get(key(model, id.slice(0, -FAST_VARIANT_SUFFIX.length)));
		if (!standard) {
			continue;
		}
		const pair: IModelSpeedVariants = { standard, fast: model };
		pairs.set(standard.identifier, pair);
		pairs.set(model.identifier, pair);
	}
	return pairs;
}

/**
 * Drops the twin that is not in use, so a pair takes one row rather than two. The
 * selected twin is the one kept, since a picker that hides the current choice cannot
 * be read as showing it.
 */
export function collapseSpeedVariants(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	variants: ReadonlyMap<string, IModelSpeedVariants>,
	selectedModelId: string | undefined,
): ILanguageModelChatMetadataAndIdentifier[] {
	if (!variants.size) {
		return [...models];
	}
	return models.filter(model => {
		const pair = variants.get(model.identifier);
		if (!pair) {
			return true;
		}
		const inUse = selectedModelId === pair.fast.identifier ? pair.fast : pair.standard;
		return model.identifier === inUse.identifier;
	});
}
