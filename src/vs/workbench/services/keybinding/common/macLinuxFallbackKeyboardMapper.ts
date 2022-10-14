/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Keybinding, ResolvedKeybinding, SimpleKeybinding, ScanCodeBinding } from 'vs/base/common/keybindings';
import { OperatingSystem } from 'vs/base/common/platform';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { IKeyboardMapper } from 'vs/platform/keyboardLayout/common/keyboardMapper';

/**
 * A keyboard mapper to be used when reading the keymap from the OS fails.
 */
export class MacLinuxFallbackKeyboardMapper implements IKeyboardMapper {

	/**
	 * OS (can be Linux or Macintosh)
	 */
	private readonly _OS: OperatingSystem;

	constructor(OS: OperatingSystem) {
		this._OS = OS;
	}

	public dumpDebugInfo(): string {
		return 'FallbackKeyboardMapper dispatching on keyCode';
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return [new USLayoutResolvedKeybinding(keybinding, this._OS)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		const keybinding = new SimpleKeybinding(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		return new USLayoutResolvedKeybinding(keybinding.toChord(), this._OS);
	}

	public resolveUserBinding(input: (SimpleKeybinding | ScanCodeBinding)[]): ResolvedKeybinding[] {
		return USLayoutResolvedKeybinding.resolveUserBinding(input, this._OS);
	}
}
