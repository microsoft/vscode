/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode } from 'vs/base/common/keyCodes';

const scanCodeIntToStr: string[] = [];
const scanCodeStrToInt: { [code: string]: number; } = Object.create(null);

export const KeyboardScanCodeUtils = {
	toEnum: (scanCode: string) => scanCodeStrToInt[scanCode] || KeyboardScanCode.None,
	toString: (scanCode: KeyboardScanCode) => scanCodeIntToStr[scanCode] || 'None'
};

function d(intScanCode: KeyboardScanCode, strScanCode: string): void {
	scanCodeIntToStr[intScanCode] = strScanCode;
	scanCodeStrToInt[strScanCode] = intScanCode;
}
(function () {
	d(KeyboardScanCode.None, 'None');
	d(KeyboardScanCode.Hyper, 'Hyper');
	d(KeyboardScanCode.Super, 'Super');
	d(KeyboardScanCode.Fn, 'Fn');
	d(KeyboardScanCode.FnLock, 'FnLock');
	d(KeyboardScanCode.Suspend, 'Suspend');
	d(KeyboardScanCode.Resume, 'Resume');
	d(KeyboardScanCode.Turbo, 'Turbo');
	d(KeyboardScanCode.Sleep, 'Sleep');
	d(KeyboardScanCode.WakeUp, 'WakeUp');
	d(KeyboardScanCode.KeyA, 'KeyA');
	d(KeyboardScanCode.KeyB, 'KeyB');
	d(KeyboardScanCode.KeyC, 'KeyC');
	d(KeyboardScanCode.KeyD, 'KeyD');
	d(KeyboardScanCode.KeyE, 'KeyE');
	d(KeyboardScanCode.KeyF, 'KeyF');
	d(KeyboardScanCode.KeyG, 'KeyG');
	d(KeyboardScanCode.KeyH, 'KeyH');
	d(KeyboardScanCode.KeyI, 'KeyI');
	d(KeyboardScanCode.KeyJ, 'KeyJ');
	d(KeyboardScanCode.KeyK, 'KeyK');
	d(KeyboardScanCode.KeyL, 'KeyL');
	d(KeyboardScanCode.KeyM, 'KeyM');
	d(KeyboardScanCode.KeyN, 'KeyN');
	d(KeyboardScanCode.KeyO, 'KeyO');
	d(KeyboardScanCode.KeyP, 'KeyP');
	d(KeyboardScanCode.KeyQ, 'KeyQ');
	d(KeyboardScanCode.KeyR, 'KeyR');
	d(KeyboardScanCode.KeyS, 'KeyS');
	d(KeyboardScanCode.KeyT, 'KeyT');
	d(KeyboardScanCode.KeyU, 'KeyU');
	d(KeyboardScanCode.KeyV, 'KeyV');
	d(KeyboardScanCode.KeyW, 'KeyW');
	d(KeyboardScanCode.KeyX, 'KeyX');
	d(KeyboardScanCode.KeyY, 'KeyY');
	d(KeyboardScanCode.KeyZ, 'KeyZ');
	d(KeyboardScanCode.Digit1, 'Digit1');
	d(KeyboardScanCode.Digit2, 'Digit2');
	d(KeyboardScanCode.Digit3, 'Digit3');
	d(KeyboardScanCode.Digit4, 'Digit4');
	d(KeyboardScanCode.Digit5, 'Digit5');
	d(KeyboardScanCode.Digit6, 'Digit6');
	d(KeyboardScanCode.Digit7, 'Digit7');
	d(KeyboardScanCode.Digit8, 'Digit8');
	d(KeyboardScanCode.Digit9, 'Digit9');
	d(KeyboardScanCode.Digit0, 'Digit0');
	d(KeyboardScanCode.Enter, 'Enter');
	d(KeyboardScanCode.Escape, 'Escape');
	d(KeyboardScanCode.Backspace, 'Backspace');
	d(KeyboardScanCode.Tab, 'Tab');
	d(KeyboardScanCode.Space, 'Space');
	d(KeyboardScanCode.Minus, 'Minus');
	d(KeyboardScanCode.Equal, 'Equal');
	d(KeyboardScanCode.BracketLeft, 'BracketLeft');
	d(KeyboardScanCode.BracketRight, 'BracketRight');
	d(KeyboardScanCode.Backslash, 'Backslash');
	d(KeyboardScanCode.IntlHash, 'IntlHash');
	d(KeyboardScanCode.Semicolon, 'Semicolon');
	d(KeyboardScanCode.Quote, 'Quote');
	d(KeyboardScanCode.Backquote, 'Backquote');
	d(KeyboardScanCode.Comma, 'Comma');
	d(KeyboardScanCode.Period, 'Period');
	d(KeyboardScanCode.Slash, 'Slash');
	d(KeyboardScanCode.CapsLock, 'CapsLock');
	d(KeyboardScanCode.F1, 'F1');
	d(KeyboardScanCode.F2, 'F2');
	d(KeyboardScanCode.F3, 'F3');
	d(KeyboardScanCode.F4, 'F4');
	d(KeyboardScanCode.F5, 'F5');
	d(KeyboardScanCode.F6, 'F6');
	d(KeyboardScanCode.F7, 'F7');
	d(KeyboardScanCode.F8, 'F8');
	d(KeyboardScanCode.F9, 'F9');
	d(KeyboardScanCode.F10, 'F10');
	d(KeyboardScanCode.F11, 'F11');
	d(KeyboardScanCode.F12, 'F12');
	d(KeyboardScanCode.PrintScreen, 'PrintScreen');
	d(KeyboardScanCode.ScrollLock, 'ScrollLock');
	d(KeyboardScanCode.Pause, 'Pause');
	d(KeyboardScanCode.Insert, 'Insert');
	d(KeyboardScanCode.Home, 'Home');
	d(KeyboardScanCode.PageUp, 'PageUp');
	d(KeyboardScanCode.Delete, 'Delete');
	d(KeyboardScanCode.End, 'End');
	d(KeyboardScanCode.PageDown, 'PageDown');
	d(KeyboardScanCode.ArrowRight, 'ArrowRight');
	d(KeyboardScanCode.ArrowLeft, 'ArrowLeft');
	d(KeyboardScanCode.ArrowDown, 'ArrowDown');
	d(KeyboardScanCode.ArrowUp, 'ArrowUp');
	d(KeyboardScanCode.NumLock, 'NumLock');
	d(KeyboardScanCode.NumpadDivide, 'NumpadDivide');
	d(KeyboardScanCode.NumpadMultiply, 'NumpadMultiply');
	d(KeyboardScanCode.NumpadSubtract, 'NumpadSubtract');
	d(KeyboardScanCode.NumpadAdd, 'NumpadAdd');
	d(KeyboardScanCode.NumpadEnter, 'NumpadEnter');
	d(KeyboardScanCode.Numpad1, 'Numpad1');
	d(KeyboardScanCode.Numpad2, 'Numpad2');
	d(KeyboardScanCode.Numpad3, 'Numpad3');
	d(KeyboardScanCode.Numpad4, 'Numpad4');
	d(KeyboardScanCode.Numpad5, 'Numpad5');
	d(KeyboardScanCode.Numpad6, 'Numpad6');
	d(KeyboardScanCode.Numpad7, 'Numpad7');
	d(KeyboardScanCode.Numpad8, 'Numpad8');
	d(KeyboardScanCode.Numpad9, 'Numpad9');
	d(KeyboardScanCode.Numpad0, 'Numpad0');
	d(KeyboardScanCode.NumpadDecimal, 'NumpadDecimal');
	d(KeyboardScanCode.IntlBackslash, 'IntlBackslash');
	d(KeyboardScanCode.ContextMenu, 'ContextMenu');
	d(KeyboardScanCode.Power, 'Power');
	d(KeyboardScanCode.NumpadEqual, 'NumpadEqual');
	d(KeyboardScanCode.F13, 'F13');
	d(KeyboardScanCode.F14, 'F14');
	d(KeyboardScanCode.F15, 'F15');
	d(KeyboardScanCode.F16, 'F16');
	d(KeyboardScanCode.F17, 'F17');
	d(KeyboardScanCode.F18, 'F18');
	d(KeyboardScanCode.F19, 'F19');
	d(KeyboardScanCode.F20, 'F20');
	d(KeyboardScanCode.F21, 'F21');
	d(KeyboardScanCode.F22, 'F22');
	d(KeyboardScanCode.F23, 'F23');
	d(KeyboardScanCode.F24, 'F24');
	d(KeyboardScanCode.Open, 'Open');
	d(KeyboardScanCode.Help, 'Help');
	d(KeyboardScanCode.Select, 'Select');
	d(KeyboardScanCode.Again, 'Again');
	d(KeyboardScanCode.Undo, 'Undo');
	d(KeyboardScanCode.Cut, 'Cut');
	d(KeyboardScanCode.Copy, 'Copy');
	d(KeyboardScanCode.Paste, 'Paste');
	d(KeyboardScanCode.Find, 'Find');
	d(KeyboardScanCode.AudioVolumeMute, 'AudioVolumeMute');
	d(KeyboardScanCode.AudioVolumeUp, 'AudioVolumeUp');
	d(KeyboardScanCode.AudioVolumeDown, 'AudioVolumeDown');
	d(KeyboardScanCode.NumpadComma, 'NumpadComma');
	d(KeyboardScanCode.IntlRo, 'IntlRo');
	d(KeyboardScanCode.KanaMode, 'KanaMode');
	d(KeyboardScanCode.IntlYen, 'IntlYen');
	d(KeyboardScanCode.Convert, 'Convert');
	d(KeyboardScanCode.NonConvert, 'NonConvert');
	d(KeyboardScanCode.Lang1, 'Lang1');
	d(KeyboardScanCode.Lang2, 'Lang2');
	d(KeyboardScanCode.Lang3, 'Lang3');
	d(KeyboardScanCode.Lang4, 'Lang4');
	d(KeyboardScanCode.Lang5, 'Lang5');
	d(KeyboardScanCode.Abort, 'Abort');
	d(KeyboardScanCode.Props, 'Props');
	d(KeyboardScanCode.NumpadParenLeft, 'NumpadParenLeft');
	d(KeyboardScanCode.NumpadParenRight, 'NumpadParenRight');
	d(KeyboardScanCode.NumpadBackspace, 'NumpadBackspace');
	d(KeyboardScanCode.NumpadMemoryStore, 'NumpadMemoryStore');
	d(KeyboardScanCode.NumpadMemoryRecall, 'NumpadMemoryRecall');
	d(KeyboardScanCode.NumpadMemoryClear, 'NumpadMemoryClear');
	d(KeyboardScanCode.NumpadMemoryAdd, 'NumpadMemoryAdd');
	d(KeyboardScanCode.NumpadMemorySubtract, 'NumpadMemorySubtract');
	d(KeyboardScanCode.NumpadClear, 'NumpadClear');
	d(KeyboardScanCode.NumpadClearEntry, 'NumpadClearEntry');
	d(KeyboardScanCode.ControlLeft, 'ControlLeft');
	d(KeyboardScanCode.ShiftLeft, 'ShiftLeft');
	d(KeyboardScanCode.AltLeft, 'AltLeft');
	d(KeyboardScanCode.MetaLeft, 'MetaLeft');
	d(KeyboardScanCode.ControlRight, 'ControlRight');
	d(KeyboardScanCode.ShiftRight, 'ShiftRight');
	d(KeyboardScanCode.AltRight, 'AltRight');
	d(KeyboardScanCode.MetaRight, 'MetaRight');
	d(KeyboardScanCode.BrightnessUp, 'BrightnessUp');
	d(KeyboardScanCode.BrightnessDown, 'BrightnessDown');
	d(KeyboardScanCode.MediaPlay, 'MediaPlay');
	d(KeyboardScanCode.MediaRecord, 'MediaRecord');
	d(KeyboardScanCode.MediaFastForward, 'MediaFastForward');
	d(KeyboardScanCode.MediaRewind, 'MediaRewind');
	d(KeyboardScanCode.MediaTrackNext, 'MediaTrackNext');
	d(KeyboardScanCode.MediaTrackPrevious, 'MediaTrackPrevious');
	d(KeyboardScanCode.MediaStop, 'MediaStop');
	d(KeyboardScanCode.Eject, 'Eject');
	d(KeyboardScanCode.MediaPlayPause, 'MediaPlayPause');
	d(KeyboardScanCode.MediaSelect, 'MediaSelect');
	d(KeyboardScanCode.LaunchMail, 'LaunchMail');
	d(KeyboardScanCode.LaunchApp2, 'LaunchApp2');
	d(KeyboardScanCode.LaunchApp1, 'LaunchApp1');
	d(KeyboardScanCode.SelectTask, 'SelectTask');
	d(KeyboardScanCode.LaunchScreenSaver, 'LaunchScreenSaver');
	d(KeyboardScanCode.BrowserSearch, 'BrowserSearch');
	d(KeyboardScanCode.BrowserHome, 'BrowserHome');
	d(KeyboardScanCode.BrowserBack, 'BrowserBack');
	d(KeyboardScanCode.BrowserForward, 'BrowserForward');
	d(KeyboardScanCode.BrowserStop, 'BrowserStop');
	d(KeyboardScanCode.BrowserRefresh, 'BrowserRefresh');
	d(KeyboardScanCode.BrowserFavorites, 'BrowserFavorites');
	d(KeyboardScanCode.ZoomToggle, 'ZoomToggle');
	d(KeyboardScanCode.MailReply, 'MailReply');
	d(KeyboardScanCode.MailForward, 'MailForward');
	d(KeyboardScanCode.MailSend, 'MailSend');
})();

