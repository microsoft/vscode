/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const INewChatModePickerService = createDecorator<INewChatModePickerService>('newChatModePickerService');

export interface INewChatModePickerService {
	readonly _serviceBrand: undefined;
	registerModePicker(open: () => void): IDisposable;
	openModePicker(): void;
}

export class NewChatModePickerService implements INewChatModePickerService {
	declare readonly _serviceBrand: undefined;

	private readonly _modePickers = new Set<() => void>();

	registerModePicker(open: () => void): IDisposable {
		this._modePickers.add(open);
		return toDisposable(() => this._modePickers.delete(open));
	}

	openModePicker(): void {
		let activeModePicker: (() => void) | undefined;
		for (const modePicker of this._modePickers) {
			activeModePicker = modePicker;
		}
		activeModePicker?.();
	}
}
