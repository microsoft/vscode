/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedKeybinding, KeyCodeChord, Keybinding } from 'vs/base/common/keybindings';
import { OperatingSystem } from 'vs/base/common/platform';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { IKeyboardMapper } from 'vs/platform/keyboardLayout/common/keyboardMapper';

/**
 * A keyboard mapper to be used when reading the keymap from the OS fails.
 */
export class FallbackKeyboardMapper implements IKeyboardMapper {

	constructor(
		private readonly _mapAltGrToCtrlAlt: boolean,
		private readonly _OS: OperatingSystem,
	) { }

	public dumpDebugInfo(): string {
		return 'FallbackKeyboardMapper dispatching on keyCode';
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		const ctrlKey = keyboardEvent.ctrlKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
		const altKey = keyboardEvent.altKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
		const chord = new KeyCodeChord(
			ctrlKey,
			keyboardEvent.shiftKey,
			altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		const result = this.resolveKeybinding(new Keybinding([chord]));
		return result[0];
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, this._OS);
	}
}
