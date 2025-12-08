/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Virtual Key Codes, the value does not hold any inherent meaning.
 * Inspired somewhat from https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
 * But these are "more general", as they should work across browsers & OS`s.
 */
export const enum KeyCode {
	DependsOnKbLayout = -1,

	/**
	 * Placed first to cover the 0 value of the enum.
	 */
	Unknown = 0,

	Backspace,
	Tab,
	Enter,
	Shift,
	Ctrl,
	Alt,
	PauseBreak,
	CapsLock,
	Escape,
	Space,
	PageUp,
	PageDown,
	End,
	Home,
	LeftArrow,
	UpArrow,
	RightArrow,
	DownArrow,
	Insert,
	Delete,

	Digit0,
	Digit1,
	Digit2,
	Digit3,
	Digit4,
	Digit5,
	Digit6,
	Digit7,
	Digit8,
	Digit9,

	KeyA,
	KeyB,
	KeyC,
	KeyD,
	KeyE,
	KeyF,
	KeyG,
	KeyH,
	KeyI,
	KeyJ,
	KeyK,
	KeyL,
	KeyM,
	KeyN,
	KeyO,
	KeyP,
	KeyQ,
	KeyR,
	KeyS,
	KeyT,
	KeyU,
	KeyV,
	KeyW,
	KeyX,
	KeyY,
	KeyZ,

	Meta,
	ContextMenu,

	F1,
	F2,
	F3,
	F4,
	F5,
	F6,
	F7,
	F8,
	F9,
	F10,
	F11,
	F12,
	F13,
	F14,
	F15,
	F16,
	F17,
	F18,
	F19,
	F20,
	F21,
	F22,
	F23,
	F24,

	NumLock,
	ScrollLock,

	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ';:' key
	 */
	Semicolon,
	/**
	 * For any country/region, the '+' key
	 * For the US standard keyboard, the '=+' key
	 */
	Equal,
	/**
	 * For any country/region, the ',' key
	 * For the US standard keyboard, the ',<' key
	 */
	Comma,
	/**
	 * For any country/region, the '-' key
	 * For the US standard keyboard, the '-_' key
	 */
	Minus,
	/**
	 * For any country/region, the '.' key
	 * For the US standard keyboard, the '.>' key
	 */
	Period,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '/?' key
	 */
	Slash,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '`~' key
	 */
	Backquote,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '[{' key
	 */
	BracketLeft,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '\|' key
	 */
	Backslash,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ']}' key
	 */
	BracketRight,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ''"' key
	 */
	Quote,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 */
	OEM_8,
	/**
	 * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
	 */
	IntlBackslash,

	Numpad0, // VK_NUMPAD0, 0x60, Numeric keypad 0 key
	Numpad1, // VK_NUMPAD1, 0x61, Numeric keypad 1 key
	Numpad2, // VK_NUMPAD2, 0x62, Numeric keypad 2 key
	Numpad3, // VK_NUMPAD3, 0x63, Numeric keypad 3 key
	Numpad4, // VK_NUMPAD4, 0x64, Numeric keypad 4 key
	Numpad5, // VK_NUMPAD5, 0x65, Numeric keypad 5 key
	Numpad6, // VK_NUMPAD6, 0x66, Numeric keypad 6 key
	Numpad7, // VK_NUMPAD7, 0x67, Numeric keypad 7 key
	Numpad8, // VK_NUMPAD8, 0x68, Numeric keypad 8 key
	Numpad9, // VK_NUMPAD9, 0x69, Numeric keypad 9 key

	NumpadMultiply,	// VK_MULTIPLY, 0x6A, Multiply key
	NumpadAdd,		// VK_ADD, 0x6B, Add key
	NUMPAD_SEPARATOR,	// VK_SEPARATOR, 0x6C, Separator key
	NumpadSubtract,	// VK_SUBTRACT, 0x6D, Subtract key
	NumpadDecimal,	// VK_DECIMAL, 0x6E, Decimal key
	NumpadDivide,	// VK_DIVIDE, 0x6F,

	/**
	 * Cover all key codes when IME is processing input.
	 */
	KEY_IN_COMPOSITION,

	ABNT_C1, // Brazilian (ABNT) Keyboard
	ABNT_C2, // Brazilian (ABNT) Keyboard

	AudioVolumeMute,
	AudioVolumeUp,
	AudioVolumeDown,

	BrowserSearch,
	BrowserHome,
	BrowserBack,
	BrowserForward,

	MediaTrackNext,
	MediaTrackPrevious,
	MediaStop,
	MediaPlayPause,
	LaunchMediaPlayer,
	LaunchMail,
	LaunchApp2,

	/**
	 * VK_CLEAR, 0x0C, CLEAR key
	 */
	Clear,

	/**
	 * Placed last to cover the length of the enum.
	 * Please do not depend on this value!
	 */
	MAX_VALUE
}

/**
 * keyboardEvent.code
 */
