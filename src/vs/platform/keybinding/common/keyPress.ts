/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SimpleKeybinding, ChordKeybinding, Keybinding, createKeybinding, KeyChord, KeyMod } from 'vs/base/common/keyCodes';
import * as defaultPlatform from 'vs/base/common/platform';

export interface IPlatform {
	isMacintosh: boolean;
}

/**
 * Binary encoding strategy:
 * ```
 *    1111 11
 *    5432 1098 7654 3210
 *    CSAW KKKK KKKK KKKK
 *  C = bit 15 = ctrlKey flag
 *  S = bit 14 = shiftKey flag
 *  A = bit 13 = altKey flag
 *  W = bit 12 = metaKey flag
 *  K = bits 0-11 = specific
 * ```
 */
const enum Constants {
	CtrlKey = (1 << 15) >>> 0,
	ShiftKey = (1 << 14) >>> 0,
	AltKey = (1 << 13) >>> 0,
	MetaKey = (1 << 12) >>> 0,
	SpecificMask = 0x00000fff,
	ModifierMask = CtrlKey | ShiftKey | AltKey | MetaKey,
	FirstPartMask = 0x0000ffff,
	ChordPartMask = 0xffff0000,
}

/**
 * Represents a keyboard layout specific key press.
 */
export class SimpleKeyPress {

	public readonly value: number;

	public static create(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, specific: number): SimpleKeyPress {
		return new SimpleKeyPress(
			(ctrlKey ? Constants.CtrlKey : 0)
			| (shiftKey ? Constants.ShiftKey : 0)
			| (altKey ? Constants.AltKey : 0)
			| (metaKey ? Constants.MetaKey : 0)
			| specific
		);
	}

	constructor(value: number) {
		if ((value & Constants.ChordPartMask) !== 0) {
			throw new Error('value does not encode a simple key press!');
		}
		this.value = value;
	}

	/**
	 * @internal
	 */
	public isChord(): this is ChordKeyPress {
		return false;
	}

	/**
	 * @internal
	 */
	public equals(other: KeyPress): boolean {
		return (other && this.value === other.value);
	}

	public hasCtrlKey(): boolean {
		return (this.value & Constants.CtrlKey ? true : false);
	}

	public hasShiftKey(): boolean {
		return (this.value & Constants.ShiftKey ? true : false);
	}

	public hasAltKey(): boolean {
		return (this.value & Constants.AltKey ? true : false);
	}

	public hasMetaKey(): boolean {
		return (this.value & Constants.MetaKey ? true : false);
	}

	public isModifierKey(): boolean {
		if ((this.value & Constants.ModifierMask) === this.value) {
			return true;
		}
		// TODO@keyboard
		return false;
	}

	public getSpecific(): number {
		return (this.value & Constants.SpecificMask);
	}
}

/**
 * Represents a keyboard layout specific key chord press.
 */
export class ChordKeyPress {

	public readonly value: number;

	public static create(firstPart: SimpleKeyPress, chordPart: SimpleKeyPress): ChordKeyPress {
		let first = firstPart.value;
		let chord = (chordPart.value << 16) >>> 0;
		return new ChordKeyPress(first | chord);
	}

	constructor(value: number) {
		if ((value & Constants.ChordPartMask) === 0) {
			throw new Error('value does not encode a chord key press!');
		}
		this.value = value;
	}

	public isChord(): this is ChordKeyPress {
		return true;
	}

	public equals(other: KeyPress): boolean {
		return (other && this.value === other.value);
	}

	public extractFirstPart(): SimpleKeyPress {
		let first = (this.value & Constants.FirstPartMask) >>> 0;
		return new SimpleKeyPress(first);
	}

	public extractChordPart(): SimpleKeyPress {
		let chord = (this.value & Constants.ChordPartMask) >>> 16;
		return new SimpleKeyPress(chord);
	}
}

export type KeyPress = SimpleKeyPress | ChordKeyPress;

