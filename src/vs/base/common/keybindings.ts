/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from 'vs/base/common/errors';
import { KeyCode, ScanCode } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';

/**
 * Binary encoding strategy:
 * ```
 *    1111 11
 *    5432 1098 7654 3210
 *    ---- CSAW KKKK KKKK
 *  C = bit 11 = ctrlCmd flag
 *  S = bit 10 = shift flag
 *  A = bit 9 = alt flag
 *  W = bit 8 = winCtrl flag
 *  K = bits 0-7 = key code
 * ```
 */
const enum BinaryKeybindingsMask {
	CtrlCmd = (1 << 11) >>> 0,
	Shift = (1 << 10) >>> 0,
	Alt = (1 << 9) >>> 0,
	WinCtrl = (1 << 8) >>> 0,
	KeyCode = 0x000000FF
}

export function createKeybinding(keybinding: number, OS: OperatingSystem): Keybinding | null {
	if (keybinding === 0) {
		return null;
	}
	const firstPart = (keybinding & 0x0000FFFF) >>> 0;
	const chordPart = (keybinding & 0xFFFF0000) >>> 16;
	if (chordPart !== 0) {
		return new ChordKeybinding([
			createSimpleKeybinding(firstPart, OS),
			createSimpleKeybinding(chordPart, OS)
		]);
	}
	return new ChordKeybinding([createSimpleKeybinding(firstPart, OS)]);
}

export function createSimpleKeybinding(keybinding: number, OS: OperatingSystem): SimpleKeybinding {

	const ctrlCmd = (keybinding & BinaryKeybindingsMask.CtrlCmd ? true : false);
	const winCtrl = (keybinding & BinaryKeybindingsMask.WinCtrl ? true : false);

	const ctrlKey = (OS === OperatingSystem.Macintosh ? winCtrl : ctrlCmd);
	const shiftKey = (keybinding & BinaryKeybindingsMask.Shift ? true : false);
	const altKey = (keybinding & BinaryKeybindingsMask.Alt ? true : false);
	const metaKey = (OS === OperatingSystem.Macintosh ? ctrlCmd : winCtrl);
	const keyCode = (keybinding & BinaryKeybindingsMask.KeyCode);

	return new SimpleKeybinding(ctrlKey, shiftKey, altKey, metaKey, keyCode);
}

export interface Modifiers {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
}

export interface IBaseKeybinding extends Modifiers {
	isDuplicateModifierCase(): boolean;
}

export class SimpleKeybinding implements IBaseKeybinding {
	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly keyCode: KeyCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, keyCode: KeyCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.keyCode = keyCode;
	}

	public equals(other: SimpleKeybinding): boolean {
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.metaKey === other.metaKey
			&& this.keyCode === other.keyCode
		);
	}

	public getHashCode(): string {
		const ctrl = this.ctrlKey ? '1' : '0';
		const shift = this.shiftKey ? '1' : '0';
		const alt = this.altKey ? '1' : '0';
		const meta = this.metaKey ? '1' : '0';
		return `${ctrl}${shift}${alt}${meta}${this.keyCode}`;
	}

	public isModifierKey(): boolean {
		return (
			this.keyCode === KeyCode.Unknown
			|| this.keyCode === KeyCode.Ctrl
			|| this.keyCode === KeyCode.Meta
			|| this.keyCode === KeyCode.Alt
			|| this.keyCode === KeyCode.Shift
		);
	}

	public toChord(): ChordKeybinding {
		return new ChordKeybinding([this]);
	}

	/**
	 * Does this keybinding refer to the key code of a modifier and it also has the modifier flag?
	 */
	public isDuplicateModifierCase(): boolean {
		return (
			(this.ctrlKey && this.keyCode === KeyCode.Ctrl)
			|| (this.shiftKey && this.keyCode === KeyCode.Shift)
			|| (this.altKey && this.keyCode === KeyCode.Alt)
			|| (this.metaKey && this.keyCode === KeyCode.Meta)
		);
	}
}

