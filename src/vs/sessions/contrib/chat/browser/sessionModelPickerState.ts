/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IPendingModelSelection } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { ISessionModelPickerOptions } from '../../../services/sessions/common/sessionsProvider.js';

/**
 * What the model picker shows, as opposed to which model the conversation runs on. The two answer
 * different questions — a model the conversation is meant to run on may be one the pool cannot
 * offer yet, and must not be presented as a selection the user could act on — so the display rules
 * live here rather than mixed into selection policy.
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
 * The picker state for a pool, the options it is presented under, and whatever model selection has
 * settled on.
 *
 * Only a model the pool actually offers is shown. A pool can empty out with nothing to fall back
 * to, which leaves selection holding the last model it applied; showing it would claim a selection
 * the user cannot act on. The intent survives either way, so the model returns on its own once the
 * pool publishes it again.
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
		// While a selection is pending nothing is shown: the model the conversation is meant to run
		// on is the only correct answer, and it is not available to show yet.
		currentModel: pendingSelection ? undefined : displayedModel,
		pendingSelection,
	};
}
