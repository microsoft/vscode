/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {IEventService} from 'vs/platform/event/common/event';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {PluginsRegistry, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {IOSupport} from 'vs/platform/keybinding/common/commonKeybindingResolver';
import {WorkbenchKeybindingService} from 'vs/workbench/services/keybinding/browser/keybindingService';
import {ICommandRule, KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {KeyCode, Keybinding, IKeyBindingLabelProvider, MacUIKeyLabelProvider, ClassicUIKeyLabelProvider} from 'vs/base/common/keyCodes';
import * as nativeKeymap from 'native-keymap';
import Platform = require('vs/base/common/platform');
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {lookupKeyCode, setExtractKeyCode} from 'vs/base/browser/keyboardEvent';

interface ContributedKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

function isContributedKeyBindingsArray(thing: ContributedKeyBinding|ContributedKeyBinding[]): thing is ContributedKeyBinding[] {
	return Array.isArray(thing);
}

function isValidContributedKeyBinding(keyBinding: ContributedKeyBinding, rejects: string[]): boolean {
	if (!keyBinding) {
		rejects.push(nls.localize('nonempty', "expected non-empty value."));
		return false;
	}
	if (typeof keyBinding.command !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
		return false;
	}
	if (typeof keyBinding.key !== 'string') {
		rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'key'));
		return false;
	}
	if (keyBinding.when && typeof keyBinding.when !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
		return false;
	}
	if (keyBinding.mac && typeof keyBinding.mac !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'mac'));
		return false;
	}
	if (keyBinding.linux && typeof keyBinding.linux !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'linux'));
		return false;
	}
	if (keyBinding.win && typeof keyBinding.win !== 'string') {
		rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'win'));
		return false;
	}
	return true;
}

let keybindingType:IJSONSchema = {
	type: 'object',
	default: { command: '', key: '' },
	properties: {
		command: {
			description: nls.localize('vscode.extension.contributes.keybindings.command', 'Identifier of the command to run when keybinding is triggered.'),
			type: 'string'
		},
		key: {
			description: nls.localize('vscode.extension.contributes.keybindings.key', 'Key or key sequence (separate keys with plus-sign and sequences with space, e.g Ctrl+O and Ctrl+L L for a chord'),
			type: 'string'
		},
		mac: {
			description: nls.localize('vscode.extension.contributes.keybindings.mac', 'Mac specific key or key sequence.'),
			type: 'string'
		},
		linux: {
			description: nls.localize('vscode.extension.contributes.keybindings.linux', 'Linux specific key or key sequence.'),
			type: 'string'
		},
		win: {
			description: nls.localize('vscode.extension.contributes.keybindings.win', 'Windows specific key or key sequence.'),
			type: 'string'
		},
		when: {
			description: nls.localize('vscode.extension.contributes.keybindings.when', 'Condition when the key is active.'),
			type: 'string'
		}
	}
};

let keybindingsExtPoint = PluginsRegistry.registerExtensionPoint<ContributedKeyBinding | ContributedKeyBinding[]>('keybindings', {
	description: nls.localize('vscode.extension.contributes.keybindings', "Contributes keybindings."),
	oneOf: [
		keybindingType,
		{
			type: 'array',
			items: keybindingType
		}
	]
});

let getNativeKeymap = (function() {
	let called = false;
	let result: nativeKeymap.INativeKeyMap[];

	return function getNativeKeymap() {
		if (!called) {
			called = true;
			result = nativeKeymap.getKeyMap();
		}
		return result;
	};
})();

// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
// See https://github.com/alexandrudima/vscode-keyboard/blob/master/deps/chromium/keyboard_codes_win.h
const NATIVE_KEY_CODE_TO_KEY_CODE: {[nativeKeyCode:string]:KeyCode;} = {
	VKEY_BACK: KeyCode.Backspace,
	VKEY_TAB: KeyCode.Tab,
	VKEY_CLEAR: KeyCode.Unknown, // MISSING
	VKEY_RETURN: KeyCode.Enter,
	VKEY_SHIFT: KeyCode.Shift,
	VKEY_CONTROL: KeyCode.Ctrl,
	VKEY_MENU: KeyCode.Alt,
	VKEY_PAUSE: KeyCode.PauseBreak,
	VKEY_CAPITAL: KeyCode.CapsLock,
	VKEY_KANA: KeyCode.Unknown, // MISSING
	VKEY_HANGUL: KeyCode.Unknown, // MISSING
	VKEY_JUNJA: KeyCode.Unknown, // MISSING
	VKEY_FINAL: KeyCode.Unknown, // MISSING
	VKEY_HANJA: KeyCode.Unknown, // MISSING
	VKEY_KANJI: KeyCode.Unknown, // MISSING
	VKEY_ESCAPE: KeyCode.Escape,
	VKEY_CONVERT: KeyCode.Unknown, // MISSING
	VKEY_NONCONVERT: KeyCode.Unknown, // MISSING
	VKEY_ACCEPT: KeyCode.Unknown, // MISSING
	VKEY_MODECHANGE: KeyCode.Unknown, // MISSING
	VKEY_SPACE: KeyCode.Space,
	VKEY_PRIOR: KeyCode.PageUp,
	VKEY_NEXT: KeyCode.PageDown,
	VKEY_END: KeyCode.End,
	VKEY_HOME: KeyCode.Home,
	VKEY_LEFT: KeyCode.LeftArrow,
	VKEY_UP: KeyCode.UpArrow,
	VKEY_RIGHT: KeyCode.RightArrow,
	VKEY_DOWN: KeyCode.DownArrow,
	VKEY_SELECT: KeyCode.Unknown, // MISSING
	VKEY_PRINT: KeyCode.Unknown, // MISSING
	VKEY_EXECUTE: KeyCode.Unknown, // MISSING
	VKEY_SNAPSHOT: KeyCode.Unknown, // MISSING
	VKEY_INSERT: KeyCode.Insert,
	VKEY_DELETE: KeyCode.Delete,
	VKEY_HELP: KeyCode.Unknown, // MISSING
	VKEY_0: KeyCode.KEY_0,
	VKEY_1: KeyCode.KEY_1,
	VKEY_2: KeyCode.KEY_2,
	VKEY_3: KeyCode.KEY_3,
	VKEY_4: KeyCode.KEY_4,
	VKEY_5: KeyCode.KEY_5,
	VKEY_6: KeyCode.KEY_6,
	VKEY_7: KeyCode.KEY_7,
	VKEY_8: KeyCode.KEY_8,
	VKEY_9: KeyCode.KEY_9,
	VKEY_A: KeyCode.KEY_A,
	VKEY_B: KeyCode.KEY_B,
	VKEY_C: KeyCode.KEY_C,
	VKEY_D: KeyCode.KEY_D,
	VKEY_E: KeyCode.KEY_E,
	VKEY_F: KeyCode.KEY_F,
	VKEY_G: KeyCode.KEY_G,
	VKEY_H: KeyCode.KEY_H,
	VKEY_I: KeyCode.KEY_I,
	VKEY_J: KeyCode.KEY_J,
	VKEY_K: KeyCode.KEY_K,
	VKEY_L: KeyCode.KEY_L,
	VKEY_M: KeyCode.KEY_M,
	VKEY_N: KeyCode.KEY_N,
	VKEY_O: KeyCode.KEY_O,
	VKEY_P: KeyCode.KEY_P,
	VKEY_Q: KeyCode.KEY_Q,
	VKEY_R: KeyCode.KEY_R,
	VKEY_S: KeyCode.KEY_S,
	VKEY_T: KeyCode.KEY_T,
	VKEY_U: KeyCode.KEY_U,
	VKEY_V: KeyCode.KEY_V,
	VKEY_W: KeyCode.KEY_W,
	VKEY_X: KeyCode.KEY_X,
	VKEY_Y: KeyCode.KEY_Y,
	VKEY_Z: KeyCode.KEY_Z,
	VKEY_LWIN: KeyCode.Meta,
	VKEY_COMMAND: KeyCode.Meta,
	VKEY_RWIN: KeyCode.Meta,
	VKEY_APPS: KeyCode.Unknown, // MISSING
	VKEY_SLEEP: KeyCode.Unknown, // MISSING
	VKEY_NUMPAD0: KeyCode.NUMPAD_0,
	VKEY_NUMPAD1: KeyCode.NUMPAD_1,
	VKEY_NUMPAD2: KeyCode.NUMPAD_2,
	VKEY_NUMPAD3: KeyCode.NUMPAD_3,
	VKEY_NUMPAD4: KeyCode.NUMPAD_4,
	VKEY_NUMPAD5: KeyCode.NUMPAD_5,
	VKEY_NUMPAD6: KeyCode.NUMPAD_6,
	VKEY_NUMPAD7: KeyCode.NUMPAD_7,
	VKEY_NUMPAD8: KeyCode.NUMPAD_8,
	VKEY_NUMPAD9: KeyCode.NUMPAD_9,
	VKEY_MULTIPLY: KeyCode.NUMPAD_MULTIPLY,
	VKEY_ADD: KeyCode.NUMPAD_ADD,
	VKEY_SEPARATOR: KeyCode.NUMPAD_SEPARATOR,
	VKEY_SUBTRACT: KeyCode.NUMPAD_SUBTRACT,
	VKEY_DECIMAL: KeyCode.NUMPAD_DECIMAL,
	VKEY_DIVIDE: KeyCode.NUMPAD_DIVIDE,
	VKEY_F1: KeyCode.F1,
	VKEY_F2: KeyCode.F2,
	VKEY_F3: KeyCode.F3,
	VKEY_F4: KeyCode.F4,
	VKEY_F5: KeyCode.F5,
	VKEY_F6: KeyCode.F6,
	VKEY_F7: KeyCode.F7,
	VKEY_F8: KeyCode.F8,
	VKEY_F9: KeyCode.F9,
	VKEY_F10: KeyCode.F10,
	VKEY_F11: KeyCode.F11,
	VKEY_F12: KeyCode.F12,
	VKEY_F13: KeyCode.F13,
	VKEY_F14: KeyCode.F14,
	VKEY_F15: KeyCode.F15,
	VKEY_F16: KeyCode.F16,
	VKEY_F17: KeyCode.F17,
	VKEY_F18: KeyCode.F18,
	VKEY_F19: KeyCode.F19,
	VKEY_F20: KeyCode.Unknown, // MISSING
	VKEY_F21: KeyCode.Unknown, // MISSING
	VKEY_F22: KeyCode.Unknown, // MISSING
	VKEY_F23: KeyCode.Unknown, // MISSING
	VKEY_F24: KeyCode.Unknown, // MISSING
	VKEY_NUMLOCK: KeyCode.NumLock,
	VKEY_SCROLL: KeyCode.ScrollLock,
	VKEY_LSHIFT: KeyCode.Shift,
	VKEY_RSHIFT: KeyCode.Shift,
	VKEY_LCONTROL: KeyCode.Ctrl,
	VKEY_RCONTROL: KeyCode.Ctrl,
	VKEY_LMENU: KeyCode.Unknown, // MISSING
	VKEY_RMENU: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_BACK: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_FORWARD: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_REFRESH: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_STOP: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_SEARCH: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_FAVORITES: KeyCode.Unknown, // MISSING
	VKEY_BROWSER_HOME: KeyCode.Unknown, // MISSING
	VKEY_VOLUME_MUTE: KeyCode.Unknown, // MISSING
	VKEY_VOLUME_DOWN: KeyCode.Unknown, // MISSING
	VKEY_VOLUME_UP: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_NEXT_TRACK: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_PREV_TRACK: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_STOP: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_PLAY_PAUSE: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_LAUNCH_MAIL: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_LAUNCH_MEDIA_SELECT: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_LAUNCH_APP1: KeyCode.Unknown, // MISSING
	VKEY_MEDIA_LAUNCH_APP2: KeyCode.Unknown, // MISSING
	VKEY_OEM_1: KeyCode.US_SEMICOLON,
	VKEY_OEM_PLUS: KeyCode.US_EQUAL,
	VKEY_OEM_COMMA: KeyCode.US_COMMA,
	VKEY_OEM_MINUS: KeyCode.US_MINUS,
	VKEY_OEM_PERIOD: KeyCode.US_DOT,
	VKEY_OEM_2: KeyCode.US_SLASH,
	VKEY_OEM_3: KeyCode.US_BACKTICK,
	VKEY_OEM_4: KeyCode.US_OPEN_SQUARE_BRACKET,
	VKEY_OEM_5: KeyCode.US_BACKSLASH,
	VKEY_OEM_6: KeyCode.US_CLOSE_SQUARE_BRACKET,
	VKEY_OEM_7: KeyCode.US_QUOTE,
	VKEY_OEM_8: KeyCode.Unknown, // MISSING
	VKEY_OEM_102: KeyCode.Unknown, // MISSING
	VKEY_PROCESSKEY: KeyCode.Unknown, // MISSING
	VKEY_PACKET: KeyCode.Unknown, // MISSING
	VKEY_DBE_SBCSCHAR: KeyCode.Unknown, // MISSING
	VKEY_DBE_DBCSCHAR: KeyCode.Unknown, // MISSING
	VKEY_ATTN: KeyCode.Unknown, // MISSING
	VKEY_CRSEL: KeyCode.Unknown, // MISSING
	VKEY_EXSEL: KeyCode.Unknown, // MISSING
	VKEY_EREOF: KeyCode.Unknown, // MISSING
	VKEY_PLAY: KeyCode.Unknown, // MISSING
	VKEY_ZOOM: KeyCode.Unknown, // MISSING
	VKEY_NONAME: KeyCode.Unknown, // MISSING
	VKEY_PA1: KeyCode.Unknown, // MISSING
	VKEY_OEM_CLEAR: KeyCode.Unknown, // MISSING
	VKEY_UNKNOWN: KeyCode.Unknown,

	// Windows does not have a specific key code for AltGr. We use the unused
	// VK_OEM_AX to represent AltGr, matching the behaviour of Firefox on Linux.
	VKEY_ALTGR: KeyCode.Unknown, // MISSING
};

