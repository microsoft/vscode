/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCodeUtils, ScanCodeUtils } from './keyCodes.js';
import { KeyCodeChord, ScanCodeChord, Keybinding, Chord } from './keybindings.js';

export class KeybindingParser {

	private static _readModifiers(input: string) {
		input = input.toLowerCase().trim();

		let ctrl = false;
		let shift = false;
		let alt = false;
		let meta = false;

		let matchedModifier: boolean;

		do {
			matchedModifier = false;
			if (/^ctrl(\+|\-)/.test(input)) {
				ctrl = true;
				input = input.substr('ctrl-'.length);
				matchedModifier = true;
			}
			if (/^shift(\+|\-)/.test(input)) {
				shift = true;
				input = input.substr('shift-'.length);
				matchedModifier = true;
			}
			if (/^alt(\+|\-)/.test(input)) {
				alt = true;
				input = input.substr('alt-'.length);
				matchedModifier = true;
			}
			if (/^meta(\+|\-)/.test(input)) {
				meta = true;
				input = input.substr('meta-'.length);
				matchedModifier = true;
			}
			if (/^win(\+|\-)/.test(input)) {
				meta = true;
				input = input.substr('win-'.length);
				matchedModifier = true;
			}
			if (/^cmd(\+|\-)/.test(input)) {
				meta = true;
				input = input.substr('cmd-'.length);
				matchedModifier = true;
			}
		} while (matchedModifier);

		let key: string;

		const firstSpaceIdx = input.indexOf(' ');
		if (firstSpaceIdx > 0) {
			key = input.substring(0, firstSpaceIdx);
			input = input.substring(firstSpaceIdx);
		} else {
			key = input;
			input = '';
		}

		return {
			remains: input,
			ctrl,
			shift,
			alt,
			meta,
			key
		};
	}

	private static parseChord(input: string): [Chord, string] {
		const mods = this._readModifiers(input);
		const scanCodeMatch = mods.key.match(/^\[([^\]]+)\]$/);
		if (scanCodeMatch) {
			const strScanCode = scanCodeMatch[1];
			const scanCode = ScanCodeUtils.lowerCaseToEnum(strScanCode);
			return [new ScanCodeChord(mods.ctrl, mods.shift, mods.alt, mods.meta, scanCode), mods.remains];
		}
		const keyCode = KeyCodeUtils.fromUserSettings(mods.key);
		return [new KeyCodeChord(mods.ctrl, mods.shift, mods.alt, mods.meta, keyCode), mods.remains];
	}

	static parseKeybinding(input: string): Keybinding | null {
		if (!input) {
			return null;
		}

		const chords: Chord[] = [];
		let chord: Chord;

		while (input.length > 0) {
			[chord, input] = this.parseChord(input);
			chords.push(chord);
		}
		return (chords.length > 0 ? new Keybinding(chords) : null);
	}
}
