/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IKeymapService } from 'vs/workbench/services/keybinding/common/keymapInfo';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { Emitter, Event } from 'vs/base/common/event';
import { DispatchConfig } from 'vs/workbench/services/keybinding/common/dispatchConfig';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IKeyboardLayoutInfo, IKeyboardLayoutService, IKeyboardMapping } from 'vs/workbench/services/keyboardLayout/common/keyboardLayout';

class NativeKeymapService extends Disposable implements IKeymapService {
	public _serviceBrand: undefined;

	private readonly _onDidChangeKeyboardMapper = this._register(new Emitter<void>());
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	constructor(
		@IKeyboardLayoutService private readonly _keyboardLayoutService: IKeyboardLayoutService
	) {
		super();

		this._register(this._keyboardLayoutService.onDidChangeKeyboardLayout(() => {
			this._onDidChangeKeyboardMapper.fire();
		}));
	}

	getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		return this._keyboardLayoutService.getKeyboardMapper(dispatchConfig);
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return this._keyboardLayoutService.getCurrentKeyboardLayout();
	}

	getAllKeyboardLayouts(): IKeyboardLayoutInfo[] {
		return [];
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return this._keyboardLayoutService.getRawKeyboardMapping();
	}

	public validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void {
		return;
	}
}

registerSingleton(IKeymapService, NativeKeymapService, true);