export const enum ScanCode {
	DependsOnKbLayout = -1,
	None,
	Hyper,
	Super,
	Fn,
	FnLock,
	Suspend,
	Resume,
	Turbo,
	Sleep,
	WakeUp,
	KeyA,
	KeyB,
	KeyC,
	KeyD,
	KeyE,
	KeyF,
	KeyG,
	KeyH,
	KeyI,
	KeyJ,
	KeyK,
	KeyL,
	KeyM,
	KeyN,
	KeyO,
	KeyP,
	KeyQ,
	KeyR,
	KeyS,
	KeyT,
	KeyU,
	KeyV,
	KeyW,
	KeyX,
	KeyY,
	KeyZ,
	Digit1,
	Digit2,
	Digit3,
	Digit4,
	Digit5,
	Digit6,
	Digit7,
	Digit8,
	Digit9,
	Digit0,
	Enter,
	Escape,
	Backspace,
	Tab,
	Space,
	Minus,
	Equal,
	BracketLeft,
	BracketRight,
	Backslash,
	IntlHash,
	Semicolon,
	Quote,
	Backquote,
	Comma,
	Period,
	Slash,
	CapsLock,
	F1,
	F2,
	F3,
	F4,
	F5,
	F6,
	F7,
	F8,
	F9,
	F10,
	F11,
	F12,
	PrintScreen,
	ScrollLock,
	Pause,
	Insert,
	Home,
	PageUp,
	Delete,
	End,
	PageDown,
	ArrowRight,
	ArrowLeft,
	ArrowDown,
	ArrowUp,
	NumLock,
	NumpadDivide,
	NumpadMultiply,
	NumpadSubtract,
	NumpadAdd,
	NumpadEnter,
	Numpad1,
	Numpad2,
	Numpad3,
	Numpad4,
	Numpad5,
	Numpad6,
	Numpad7,
	Numpad8,
	Numpad9,
	Numpad0,
	NumpadDecimal,
	IntlBackslash,
	ContextMenu,
	Power,
	NumpadEqual,
	F13,
	F14,
	F15,
	F16,
	F17,
	F18,
	F19,
	F20,
	F21,
	F22,
	F23,
	F24,
	Open,
	Help,
	Select,
	Again,
	Undo,
	Cut,
	Copy,
	Paste,
	Find,
	AudioVolumeMute,
	AudioVolumeUp,
	AudioVolumeDown,
	NumpadComma,
	IntlRo,
	KanaMode,
	IntlYen,
	Convert,
	NonConvert,
	Lang1,
	Lang2,
	Lang3,
	Lang4,
	Lang5,
	Abort,
	Props,
	NumpadParenLeft,
	NumpadParenRight,
	NumpadBackspace,
	NumpadMemoryStore,
	NumpadMemoryRecall,
	NumpadMemoryClear,
	NumpadMemoryAdd,
	NumpadMemorySubtract,
	NumpadClear,
	NumpadClearEntry,
	ControlLeft,
	ShiftLeft,
	AltLeft,
	MetaLeft,
	ControlRight,
	ShiftRight,
	AltRight,
	MetaRight,
	BrightnessUp,
	BrightnessDown,
	MediaPlay,
	MediaRecord,
	MediaFastForward,
	MediaRewind,
	MediaTrackNext,
	MediaTrackPrevious,
	MediaStop,
	Eject,
	MediaPlayPause,
	MediaSelect,
	LaunchMail,
	LaunchApp2,
	LaunchApp1,
	SelectTask,
	LaunchScreenSaver,
	BrowserSearch,
	BrowserHome,
	BrowserBack,
	BrowserForward,
	BrowserStop,
	BrowserRefresh,
	BrowserFavorites,
	ZoomToggle,
	MailReply,
	MailForward,
	MailSend,

	MAX_VALUE
}

class KeyCodeStrMap {

	public _keyCodeToStr: string[];
	public _strToKeyCode: { [str: string]: KeyCode };

	constructor() {
		this._keyCodeToStr = [];
		this._strToKeyCode = Object.create(null);
	}

	define(keyCode: KeyCode, str: string): void {
		this._keyCodeToStr[keyCode] = str;
		this._strToKeyCode[str.toLowerCase()] = keyCode;
	}

	keyCodeToStr(keyCode: KeyCode): string {
		return this._keyCodeToStr[keyCode];
	}

	strToKeyCode(str: string): KeyCode {
		return this._strToKeyCode[str.toLowerCase()] || KeyCode.Unknown;
	}
}

const uiMap = new KeyCodeStrMap();
const userSettingsUSMap = new KeyCodeStrMap();
const userSettingsGeneralMap = new KeyCodeStrMap();
export const EVENT_KEY_CODE_MAP: { [keyCode: number]: KeyCode } = new Array(230);
export const NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE: { [nativeKeyCode: string]: KeyCode } = {};
const scanCodeIntToStr: string[] = [];
const scanCodeStrToInt: { [code: string]: number } = Object.create(null);
const scanCodeLowerCaseStrToInt: { [code: string]: number } = Object.create(null);

export const ScanCodeUtils = {
	lowerCaseToEnum: (scanCode: string) => scanCodeLowerCaseStrToInt[scanCode] || ScanCode.None,
	toEnum: (scanCode: string) => scanCodeStrToInt[scanCode] || ScanCode.None,
	toString: (scanCode: ScanCode) => scanCodeIntToStr[scanCode] || 'None'
};

