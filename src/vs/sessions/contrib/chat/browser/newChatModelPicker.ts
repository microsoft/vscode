/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getNextModelInCycle, isModelHiddenInPicker } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputModelUtils.js';
import type { IChatInputHostModelSelection } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionModelSelection } from './sessionModelSelection.js';

export const INewChatModelPickerService = createDecorator<INewChatModelPickerService>('newChatModelPickerService');

export interface INewChatModelPicker {
	getDomNode(): HTMLElement | undefined;
	readonly open: () => void;
	readonly openComparison?: () => void;
	readonly switchToModel: (modelIdentifier: string) => boolean;
}

export interface INewChatModelPickerService {
	readonly _serviceBrand: undefined;
	readonly activePicker: INewChatModelPicker | undefined;
	registerModelPicker(modelPicker: INewChatModelPicker): IDisposable;
	openModelPicker(): void;
	switchToModel(modelIdentifier: string): boolean;
	/** Moves focus to the prompt input that hosts the model pickers. */
	focusInput(): void;
}

export class NewChatModelPickerService implements INewChatModelPickerService {
	declare readonly _serviceBrand: undefined;

	private readonly _modelPickers = new Set<INewChatModelPicker>();

	constructor(private readonly _focusInput: () => void = () => { }) { }

	registerModelPicker(modelPicker: INewChatModelPicker): IDisposable {
		this._modelPickers.add(modelPicker);
		return toDisposable(() => this._modelPickers.delete(modelPicker));
	}

	openModelPicker(): void {
		this.activePicker?.open();
	}

	switchToModel(modelIdentifier: string): boolean {
		return this.activePicker?.switchToModel(modelIdentifier) ?? false;
	}

	focusInput(): void {
		this._focusInput();
	}

	get activePicker(): INewChatModelPicker | undefined {
		let activeModelPicker: INewChatModelPicker | undefined;
		for (const modelPicker of this._modelPickers) {
			activeModelPicker = modelPicker;
		}
		return activeModelPicker;
	}
}

/** The composer's models the model picker commands cycle and switch among, in picker order. */
function getSelectableSessionModels(selection: ISessionModelSelection, languageModelsService: ILanguageModelsService): ILanguageModelChatMetadataAndIdentifier[] {
	return selection.state.get().models
		.filter(model => model.metadata.isUserSelectable !== false && !isModelHiddenInPicker(model, id => languageModelsService.isModelHidden(id)))
		.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
}

/**
 * The model commands of a composer's session model selection: cycling and
 * switching among its selectable models, for the chat input's model commands
 * and their keybindings.
 */
export function createSessionModelCommands(selection: ISessionModelSelection, languageModelsService: ILanguageModelsService): Pick<IChatInputHostModelSelection, 'switchToNextModel' | 'switchToNextPinnedModel' | 'switchModel'> {
	const switchToNext = (pinnedOnly: boolean) => {
		const currentIdentifier = selection.state.get().currentModel?.identifier;
		const nextModel = getNextModelInCycle(getSelectableSessionModels(selection, languageModelsService), currentIdentifier, pinnedOnly ? languageModelsService.getPinnedModelIds() : undefined);
		if (nextModel) {
			selection.selectModel(nextModel.identifier);
		}
	};
	return {
		switchToNextModel: () => switchToNext(false),
		switchToNextPinnedModel: () => switchToNext(true),
		switchModel: model => {
			const match = getSelectableSessionModels(selection, languageModelsService).find(candidate => candidate.metadata.vendor === model.vendor && candidate.metadata.id === model.id && candidate.metadata.family === model.family);
			if (match) {
				selection.selectModel(match.identifier);
			}
		},
	};
}
