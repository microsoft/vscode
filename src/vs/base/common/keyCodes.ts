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

	Backspace = 1,
	Tab = 2,
	Enter = 3,
	Shift = 4,
	Ctrl = 5,
	Alt = 6,
	PauseBreak = 7,
	CapsLock = 8,
	Escape = 9,
	Space = 10,
	PageUp = 11,
	PageDown = 12,
	End = 13,
	Home = 14,
	LeftArrow = 15,
	UpArrow = 16,
	RightArrow = 17,
	DownArrow = 18,
	Insert = 19,
	Delete = 20,

	KEY_0 = 21,
	KEY_1 = 22,
	KEY_2 = 23,
	KEY_3 = 24,
	KEY_4 = 25,
	KEY_5 = 26,
	KEY_6 = 27,
	KEY_7 = 28,
	KEY_8 = 29,
	KEY_9 = 30,

	KEY_A = 31,
	KEY_B = 32,
	KEY_C = 33,
	KEY_D = 34,
	KEY_E = 35,
	KEY_F = 36,
	KEY_G = 37,
	KEY_H = 38,
	KEY_I = 39,
	KEY_J = 40,
	KEY_K = 41,
	KEY_L = 42,
	KEY_M = 43,
	KEY_N = 44,
	KEY_O = 45,
	KEY_P = 46,
	KEY_Q = 47,
	KEY_R = 48,
	KEY_S = 49,
	KEY_T = 50,
	KEY_U = 51,
	KEY_V = 52,
	KEY_W = 53,
	KEY_X = 54,
	KEY_Y = 55,
	KEY_Z = 56,

	Meta = 57,
	ContextMenu = 58,

	F1 = 59,
	F2 = 60,
	F3 = 61,
	F4 = 62,
	F5 = 63,
	F6 = 64,
	F7 = 65,
	F8 = 66,
	F9 = 67,
	F10 = 68,
	F11 = 69,
	F12 = 70,
	F13 = 71,
	F14 = 72,
	F15 = 73,
	F16 = 74,
	F17 = 75,
	F18 = 76,
	F19 = 77,

	NumLock = 78,
	ScrollLock = 79,

	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ';:' key
	 */
	US_SEMICOLON = 80,
	/**
	 * For any country/region, the '+' key
	 * For the US standard keyboard, the '=+' key
	 */
	US_EQUAL = 81,
	/**
	 * For any country/region, the ',' key
	 * For the US standard keyboard, the ',<' key
	 */
	US_COMMA = 82,
	/**
	 * For any country/region, the '-' key
	 * For the US standard keyboard, the '-_' key
	 */
	US_MINUS = 83,
	/**
	 * For any country/region, the '.' key
	 * For the US standard keyboard, the '.>' key
	 */
	US_DOT = 84,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '/?' key
	 */
	US_SLASH = 85,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '`~' key
	 */
	US_BACKTICK = 86,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '[{' key
	 */
	US_OPEN_SQUARE_BRACKET = 87,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the '\|' key
	 */
	US_BACKSLASH = 88,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ']}' key
	 */
	US_CLOSE_SQUARE_BRACKET = 89,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 * For the US standard keyboard, the ''"' key
	 */
	US_QUOTE = 90,
	/**
	 * Used for miscellaneous characters; it can vary by keyboard.
	 */
	OEM_8 = 91,
	/**
	 * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
	 */
	OEM_102 = 92,

	NUMPAD_0 = 93, // VK_NUMPAD0, 0x60, Numeric keypad 0 key
	NUMPAD_1 = 94, // VK_NUMPAD1, 0x61, Numeric keypad 1 key
	NUMPAD_2 = 95, // VK_NUMPAD2, 0x62, Numeric keypad 2 key
	NUMPAD_3 = 96, // VK_NUMPAD3, 0x63, Numeric keypad 3 key
	NUMPAD_4 = 97, // VK_NUMPAD4, 0x64, Numeric keypad 4 key
	NUMPAD_5 = 98, // VK_NUMPAD5, 0x65, Numeric keypad 5 key
	NUMPAD_6 = 99, // VK_NUMPAD6, 0x66, Numeric keypad 6 key
	NUMPAD_7 = 100, // VK_NUMPAD7, 0x67, Numeric keypad 7 key
	NUMPAD_8 = 101, // VK_NUMPAD8, 0x68, Numeric keypad 8 key
	NUMPAD_9 = 102, // VK_NUMPAD9, 0x69, Numeric keypad 9 key

	NUMPAD_MULTIPLY = 103,	// VK_MULTIPLY, 0x6A, Multiply key
	NUMPAD_ADD = 104,		// VK_ADD, 0x6B, Add key
	NUMPAD_SEPARATOR = 105,	// VK_SEPARATOR, 0x6C, Separator key
	NUMPAD_SUBTRACT = 106,	// VK_SUBTRACT, 0x6D, Subtract key
	NUMPAD_DECIMAL = 107,	// VK_DECIMAL, 0x6E, Decimal key
	NUMPAD_DIVIDE = 108,	// VK_DIVIDE, 0x6F,

	/**
	 * Cover all key codes when IME is processing input.
	 */
	KEY_IN_COMPOSITION = 109,

	ABNT_C1 = 110, // Brazilian (ABNT) Keyboard
	ABNT_C2 = 111, // Brazilian (ABNT) Keyboard

	BrowserBack = 112,
	BrowserForward = 113,

	MediaTrackNext = 114,
	MediaTrackPrevious = 115,
	MediaStop = 116,
	MediaPlayPause = 117,

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
	public _strToKeyCode: { [str: string]: KeyCode; };

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
export const NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE: { [nativeKeyCode: string]: KeyCode; } = {};
const scanCodeIntToStr: string[] = [];
const scanCodeStrToInt: { [code: string]: number; } = Object.create(null);
const scanCodeLowerCaseStrToInt: { [code: string]: number; } = Object.create(null);

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

	// See https://lists.w3.org/Archives/Public/www-dom/2010JulSep/att-0182/keyCode-spec.html
	// If an Input Method Editor is processing key input and the event is keydown, return 229.

	// See https://msdn.microsoft.com/en-us/library/windows/desktop/dd375731(v=vs.85).aspx
	// See https://github.com/microsoft/node-native-keymap/blob/master/deps/chromium/keyboard_codes_win.h

	const empty = '';
	type IMappingEntry = [number, 0 | 1, ScanCode, string, KeyCode, string, number, string, string, string];
	const mappings: IMappingEntry[] = [
		// keyCodeOrd, immutable, scanCode, scanCodeStr, keyCode, keyCodeStr, eventKeyCode, vkey, usUserSettingsLabel, generalUserSettingsLabel
		[0, 1, ScanCode.None, 'None', KeyCode.Unknown, 'unknown', 0, 'VK_UNKNOWN', empty, empty],
		[0, 1, ScanCode.Hyper, 'Hyper', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Super, 'Super', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Fn, 'Fn', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.FnLock, 'FnLock', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Suspend, 'Suspend', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Resume, 'Resume', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Turbo, 'Turbo', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Sleep, 'Sleep', KeyCode.Unknown, empty, 0, 'VK_SLEEP', empty, empty],
		[0, 1, ScanCode.WakeUp, 'WakeUp', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[31, 0, ScanCode.KeyA, 'KeyA', KeyCode.KEY_A, 'A', 65, 'VK_A', empty, empty],
		[32, 0, ScanCode.KeyB, 'KeyB', KeyCode.KEY_B, 'B', 66, 'VK_B', empty, empty],
		[33, 0, ScanCode.KeyC, 'KeyC', KeyCode.KEY_C, 'C', 67, 'VK_C', empty, empty],
		[34, 0, ScanCode.KeyD, 'KeyD', KeyCode.KEY_D, 'D', 68, 'VK_D', empty, empty],
		[35, 0, ScanCode.KeyE, 'KeyE', KeyCode.KEY_E, 'E', 69, 'VK_E', empty, empty],
		[36, 0, ScanCode.KeyF, 'KeyF', KeyCode.KEY_F, 'F', 70, 'VK_F', empty, empty],
		[37, 0, ScanCode.KeyG, 'KeyG', KeyCode.KEY_G, 'G', 71, 'VK_G', empty, empty],
		[38, 0, ScanCode.KeyH, 'KeyH', KeyCode.KEY_H, 'H', 72, 'VK_H', empty, empty],
		[39, 0, ScanCode.KeyI, 'KeyI', KeyCode.KEY_I, 'I', 73, 'VK_I', empty, empty],
		[40, 0, ScanCode.KeyJ, 'KeyJ', KeyCode.KEY_J, 'J', 74, 'VK_J', empty, empty],
		[41, 0, ScanCode.KeyK, 'KeyK', KeyCode.KEY_K, 'K', 75, 'VK_K', empty, empty],
		[42, 0, ScanCode.KeyL, 'KeyL', KeyCode.KEY_L, 'L', 76, 'VK_L', empty, empty],
		[43, 0, ScanCode.KeyM, 'KeyM', KeyCode.KEY_M, 'M', 77, 'VK_M', empty, empty],
		[44, 0, ScanCode.KeyN, 'KeyN', KeyCode.KEY_N, 'N', 78, 'VK_N', empty, empty],
		[45, 0, ScanCode.KeyO, 'KeyO', KeyCode.KEY_O, 'O', 79, 'VK_O', empty, empty],
		[46, 0, ScanCode.KeyP, 'KeyP', KeyCode.KEY_P, 'P', 80, 'VK_P', empty, empty],
		[47, 0, ScanCode.KeyQ, 'KeyQ', KeyCode.KEY_Q, 'Q', 81, 'VK_Q', empty, empty],
		[48, 0, ScanCode.KeyR, 'KeyR', KeyCode.KEY_R, 'R', 82, 'VK_R', empty, empty],
		[49, 0, ScanCode.KeyS, 'KeyS', KeyCode.KEY_S, 'S', 83, 'VK_S', empty, empty],
		[50, 0, ScanCode.KeyT, 'KeyT', KeyCode.KEY_T, 'T', 84, 'VK_T', empty, empty],
		[51, 0, ScanCode.KeyU, 'KeyU', KeyCode.KEY_U, 'U', 85, 'VK_U', empty, empty],
		[52, 0, ScanCode.KeyV, 'KeyV', KeyCode.KEY_V, 'V', 86, 'VK_V', empty, empty],
		[53, 0, ScanCode.KeyW, 'KeyW', KeyCode.KEY_W, 'W', 87, 'VK_W', empty, empty],
		[54, 0, ScanCode.KeyX, 'KeyX', KeyCode.KEY_X, 'X', 88, 'VK_X', empty, empty],
		[55, 0, ScanCode.KeyY, 'KeyY', KeyCode.KEY_Y, 'Y', 89, 'VK_Y', empty, empty],
		[56, 0, ScanCode.KeyZ, 'KeyZ', KeyCode.KEY_Z, 'Z', 90, 'VK_Z', empty, empty],
		[22, 0, ScanCode.Digit1, 'Digit1', KeyCode.KEY_1, '1', 49, 'VK_1', empty, empty],
		[23, 0, ScanCode.Digit2, 'Digit2', KeyCode.KEY_2, '2', 50, 'VK_2', empty, empty],
		[24, 0, ScanCode.Digit3, 'Digit3', KeyCode.KEY_3, '3', 51, 'VK_3', empty, empty],
		[25, 0, ScanCode.Digit4, 'Digit4', KeyCode.KEY_4, '4', 52, 'VK_4', empty, empty],
		[26, 0, ScanCode.Digit5, 'Digit5', KeyCode.KEY_5, '5', 53, 'VK_5', empty, empty],
		[27, 0, ScanCode.Digit6, 'Digit6', KeyCode.KEY_6, '6', 54, 'VK_6', empty, empty],
		[28, 0, ScanCode.Digit7, 'Digit7', KeyCode.KEY_7, '7', 55, 'VK_7', empty, empty],
		[29, 0, ScanCode.Digit8, 'Digit8', KeyCode.KEY_8, '8', 56, 'VK_8', empty, empty],
		[30, 0, ScanCode.Digit9, 'Digit9', KeyCode.KEY_9, '9', 57, 'VK_9', empty, empty],
		[21, 0, ScanCode.Digit0, 'Digit0', KeyCode.KEY_0, '0', 48, 'VK_0', empty, empty],
		[3, 1, ScanCode.Enter, 'Enter', KeyCode.Enter, 'Enter', 13, 'VK_RETURN', empty, empty],
		[9, 1, ScanCode.Escape, 'Escape', KeyCode.Escape, 'Escape', 27, 'VK_ESCAPE', empty, empty],
		[1, 1, ScanCode.Backspace, 'Backspace', KeyCode.Backspace, 'Backspace', 8, 'VK_BACK', empty, empty],
		[2, 1, ScanCode.Tab, 'Tab', KeyCode.Tab, 'Tab', 9, 'VK_TAB', empty, empty],
		[10, 1, ScanCode.Space, 'Space', KeyCode.Space, 'Space', 32, 'VK_SPACE', empty, empty],
		[83, 0, ScanCode.Minus, 'Minus', KeyCode.US_MINUS, '-', 189, 'VK_OEM_MINUS', '-', 'OEM_MINUS'],
		[81, 0, ScanCode.Equal, 'Equal', KeyCode.US_EQUAL, '=', 187, 'VK_OEM_PLUS', '=', 'OEM_PLUS'],
		[87, 0, ScanCode.BracketLeft, 'BracketLeft', KeyCode.US_OPEN_SQUARE_BRACKET, '[', 219, 'VK_OEM_4', '[', 'OEM_4'],
		[89, 0, ScanCode.BracketRight, 'BracketRight', KeyCode.US_CLOSE_SQUARE_BRACKET, ']', 221, 'VK_OEM_6', ']', 'OEM_6'],
		[88, 0, ScanCode.Backslash, 'Backslash', KeyCode.US_BACKSLASH, '\\', 220, 'VK_OEM_5', '\\', 'OEM_5'],
		[0, 0, ScanCode.IntlHash, 'IntlHash', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[80, 0, ScanCode.Semicolon, 'Semicolon', KeyCode.US_SEMICOLON, ';', 186, 'VK_OEM_1', ';', 'OEM_1'],
		[90, 0, ScanCode.Quote, 'Quote', KeyCode.US_QUOTE, '\'', 222, 'VK_OEM_7', '\'', 'OEM_7'],
		[86, 0, ScanCode.Backquote, 'Backquote', KeyCode.US_BACKTICK, '`', 192, 'VK_OEM_3', '`', 'OEM_3'],
		[82, 0, ScanCode.Comma, 'Comma', KeyCode.US_COMMA, ',', 188, 'VK_OEM_COMMA', ',', 'OEM_COMMA'],
		[84, 0, ScanCode.Period, 'Period', KeyCode.US_DOT, '.', 190, 'VK_OEM_PERIOD', '.', 'OEM_PERIOD'],
		[85, 0, ScanCode.Slash, 'Slash', KeyCode.US_SLASH, '/', 191, 'VK_OEM_2', '/', 'OEM_2'],
		[8, 1, ScanCode.CapsLock, 'CapsLock', KeyCode.CapsLock, 'CapsLock', 20, 'VK_CAPITAL', empty, empty],
		[59, 1, ScanCode.F1, 'F1', KeyCode.F1, 'F1', 112, 'VK_F1', empty, empty],
		[60, 1, ScanCode.F2, 'F2', KeyCode.F2, 'F2', 113, 'VK_F2', empty, empty],
		[61, 1, ScanCode.F3, 'F3', KeyCode.F3, 'F3', 114, 'VK_F3', empty, empty],
		[62, 1, ScanCode.F4, 'F4', KeyCode.F4, 'F4', 115, 'VK_F4', empty, empty],
		[63, 1, ScanCode.F5, 'F5', KeyCode.F5, 'F5', 116, 'VK_F5', empty, empty],
		[64, 1, ScanCode.F6, 'F6', KeyCode.F6, 'F6', 117, 'VK_F6', empty, empty],
		[65, 1, ScanCode.F7, 'F7', KeyCode.F7, 'F7', 118, 'VK_F7', empty, empty],
		[66, 1, ScanCode.F8, 'F8', KeyCode.F8, 'F8', 119, 'VK_F8', empty, empty],
		[67, 1, ScanCode.F9, 'F9', KeyCode.F9, 'F9', 120, 'VK_F9', empty, empty],
		[68, 1, ScanCode.F10, 'F10', KeyCode.F10, 'F10', 121, 'VK_F10', empty, empty],
		[69, 1, ScanCode.F11, 'F11', KeyCode.F11, 'F11', 122, 'VK_F11', empty, empty],
		[70, 1, ScanCode.F12, 'F12', KeyCode.F12, 'F12', 123, 'VK_F12', empty, empty],
		[0, 1, ScanCode.PrintScreen, 'PrintScreen', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[79, 1, ScanCode.ScrollLock, 'ScrollLock', KeyCode.ScrollLock, 'ScrollLock', 145, 'VK_SCROLL', empty, empty],
		[7, 1, ScanCode.Pause, 'Pause', KeyCode.PauseBreak, 'PauseBreak', 19, 'VK_PAUSE', empty, empty],
		[19, 1, ScanCode.Insert, 'Insert', KeyCode.Insert, 'Insert', 45, 'VK_INSERT', empty, empty],
		[14, 1, ScanCode.Home, 'Home', KeyCode.Home, 'Home', 36, 'VK_HOME', empty, empty],
		[11, 1, ScanCode.PageUp, 'PageUp', KeyCode.PageUp, 'PageUp', 33, 'VK_PRIOR', empty, empty],
		[20, 1, ScanCode.Delete, 'Delete', KeyCode.Delete, 'Delete', 46, 'VK_DELETE', empty, empty],
		[13, 1, ScanCode.End, 'End', KeyCode.End, 'End', 35, 'VK_END', empty, empty],
		[12, 1, ScanCode.PageDown, 'PageDown', KeyCode.PageDown, 'PageDown', 34, 'VK_NEXT', empty, empty],
		[17, 1, ScanCode.ArrowRight, 'ArrowRight', KeyCode.RightArrow, 'RightArrow', 39, 'VK_RIGHT', 'Right', empty],
		[15, 1, ScanCode.ArrowLeft, 'ArrowLeft', KeyCode.LeftArrow, 'LeftArrow', 37, 'VK_LEFT', 'Left', empty],
		[18, 1, ScanCode.ArrowDown, 'ArrowDown', KeyCode.DownArrow, 'DownArrow', 40, 'VK_DOWN', 'Down', empty],
		[16, 1, ScanCode.ArrowUp, 'ArrowUp', KeyCode.UpArrow, 'UpArrow', 38, 'VK_UP', 'Up', empty],
		[78, 1, ScanCode.NumLock, 'NumLock', KeyCode.NumLock, 'NumLock', 144, 'VK_NUMLOCK', empty, empty],
		[108, 1, ScanCode.NumpadDivide, 'NumpadDivide', KeyCode.NUMPAD_DIVIDE, 'NumPad_Divide', 111, 'VK_DIVIDE', empty, empty],
		[103, 1, ScanCode.NumpadMultiply, 'NumpadMultiply', KeyCode.NUMPAD_MULTIPLY, 'NumPad_Multiply', 106, 'VK_MULTIPLY', empty, empty],
		[106, 1, ScanCode.NumpadSubtract, 'NumpadSubtract', KeyCode.NUMPAD_SUBTRACT, 'NumPad_Subtract', 109, 'VK_SUBTRACT', empty, empty],
		[104, 1, ScanCode.NumpadAdd, 'NumpadAdd', KeyCode.NUMPAD_ADD, 'NumPad_Add', 107, 'VK_ADD', empty, empty],
		[3, 1, ScanCode.NumpadEnter, 'NumpadEnter', KeyCode.Enter, empty, 0, empty, empty, empty],
		[94, 1, ScanCode.Numpad1, 'Numpad1', KeyCode.NUMPAD_1, 'NumPad1', 97, 'VK_NUMPAD1', empty, empty],
		[95, 1, ScanCode.Numpad2, 'Numpad2', KeyCode.NUMPAD_2, 'NumPad2', 98, 'VK_NUMPAD2', empty, empty],
		[96, 1, ScanCode.Numpad3, 'Numpad3', KeyCode.NUMPAD_3, 'NumPad3', 99, 'VK_NUMPAD3', empty, empty],
		[97, 1, ScanCode.Numpad4, 'Numpad4', KeyCode.NUMPAD_4, 'NumPad4', 100, 'VK_NUMPAD4', empty, empty],
		[98, 1, ScanCode.Numpad5, 'Numpad5', KeyCode.NUMPAD_5, 'NumPad5', 101, 'VK_NUMPAD5', empty, empty],
		[99, 1, ScanCode.Numpad6, 'Numpad6', KeyCode.NUMPAD_6, 'NumPad6', 102, 'VK_NUMPAD6', empty, empty],
		[100, 1, ScanCode.Numpad7, 'Numpad7', KeyCode.NUMPAD_7, 'NumPad7', 103, 'VK_NUMPAD7', empty, empty],
		[101, 1, ScanCode.Numpad8, 'Numpad8', KeyCode.NUMPAD_8, 'NumPad8', 104, 'VK_NUMPAD8', empty, empty],
		[102, 1, ScanCode.Numpad9, 'Numpad9', KeyCode.NUMPAD_9, 'NumPad9', 105, 'VK_NUMPAD9', empty, empty],
		[93, 1, ScanCode.Numpad0, 'Numpad0', KeyCode.NUMPAD_0, 'NumPad0', 96, 'VK_NUMPAD0', empty, empty],
		[107, 1, ScanCode.NumpadDecimal, 'NumpadDecimal', KeyCode.NUMPAD_DECIMAL, 'NumPad_Decimal', 110, 'VK_DECIMAL', empty, empty],
		[92, 0, ScanCode.IntlBackslash, 'IntlBackslash', KeyCode.OEM_102, 'OEM_102', 226, 'VK_OEM_102', empty, empty],
		[58, 1, ScanCode.ContextMenu, 'ContextMenu', KeyCode.ContextMenu, 'ContextMenu', 93, empty, empty, empty],
		[0, 1, ScanCode.Power, 'Power', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadEqual, 'NumpadEqual', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[71, 1, ScanCode.F13, 'F13', KeyCode.F13, 'F13', 124, 'VK_F13', empty, empty],
		[72, 1, ScanCode.F14, 'F14', KeyCode.F14, 'F14', 125, 'VK_F14', empty, empty],
		[73, 1, ScanCode.F15, 'F15', KeyCode.F15, 'F15', 126, 'VK_F15', empty, empty],
		[74, 1, ScanCode.F16, 'F16', KeyCode.F16, 'F16', 127, 'VK_F16', empty, empty],
		[75, 1, ScanCode.F17, 'F17', KeyCode.F17, 'F17', 128, 'VK_F17', empty, empty],
		[76, 1, ScanCode.F18, 'F18', KeyCode.F18, 'F18', 129, 'VK_F18', empty, empty],
		[77, 1, ScanCode.F19, 'F19', KeyCode.F19, 'F19', 130, 'VK_F19', empty, empty],
		[0, 1, ScanCode.F20, 'F20', KeyCode.Unknown, empty, 0, 'VK_F20', empty, empty],
		[0, 1, ScanCode.F21, 'F21', KeyCode.Unknown, empty, 0, 'VK_F21', empty, empty],
		[0, 1, ScanCode.F22, 'F22', KeyCode.Unknown, empty, 0, 'VK_F22', empty, empty],
		[0, 1, ScanCode.F23, 'F23', KeyCode.Unknown, empty, 0, 'VK_F23', empty, empty],
		[0, 1, ScanCode.F24, 'F24', KeyCode.Unknown, empty, 0, 'VK_F24', empty, empty],
		[0, 1, ScanCode.Open, 'Open', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Help, 'Help', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Select, 'Select', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Again, 'Again', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Undo, 'Undo', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Cut, 'Cut', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Copy, 'Copy', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Paste, 'Paste', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Find, 'Find', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.AudioVolumeMute, 'AudioVolumeMute', KeyCode.Unknown, empty, 0, 'VK_VOLUME_MUTE', empty, empty],
		[0, 1, ScanCode.AudioVolumeUp, 'AudioVolumeUp', KeyCode.Unknown, empty, 0, 'VK_VOLUME_UP', empty, empty],
		[0, 1, ScanCode.AudioVolumeDown, 'AudioVolumeDown', KeyCode.Unknown, empty, 0, 'VK_VOLUME_DOWN', empty, empty],
		[105, 1, ScanCode.NumpadComma, 'NumpadComma', KeyCode.NUMPAD_SEPARATOR, 'NumPad_Separator', 108, 'VK_SEPARATOR', empty, empty],
		[110, 0, ScanCode.IntlRo, 'IntlRo', KeyCode.ABNT_C1, 'ABNT_C1', 193, 'VK_ABNT_C1', empty, empty],
		[0, 1, ScanCode.KanaMode, 'KanaMode', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 0, ScanCode.IntlYen, 'IntlYen', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Convert, 'Convert', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NonConvert, 'NonConvert', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Lang1, 'Lang1', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Lang2, 'Lang2', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Lang3, 'Lang3', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Lang4, 'Lang4', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Lang5, 'Lang5', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Abort, 'Abort', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.Props, 'Props', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadParenLeft, 'NumpadParenLeft', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadParenRight, 'NumpadParenRight', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadBackspace, 'NumpadBackspace', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadMemoryStore, 'NumpadMemoryStore', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadMemoryRecall, 'NumpadMemoryRecall', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadMemoryClear, 'NumpadMemoryClear', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadMemoryAdd, 'NumpadMemoryAdd', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadMemorySubtract, 'NumpadMemorySubtract', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadClear, 'NumpadClear', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.NumpadClearEntry, 'NumpadClearEntry', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[5, 1, ScanCode.None, empty, KeyCode.Ctrl, 'Ctrl', 17, 'VK_CONTROL', empty, empty],
		[4, 1, ScanCode.None, empty, KeyCode.Shift, 'Shift', 16, 'VK_SHIFT', empty, empty],
		[6, 1, ScanCode.None, empty, KeyCode.Alt, 'Alt', 18, 'VK_MENU', empty, empty],
		[57, 1, ScanCode.None, empty, KeyCode.Meta, 'Meta', 0, 'VK_COMMAND', empty, empty],
		[5, 1, ScanCode.ControlLeft, 'ControlLeft', KeyCode.Ctrl, empty, 0, 'VK_LCONTROL', empty, empty],
		[4, 1, ScanCode.ShiftLeft, 'ShiftLeft', KeyCode.Shift, empty, 0, 'VK_LSHIFT', empty, empty],
		[6, 1, ScanCode.AltLeft, 'AltLeft', KeyCode.Alt, empty, 0, 'VK_LMENU', empty, empty],
		[57, 1, ScanCode.MetaLeft, 'MetaLeft', KeyCode.Meta, empty, 0, 'VK_LWIN', empty, empty],
		[5, 1, ScanCode.ControlRight, 'ControlRight', KeyCode.Ctrl, empty, 0, 'VK_RCONTROL', empty, empty],
		[4, 1, ScanCode.ShiftRight, 'ShiftRight', KeyCode.Shift, empty, 0, 'VK_RSHIFT', empty, empty],
		[6, 1, ScanCode.AltRight, 'AltRight', KeyCode.Alt, empty, 0, 'VK_RMENU', empty, empty],
		[57, 1, ScanCode.MetaRight, 'MetaRight', KeyCode.Meta, empty, 0, 'VK_RWIN', empty, empty],
		[0, 1, ScanCode.BrightnessUp, 'BrightnessUp', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.BrightnessDown, 'BrightnessDown', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MediaPlay, 'MediaPlay', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MediaRecord, 'MediaRecord', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MediaFastForward, 'MediaFastForward', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MediaRewind, 'MediaRewind', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[114, 1, ScanCode.MediaTrackNext, 'MediaTrackNext', KeyCode.MediaTrackNext, 'MediaTrackNext', 176, 'VK_MEDIA_NEXT_TRACK', empty, empty],
		[115, 1, ScanCode.MediaTrackPrevious, 'MediaTrackPrevious', KeyCode.MediaTrackPrevious, 'MediaTrackPrevious', 177, 'VK_MEDIA_PREV_TRACK', empty, empty],
		[116, 1, ScanCode.MediaStop, 'MediaStop', KeyCode.MediaStop, 'MediaStop', 178, 'VK_MEDIA_STOP', empty, empty],
		[0, 1, ScanCode.Eject, 'Eject', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[117, 1, ScanCode.MediaPlayPause, 'MediaPlayPause', KeyCode.MediaPlayPause, 'MediaPlayPause', 179, 'VK_MEDIA_PLAY_PAUSE', empty, empty],
		[0, 1, ScanCode.MediaSelect, 'MediaSelect', KeyCode.Unknown, empty, 0, 'VK_MEDIA_LAUNCH_MEDIA_SELECT', empty, empty],
		[0, 1, ScanCode.LaunchMail, 'LaunchMail', KeyCode.Unknown, empty, 0, 'VK_MEDIA_LAUNCH_MAIL', empty, empty],
		[0, 1, ScanCode.LaunchApp2, 'LaunchApp2', KeyCode.Unknown, empty, 0, 'VK_MEDIA_LAUNCH_APP2', empty, empty],
		[0, 1, ScanCode.LaunchApp1, 'LaunchApp1', KeyCode.Unknown, empty, 0, 'VK_MEDIA_LAUNCH_APP1', empty, empty],
		[0, 1, ScanCode.SelectTask, 'SelectTask', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.LaunchScreenSaver, 'LaunchScreenSaver', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.BrowserSearch, 'BrowserSearch', KeyCode.Unknown, empty, 0, 'VK_BROWSER_SEARCH', empty, empty],
		[0, 1, ScanCode.BrowserHome, 'BrowserHome', KeyCode.Unknown, empty, 0, 'VK_BROWSER_HOME', empty, empty],
		[112, 1, ScanCode.BrowserBack, 'BrowserBack', KeyCode.BrowserBack, 'BrowserBack', 166, 'VK_BROWSER_BACK', empty, empty],
		[113, 1, ScanCode.BrowserForward, 'BrowserForward', KeyCode.BrowserForward, 'BrowserForward', 167, 'VK_BROWSER_FORWARD', empty, empty],
		[0, 1, ScanCode.BrowserStop, 'BrowserStop', KeyCode.Unknown, empty, 0, 'VK_BROWSER_STOP', empty, empty],
		[0, 1, ScanCode.BrowserRefresh, 'BrowserRefresh', KeyCode.Unknown, empty, 0, 'VK_BROWSER_REFRESH', empty, empty],
		[0, 1, ScanCode.BrowserFavorites, 'BrowserFavorites', KeyCode.Unknown, empty, 0, 'VK_BROWSER_FAVORITES', empty, empty],
		[0, 1, ScanCode.ZoomToggle, 'ZoomToggle', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MailReply, 'MailReply', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MailForward, 'MailForward', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[0, 1, ScanCode.MailSend, 'MailSend', KeyCode.Unknown, empty, 0, empty, empty, empty],
		[109, 1, ScanCode.None, empty, KeyCode.KEY_IN_COMPOSITION, 'KeyInComposition', 229, empty, empty, empty],
		[111, 1, ScanCode.None, empty, KeyCode.ABNT_C2, 'ABNT_C2', 194, 'VK_ABNT_C2', empty, empty],
		[91, 1, ScanCode.None, empty, KeyCode.OEM_8, 'OEM_8', 223, 'VK_OEM_8', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_CLEAR', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_KANA', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_HANGUL', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_JUNJA', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_FINAL', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_HANJA', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_KANJI', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_CONVERT', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_NONCONVERT', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_ACCEPT', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_MODECHANGE', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_SELECT', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PRINT', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_EXECUTE', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_SNAPSHOT', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_HELP', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_APPS', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PROCESSKEY', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PACKET', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_DBE_SBCSCHAR', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_DBE_DBCSCHAR', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_ATTN', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_CRSEL', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_EXSEL', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_EREOF', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PLAY', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_ZOOM', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_NONAME', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_PA1', empty, empty],
		[0, 1, ScanCode.None, empty, KeyCode.Unknown, empty, 0, 'VK_OEM_CLEAR', empty, empty],
	];

	let seenKeyCode: boolean[] = [];
	let seenScanCode: boolean[] = [];
	for (const mapping of mappings) {
		const [_keyCodeOrd, immutable, scanCode, scanCodeStr, keyCode, keyCodeStr, eventKeyCode, vkey, usUserSettingsLabel, generalUserSettingsLabel] = mapping;
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
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
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
