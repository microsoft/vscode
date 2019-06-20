/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeymapInfo } from 'vs/workbench/services/keybinding/common/keymapInfo';

export class KeyboardLayoutContribution {
	public static readonly INSTANCE: KeyboardLayoutContribution = new KeyboardLayoutContribution();

	private _layoutInfos: KeymapInfo[] = [];

	get layoutInfos() {
		return this._layoutInfos;
	}

	private constructor() {
	}

	registerKeyboardLayout(layout: KeymapInfo) {
		this._layoutInfos.push(layout);
	}
}