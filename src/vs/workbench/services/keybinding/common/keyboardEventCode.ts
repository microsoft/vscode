/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyCode } from 'vs/base/common/keyCodes';

const codeIntToStr: string[] = [];
const codeStrToInt: { [code: string]: number; } = Object.create(null);

export const KeyboardEventCodeUtils = {
	toEnum: (code: string) => codeStrToInt[code] || KeyboardEventCode.None,
	toString: (code: KeyboardEventCode) => codeIntToStr[code] || 'None'
};

function d(int: KeyboardEventCode, str: string): void {
	codeIntToStr[int] = str;
	codeStrToInt[str] = int;
}
(function () {
	d(KeyboardEventCode.None, 'None');
	d(KeyboardEventCode.Hyper, 'Hyper');
	d(KeyboardEventCode.Super, 'Super');
	d(KeyboardEventCode.Fn, 'Fn');
	d(KeyboardEventCode.FnLock, 'FnLock');
	d(KeyboardEventCode.Suspend, 'Suspend');
	d(KeyboardEventCode.Resume, 'Resume');
	d(KeyboardEventCode.Turbo, 'Turbo');
	d(KeyboardEventCode.Sleep, 'Sleep');
	d(KeyboardEventCode.WakeUp, 'WakeUp');
	d(KeyboardEventCode.KeyA, 'KeyA');
	d(KeyboardEventCode.KeyB, 'KeyB');
	d(KeyboardEventCode.KeyC, 'KeyC');
	d(KeyboardEventCode.KeyD, 'KeyD');
	d(KeyboardEventCode.KeyE, 'KeyE');
	d(KeyboardEventCode.KeyF, 'KeyF');
	d(KeyboardEventCode.KeyG, 'KeyG');
	d(KeyboardEventCode.KeyH, 'KeyH');
	d(KeyboardEventCode.KeyI, 'KeyI');
	d(KeyboardEventCode.KeyJ, 'KeyJ');
	d(KeyboardEventCode.KeyK, 'KeyK');
	d(KeyboardEventCode.KeyL, 'KeyL');
	d(KeyboardEventCode.KeyM, 'KeyM');
	d(KeyboardEventCode.KeyN, 'KeyN');
	d(KeyboardEventCode.KeyO, 'KeyO');
	d(KeyboardEventCode.KeyP, 'KeyP');
	d(KeyboardEventCode.KeyQ, 'KeyQ');
	d(KeyboardEventCode.KeyR, 'KeyR');
	d(KeyboardEventCode.KeyS, 'KeyS');
	d(KeyboardEventCode.KeyT, 'KeyT');
	d(KeyboardEventCode.KeyU, 'KeyU');
	d(KeyboardEventCode.KeyV, 'KeyV');
	d(KeyboardEventCode.KeyW, 'KeyW');
	d(KeyboardEventCode.KeyX, 'KeyX');
	d(KeyboardEventCode.KeyY, 'KeyY');
	d(KeyboardEventCode.KeyZ, 'KeyZ');
	d(KeyboardEventCode.Digit1, 'Digit1');
	d(KeyboardEventCode.Digit2, 'Digit2');
	d(KeyboardEventCode.Digit3, 'Digit3');
	d(KeyboardEventCode.Digit4, 'Digit4');
	d(KeyboardEventCode.Digit5, 'Digit5');
	d(KeyboardEventCode.Digit6, 'Digit6');
	d(KeyboardEventCode.Digit7, 'Digit7');
	d(KeyboardEventCode.Digit8, 'Digit8');
	d(KeyboardEventCode.Digit9, 'Digit9');
	d(KeyboardEventCode.Digit0, 'Digit0');
	d(KeyboardEventCode.Enter, 'Enter');
	d(KeyboardEventCode.Escape, 'Escape');
	d(KeyboardEventCode.Backspace, 'Backspace');
	d(KeyboardEventCode.Tab, 'Tab');
	d(KeyboardEventCode.Space, 'Space');
	d(KeyboardEventCode.Minus, 'Minus');
	d(KeyboardEventCode.Equal, 'Equal');
	d(KeyboardEventCode.BracketLeft, 'BracketLeft');
	d(KeyboardEventCode.BracketRight, 'BracketRight');
	d(KeyboardEventCode.Backslash, 'Backslash');
	d(KeyboardEventCode.IntlHash, 'IntlHash');
	d(KeyboardEventCode.Semicolon, 'Semicolon');
	d(KeyboardEventCode.Quote, 'Quote');
	d(KeyboardEventCode.Backquote, 'Backquote');
	d(KeyboardEventCode.Comma, 'Comma');
	d(KeyboardEventCode.Period, 'Period');
	d(KeyboardEventCode.Slash, 'Slash');
	d(KeyboardEventCode.CapsLock, 'CapsLock');
	d(KeyboardEventCode.F1, 'F1');
	d(KeyboardEventCode.F2, 'F2');
	d(KeyboardEventCode.F3, 'F3');
	d(KeyboardEventCode.F4, 'F4');
	d(KeyboardEventCode.F5, 'F5');
	d(KeyboardEventCode.F6, 'F6');
	d(KeyboardEventCode.F7, 'F7');
	d(KeyboardEventCode.F8, 'F8');
	d(KeyboardEventCode.F9, 'F9');
	d(KeyboardEventCode.F10, 'F10');
	d(KeyboardEventCode.F11, 'F11');
	d(KeyboardEventCode.F12, 'F12');
	d(KeyboardEventCode.PrintScreen, 'PrintScreen');
	d(KeyboardEventCode.ScrollLock, 'ScrollLock');
	d(KeyboardEventCode.Pause, 'Pause');
	d(KeyboardEventCode.Insert, 'Insert');
	d(KeyboardEventCode.Home, 'Home');
	d(KeyboardEventCode.PageUp, 'PageUp');
	d(KeyboardEventCode.Delete, 'Delete');
	d(KeyboardEventCode.End, 'End');
	d(KeyboardEventCode.PageDown, 'PageDown');
	d(KeyboardEventCode.ArrowRight, 'ArrowRight');
	d(KeyboardEventCode.ArrowLeft, 'ArrowLeft');
	d(KeyboardEventCode.ArrowDown, 'ArrowDown');
	d(KeyboardEventCode.ArrowUp, 'ArrowUp');
	d(KeyboardEventCode.NumLock, 'NumLock');
	d(KeyboardEventCode.NumpadDivide, 'NumpadDivide');
	d(KeyboardEventCode.NumpadMultiply, 'NumpadMultiply');
	d(KeyboardEventCode.NumpadSubtract, 'NumpadSubtract');
	d(KeyboardEventCode.NumpadAdd, 'NumpadAdd');
	d(KeyboardEventCode.NumpadEnter, 'NumpadEnter');
	d(KeyboardEventCode.Numpad1, 'Numpad1');
	d(KeyboardEventCode.Numpad2, 'Numpad2');
	d(KeyboardEventCode.Numpad3, 'Numpad3');
	d(KeyboardEventCode.Numpad4, 'Numpad4');
	d(KeyboardEventCode.Numpad5, 'Numpad5');
	d(KeyboardEventCode.Numpad6, 'Numpad6');
	d(KeyboardEventCode.Numpad7, 'Numpad7');
	d(KeyboardEventCode.Numpad8, 'Numpad8');
	d(KeyboardEventCode.Numpad9, 'Numpad9');
	d(KeyboardEventCode.Numpad0, 'Numpad0');
	d(KeyboardEventCode.NumpadDecimal, 'NumpadDecimal');
	d(KeyboardEventCode.IntlBackslash, 'IntlBackslash');
	d(KeyboardEventCode.ContextMenu, 'ContextMenu');
	d(KeyboardEventCode.Power, 'Power');
	d(KeyboardEventCode.NumpadEqual, 'NumpadEqual');
	d(KeyboardEventCode.F13, 'F13');
	d(KeyboardEventCode.F14, 'F14');
	d(KeyboardEventCode.F15, 'F15');
	d(KeyboardEventCode.F16, 'F16');
	d(KeyboardEventCode.F17, 'F17');
	d(KeyboardEventCode.F18, 'F18');
	d(KeyboardEventCode.F19, 'F19');
	d(KeyboardEventCode.F20, 'F20');
	d(KeyboardEventCode.F21, 'F21');
	d(KeyboardEventCode.F22, 'F22');
	d(KeyboardEventCode.F23, 'F23');
	d(KeyboardEventCode.F24, 'F24');
	d(KeyboardEventCode.Open, 'Open');
	d(KeyboardEventCode.Help, 'Help');
	d(KeyboardEventCode.Select, 'Select');
	d(KeyboardEventCode.Again, 'Again');
	d(KeyboardEventCode.Undo, 'Undo');
	d(KeyboardEventCode.Cut, 'Cut');
	d(KeyboardEventCode.Copy, 'Copy');
	d(KeyboardEventCode.Paste, 'Paste');
	d(KeyboardEventCode.Find, 'Find');
	d(KeyboardEventCode.AudioVolumeMute, 'AudioVolumeMute');
	d(KeyboardEventCode.AudioVolumeUp, 'AudioVolumeUp');
	d(KeyboardEventCode.AudioVolumeDown, 'AudioVolumeDown');
	d(KeyboardEventCode.NumpadComma, 'NumpadComma');
	d(KeyboardEventCode.IntlRo, 'IntlRo');
	d(KeyboardEventCode.KanaMode, 'KanaMode');
	d(KeyboardEventCode.IntlYen, 'IntlYen');
	d(KeyboardEventCode.Convert, 'Convert');
	d(KeyboardEventCode.NonConvert, 'NonConvert');
	d(KeyboardEventCode.Lang1, 'Lang1');
	d(KeyboardEventCode.Lang2, 'Lang2');
	d(KeyboardEventCode.Lang3, 'Lang3');
	d(KeyboardEventCode.Lang4, 'Lang4');
	d(KeyboardEventCode.Lang5, 'Lang5');
	d(KeyboardEventCode.Abort, 'Abort');
	d(KeyboardEventCode.Props, 'Props');
	d(KeyboardEventCode.NumpadParenLeft, 'NumpadParenLeft');
	d(KeyboardEventCode.NumpadParenRight, 'NumpadParenRight');
	d(KeyboardEventCode.NumpadBackspace, 'NumpadBackspace');
	d(KeyboardEventCode.NumpadMemoryStore, 'NumpadMemoryStore');
	d(KeyboardEventCode.NumpadMemoryRecall, 'NumpadMemoryRecall');
	d(KeyboardEventCode.NumpadMemoryClear, 'NumpadMemoryClear');
	d(KeyboardEventCode.NumpadMemoryAdd, 'NumpadMemoryAdd');
	d(KeyboardEventCode.NumpadMemorySubtract, 'NumpadMemorySubtract');
	d(KeyboardEventCode.NumpadClear, 'NumpadClear');
	d(KeyboardEventCode.NumpadClearEntry, 'NumpadClearEntry');
	d(KeyboardEventCode.ControlLeft, 'ControlLeft');
	d(KeyboardEventCode.ShiftLeft, 'ShiftLeft');
	d(KeyboardEventCode.AltLeft, 'AltLeft');
	d(KeyboardEventCode.MetaLeft, 'MetaLeft');
	d(KeyboardEventCode.ControlRight, 'ControlRight');
	d(KeyboardEventCode.ShiftRight, 'ShiftRight');
	d(KeyboardEventCode.AltRight, 'AltRight');
	d(KeyboardEventCode.MetaRight, 'MetaRight');
	d(KeyboardEventCode.BrightnessUp, 'BrightnessUp');
	d(KeyboardEventCode.BrightnessDown, 'BrightnessDown');
	d(KeyboardEventCode.MediaPlay, 'MediaPlay');
	d(KeyboardEventCode.MediaRecord, 'MediaRecord');
	d(KeyboardEventCode.MediaFastForward, 'MediaFastForward');
	d(KeyboardEventCode.MediaRewind, 'MediaRewind');
	d(KeyboardEventCode.MediaTrackNext, 'MediaTrackNext');
	d(KeyboardEventCode.MediaTrackPrevious, 'MediaTrackPrevious');
	d(KeyboardEventCode.MediaStop, 'MediaStop');
	d(KeyboardEventCode.Eject, 'Eject');
	d(KeyboardEventCode.MediaPlayPause, 'MediaPlayPause');
	d(KeyboardEventCode.MediaSelect, 'MediaSelect');
	d(KeyboardEventCode.LaunchMail, 'LaunchMail');
	d(KeyboardEventCode.LaunchApp2, 'LaunchApp2');
	d(KeyboardEventCode.LaunchApp1, 'LaunchApp1');
	d(KeyboardEventCode.SelectTask, 'SelectTask');
	d(KeyboardEventCode.LaunchScreenSaver, 'LaunchScreenSaver');
	d(KeyboardEventCode.BrowserSearch, 'BrowserSearch');
	d(KeyboardEventCode.BrowserHome, 'BrowserHome');
	d(KeyboardEventCode.BrowserBack, 'BrowserBack');
	d(KeyboardEventCode.BrowserForward, 'BrowserForward');
	d(KeyboardEventCode.BrowserStop, 'BrowserStop');
	d(KeyboardEventCode.BrowserRefresh, 'BrowserRefresh');
	d(KeyboardEventCode.BrowserFavorites, 'BrowserFavorites');
	d(KeyboardEventCode.ZoomToggle, 'ZoomToggle');
	d(KeyboardEventCode.MailReply, 'MailReply');
	d(KeyboardEventCode.MailForward, 'MailForward');
	d(KeyboardEventCode.MailSend, 'MailSend');
})();