/**
 * -1 if a ScanCode => KeyCode mapping depends on kb layout.
 */
export const IMMUTABLE_CODE_TO_KEY_CODE: KeyCode[] = [];

/**
 * -1 if a KeyCode => ScanCode mapping depends on kb layout.
 */
export const IMMUTABLE_KEY_CODE_TO_CODE: ScanCode[] = [];

for (let i = 0; i <= ScanCode.MAX_VALUE; i++) {
	IMMUTABLE_CODE_TO_KEY_CODE[i] = KeyCode.DependsOnKbLayout;
}

for (let i = 0; i <= KeyCode.MAX_VALUE; i++) {
	IMMUTABLE_KEY_CODE_TO_CODE[i] = ScanCode.DependsOnKbLayout;
}

(function () {

	// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
	// See https://github.com/microsoft/node-native-keymap/blob/88c0b0e5/deps/chromium/keyboard_codes_win.h

	const empty = '';
	type IMappingEntry = [0 | 1, ScanCode, string, KeyCode, string, number, string, string, string];
	const mappings: IMappingEntry[] = [
		// immutable, scanCode, scanCodeStr, keyCode, keyCodeStr, eventKeyCode, vkey, usUserSettingsLabel, generalUserSettingsLabel
		[1, ScanCode.None, 'None', KeyCode.Unknown, 'unknown', 0, 'VK_UNKNOWN', empty, empty],
		[1, ScanCode.Hyper, 'Hyper', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Super, 'Super', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Fn, 'Fn', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.FnLock, 'FnLock', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Suspend, 'Suspend', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Resume, 'Resume', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Turbo, 'Turbo', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Sleep, 'Sleep', KeyCode.Unknown, empty, 0, 'VK_SLEEP', empty, empty],
		[1, ScanCode.WakeUp, 'WakeUp', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, ScanCode.KeyA, 'KeyA', KeyCode.KeyA, 'A', 65, 'VK_A', empty, empty],
		[0, ScanCode.KeyB, 'KeyB', KeyCode.KeyB, 'B', 66, 'VK_B', empty, empty],
		[0, ScanCode.KeyC, 'KeyC', KeyCode.KeyC, 'C', 67, 'VK_C', empty, empty],
		[0, ScanCode.KeyD, 'KeyD', KeyCode.KeyD, 'D', 68, 'VK_D', empty, empty],
		[0, ScanCode.KeyE, 'KeyE', KeyCode.KeyE, 'E', 69, 'VK_E', empty, empty],
		[0, ScanCode.KeyF, 'KeyF', KeyCode.KeyF, 'F', 70, 'VK_F', empty, empty],
		[0, ScanCode.KeyG, 'KeyG', KeyCode.KeyG, 'G', 71, 'VK_G', empty, empty],
		[0, ScanCode.KeyH, 'KeyH', KeyCode.KeyH, 'H', 72, 'VK_H', empty, empty],
		[0, ScanCode.KeyI, 'KeyI', KeyCode.KeyI, 'I', 73, 'VK_I', empty, empty],
		[0, ScanCode.KeyJ, 'KeyJ', KeyCode.KeyJ, 'J', 74, 'VK_J', empty, empty],
		[0, ScanCode.KeyK, 'KeyK', KeyCode.KeyK, 'K', 75, 'VK_K', empty, empty],
		[0, ScanCode.KeyL, 'KeyL', KeyCode.KeyL, 'L', 76, 'VK_L', empty, empty],
		[0, ScanCode.KeyM, 'KeyM', KeyCode.KeyM, 'M', 77, 'VK_M', empty, empty],
		[0, ScanCode.KeyN, 'KeyN', KeyCode.KeyN, 'N', 78, 'VK_N', empty, empty],
		[0, ScanCode.KeyO, 'KeyO', KeyCode.KeyO, 'O', 79, 'VK_O', empty, empty],
		[0, ScanCode.KeyP, 'KeyP', KeyCode.KeyP, 'P', 80, 'VK_P', empty, empty],
		[0, ScanCode.KeyQ, 'KeyQ', KeyCode.KeyQ, 'Q', 81, 'VK_Q', empty, empty],
		[0, ScanCode.KeyR, 'KeyR', KeyCode.KeyR, 'R', 82, 'VK_R', empty, empty],
		[0, ScanCode.KeyS, 'KeyS', KeyCode.KeyS, 'S', 83, 'VK_S', empty, empty],
		[0, ScanCode.KeyT, 'KeyT', KeyCode.KeyT, 'T', 84, 'VK_T', empty, empty],
		[0, ScanCode.KeyU, 'KeyU', KeyCode.KeyU, 'U', 85, 'VK_U', empty, empty],
		[0, ScanCode.KeyV, 'KeyV', KeyCode.KeyV, 'V', 86, 'VK_V', empty, empty],
		[0, ScanCode.KeyW, 'KeyW', KeyCode.KeyW, 'W', 87, 'VK_W', empty, empty],
		[0, ScanCode.KeyX, 'KeyX', KeyCode.KeyX, 'X', 88, 'VK_X', empty, empty],
		[0, ScanCode.KeyY, 'KeyY', KeyCode.KeyY, 'Y', 89, 'VK_Y', empty, empty],
		[0, ScanCode.KeyZ, 'KeyZ', KeyCode.KeyZ, 'Z', 90, 'VK_Z', empty, empty],
		[0, ScanCode.Digit1, 'Digit1', KeyCode.Digit1, '1', 49, 'VK_1', empty, empty],
		[0, ScanCode.Digit2, 'Digit2', KeyCode.Digit2, '2', 50, 'VK_2', empty, empty],
		[0, ScanCode.Digit3, 'Digit3', KeyCode.Digit3, '3', 51, 'VK_3', empty, empty],
		[0, ScanCode.Digit4, 'Digit4', KeyCode.Digit4, '4', 52, 'VK_4', empty, empty],
		[0, ScanCode.Digit5, 'Digit5', KeyCode.Digit5, '5', 53, 'VK_5', empty, empty],
		[0, ScanCode.Digit6, 'Digit6', KeyCode.Digit6, '6', 54, 'VK_6', empty, empty],
		[0, ScanCode.Digit7, 'Digit7', KeyCode.Digit7, '7', 55, 'VK_7', empty, empty],
		[0, ScanCode.Digit8, 'Digit8', KeyCode.Digit8, '8', 56, 'VK_8', empty, empty],
		[0, ScanCode.Digit9, 'Digit9', KeyCode.Digit9, '9', 57, 'VK_9', empty, empty],
		[0, ScanCode.Digit0, 'Digit0', KeyCode.Digit0, '0', 48, 'VK_0', empty, empty],
		[1, ScanCode.Enter, 'Enter', KeyCode.Enter, 'Enter', 13, 'VK_RETURN', empty, empty],
		[1, ScanCode.Escape, 'Escape', KeyCode.Escape, 'Escape', 27, 'VK_ESCAPE', empty, empty],
		[1, ScanCode.Backspace, 'Backspace', KeyCode.Backspace, 'Backspace', 8, 'VK_BACK', empty, empty],
		[1, ScanCode.Tab, 'Tab', KeyCode.Tab, 'Tab', 9, 'VK_TAB', empty, empty],
		[1, ScanCode.Space, 'Space', KeyCode.Space, 'Space', 32, 'VK_SPACE', empty, empty],
		[0, ScanCode.Minus, 'Minus', KeyCode.Minus, '-', 189, 'VK_OEM_MINUS', '-', 'OEM_MINUS'],
		[0, ScanCode.Equal, 'Equal', KeyCode.Equal, '=', 187, 'VK_OEM_PLUS', '=', 'OEM_PLUS'],
		[0, ScanCode.BracketLeft, 'BracketLeft', KeyCode.BracketLeft, '[', 219, 'VK_OEM_4', '[', 'OEM_4'],
		[0, ScanCode.BracketRight, 'BracketRight', KeyCode.BracketRight, ']', 221, 'VK_OEM_6', ']', 'OEM_6'],
		[0, ScanCode.Backslash, 'Backslash', KeyCode.Backslash, '\\', 220, 'VK_OEM_5', '\\', 'OEM_5'],
		[0, ScanCode.IntlHash, 'IntlHash', KeyCode.Unknown, empty, 0, empty, empty, empty], // has been dropped from the w3c spec
		[0, ScanCode.Semicolon, 'Semicolon', KeyCode.Semicolon, ';', 186, 'VK_OEM_1', ';', 'OEM_1'],
		[0, ScanCode.Quote, 'Quote', KeyCode.Quote, '\'', 222, 'VK_OEM_7', '\'', 'OEM_7'],
		[0, ScanCode.Backquote, 'Backquote', KeyCode.Backquote, '`', 192, 'VK_OEM_3', '`', 'OEM_3'],
		[0, ScanCode.Comma, 'Comma', KeyCode.Comma, ',', 188, 'VK_OEM_COMMA', ',', 'OEM_COMMA'],
		[0, ScanCode.Period, 'Period', KeyCode.Period, '.', 190, 'VK_OEM_PERIOD', '.', 'OEM_PERIOD'],
		[0, ScanCode.Slash, 'Slash', KeyCode.Slash, '/', 191, 'VK_OEM_2', '/', 'OEM_2'],
		[1, ScanCode.CapsLock, 'CapsLock', KeyCode.CapsLock, 'CapsLock', 20, 'VK_CAPITAL', empty, empty],
		[1, ScanCode.F1, 'F1', KeyCode.F1, 'F1', 112, 'VK_F1', empty, empty],
		[1, ScanCode.F2, 'F2', KeyCode.F2, 'F2', 113, 'VK_F2', empty, empty],
		[1, ScanCode.F3, 'F3', KeyCode.F3, 'F3', 114, 'VK_F3', empty, empty],
		[1, ScanCode.F4, 'F4', KeyCode.F4, 'F4', 115, 'VK_F4', empty, empty],
		[1, ScanCode.F5, 'F5', KeyCode.F5, 'F5', 116, 'VK_F5', empty, empty],
		[1, ScanCode.F6, 'F6', KeyCode.F6, 'F6', 117, 'VK_F6', empty, empty],
		[1, ScanCode.F7, 'F7', KeyCode.F7, 'F7', 118, 'VK_F7', empty, empty],
		[1, ScanCode.F8, 'F8', KeyCode.F8, 'F8', 119, 'VK_F8', empty, empty],
		[1, ScanCode.F9, 'F9', KeyCode.F9, 'F9', 120, 'VK_F9', empty, empty],
		[1, ScanCode.F10, 'F10', KeyCode.F10, 'F10', 121, 'VK_F10', empty, empty],
		[1, ScanCode.F11, 'F11', KeyCode.F11, 'F11', 122, 'VK_F11', empty, empty],
		[1, ScanCode.F12, 'F12', KeyCode.F12, 'F12', 123, 'VK_F12', empty, empty],
		[1, ScanCode.PrintScreen, 'PrintScreen', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.ScrollLock, 'ScrollLock', KeyCode.ScrollLock, 'ScrollLock', 145, 'VK_SCROLL', empty, empty],
		[1, ScanCode.Pause, 'Pause', KeyCode.PauseBreak, 'PauseBreak', 19, 'VK_PAUSE', empty, empty],
		[1, ScanCode.Insert, 'Insert', KeyCode.Insert, 'Insert', 45, 'VK_INSERT', empty, empty],
		[1, ScanCode.Home, 'Home', KeyCode.Home, 'Home', 36, 'VK_HOME', empty, empty],
		[1, ScanCode.PageUp, 'PageUp', KeyCode.PageUp, 'PageUp', 33, 'VK_PRIOR', empty, empty],
		[1, ScanCode.Delete, 'Delete', KeyCode.Delete, 'Delete', 46, 'VK_DELETE', empty, empty],
		[1, ScanCode.End, 'End', KeyCode.End, 'End', 35, 'VK_END', empty, empty],
		[1, ScanCode.PageDown, 'PageDown', KeyCode.PageDown, 'PageDown', 34, 'VK_NEXT', empty, empty],
		[1, ScanCode.ArrowRight, 'ArrowRight', KeyCode.RightArrow, 'RightArrow', 39, 'VK_RIGHT', 'Right', empty],
		[1, ScanCode.ArrowLeft, 'ArrowLeft', KeyCode.LeftArrow, 'LeftArrow', 37, 'VK_LEFT', 'Left', empty],
		[1, ScanCode.ArrowDown, 'ArrowDown', KeyCode.DownArrow, 'DownArrow', 40, 'VK_DOWN', 'Down', empty],
		[1, ScanCode.ArrowUp, 'ArrowUp', KeyCode.UpArrow, 'UpArrow', 38, 'VK_UP', 'Up', empty],
		[1, ScanCode.NumLock, 'NumLock', KeyCode.NumLock, 'NumLock', 144, 'VK_NUMLOCK', empty, empty],
		[1, ScanCode.NumpadDivide, 'NumpadDivide', KeyCode.NumpadDivide, 'NumPad_Divide', 111, 'VK_DIVIDE', empty, empty],
		[1, ScanCode.NumpadMultiply, 'NumpadMultiply', KeyCode.NumpadMultiply, 'NumPad_Multiply', 106, 'VK_MULTIPLY', empty, empty],
		[1, ScanCode.NumpadSubtract, 'NumpadSubtract', KeyCode.NumpadSubtract, 'NumPad_Subtract', 109, 'VK_SUBTRACT', empty, empty],
		[1, ScanCode.NumpadAdd, 'NumpadAdd', KeyCode.NumpadAdd, 'NumPad_Add', 107, 'VK_ADD', empty, empty],
		[1, ScanCode.NumpadEnter, 'NumpadEnter', KeyCode.Enter, empty, 0, empty, empty, empty],
		[1, ScanCode.Numpad1, 'Numpad1', KeyCode.Numpad1, 'NumPad1', 97, 'VK_NUMPAD1', empty, empty],
		[1, ScanCode.Numpad2, 'Numpad2', KeyCode.Numpad2, 'NumPad2', 98, 'VK_NUMPAD2', empty, empty],
		[1, ScanCode.Numpad3, 'Numpad3', KeyCode.Numpad3, 'NumPad3', 99, 'VK_NUMPAD3', empty, empty],
		[1, ScanCode.Numpad4, 'Numpad4', KeyCode.Numpad4, 'NumPad4', 100, 'VK_NUMPAD4', empty, empty],
		[1, ScanCode.Numpad5, 'Numpad5', KeyCode.Numpad5, 'NumPad5', 101, 'VK_NUMPAD5', empty, empty],
		[1, ScanCode.Numpad6, 'Numpad6', KeyCode.Numpad6, 'NumPad6', 102, 'VK_NUMPAD6', empty, empty],
		[1, ScanCode.Numpad7, 'Numpad7', KeyCode.Numpad7, 'NumPad7', 103, 'VK_NUMPAD7', empty, empty],
		[1, ScanCode.Numpad8, 'Numpad8', KeyCode.Numpad8, 'NumPad8', 104, 'VK_NUMPAD8', empty, empty],
		[1, ScanCode.Numpad9, 'Numpad9', KeyCode.Numpad9, 'NumPad9', 105, 'VK_NUMPAD9', empty, empty],
		[1, ScanCode.Numpad0, 'Numpad0', KeyCode.Numpad0, 'NumPad0', 96, 'VK_NUMPAD0', empty, empty],
		[1, ScanCode.NumpadDecimal, 'NumpadDecimal', KeyCode.NumpadDecimal, 'NumPad_Decimal', 110, 'VK_DECIMAL', empty, empty],
		[0, ScanCode.IntlBackslash, 'IntlBackslash', KeyCode.IntlBackslash, 'OEM_102', 226, 'VK_OEM_102', empty, empty],
		[1, ScanCode.ContextMenu, 'ContextMenu', KeyCode.ContextMenu, 'ContextMenu', 93, empty, empty, empty],
		[1, ScanCode.Power, 'Power', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadEqual, 'NumpadEqual', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.F13, 'F13', KeyCode.F13, 'F13', 124, 'VK_F13', empty, empty],
		[1, ScanCode.F14, 'F14', KeyCode.F14, 'F14', 125, 'VK_F14', empty, empty],
		[1, ScanCode.F15, 'F15', KeyCode.F15, 'F15', 126, 'VK_F15', empty, empty],
		[1, ScanCode.F16, 'F16', KeyCode.F16, 'F16', 127, 'VK_F16', empty, empty],
		[1, ScanCode.F17, 'F17', KeyCode.F17, 'F17', 128, 'VK_F17', empty, empty],
		[1, ScanCode.F18, 'F18', KeyCode.F18, 'F18', 129, 'VK_F18', empty, empty],
		[1, ScanCode.F19, 'F19', KeyCode.F19, 'F19', 130, 'VK_F19', empty, empty],
		[1, ScanCode.F20, 'F20', KeyCode.F20, 'F20', 131, 'VK_F20', empty, empty],
		[1, ScanCode.F21, 'F21', KeyCode.F21, 'F21', 132, 'VK_F21', empty, empty],
		[1, ScanCode.F22, 'F22', KeyCode.F22, 'F22', 133, 'VK_F22', empty, empty],
		[1, ScanCode.F23, 'F23', KeyCode.F23, 'F23', 134, 'VK_F23', empty, empty],
		[1, ScanCode.F24, 'F24', KeyCode.F24, 'F24', 135, 'VK_F24', empty, empty],
		[1, ScanCode.Open, 'Open', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Help, 'Help', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Select, 'Select', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Again, 'Again', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Undo, 'Undo', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Cut, 'Cut', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Copy, 'Copy', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Paste, 'Paste', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Find, 'Find', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.AudioVolumeMute, 'AudioVolumeMute', KeyCode.AudioVolumeMute, 'AudioVolumeMute', 173, 'VK_VOLUME_MUTE', empty, empty],
		[1, ScanCode.AudioVolumeUp, 'AudioVolumeUp', KeyCode.AudioVolumeUp, 'AudioVolumeUp', 175, 'VK_VOLUME_UP', empty, empty],
		[1, ScanCode.AudioVolumeDown, 'AudioVolumeDown', KeyCode.AudioVolumeDown, 'AudioVolumeDown', 174, 'VK_VOLUME_DOWN', empty, empty],
		[1, ScanCode.NumpadComma, 'NumpadComma', KeyCode.NUMPAD_SEPARATOR, 'NumPad_Separator', 108, 'VK_SEPARATOR', empty, empty],
		[0, ScanCode.IntlRo, 'IntlRo', KeyCode.ABNT_C1, 'ABNT_C1', 193, 'VK_ABNT_C1', empty, empty],
		[1, ScanCode.KanaMode, 'KanaMode', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, ScanCode.IntlYen, 'IntlYen', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Convert, 'Convert', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NonConvert, 'NonConvert', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Lang1, 'Lang1', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Lang2, 'Lang2', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Lang3, 'Lang3', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Lang4, 'Lang4', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Lang5, 'Lang5', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Abort, 'Abort', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.Props, 'Props', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadParenLeft, 'NumpadParenLeft', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadParenRight, 'NumpadParenRight', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadBackspace, 'NumpadBackspace', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadMemoryStore, 'NumpadMemoryStore', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadMemoryRecall, 'NumpadMemoryRecall', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadMemoryClear, 'NumpadMemoryClear', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadMemoryAdd, 'NumpadMemoryAdd', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadMemorySubtract, 'NumpadMemorySubtract', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.NumpadClear, 'NumpadClear', KeyCode.Clear, 'Clear', 12, 'VK_CLEAR', empty, empty],
		[1, ScanCode.NumpadClearEntry, 'NumpadClearEntry', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.None, empty, KeyCode.Ctrl, 'Ctrl', 17, 'VK_CONTROL', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Shift, 'Shift', 16, 'VK_SHIFT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Alt, 'Alt', 18, 'VK_MENU', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Meta, 'Meta', 91, 'VK_COMMAND', empty, empty],
		[1, ScanCode.ControlLeft, 'ControlLeft', KeyCode.Ctrl, empty, 0, 'VK_LCONTROL', empty, empty],
		[1, ScanCode.ShiftLeft, 'ShiftLeft', KeyCode.Shift, empty, 0, 'VK_LSHIFT', empty, empty],
		[1, ScanCode.AltLeft, 'AltLeft', KeyCode.Alt, empty, 0, 'VK_LMENU', empty, empty],
		[1, ScanCode.MetaLeft, 'MetaLeft', KeyCode.Meta, empty, 0, 'VK_LWIN', empty, empty],
		[1, ScanCode.ControlRight, 'ControlRight', KeyCode.Ctrl, empty, 0, 'VK_RCONTROL', empty, empty],
		[1, ScanCode.ShiftRight, 'ShiftRight', KeyCode.Shift, empty, 0, 'VK_RSHIFT', empty, empty],
		[1, ScanCode.AltRight, 'AltRight', KeyCode.Alt, empty, 0, 'VK_RMENU', empty, empty],
		[1, ScanCode.MetaRight, 'MetaRight', KeyCode.Meta, empty, 0, 'VK_RWIN', empty, empty],
		[1, ScanCode.BrightnessUp, 'BrightnessUp', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.BrightnessDown, 'BrightnessDown', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MediaPlay, 'MediaPlay', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MediaRecord, 'MediaRecord', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MediaFastForward, 'MediaFastForward', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MediaRewind, 'MediaRewind', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MediaTrackNext, 'MediaTrackNext', KeyCode.MediaTrackNext, 'MediaTrackNext', 176, 'VK_MEDIA_NEXT_TRACK', empty, empty],
		[1, ScanCode.MediaTrackPrevious, 'MediaTrackPrevious', KeyCode.MediaTrackPrevious, 'MediaTrackPrevious', 177, 'VK_MEDIA_PREV_TRACK', empty, empty],
		[1, ScanCode.MediaStop, 'MediaStop', KeyCode.MediaStop, 'MediaStop', 178, 'VK_MEDIA_STOP', empty, empty],
		[1, ScanCode.Eject, 'Eject', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MediaPlayPause, 'MediaPlayPause', KeyCode.MediaPlayPause, 'MediaPlayPause', 179, 'VK_MEDIA_PLAY_PAUSE', empty, empty],
		[1, ScanCode.MediaSelect, 'MediaSelect', KeyCode.LaunchMediaPlayer, 'LaunchMediaPlayer', 181, 'VK_MEDIA_LAUNCH_MEDIA_SELECT', empty, empty],
		[1, ScanCode.LaunchMail, 'LaunchMail', KeyCode.LaunchMail, 'LaunchMail', 180, 'VK_MEDIA_LAUNCH_MAIL', empty, empty],
		[1, ScanCode.LaunchApp2, 'LaunchApp2', KeyCode.LaunchApp2, 'LaunchApp2', 183, 'VK_MEDIA_LAUNCH_APP2', empty, empty],
		[1, ScanCode.LaunchApp1, 'LaunchApp1', KeyCode.Unknown, empty, 0, 'VK_MEDIA_LAUNCH_APP1', empty, empty],
		[1, ScanCode.SelectTask, 'SelectTask', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.LaunchScreenSaver, 'LaunchScreenSaver', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.BrowserSearch, 'BrowserSearch', KeyCode.BrowserSearch, 'BrowserSearch', 170, 'VK_BROWSER_SEARCH', empty, empty],
		[1, ScanCode.BrowserHome, 'BrowserHome', KeyCode.BrowserHome, 'BrowserHome', 172, 'VK_BROWSER_HOME', empty, empty],
		[1, ScanCode.BrowserBack, 'BrowserBack', KeyCode.BrowserBack, 'BrowserBack', 166, 'VK_BROWSER_BACK', empty, empty],
		[1, ScanCode.BrowserForward, 'BrowserForward', KeyCode.BrowserForward, 'BrowserForward', 167, 'VK_BROWSER_FORWARD', empty, empty],
		[1, ScanCode.BrowserStop, 'BrowserStop', KeyCode.Unknown, empty, 0, 'VK_BROWSER_STOP', empty, empty],
		[1, ScanCode.BrowserRefresh, 'BrowserRefresh', KeyCode.Unknown, empty, 0, 'VK_BROWSER_REFRESH', empty, empty],
		[1, ScanCode.BrowserFavorites, 'BrowserFavorites', KeyCode.Unknown, empty, 0, 'VK_BROWSER_FAVORITES', empty, empty],
		[1, ScanCode.ZoomToggle, 'ZoomToggle', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MailReply, 'MailReply', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MailForward, 'MailForward', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[1, ScanCode.MailSend, 'MailSend', KeyCode.Unknown, empty, 0, empty, empty, empty],

		// See https://lists.w3.org/Archives/Public/www-dom/2010JulSep/att-0182/keyCode-spec.html
		// If an Input Method Editor is processing key input and the event is keydown, return 229.
		[1, ScanCode.None, empty, KeyCode.KEY_IN_COMPOSITION, 'KeyInComposition', 229, empty, empty, empty],
		[1, ScanCode.None, empty, KeyCode.ABNT_C2, 'ABNT_C2', 194, 'VK_ABNT_C2', empty, empty],
		[1, ScanCode.None, empty, KeyCode.OEM_8, 'OEM_8', 223, 'VK_OEM_8', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_KANA', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_HANGUL', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_JUNJA', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_FINAL', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_HANJA', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_KANJI', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_CONVERT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_NONCONVERT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_ACCEPT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_MODECHANGE', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_SELECT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PRINT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_EXECUTE', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_SNAPSHOT', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_HELP', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_APPS', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PROCESSKEY', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PACKET', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_DBE_SBCSCHAR', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_DBE_DBCSCHAR', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_ATTN', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_CRSEL', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_EXSEL', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_EREOF', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PLAY', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_ZOOM', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_NONAME', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PA1', empty, empty],
		[1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_OEM_CLEAR', empty, empty],
	];

	const seenKeyCode: boolean[] = [];
	const seenScanCode: boolean[] = [];
	for (const mapping of mappings) {
		const [immutable, scanCode, scanCodeStr, keyCode, keyCodeStr, eventKeyCode, vkey, usUserSettingsLabel, generalUserSettingsLabel] = mapping;
		if (!seenScanCode[scanCode]) {
			seenScanCode[scanCode] = true;
			scanCodeIntToStr[scanCode] = scanCodeStr;
			scanCodeStrToInt[scanCodeStr] = scanCode;
			scanCodeLowerCaseStrToInt[scanCodeStr.toLowerCase()] = scanCode;
			if (immutable) {
				IMMUTABLE_CODE_TO_KEY_CODE[scanCode] = keyCode;
				if (
					(keyCode !== KeyCode.Unknown)
					&& (keyCode !== KeyCode.Enter)
					&& (keyCode !== KeyCode.Ctrl)
					&& (keyCode !== KeyCode.Shift)
					&& (keyCode !== KeyCode.Alt)
					&& (keyCode !== KeyCode.Meta)
				) {
					IMMUTABLE_KEY_CODE_TO_CODE[keyCode] = scanCode;
				}
			}
		}
		if (!seenKeyCode[keyCode]) {
			seenKeyCode[keyCode] = true;
			if (!keyCodeStr) {
				throw new Error(`String representation missing for key code ${keyCode} around scan code ${scanCodeStr}`);
			}
			uiMap.define(keyCode, keyCodeStr);
			userSettingsUSMap.define(keyCode, usUserSettingsLabel || keyCodeStr);
			userSettingsGeneralMap.define(keyCode, generalUserSettingsLabel || usUserSettingsLabel || keyCodeStr);
		}
		if (eventKeyCode) {
			EVENT_KEY_CODE_MAP[eventKeyCode] = keyCode;
		}
		if (vkey) {
			NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[vkey] = keyCode;
		}
	}
	// Manually added due to the exclusion above (due to duplication with NumpadEnter)
	IMMUTABLE_KEY_CODE_TO_CODE[KeyCode.Enter] = ScanCode.Enter;

})();

export namespace KeyCodeUtils {
	export function toString(keyCode: KeyCode): string {
		return uiMap.keyCodeToStr(keyCode);
	}
	export function fromString(key: string): KeyCode {
		return uiMap.strToKeyCode(key);
	}

	export function toUserSettingsUS(keyCode: KeyCode): string {
		return userSettingsUSMap.keyCodeToStr(keyCode);
	}
	export function toUserSettingsGeneral(keyCode: KeyCode): string {
		return userSettingsGeneralMap.keyCodeToStr(keyCode);
	}
	export function fromUserSettings(key: string): KeyCode {
		return userSettingsUSMap.strToKeyCode(key) || userSettingsGeneralMap.strToKeyCode(key);
	}

	export function toElectronAccelerator(keyCode: KeyCode): string | null {
		if (keyCode >= KeyCode.Numpad0 && keyCode <= KeyCode.NumpadDivide) {
			// [Electron Accelerators] Electron is able to parse numpad keys, but unfortunately it
			// renders them just as regular keys in menus. For example, num0 is rendered as "0",
			// numdiv is rendered as "/", numsub is rendered as "-".
			//
			// This can lead to incredible confusion, as it makes numpad based keybindings indistinguishable
			// from keybindings based on regular keys.
			//
			// We therefore need to fall back to custom rendering for numpad keys.
			return null;
		}

		switch (keyCode) {
			case KeyCode.UpArrow:
				return 'Up';
			case KeyCode.DownArrow:
				return 'Down';
			case KeyCode.LeftArrow:
				return 'Left';
			case KeyCode.RightArrow:
				return 'Right';
		}

		return uiMap.keyCodeToStr(keyCode);
	}
}

export const enum KeyMod {
	CtrlCmd = (1 << 11) >>> 0,
	Shift = (1 << 10) >>> 0,
	Alt = (1 << 9) >>> 0,
	WinCtrl = (1 << 8) >>> 0,
}

export function KeyChord(firstPart: number, secondPart: number): number {
	const chordPart = ((secondPart & 0x0000FFFF) << 16) >>> 0;
	return (firstPart | chordPart) >>> 0;
}