function simpleKeybindingToSimpleKeyPress(keybinding: SimpleKeybinding, platform: IPlatform): SimpleKeyPress {
	let ctrlKey: boolean;
	let metaKey: boolean;
	if (platform.isMacintosh) {
		ctrlKey = keybinding.hasWinCtrl();
		metaKey = keybinding.hasCtrlCmd();
	} else {
		ctrlKey = keybinding.hasCtrlCmd();
		metaKey = keybinding.hasWinCtrl();
	}
	let altKey = keybinding.hasAlt();
	let shiftKey = keybinding.hasShift();
	let keyCode = keybinding.getKeyCode();
	return SimpleKeyPress.create(ctrlKey, shiftKey, altKey, metaKey, keyCode);
}

/**
 * Encode the `keyCode` of a `Keybinding` as the `specific` of a `KeyPress`.
 * i.e. this is assuming no transformation is needed.
 */
export function keybindingToKeyPress(keybinding: SimpleKeybinding, platform?: IPlatform): SimpleKeyPress;
export function keybindingToKeyPress(keybinding: ChordKeybinding, platform?: IPlatform): ChordKeyPress;
export function keybindingToKeyPress(keybinding: Keybinding, platform?: IPlatform): KeyPress;
export function keybindingToKeyPress(keybinding: Keybinding, platform: IPlatform = defaultPlatform): KeyPress {
	if (!keybinding) {
		return null;
	}
	if (keybinding.isChord()) {
		let firstPart = simpleKeybindingToSimpleKeyPress(keybinding.extractFirstPart(), platform);
		let chordPart = simpleKeybindingToSimpleKeyPress(keybinding.extractChordPart(), platform);
		return ChordKeyPress.create(firstPart, chordPart);
	}
	return simpleKeybindingToSimpleKeyPress(keybinding, platform);
}

function simpleKeyPressToSimpleKeybinding(keyPress: SimpleKeyPress, platform: IPlatform): SimpleKeybinding {
	let ctrlCmd: boolean;
	let winCtrl: boolean;
	if (platform.isMacintosh) {
		ctrlCmd = keyPress.hasMetaKey();
		winCtrl = keyPress.hasCtrlKey();
	} else {
		ctrlCmd = keyPress.hasCtrlKey();
		winCtrl = keyPress.hasMetaKey();
	}
	let alt = keyPress.hasAltKey();
	let shift = keyPress.hasShiftKey();
	let specific = keyPress.getSpecific();

	let result = (
		(ctrlCmd ? KeyMod.CtrlCmd : 0)
		| (winCtrl ? KeyMod.WinCtrl : 0)
		| (alt ? KeyMod.Alt : 0)
		| (shift ? KeyMod.Shift : 0)
		| specific
	);
	return new SimpleKeybinding(result);
}

/**
 * Decode the `specific` of a `KeyPress` as the `keyCode` of a `Keybinding`.
 * i.e. this is assuming no transformation is needed.
 */
export function keyPressToKeybinding(keyPress: SimpleKeyPress, platform?: IPlatform): SimpleKeybinding;
export function keyPressToKeybinding(keyPress: ChordKeyPress, platform?: IPlatform): ChordKeybinding;
export function keyPressToKeybinding(keyPress: KeyPress, platform?: IPlatform): Keybinding;
export function keyPressToKeybinding(keyPress: KeyPress, platform: IPlatform = defaultPlatform): Keybinding {
	if (!keyPress) {
		return null;
	}
	if (keyPress.isChord()) {
		let firstPart = simpleKeyPressToSimpleKeybinding(keyPress.extractFirstPart(), platform);
		let chordPart = simpleKeyPressToSimpleKeybinding(keyPress.extractChordPart(), platform);
		return createKeybinding(KeyChord(firstPart.value, chordPart.value));
	}
	return simpleKeyPressToSimpleKeybinding(keyPress, platform);
}
