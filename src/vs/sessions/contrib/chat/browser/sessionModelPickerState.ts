/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IPendingModelSelection } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ISessionModelPickerOptions } from '../../../services/sessions/common/sessionsProvider.js';

/**
 * What the picker shows, as opposed to what the conversation runs on. A model it is meant to run on
 * may be one the pool cannot offer yet, which must not look like a selection the user can act on.
 */

export interface INormalizedSessionModelPickerOptions extends ISessionModelPickerOptions {
	readonly showAutoModel: boolean;
}

const DEFAULT_MODEL_PICKER_OPTIONS: INormalizedSessionModelPickerOptions = {
	useGroupedModelPicker: true,
	showFeatured: true,
	showUnavailableFeatured: false,
	showManageModelsAction: false,
	showAutoModel: true,
};

export interface ISessionModelSelectionState {
	readonly currentModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly pendingSelection: IPendingModelSelection | undefined;
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly options: INormalizedSessionModelPickerOptions;
	readonly hasSelectableModel: boolean;
}

export function normalizeModelPickerOptions(options: ISessionModelPickerOptions | undefined): INormalizedSessionModelPickerOptions {
	return {
		...DEFAULT_MODEL_PICKER_OPTIONS,
		...options,
		showAutoModel: options?.showAutoModel ?? true,
	};
}

export function hasSelectableModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	options: INormalizedSessionModelPickerOptions,
): boolean {
	return models.length > 0 || options.showAutoModel;
}

export const EMPTY_MODEL_SELECTION_STATE: ISessionModelSelectionState = {
	currentModel: undefined,
	pendingSelection: undefined,
	models: [],
	options: normalizeModelPickerOptions(undefined),
	hasSelectableModel: false,
};

/**
 * Only a model the pool actually offers is shown. A pool can empty out while selection still holds
 * the last model it applied; the intent survives, so it returns once the pool publishes it again.
 */
export function createModelSelectionState(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	options: INormalizedSessionModelPickerOptions,
	currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
	pendingSelection: IPendingModelSelection | undefined,
): ISessionModelSelectionState {
	const displayedModel = currentModel && models.some(model => model.identifier === currentModel.identifier)
		? currentModel
		: undefined;
	return {
		models,
		options,
		hasSelectableModel: hasSelectableModel(models, options),
		// Nothing is shown while pending: the only correct answer is not available yet.
		currentModel: pendingSelection ? undefined : displayedModel,
		pendingSelection,
	};
}
