/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const INewChatModelPickerService = createDecorator<INewChatModelPickerService>('newChatModelPickerService');

export interface INewChatModelPickerService {
	readonly _serviceBrand: undefined;
	registerModelPicker(opener: () => void): IDisposable;
	openModelPicker(): void;
}

export class NewChatModelPickerService implements INewChatModelPickerService {
	declare readonly _serviceBrand: undefined;

	private readonly _openers = new Set<() => void>();

	registerModelPicker(opener: () => void): IDisposable {
		this._openers.add(opener);
		return toDisposable(() => this._openers.delete(opener));
	}

	openModelPicker(): void {
		let latestOpener: (() => void) | undefined;
		for (const opener of this._openers) {
			latestOpener = opener;
		}
		latestOpener?.();
	}
}