/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
}