// See http://www.w3.org/TR/DOM-Level-3-Events/#h-optionally-fixed-virtual-key-codes
// See issue #1302: Chromium has implemented section B.2.4 of DOM Level 3 Events on mac
// This is bad news because we cannot trust the event's keyCode to be the actual pressed key.
// Here we try to find out the actual pressed key by "undoing" their massaging

// Key                       Character         Virtual Key Code
// Semicolon                 ';'	                  186
// Colon                     ':'                      186
// Equals sign               '='                      187
// Plus                      '+'                      187
// Comma                     ','                      188
// Less than sign            '<'                      188
// Minus                     '-'                      189
// Underscore                '_'                      189
// Period                    '.'                      190
// Greater than sign         '>'                      190
// Forward slash             '/'                      191
// Question mark             '?'                      191
// Backtick                  '`'                      192
// Tilde                     '~'                      192
// Opening square bracket    '['                      219
// Opening curly brace       '{'                      219
// Backslash                 '\'                      220
// Pipe                      '|'                      220
// Closing square bracket    ']'                      221
// Closing curly brace       '}'                      221
// Single quote              '''                      222
// Double quote              '"'                      222

interface IFixedVirtualKeyCodeElement {
	char:string;
	virtualKeyCode:number;
}

let _b24_fixedVirtualKeyCodes: IFixedVirtualKeyCodeElement[] = [
	{ char: ';',	virtualKeyCode: 186 },
	{ char: ':',	virtualKeyCode: 186 },
	{ char: '=',	virtualKeyCode: 187 },
	{ char: '+',	virtualKeyCode: 187 },
	{ char: ',',	virtualKeyCode: 188 },
	{ char: '<',	virtualKeyCode: 188 },
	{ char: '-',	virtualKeyCode: 189 },
	{ char: '_',	virtualKeyCode: 189 },
	{ char: '.',	virtualKeyCode: 190 },
	{ char: '>',	virtualKeyCode: 190 },
	{ char: '/',	virtualKeyCode: 191 },
	{ char: '?',	virtualKeyCode: 191 },
	{ char: '`',	virtualKeyCode: 192 },
	{ char: '~',	virtualKeyCode: 192 },
	{ char: '[',	virtualKeyCode: 219 },
	{ char: '{',	virtualKeyCode: 219 },
	{ char: '\\',	virtualKeyCode: 220 },
	{ char: '|',	virtualKeyCode: 220 },
	{ char: ']',	virtualKeyCode: 221 },
	{ char: '}',	virtualKeyCode: 221 },
	{ char: '\'',	virtualKeyCode: 222 },
	{ char: '"',	virtualKeyCode: 222 },
];
let _b24_interestingChars: {[char:string]:boolean;} = Object.create(null);
_b24_fixedVirtualKeyCodes.forEach(el => _b24_interestingChars[el.char] = true);