/**
 * keyboardEvent.code
 */
export const enum KeyboardEventCode {
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
	for (let i = 0; i <= KeyboardEventCode.MAX_VALUE; i++) {
		IMMUTABLE_CODE_TO_KEY_CODE[i] = -1;
	}

	function define(code: KeyboardEventCode, keyCode: KeyCode): void {
		IMMUTABLE_CODE_TO_KEY_CODE[code] = keyCode;
	}

	define(KeyboardEventCode.None, KeyCode.Unknown);
	define(KeyboardEventCode.Hyper, KeyCode.Unknown);
	define(KeyboardEventCode.Super, KeyCode.Unknown);
	define(KeyboardEventCode.Fn, KeyCode.Unknown);
	define(KeyboardEventCode.FnLock, KeyCode.Unknown);
	define(KeyboardEventCode.Suspend, KeyCode.Unknown);
	define(KeyboardEventCode.Resume, KeyCode.Unknown);
	define(KeyboardEventCode.Turbo, KeyCode.Unknown);
	define(KeyboardEventCode.Sleep, KeyCode.Unknown);
	define(KeyboardEventCode.WakeUp, KeyCode.Unknown);
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
	define(KeyboardEventCode.Enter, KeyCode.Enter);
	define(KeyboardEventCode.Escape, KeyCode.Escape);
	define(KeyboardEventCode.Backspace, KeyCode.Backspace);
	define(KeyboardEventCode.Tab, KeyCode.Tab);
	define(KeyboardEventCode.Space, KeyCode.Space);
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
	define(KeyboardEventCode.CapsLock, KeyCode.CapsLock);
	define(KeyboardEventCode.F1, KeyCode.F1);
	define(KeyboardEventCode.F2, KeyCode.F2);
	define(KeyboardEventCode.F3, KeyCode.F3);
	define(KeyboardEventCode.F4, KeyCode.F4);
	define(KeyboardEventCode.F5, KeyCode.F5);
	define(KeyboardEventCode.F6, KeyCode.F6);
	define(KeyboardEventCode.F7, KeyCode.F7);
	define(KeyboardEventCode.F8, KeyCode.F8);
	define(KeyboardEventCode.F9, KeyCode.F9);
	define(KeyboardEventCode.F10, KeyCode.F10);
	define(KeyboardEventCode.F11, KeyCode.F11);
	define(KeyboardEventCode.F12, KeyCode.F12);
	define(KeyboardEventCode.PrintScreen, KeyCode.Unknown);
	define(KeyboardEventCode.ScrollLock, KeyCode.ScrollLock);
	define(KeyboardEventCode.Pause, KeyCode.PauseBreak);
	define(KeyboardEventCode.Insert, KeyCode.Insert);
	define(KeyboardEventCode.Home, KeyCode.Home);
	define(KeyboardEventCode.PageUp, KeyCode.PageUp);
	define(KeyboardEventCode.Delete, KeyCode.Delete);
	define(KeyboardEventCode.End, KeyCode.End);
	define(KeyboardEventCode.PageDown, KeyCode.PageDown);
	define(KeyboardEventCode.ArrowRight, KeyCode.RightArrow);
	define(KeyboardEventCode.ArrowLeft, KeyCode.LeftArrow);
	define(KeyboardEventCode.ArrowDown, KeyCode.DownArrow);
	define(KeyboardEventCode.ArrowUp, KeyCode.UpArrow);
	define(KeyboardEventCode.NumLock, KeyCode.NumLock);
	define(KeyboardEventCode.NumpadDivide, KeyCode.NUMPAD_DIVIDE);
	define(KeyboardEventCode.NumpadMultiply, KeyCode.NUMPAD_MULTIPLY);
	define(KeyboardEventCode.NumpadSubtract, KeyCode.NUMPAD_SUBTRACT);
	define(KeyboardEventCode.NumpadAdd, KeyCode.NUMPAD_ADD);
	define(KeyboardEventCode.NumpadEnter, KeyCode.Enter); // TODO
	define(KeyboardEventCode.Numpad1, KeyCode.NUMPAD_1);
	define(KeyboardEventCode.Numpad2, KeyCode.NUMPAD_2);
	define(KeyboardEventCode.Numpad3, KeyCode.NUMPAD_3);
	define(KeyboardEventCode.Numpad4, KeyCode.NUMPAD_4);
	define(KeyboardEventCode.Numpad5, KeyCode.NUMPAD_5);
	define(KeyboardEventCode.Numpad6, KeyCode.NUMPAD_6);
	define(KeyboardEventCode.Numpad7, KeyCode.NUMPAD_7);
	define(KeyboardEventCode.Numpad8, KeyCode.NUMPAD_8);
	define(KeyboardEventCode.Numpad9, KeyCode.NUMPAD_9);
	define(KeyboardEventCode.Numpad0, KeyCode.NUMPAD_0);
	define(KeyboardEventCode.NumpadDecimal, KeyCode.NUMPAD_DECIMAL);
	// define(KeyboardEventCode.IntlBackslash, KeyCode.Unknown);
	define(KeyboardEventCode.ContextMenu, KeyCode.ContextMenu);
	define(KeyboardEventCode.Power, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadEqual, KeyCode.Unknown);
	define(KeyboardEventCode.F13, KeyCode.F13);
	define(KeyboardEventCode.F14, KeyCode.F14);
	define(KeyboardEventCode.F15, KeyCode.F15);
	define(KeyboardEventCode.F16, KeyCode.F16);
	define(KeyboardEventCode.F17, KeyCode.F17);
	define(KeyboardEventCode.F18, KeyCode.F18);
	define(KeyboardEventCode.F19, KeyCode.F19);
	define(KeyboardEventCode.F20, KeyCode.Unknown);
	define(KeyboardEventCode.F21, KeyCode.Unknown);
	define(KeyboardEventCode.F22, KeyCode.Unknown);
	define(KeyboardEventCode.F23, KeyCode.Unknown);
	define(KeyboardEventCode.F24, KeyCode.Unknown);
	define(KeyboardEventCode.Open, KeyCode.Unknown);
	define(KeyboardEventCode.Help, KeyCode.Unknown);
	define(KeyboardEventCode.Select, KeyCode.Unknown);
	define(KeyboardEventCode.Again, KeyCode.Unknown);
	define(KeyboardEventCode.Undo, KeyCode.Unknown);
	define(KeyboardEventCode.Cut, KeyCode.Unknown);
	define(KeyboardEventCode.Copy, KeyCode.Unknown);
	define(KeyboardEventCode.Paste, KeyCode.Unknown);
	define(KeyboardEventCode.Find, KeyCode.Unknown);
	define(KeyboardEventCode.AudioVolumeMute, KeyCode.Unknown);
	define(KeyboardEventCode.AudioVolumeUp, KeyCode.Unknown);
	define(KeyboardEventCode.AudioVolumeDown, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadComma, KeyCode.NUMPAD_SEPARATOR);
	define(KeyboardEventCode.IntlRo, KeyCode.Unknown);
	define(KeyboardEventCode.KanaMode, KeyCode.Unknown);
	define(KeyboardEventCode.IntlYen, KeyCode.Unknown);
	define(KeyboardEventCode.Convert, KeyCode.Unknown);
	define(KeyboardEventCode.NonConvert, KeyCode.Unknown);
	define(KeyboardEventCode.Lang1, KeyCode.Unknown);
	define(KeyboardEventCode.Lang2, KeyCode.Unknown);
	define(KeyboardEventCode.Lang3, KeyCode.Unknown);
	define(KeyboardEventCode.Lang4, KeyCode.Unknown);
	define(KeyboardEventCode.Lang5, KeyCode.Unknown);
	define(KeyboardEventCode.Abort, KeyCode.Unknown);
	define(KeyboardEventCode.Props, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadParenLeft, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadParenRight, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadBackspace, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryStore, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryRecall, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryClear, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemoryAdd, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadMemorySubtract, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadClear, KeyCode.Unknown);
	define(KeyboardEventCode.NumpadClearEntry, KeyCode.Unknown);
	define(KeyboardEventCode.ControlLeft, KeyCode.Ctrl); // TODO
	define(KeyboardEventCode.ShiftLeft, KeyCode.Shift); // TODO
	define(KeyboardEventCode.AltLeft, KeyCode.Alt); // TODO
	define(KeyboardEventCode.MetaLeft, KeyCode.Meta); // TODO
	define(KeyboardEventCode.ControlRight, KeyCode.Ctrl); // TODO
	define(KeyboardEventCode.ShiftRight, KeyCode.Shift); // TODO
	define(KeyboardEventCode.AltRight, KeyCode.Alt); // TODO
	define(KeyboardEventCode.MetaRight, KeyCode.Meta); // TODO
	define(KeyboardEventCode.BrightnessUp, KeyCode.Unknown);
	define(KeyboardEventCode.BrightnessDown, KeyCode.Unknown);
	define(KeyboardEventCode.MediaPlay, KeyCode.Unknown);
	define(KeyboardEventCode.MediaRecord, KeyCode.Unknown);
	define(KeyboardEventCode.MediaFastForward, KeyCode.Unknown);
	define(KeyboardEventCode.MediaRewind, KeyCode.Unknown);
	define(KeyboardEventCode.MediaTrackNext, KeyCode.Unknown);
	define(KeyboardEventCode.MediaTrackPrevious, KeyCode.Unknown);
	define(KeyboardEventCode.MediaStop, KeyCode.Unknown);
	define(KeyboardEventCode.Eject, KeyCode.Unknown);
	define(KeyboardEventCode.MediaPlayPause, KeyCode.Unknown);
	define(KeyboardEventCode.MediaSelect, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchMail, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchApp2, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchApp1, KeyCode.Unknown);
	define(KeyboardEventCode.SelectTask, KeyCode.Unknown);
	define(KeyboardEventCode.LaunchScreenSaver, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserSearch, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserHome, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserBack, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserForward, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserStop, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserRefresh, KeyCode.Unknown);
	define(KeyboardEventCode.BrowserFavorites, KeyCode.Unknown);
	define(KeyboardEventCode.ZoomToggle, KeyCode.Unknown);
	define(KeyboardEventCode.MailReply, KeyCode.Unknown);
	define(KeyboardEventCode.MailForward, KeyCode.Unknown);
	define(KeyboardEventCode.MailSend, KeyCode.Unknown);
})();