export class ChordKeybinding {
	public readonly parts: SimpleKeybinding[];

	constructor(parts: SimpleKeybinding[]) {
		if (parts.length === 0) {
			throw illegalArgument(`parts`);
		}
		this.parts = parts;
	}

	public getHashCode(): string {
		let result = '';
		for (let i = 0, len = this.parts.length; i < len; i++) {
			if (i !== 0) {
				result += ';';
			}
			result += this.parts[i].getHashCode();
		}
		return result;
	}

	public equals(other: ChordKeybinding | null): boolean {
		if (other === null) {
			return false;
		}
		if (this.parts.length !== other.parts.length) {
			return false;
		}
		for (let i = 0; i < this.parts.length; i++) {
			if (!this.parts[i].equals(other.parts[i])) {
				return false;
			}
		}
		return true;
	}
}

export type Keybinding = ChordKeybinding;

export class ScanCodeBinding implements IBaseKeybinding {
	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly scanCode: ScanCode;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, scanCode: ScanCode) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.scanCode = scanCode;
	}

	public equals(other: ScanCodeBinding): boolean {
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.metaKey === other.metaKey
			&& this.scanCode === other.scanCode
		);
	}

	/**
	 * Does this keybinding refer to the key code of a modifier and it also has the modifier flag?
	 */
	public isDuplicateModifierCase(): boolean {
		return (
			(this.ctrlKey && (this.scanCode === ScanCode.ControlLeft || this.scanCode === ScanCode.ControlRight))
			|| (this.shiftKey && (this.scanCode === ScanCode.ShiftLeft || this.scanCode === ScanCode.ShiftRight))
			|| (this.altKey && (this.scanCode === ScanCode.AltLeft || this.scanCode === ScanCode.AltRight))
			|| (this.metaKey && (this.scanCode === ScanCode.MetaLeft || this.scanCode === ScanCode.MetaRight))
		);
	}
}

export class ResolvedKeybindingPart {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;

	readonly keyLabel: string | null;
	readonly keyAriaLabel: string | null;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, kbLabel: string | null, kbAriaLabel: string | null) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.keyLabel = kbLabel;
		this.keyAriaLabel = kbAriaLabel;
	}
}

export type KeybindingModifier = 'ctrl' | 'shift' | 'alt' | 'meta';

/**
 * A resolved keybinding. Can be a simple keybinding or a chord keybinding.
 */
export abstract class ResolvedKeybinding {
	/**
	 * This prints the binding in a format suitable for displaying in the UI.
	 */
	public abstract getLabel(): string | null;
	/**
	 * This prints the binding in a format suitable for ARIA.
	 */
	public abstract getAriaLabel(): string | null;
	/**
	 * This prints the binding in a format suitable for electron's accelerators.
	 * See https://github.com/electron/electron/blob/master/docs/api/accelerator.md
	 */
	public abstract getElectronAccelerator(): string | null;
	/**
	 * This prints the binding in a format suitable for user settings.
	 */
	public abstract getUserSettingsLabel(): string | null;
	/**
	 * Is the user settings label reflecting the label?
	 */
	public abstract isWYSIWYG(): boolean;

	/**
	 * Is the binding a chord?
	 */
	public abstract isChord(): boolean;

	/**
	 * Returns the parts that comprise of the keybinding.
	 * Simple keybindings return one element.
	 */
	public abstract getParts(): ResolvedKeybindingPart[];

	/**
	 * Returns the parts that should be used for dispatching.
	 * Returns null for parts consisting of only modifier keys
	 * @example keybinding "Shift" -> null
	 * @example keybinding ("D" with shift == true) -> "shift+D"
	 */
	public abstract getDispatchParts(): (string | null)[];

	/**
	 * Returns the parts that should be used for dispatching single modifier keys
	 * Returns null for parts that contain more than one modifier or a regular key.
	 * @example keybinding "Shift" -> "shift"
	 * @example keybinding ("D" with shift == true") -> null
	 */
	public abstract getSingleModifierDispatchParts(): (KeybindingModifier | null)[];
}