let _b24_interestingVirtualKeyCodes: {[virtualKeyCode:number]:boolean;} = Object.create(null);
_b24_fixedVirtualKeyCodes.forEach(el => _b24_interestingVirtualKeyCodes[el.virtualKeyCode] = true);

interface IUnfixedVirtualKeyCodeMap {
	[char:string]: KeyCode;
}
let _b24_getActualKeyCodeMap = (function() {
	let result: IUnfixedVirtualKeyCodeMap = null;
	return function() {
		if (!result) {
			result = Object.create(null);

			let nativeMappings = getNativeKeymap();

			for (let i = 0, len = nativeMappings.length; i < len; i++) {
				let nativeMapping = nativeMappings[i];

				if (nativeMapping.value && _b24_interestingChars[nativeMapping.value]) {
					// console.log(nativeMapping.value + " is made by " + nativeMapping.key_code);
					let keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[nativeMapping.key_code];
					if (keyCode && keyCode !== KeyCode.Unknown) {
						if (!result[nativeMapping.value] || result[nativeMapping.value] > keyCode) {
							result[nativeMapping.value] = keyCode;
						}
					}
				}

				if (nativeMapping.withShift && _b24_interestingChars[nativeMapping.withShift]) {
					// console.log(nativeMapping.withShift + " is made by " + nativeMapping.key_code);
					let keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[nativeMapping.key_code];
					if (keyCode && keyCode !== KeyCode.Unknown) {
						if (!result[nativeMapping.withShift] || result[nativeMapping.withShift] > keyCode) {
							result[nativeMapping.withShift] = keyCode;
						}
					}
				}
			}
		}
		return result;
	};
})();

