/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { ResolvedKeybinding, SimpleKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';

export interface IMacLinuxKeyMapping {
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;

	valueIsDeadKey?: boolean;
	withShiftIsDeadKey?: boolean;
	withAltGrIsDeadKey?: boolean;
	withShiftAltGrIsDeadKey?: boolean;
}

export interface IMacLinuxKeyboardMapping {
	[scanCode: string]: IMacLinuxKeyMapping;
}

/**
 * A keyboard mapper to be used when reading the keymap from the OS fails.
 */
export class MacLinuxFallbackKeyboardMapper implements IKeyboardMapper {

	/**
	 * used only for debug purposes.
	 */
	private readonly _rawMappings: IMacLinuxKeyboardMapping;
	/**
	 * OS (can be Linux or Macintosh)
	 */
	private readonly _OS: OperatingSystem;

	constructor(rawMappings: IMacLinuxKeyboardMapping, OS: OperatingSystem) {
		this._rawMappings = rawMappings;
		this._OS = OS;
	}

	public dumpRawDebugInfo(): string {
		return JSON.stringify(this._rawMappings, null, '\t');
	}

	public dumpDebugInfo(): string {
		return 'FallbackKeyboardMapper dispatching on keyCode';
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return [new USLayoutResolvedKeybinding(keybinding, this._OS)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		let keybinding = new SimpleKeybinding(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		return new USLayoutResolvedKeybinding(keybinding, this._OS);
	}
}
