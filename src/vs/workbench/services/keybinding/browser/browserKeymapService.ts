/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IKeymapService, IKeyboardLayoutInfo, IKeyboardMapping } from 'vs/workbench/services/keybinding/common/keymapService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DispatchConfig } from 'vs/workbench/services/keybinding/common/dispatchConfig';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { WindowsKeyboardMapper } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { MacLinuxFallbackKeyboardMapper } from 'vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper';

class BrowserKeymapService extends Disposable implements IKeymapService {
	public _serviceBrand: any;

	private readonly _onDidChangeKeyboardMapper = new Emitter<void>();
	public readonly onDidChangeKeyboardMapper: Event<void> = this._onDidChangeKeyboardMapper.event;

	constructor() {
		super();
	}

	getKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		return this._createKeyboardMapper(dispatchConfig);
	}

	private _createKeyboardMapper(dispatchConfig: DispatchConfig): IKeyboardMapper {
		if (OS === OperatingSystem.Windows) {
			return new WindowsKeyboardMapper(true, {});
		}

		// Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
		return new MacLinuxFallbackKeyboardMapper(OS);
	}

	public getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null {
		return null;
	}

	public getRawKeyboardMapping(): IKeyboardMapping | null {
		return null;
	}
}

registerSingleton(IKeymapService, BrowserKeymapService, true);