setExtractKeyCode((e:KeyboardEvent) => {
	if (e.charCode) {
		// "keypress" events mostly
		let char = String.fromCharCode(e.charCode).toUpperCase();
		return KeyCode.fromString(char);
	}

	if (Platform.isMacintosh && _b24_interestingVirtualKeyCodes[e.keyCode] && typeof (<any>e).keyIdentifier === 'string') {
		let keyIdentifier:string = (<any>e).keyIdentifier;
		let strCharCode = keyIdentifier.substr(2);
		try {
			let charCode = parseInt(strCharCode, 16);
			let char = String.fromCharCode(charCode);
			let unfixMap = _b24_getActualKeyCodeMap();
			if (unfixMap[char]) {
				return unfixMap[char];
			}
			// console.log(keyIdentifier + ' => ' + char);
		} catch(err) {
		}
	}
	// _b24_getActualKeyCodeMap();
	// console.log('injected!!!');

	return lookupKeyCode(e);
});

export default class PluginWorkbenchKeybindingService extends WorkbenchKeybindingService {

	private _pluginService: IPluginService;
	private _eventService: IEventService;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService, telemetryService: ITelemetryService, domNode: HTMLElement) {
		super(contextService, eventService, telemetryService, domNode);
		this._eventService = eventService;
		keybindingsExtPoint.setHandler((extensions) => {
			let commandAdded = false;

			for (let extension of extensions) {
				commandAdded = this._handleKeybindingsExtensionPointUser(extension.description.isBuiltin, extension.value, extension.collector) || commandAdded;
			}

			if (commandAdded) {
				this.updateResolver();
			}
		});
	}

	setPluginService(pluginService: IPluginService): void {
		this._pluginService = pluginService;
	}

	public getLabelFor(keybinding:Keybinding): string {
		this._ensureNativeKeymap();
		return keybinding.toCustomLabel(this._nativeLabelProvider);
	}

	public getHTMLLabelFor(keybinding:Keybinding): IHTMLContentElement[] {
		this._ensureNativeKeymap();
		return keybinding.toCustomHTMLLabel(this._nativeLabelProvider);
	}

	public getElectronAcceleratorFor(keybinding:Keybinding): string {
		if (Platform.isWindows) {
			// electron menus always do the correct rendering on Windows
			return super.getElectronAcceleratorFor(keybinding);
		}

		let usLabel = keybinding._toUSLabel();
		let label = this.getLabelFor(keybinding);
		if (usLabel !== label) {
			// electron menus are incorrect in rendering (linux) and in rendering and interpreting (mac)
			// for non US standard keyboard layouts
			return null;
		}

		return super.getElectronAcceleratorFor(keybinding);
	}

	private _handleKeybindingsExtensionPointUser(isBuiltin: boolean, keybindings:ContributedKeyBinding | ContributedKeyBinding[], collector:IMessageCollector): boolean {
		if (isContributedKeyBindingsArray(keybindings)) {
			let commandAdded = false;
			for (let i = 0, len = keybindings.length; i < len; i++) {
				commandAdded = this._handleKeybinding(isBuiltin, i + 1, keybindings[i], collector) || commandAdded;
			}
			return commandAdded;
		} else {
			return this._handleKeybinding(isBuiltin, 1, keybindings, collector);
		}
	}

	private _handleKeybinding(isBuiltin: boolean, idx:number, keybindings:ContributedKeyBinding, collector:IMessageCollector): boolean {

		let rejects: string[] = [];
		let commandAdded = false;

		if (isValidContributedKeyBinding(keybindings, rejects)) {
			let rule = this._asCommandRule(isBuiltin, idx++, keybindings);
			if (rule) {
				KeybindingsRegistry.registerCommandRule(rule);
				commandAdded = true;
			}
		}

		if (rejects.length > 0) {
			collector.error(nls.localize(
				'invalid.keybindings',
				"Invalid `contributes.{0}`: {1}",
				keybindingsExtPoint.name,
				rejects.join('\n')
			));
		}

		return commandAdded;
	}

	protected _invokeHandler(commandId: string, args: any): TPromise<any> {
		if (this._pluginService) {
			return this._pluginService.activateByEvent('onCommand:' + commandId).then(_ => {
				return super._invokeHandler(commandId, args);
			});
		}
		return TPromise.as(null);
	}

	private _asCommandRule(isBuiltin: boolean, idx:number, binding: ContributedKeyBinding): ICommandRule {

		let {command, when, key, mac, linux, win} = binding;

		let weight: number;
		if (isBuiltin) {
			weight = KeybindingsRegistry.WEIGHT.builtinExtension(idx);
		} else {
			weight = KeybindingsRegistry.WEIGHT.externalExtension(idx);
		}

		let desc = {
			id: command,
			context: IOSupport.readKeybindingContexts(when),
			weight: weight,
			primary: IOSupport.readKeybinding(key),
			mac: mac && { primary: IOSupport.readKeybinding(mac) },
			linux: linux && { primary: IOSupport.readKeybinding(linux) },
			win: win && { primary: IOSupport.readKeybinding(win) }
		};

		if (!desc.primary && !desc.mac && !desc.linux && !desc.win) {
			return;
		}

		return desc;
	}

	private _gotNativeKeymap = false;
	private _nativeLabelProvider:IKeyBindingLabelProvider = null;
	private _ensureNativeKeymap(): void {
		if (this._gotNativeKeymap) {
			return;
		}
		this._gotNativeKeymap = true;

		// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
		// See https://github.com/alexandrudima/vscode-keyboard/blob/master/deps/chromium/keyboard_codes_win.h
		let interestingKeyCodes:{[vkeyCode:string]:boolean;} = {
			VKEY_OEM_1: true,
			VKEY_OEM_PLUS: true,
			VKEY_OEM_COMMA: true,
			VKEY_OEM_MINUS: true,
			VKEY_OEM_PERIOD: true,
			VKEY_OEM_2: true,
			VKEY_OEM_3: true,
			VKEY_OEM_4: true,
			VKEY_OEM_5: true,
			VKEY_OEM_6: true,
			VKEY_OEM_7: true,
		};

		let remaps:string[] = [];
		for (let i = 0, len = KeyCode.MAX_VALUE; i < len; i++) {
			remaps[i] = null;
		}

		let nativeMappings = getNativeKeymap();
		let hadRemap = false;
		for (let i = 0, len = nativeMappings.length; i < len; i++) {
			let nativeMapping = nativeMappings[i];

			if (interestingKeyCodes[nativeMapping.key_code]) {
				let newValue = nativeMapping.value || nativeMapping.withShift;
				if (newValue.length > 0) {
					hadRemap = true;
					remaps[NATIVE_KEY_CODE_TO_KEY_CODE[nativeMapping.key_code]] = newValue;
				} else {
					// console.warn('invalid remap for ', nativeMapping);
				}
			}
		}

		if (hadRemap) {
			for (let interestingKeyCode in interestingKeyCodes) {
				if (interestingKeyCodes.hasOwnProperty(interestingKeyCode)) {
					let keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[interestingKeyCode];
					remaps[keyCode] = remaps[keyCode] || '';
				}
			}
		}

		if (Platform.isMacintosh) {
			this._nativeLabelProvider = new NativeMacUIKeyLabelProvider(remaps);
		} else {
			this._nativeLabelProvider = new NativeClassicUIKeyLabelProvider(remaps);
		}
	}
}

class NativeMacUIKeyLabelProvider extends MacUIKeyLabelProvider {
	constructor(private remaps:string[]) {
		super();
	}

	public getLabelForKey(keyCode:KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode];
		}
		return super.getLabelForKey(keyCode);
	}
}

class NativeClassicUIKeyLabelProvider extends ClassicUIKeyLabelProvider {
	constructor(private remaps:string[]) {
		super();
	}

	public getLabelForKey(keyCode:KeyCode): string {
		if (this.remaps[keyCode] !== null) {
			return this.remaps[keyCode];
		}
		return super.getLabelForKey(keyCode);
	}
}