/**
 * keyboardEvent.code
 */
export const enum KeyboardScanCode {
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

/**
 * -1 if a HwCode => KeyCode mapping depends on kb layout.
 */
export const IMMUTABLE_CODE_TO_KEY_CODE: KeyCode[] = [];

(function () {
	for (let i = 0; i <= KeyboardScanCode.MAX_VALUE; i++) {
		IMMUTABLE_CODE_TO_KEY_CODE[i] = -1;
	}

	function define(code: KeyboardScanCode, keyCode: KeyCode): void {
		IMMUTABLE_CODE_TO_KEY_CODE[code] = keyCode;
	}

	define(KeyboardScanCode.None, KeyCode.Unknown);
	define(KeyboardScanCode.Hyper, KeyCode.Unknown);
	define(KeyboardScanCode.Super, KeyCode.Unknown);
	define(KeyboardScanCode.Fn, KeyCode.Unknown);
	define(KeyboardScanCode.FnLock, KeyCode.Unknown);
	define(KeyboardScanCode.Suspend, KeyCode.Unknown);
	define(KeyboardScanCode.Resume, KeyCode.Unknown);
	define(KeyboardScanCode.Turbo, KeyCode.Unknown);
	define(KeyboardScanCode.Sleep, KeyCode.Unknown);
	define(KeyboardScanCode.WakeUp, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyA, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyB, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyC, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyD, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyE, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyF, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyG, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyH, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyI, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyJ, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyK, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyL, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyM, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyN, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyO, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyP, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyQ, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyR, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyS, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyT, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyU, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyV, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyW, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyX, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyY, KeyCode.Unknown);
	// define(KeyboardEventCode.KeyZ, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit1, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit2, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit3, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit4, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit5, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit6, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit7, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit8, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit9, KeyCode.Unknown);
	// define(KeyboardEventCode.Digit0, KeyCode.Unknown);
	define(KeyboardScanCode.Enter, KeyCode.Enter);
	define(KeyboardScanCode.Escape, KeyCode.Escape);
	define(KeyboardScanCode.Backspace, KeyCode.Backspace);
	define(KeyboardScanCode.Tab, KeyCode.Tab);
	define(KeyboardScanCode.Space, KeyCode.Space);
	// define(KeyboardEventCode.Minus, KeyCode.Unknown);
	// define(KeyboardEventCode.Equal, KeyCode.Unknown);
	// define(KeyboardEventCode.BracketLeft, KeyCode.Unknown);
	// define(KeyboardEventCode.BracketRight, KeyCode.Unknown);
	// define(KeyboardEventCode.Backslash, KeyCode.Unknown);
	// define(KeyboardEventCode.IntlHash, KeyCode.Unknown);
	// define(KeyboardEventCode.Semicolon, KeyCode.Unknown);
	// define(KeyboardEventCode.Quote, KeyCode.Unknown);
	// define(KeyboardEventCode.Backquote, KeyCode.Unknown);
	// define(KeyboardEventCode.Comma, KeyCode.Unknown);
	// define(KeyboardEventCode.Period, KeyCode.Unknown);
	// define(KeyboardEventCode.Slash, KeyCode.Unknown);
	define(KeyboardScanCode.CapsLock, KeyCode.CapsLock);
	define(KeyboardScanCode.F1, KeyCode.F1);
	define(KeyboardScanCode.F2, KeyCode.F2);
	define(KeyboardScanCode.F3, KeyCode.F3);
	define(KeyboardScanCode.F4, KeyCode.F4);
	define(KeyboardScanCode.F5, KeyCode.F5);
	define(KeyboardScanCode.F6, KeyCode.F6);
	define(KeyboardScanCode.F7, KeyCode.F7);
	define(KeyboardScanCode.F8, KeyCode.F8);
	define(KeyboardScanCode.F9, KeyCode.F9);
	define(KeyboardScanCode.F10, KeyCode.F10);
	define(KeyboardScanCode.F11, KeyCode.F11);
	define(KeyboardScanCode.F12, KeyCode.F12);
	define(KeyboardScanCode.PrintScreen, KeyCode.Unknown);
	define(KeyboardScanCode.ScrollLock, KeyCode.ScrollLock);
	define(KeyboardScanCode.Pause, KeyCode.PauseBreak);
	define(KeyboardScanCode.Insert, KeyCode.Insert);
	define(KeyboardScanCode.Home, KeyCode.Home);
	define(KeyboardScanCode.PageUp, KeyCode.PageUp);
	define(KeyboardScanCode.Delete, KeyCode.Delete);
	define(KeyboardScanCode.End, KeyCode.End);
	define(KeyboardScanCode.PageDown, KeyCode.PageDown);
	define(KeyboardScanCode.ArrowRight, KeyCode.RightArrow);
	define(KeyboardScanCode.ArrowLeft, KeyCode.LeftArrow);
	define(KeyboardScanCode.ArrowDown, KeyCode.DownArrow);
	define(KeyboardScanCode.ArrowUp, KeyCode.UpArrow);
	define(KeyboardScanCode.NumLock, KeyCode.NumLock);
	define(KeyboardScanCode.NumpadDivide, KeyCode.NUMPAD_DIVIDE);
	define(KeyboardScanCode.NumpadMultiply, KeyCode.NUMPAD_MULTIPLY);
	define(KeyboardScanCode.NumpadSubtract, KeyCode.NUMPAD_SUBTRACT);
	define(KeyboardScanCode.NumpadAdd, KeyCode.NUMPAD_ADD);
	define(KeyboardScanCode.NumpadEnter, KeyCode.Enter); // Duplicate
	define(KeyboardScanCode.Numpad1, KeyCode.NUMPAD_1);
	define(KeyboardScanCode.Numpad2, KeyCode.NUMPAD_2);
	define(KeyboardScanCode.Numpad3, KeyCode.NUMPAD_3);
	define(KeyboardScanCode.Numpad4, KeyCode.NUMPAD_4);
	define(KeyboardScanCode.Numpad5, KeyCode.NUMPAD_5);
	define(KeyboardScanCode.Numpad6, KeyCode.NUMPAD_6);
	define(KeyboardScanCode.Numpad7, KeyCode.NUMPAD_7);
	define(KeyboardScanCode.Numpad8, KeyCode.NUMPAD_8);
	define(KeyboardScanCode.Numpad9, KeyCode.NUMPAD_9);
	define(KeyboardScanCode.Numpad0, KeyCode.NUMPAD_0);
	define(KeyboardScanCode.NumpadDecimal, KeyCode.NUMPAD_DECIMAL);
	// define(KeyboardEventCode.IntlBackslash, KeyCode.Unknown);
	define(KeyboardScanCode.ContextMenu, KeyCode.ContextMenu);
	define(KeyboardScanCode.Power, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadEqual, KeyCode.Unknown);
	define(KeyboardScanCode.F13, KeyCode.F13);
	define(KeyboardScanCode.F14, KeyCode.F14);
	define(KeyboardScanCode.F15, KeyCode.F15);
	define(KeyboardScanCode.F16, KeyCode.F16);
	define(KeyboardScanCode.F17, KeyCode.F17);
	define(KeyboardScanCode.F18, KeyCode.F18);
	define(KeyboardScanCode.F19, KeyCode.F19);
	define(KeyboardScanCode.F20, KeyCode.Unknown);
	define(KeyboardScanCode.F21, KeyCode.Unknown);
	define(KeyboardScanCode.F22, KeyCode.Unknown);
	define(KeyboardScanCode.F23, KeyCode.Unknown);
	define(KeyboardScanCode.F24, KeyCode.Unknown);
	define(KeyboardScanCode.Open, KeyCode.Unknown);
	define(KeyboardScanCode.Help, KeyCode.Unknown);
	define(KeyboardScanCode.Select, KeyCode.Unknown);
	define(KeyboardScanCode.Again, KeyCode.Unknown);
	define(KeyboardScanCode.Undo, KeyCode.Unknown);
	define(KeyboardScanCode.Cut, KeyCode.Unknown);
	define(KeyboardScanCode.Copy, KeyCode.Unknown);
	define(KeyboardScanCode.Paste, KeyCode.Unknown);
	define(KeyboardScanCode.Find, KeyCode.Unknown);
	define(KeyboardScanCode.AudioVolumeMute, KeyCode.Unknown);
	define(KeyboardScanCode.AudioVolumeUp, KeyCode.Unknown);
	define(KeyboardScanCode.AudioVolumeDown, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadComma, KeyCode.NUMPAD_SEPARATOR);
	define(KeyboardScanCode.IntlRo, KeyCode.Unknown);
	define(KeyboardScanCode.KanaMode, KeyCode.Unknown);
	define(KeyboardScanCode.IntlYen, KeyCode.Unknown);
	define(KeyboardScanCode.Convert, KeyCode.Unknown);
	define(KeyboardScanCode.NonConvert, KeyCode.Unknown);
	define(KeyboardScanCode.Lang1, KeyCode.Unknown);
	define(KeyboardScanCode.Lang2, KeyCode.Unknown);
	define(KeyboardScanCode.Lang3, KeyCode.Unknown);
	define(KeyboardScanCode.Lang4, KeyCode.Unknown);
	define(KeyboardScanCode.Lang5, KeyCode.Unknown);
	define(KeyboardScanCode.Abort, KeyCode.Unknown);
	define(KeyboardScanCode.Props, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadParenLeft, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadParenRight, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadBackspace, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadMemoryStore, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadMemoryRecall, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadMemoryClear, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadMemoryAdd, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadMemorySubtract, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadClear, KeyCode.Unknown);
	define(KeyboardScanCode.NumpadClearEntry, KeyCode.Unknown);
	define(KeyboardScanCode.ControlLeft, KeyCode.Ctrl); // Duplicate
	define(KeyboardScanCode.ShiftLeft, KeyCode.Shift); // Duplicate
	define(KeyboardScanCode.AltLeft, KeyCode.Alt); // Duplicate
	define(KeyboardScanCode.MetaLeft, KeyCode.Meta); // Duplicate
	define(KeyboardScanCode.ControlRight, KeyCode.Ctrl); // Duplicate
	define(KeyboardScanCode.ShiftRight, KeyCode.Shift); // Duplicate
	define(KeyboardScanCode.AltRight, KeyCode.Alt); // Duplicate
	define(KeyboardScanCode.MetaRight, KeyCode.Meta); // Duplicate
	define(KeyboardScanCode.BrightnessUp, KeyCode.Unknown);
	define(KeyboardScanCode.BrightnessDown, KeyCode.Unknown);
	define(KeyboardScanCode.MediaPlay, KeyCode.Unknown);
	define(KeyboardScanCode.MediaRecord, KeyCode.Unknown);
	define(KeyboardScanCode.MediaFastForward, KeyCode.Unknown);
	define(KeyboardScanCode.MediaRewind, KeyCode.Unknown);
	define(KeyboardScanCode.MediaTrackNext, KeyCode.Unknown);
	define(KeyboardScanCode.MediaTrackPrevious, KeyCode.Unknown);
	define(KeyboardScanCode.MediaStop, KeyCode.Unknown);
	define(KeyboardScanCode.Eject, KeyCode.Unknown);
	define(KeyboardScanCode.MediaPlayPause, KeyCode.Unknown);
	define(KeyboardScanCode.MediaSelect, KeyCode.Unknown);
	define(KeyboardScanCode.LaunchMail, KeyCode.Unknown);
	define(KeyboardScanCode.LaunchApp2, KeyCode.Unknown);
	define(KeyboardScanCode.LaunchApp1, KeyCode.Unknown);
	define(KeyboardScanCode.SelectTask, KeyCode.Unknown);
	define(KeyboardScanCode.LaunchScreenSaver, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserSearch, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserHome, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserBack, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserForward, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserStop, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserRefresh, KeyCode.Unknown);
	define(KeyboardScanCode.BrowserFavorites, KeyCode.Unknown);
	define(KeyboardScanCode.ZoomToggle, KeyCode.Unknown);
	define(KeyboardScanCode.MailReply, KeyCode.Unknown);
	define(KeyboardScanCode.MailForward, KeyCode.Unknown);
	define(KeyboardScanCode.MailSend, KeyCode.Unknown);
})();
