/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { EVENT_KEY_CODE_MAP, KeyCode, KeyCodeUtils, KeyMod } from 'vs/base/common/keyCodes';
import { SimpleKeybinding } from 'vs/base/common/keybindings';
import * as platform from 'vs/base/common/platform';



function extractKeyCode(e: KeyboardEvent): KeyCode {
	if (e.charCode) {
		// "keypress" events mostly
		let char = String.fromCharCode(e.charCode).toUpperCase();
		return KeyCodeUtils.fromString(char);
	}

	const keyCode = e.keyCode;

	// browser quirks
	if (keyCode === 3) {
		return KeyCode.PauseBreak;
	} else if (browser.isFirefox) {
		if (keyCode === 59) {
			return KeyCode.Semicolon;
		} else if (keyCode === 107) {
			return KeyCode.Equal;
		} else if (keyCode === 109) {
			return KeyCode.Minus;
		} else if (platform.isMacintosh && keyCode === 224) {
			return KeyCode.Meta;
		}
	} else if (browser.isWebKit) {
		if (keyCode === 91) {
			return KeyCode.Meta;
		} else if (platform.isMacintosh && keyCode === 93) {
			// the two meta keys in the Mac have different key codes (91 and 93)
			return KeyCode.Meta;
		} else if (!platform.isMacintosh && keyCode === 92) {
			return KeyCode.Meta;
		}
	}

	// cross browser keycodes:
	return EVENT_KEY_CODE_MAP[keyCode] || KeyCode.Unknown;
}

export interface IKeyboardEvent {

	readonly _standardKeyboardEventBrand: true;

	readonly browserEvent: KeyboardEvent;
	readonly target: HTMLElement;

	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly keyCode: KeyCode;
	readonly code: string;

	/**
	 * @internal
	 */
	toKeybinding(): SimpleKeybinding;
	equals(keybinding: number): boolean;

	preventDefault(): void;
	stopPropagation(): void;
}

const ctrlKeyMod = (platform.isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd);
const altKeyMod = KeyMod.Alt;
const shiftKeyMod = KeyMod.Shift;
const metaKeyMod = (platform.isMacintosh ? KeyMod.CtrlCmd : KeyMod.WinCtrl);

export function printKeyboardEvent(e: KeyboardEvent): string {
	let modifiers: string[] = [];
	if (e.ctrlKey) {
		modifiers.push(`ctrl`);
	}
	if (e.shiftKey) {
		modifiers.push(`shift`);
	}
	if (e.altKey) {
		modifiers.push(`alt`);
	}
	if (e.metaKey) {
		modifiers.push(`meta`);
	}
	return `modifiers: [${modifiers.join(',')}], code: ${e.code}, keyCode: ${e.keyCode}, key: ${e.key}`;
}

export function printStandardKeyboardEvent(e: StandardKeyboardEvent): string {
	let modifiers: string[] = [];
	if (e.ctrlKey) {
		modifiers.push(`ctrl`);
	}
	if (e.shiftKey) {
		modifiers.push(`shift`);
	}
	if (e.altKey) {
		modifiers.push(`alt`);
	}
	if (e.metaKey) {
		modifiers.push(`meta`);
	}
	return `modifiers: [${modifiers.join(',')}], code: ${e.code}, keyCode: ${e.keyCode} ('${KeyCodeUtils.toString(e.keyCode)}')`;
}

export class StandardKeyboardEvent implements IKeyboardEvent {

	readonly _standardKeyboardEventBrand = true;

	public readonly browserEvent: KeyboardEvent;
	public readonly target: HTMLElement;

	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly keyCode: KeyCode;
	public readonly code: string;

	private _asKeybinding: number;
	private _asRuntimeKeybinding: SimpleKeybinding;

	constructor(source: KeyboardEvent) {
		let e = source;

		this.browserEvent = e;
		this.target = <HTMLElement>e.target;

		this.ctrlKey = e.ctrlKey;
		this.shiftKey = e.shiftKey;
		this.altKey = e.altKey;
		this.metaKey = e.metaKey;
		this.keyCode = extractKeyCode(e);
		this.code = e.code;

		// console.info(e.type + ": keyCode: " + e.keyCode + ", which: " + e.which + ", charCode: " + e.charCode + ", detail: " + e.detail + " ====> " + this.keyCode + ' -- ' + KeyCode[this.keyCode]);

		this.ctrlKey = this.ctrlKey || this.keyCode === KeyCode.Ctrl;
		this.altKey = this.altKey || this.keyCode === KeyCode.Alt;
		this.shiftKey = this.shiftKey || this.keyCode === KeyCode.Shift;
		this.metaKey = this.metaKey || this.keyCode === KeyCode.Meta;

		this._asKeybinding = this._computeKeybinding();
		this._asRuntimeKeybinding = this._computeRuntimeKeybinding();

		// console.log(`code: ${e.code}, keyCode: ${e.keyCode}, key: ${e.key}`);
	}

	public preventDefault(): void {
		if (this.browserEvent && this.browserEvent.preventDefault) {
			this.browserEvent.preventDefault();
		}
	}

	public stopPropagation(): void {
		if (this.browserEvent && this.browserEvent.stopPropagation) {
			this.browserEvent.stopPropagation();
		}
	}

	public toKeybinding(): SimpleKeybinding {
		return this._asRuntimeKeybinding;
	}

	public equals(other: number): boolean {
		return this._asKeybinding === other;
	}

	private _computeKeybinding(): number {
		let key = KeyCode.Unknown;
		if (this.keyCode !== KeyCode.Ctrl && this.keyCode !== KeyCode.Shift && this.keyCode !== KeyCode.Alt && this.keyCode !== KeyCode.Meta) {
			key = this.keyCode;
		}

		let result = 0;
		if (this.ctrlKey) {
			result |= ctrlKeyMod;
		}
		if (this.altKey) {
			result |= altKeyMod;
		}
		if (this.shiftKey) {
			result |= shiftKeyMod;
		}
		if (this.metaKey) {
			result |= metaKeyMod;
		}
		result |= key;

		return result;
	}

	private _computeRuntimeKeybinding(): SimpleKeybinding {
		let key = KeyCode.Unknown;
		if (this.keyCode !== KeyCode.Ctrl && this.keyCode !== KeyCode.Shift && this.keyCode !== KeyCode.Alt && this.keyCode !== KeyCode.Meta) {
			key = this.keyCode;
		}
		return new SimpleKeybinding(this.ctrlKey, this.shiftKey, this.altKey, this.metaKey, key);
	}
}
