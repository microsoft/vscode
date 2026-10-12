/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const INewChatModelPickerService = createDecorator<INewChatModelPickerService>('newChatModelPickerService');

export interface INewChatModelPicker {
	getDomNode(): HTMLElement | undefined;
	readonly open: () => void;
	readonly switchToModel: (modelIdentifier: string) => boolean;
}

export interface INewChatModelPickerService {
	readonly _serviceBrand: undefined;
	readonly activePicker: INewChatModelPicker | undefined;
	registerModelPicker(modelPicker: INewChatModelPicker): IDisposable;
	openModelPicker(): void;
	switchToModel(modelIdentifier: string): boolean;
}

export class NewChatModelPickerService implements INewChatModelPickerService {
	declare readonly _serviceBrand: undefined;

	private readonly _modelPickers = new Set<INewChatModelPicker>();

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

	get activePicker(): INewChatModelPicker | undefined {
		let activeModelPicker: INewChatModelPicker | undefined;
		for (const modelPicker of this._modelPickers) {
			activeModelPicker = modelPicker;
		}
		return activeModelPicker;
	}
}
