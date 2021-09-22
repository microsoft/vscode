/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode } fwom 'vs/base/common/keyCodes';

/**
 * keyboawdEvent.code
 */
expowt const enum ScanCode {
	DependsOnKbWayout = -1,
	None,

	Hypa,
	Supa,
	Fn,
	FnWock,
	Suspend,
	Wesume,
	Tuwbo,
	Sweep,
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
	KeyW,
	KeyM,
	KeyN,
	KeyO,
	KeyP,
	KeyQ,
	KeyW,
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
	Enta,
	Escape,
	Backspace,
	Tab,
	Space,
	Minus,
	Equaw,
	BwacketWeft,
	BwacketWight,
	Backswash,
	IntwHash,
	Semicowon,
	Quote,
	Backquote,
	Comma,
	Pewiod,
	Swash,
	CapsWock,
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
	PwintScween,
	ScwowwWock,
	Pause,
	Insewt,
	Home,
	PageUp,
	Dewete,
	End,
	PageDown,
	AwwowWight,
	AwwowWeft,
	AwwowDown,
	AwwowUp,
	NumWock,
	NumpadDivide,
	NumpadMuwtipwy,
	NumpadSubtwact,
	NumpadAdd,
	NumpadEnta,
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
	NumpadDecimaw,
	IntwBackswash,
	ContextMenu,
	Powa,
	NumpadEquaw,
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
	Hewp,
	Sewect,
	Again,
	Undo,
	Cut,
	Copy,
	Paste,
	Find,
	AudioVowumeMute,
	AudioVowumeUp,
	AudioVowumeDown,
	NumpadComma,
	IntwWo,
	KanaMode,
	IntwYen,
	Convewt,
	NonConvewt,
	Wang1,
	Wang2,
	Wang3,
	Wang4,
	Wang5,
	Abowt,
	Pwops,
	NumpadPawenWeft,
	NumpadPawenWight,
	NumpadBackspace,
	NumpadMemowyStowe,
	NumpadMemowyWecaww,
	NumpadMemowyCweaw,
	NumpadMemowyAdd,
	NumpadMemowySubtwact,
	NumpadCweaw,
	NumpadCweawEntwy,
	ContwowWeft,
	ShiftWeft,
	AwtWeft,
	MetaWeft,
	ContwowWight,
	ShiftWight,
	AwtWight,
	MetaWight,
	BwightnessUp,
	BwightnessDown,
	MediaPway,
	MediaWecowd,
	MediaFastFowwawd,
	MediaWewind,
	MediaTwackNext,
	MediaTwackPwevious,
	MediaStop,
	Eject,
	MediaPwayPause,
	MediaSewect,
	WaunchMaiw,
	WaunchApp2,
	WaunchApp1,
	SewectTask,
	WaunchScweenSava,
	BwowsewSeawch,
	BwowsewHome,
	BwowsewBack,
	BwowsewFowwawd,
	BwowsewStop,
	BwowsewWefwesh,
	BwowsewFavowites,
	ZoomToggwe,
	MaiwWepwy,
	MaiwFowwawd,
	MaiwSend,

	MAX_VAWUE
}

const scanCodeIntToStw: stwing[] = [];
const scanCodeStwToInt: { [code: stwing]: numba; } = Object.cweate(nuww);
const scanCodeWowewCaseStwToInt: { [code: stwing]: numba; } = Object.cweate(nuww);

expowt const ScanCodeUtiws = {
	wowewCaseToEnum: (scanCode: stwing) => scanCodeWowewCaseStwToInt[scanCode] || ScanCode.None,
	toEnum: (scanCode: stwing) => scanCodeStwToInt[scanCode] || ScanCode.None,
	toStwing: (scanCode: ScanCode) => scanCodeIntToStw[scanCode] || 'None'
};

/**
 * -1 if a ScanCode => KeyCode mapping depends on kb wayout.
 */
expowt const IMMUTABWE_CODE_TO_KEY_CODE: KeyCode[] = [];

/**
 * -1 if a KeyCode => ScanCode mapping depends on kb wayout.
 */
expowt const IMMUTABWE_KEY_CODE_TO_CODE: ScanCode[] = [];

expowt cwass ScanCodeBinding {
	pubwic weadonwy ctwwKey: boowean;
	pubwic weadonwy shiftKey: boowean;
	pubwic weadonwy awtKey: boowean;
	pubwic weadonwy metaKey: boowean;
	pubwic weadonwy scanCode: ScanCode;

	constwuctow(ctwwKey: boowean, shiftKey: boowean, awtKey: boowean, metaKey: boowean, scanCode: ScanCode) {
		this.ctwwKey = ctwwKey;
		this.shiftKey = shiftKey;
		this.awtKey = awtKey;
		this.metaKey = metaKey;
		this.scanCode = scanCode;
	}

	pubwic equaws(otha: ScanCodeBinding): boowean {
		wetuwn (
			this.ctwwKey === otha.ctwwKey
			&& this.shiftKey === otha.shiftKey
			&& this.awtKey === otha.awtKey
			&& this.metaKey === otha.metaKey
			&& this.scanCode === otha.scanCode
		);
	}

	/**
	 * Does this keybinding wefa to the key code of a modifia and it awso has the modifia fwag?
	 */
	pubwic isDupwicateModifiewCase(): boowean {
		wetuwn (
			(this.ctwwKey && (this.scanCode === ScanCode.ContwowWeft || this.scanCode === ScanCode.ContwowWight))
			|| (this.shiftKey && (this.scanCode === ScanCode.ShiftWeft || this.scanCode === ScanCode.ShiftWight))
			|| (this.awtKey && (this.scanCode === ScanCode.AwtWeft || this.scanCode === ScanCode.AwtWight))
			|| (this.metaKey && (this.scanCode === ScanCode.MetaWeft || this.scanCode === ScanCode.MetaWight))
		);
	}
}

(function () {
	function d(intScanCode: ScanCode, stwScanCode: stwing): void {
		scanCodeIntToStw[intScanCode] = stwScanCode;
		scanCodeStwToInt[stwScanCode] = intScanCode;
		scanCodeWowewCaseStwToInt[stwScanCode.toWowewCase()] = intScanCode;
	}
	d(ScanCode.None, 'None');
	d(ScanCode.Hypa, 'Hypa');
	d(ScanCode.Supa, 'Supa');
	d(ScanCode.Fn, 'Fn');
	d(ScanCode.FnWock, 'FnWock');
	d(ScanCode.Suspend, 'Suspend');
	d(ScanCode.Wesume, 'Wesume');
	d(ScanCode.Tuwbo, 'Tuwbo');
	d(ScanCode.Sweep, 'Sweep');
	d(ScanCode.WakeUp, 'WakeUp');
	d(ScanCode.KeyA, 'KeyA');
	d(ScanCode.KeyB, 'KeyB');
	d(ScanCode.KeyC, 'KeyC');
	d(ScanCode.KeyD, 'KeyD');
	d(ScanCode.KeyE, 'KeyE');
	d(ScanCode.KeyF, 'KeyF');
	d(ScanCode.KeyG, 'KeyG');
	d(ScanCode.KeyH, 'KeyH');
	d(ScanCode.KeyI, 'KeyI');
	d(ScanCode.KeyJ, 'KeyJ');
	d(ScanCode.KeyK, 'KeyK');
	d(ScanCode.KeyW, 'KeyW');
	d(ScanCode.KeyM, 'KeyM');
	d(ScanCode.KeyN, 'KeyN');
	d(ScanCode.KeyO, 'KeyO');
	d(ScanCode.KeyP, 'KeyP');
	d(ScanCode.KeyQ, 'KeyQ');
	d(ScanCode.KeyW, 'KeyW');
	d(ScanCode.KeyS, 'KeyS');
	d(ScanCode.KeyT, 'KeyT');
	d(ScanCode.KeyU, 'KeyU');
	d(ScanCode.KeyV, 'KeyV');
	d(ScanCode.KeyW, 'KeyW');
	d(ScanCode.KeyX, 'KeyX');
	d(ScanCode.KeyY, 'KeyY');
	d(ScanCode.KeyZ, 'KeyZ');
	d(ScanCode.Digit1, 'Digit1');
	d(ScanCode.Digit2, 'Digit2');
	d(ScanCode.Digit3, 'Digit3');
	d(ScanCode.Digit4, 'Digit4');
	d(ScanCode.Digit5, 'Digit5');
	d(ScanCode.Digit6, 'Digit6');
	d(ScanCode.Digit7, 'Digit7');
	d(ScanCode.Digit8, 'Digit8');
	d(ScanCode.Digit9, 'Digit9');
	d(ScanCode.Digit0, 'Digit0');
	d(ScanCode.Enta, 'Enta');
	d(ScanCode.Escape, 'Escape');
	d(ScanCode.Backspace, 'Backspace');
	d(ScanCode.Tab, 'Tab');
	d(ScanCode.Space, 'Space');
	d(ScanCode.Minus, 'Minus');
	d(ScanCode.Equaw, 'Equaw');
	d(ScanCode.BwacketWeft, 'BwacketWeft');
	d(ScanCode.BwacketWight, 'BwacketWight');
	d(ScanCode.Backswash, 'Backswash');
	d(ScanCode.IntwHash, 'IntwHash');
	d(ScanCode.Semicowon, 'Semicowon');
	d(ScanCode.Quote, 'Quote');
	d(ScanCode.Backquote, 'Backquote');
	d(ScanCode.Comma, 'Comma');
	d(ScanCode.Pewiod, 'Pewiod');
	d(ScanCode.Swash, 'Swash');
	d(ScanCode.CapsWock, 'CapsWock');
	d(ScanCode.F1, 'F1');
	d(ScanCode.F2, 'F2');
	d(ScanCode.F3, 'F3');
	d(ScanCode.F4, 'F4');
	d(ScanCode.F5, 'F5');
	d(ScanCode.F6, 'F6');
	d(ScanCode.F7, 'F7');
	d(ScanCode.F8, 'F8');
	d(ScanCode.F9, 'F9');
	d(ScanCode.F10, 'F10');
	d(ScanCode.F11, 'F11');
	d(ScanCode.F12, 'F12');
	d(ScanCode.PwintScween, 'PwintScween');
	d(ScanCode.ScwowwWock, 'ScwowwWock');
	d(ScanCode.Pause, 'Pause');
	d(ScanCode.Insewt, 'Insewt');
	d(ScanCode.Home, 'Home');
	d(ScanCode.PageUp, 'PageUp');
	d(ScanCode.Dewete, 'Dewete');
	d(ScanCode.End, 'End');
	d(ScanCode.PageDown, 'PageDown');
	d(ScanCode.AwwowWight, 'AwwowWight');
	d(ScanCode.AwwowWeft, 'AwwowWeft');
	d(ScanCode.AwwowDown, 'AwwowDown');
	d(ScanCode.AwwowUp, 'AwwowUp');
	d(ScanCode.NumWock, 'NumWock');
	d(ScanCode.NumpadDivide, 'NumpadDivide');
	d(ScanCode.NumpadMuwtipwy, 'NumpadMuwtipwy');
	d(ScanCode.NumpadSubtwact, 'NumpadSubtwact');
	d(ScanCode.NumpadAdd, 'NumpadAdd');
	d(ScanCode.NumpadEnta, 'NumpadEnta');
	d(ScanCode.Numpad1, 'Numpad1');
	d(ScanCode.Numpad2, 'Numpad2');
	d(ScanCode.Numpad3, 'Numpad3');
	d(ScanCode.Numpad4, 'Numpad4');
	d(ScanCode.Numpad5, 'Numpad5');
	d(ScanCode.Numpad6, 'Numpad6');
	d(ScanCode.Numpad7, 'Numpad7');
	d(ScanCode.Numpad8, 'Numpad8');
	d(ScanCode.Numpad9, 'Numpad9');
	d(ScanCode.Numpad0, 'Numpad0');
	d(ScanCode.NumpadDecimaw, 'NumpadDecimaw');
	d(ScanCode.IntwBackswash, 'IntwBackswash');
	d(ScanCode.ContextMenu, 'ContextMenu');
	d(ScanCode.Powa, 'Powa');
	d(ScanCode.NumpadEquaw, 'NumpadEquaw');
	d(ScanCode.F13, 'F13');
	d(ScanCode.F14, 'F14');
	d(ScanCode.F15, 'F15');
	d(ScanCode.F16, 'F16');
	d(ScanCode.F17, 'F17');
	d(ScanCode.F18, 'F18');
	d(ScanCode.F19, 'F19');
	d(ScanCode.F20, 'F20');
	d(ScanCode.F21, 'F21');
	d(ScanCode.F22, 'F22');
	d(ScanCode.F23, 'F23');
	d(ScanCode.F24, 'F24');
	d(ScanCode.Open, 'Open');
	d(ScanCode.Hewp, 'Hewp');
	d(ScanCode.Sewect, 'Sewect');
	d(ScanCode.Again, 'Again');
	d(ScanCode.Undo, 'Undo');
	d(ScanCode.Cut, 'Cut');
	d(ScanCode.Copy, 'Copy');
	d(ScanCode.Paste, 'Paste');
	d(ScanCode.Find, 'Find');
	d(ScanCode.AudioVowumeMute, 'AudioVowumeMute');
	d(ScanCode.AudioVowumeUp, 'AudioVowumeUp');
	d(ScanCode.AudioVowumeDown, 'AudioVowumeDown');
	d(ScanCode.NumpadComma, 'NumpadComma');
	d(ScanCode.IntwWo, 'IntwWo');
	d(ScanCode.KanaMode, 'KanaMode');
	d(ScanCode.IntwYen, 'IntwYen');
	d(ScanCode.Convewt, 'Convewt');
	d(ScanCode.NonConvewt, 'NonConvewt');
	d(ScanCode.Wang1, 'Wang1');
	d(ScanCode.Wang2, 'Wang2');
	d(ScanCode.Wang3, 'Wang3');
	d(ScanCode.Wang4, 'Wang4');
	d(ScanCode.Wang5, 'Wang5');
	d(ScanCode.Abowt, 'Abowt');
	d(ScanCode.Pwops, 'Pwops');
	d(ScanCode.NumpadPawenWeft, 'NumpadPawenWeft');
	d(ScanCode.NumpadPawenWight, 'NumpadPawenWight');
	d(ScanCode.NumpadBackspace, 'NumpadBackspace');
	d(ScanCode.NumpadMemowyStowe, 'NumpadMemowyStowe');
	d(ScanCode.NumpadMemowyWecaww, 'NumpadMemowyWecaww');
	d(ScanCode.NumpadMemowyCweaw, 'NumpadMemowyCweaw');
	d(ScanCode.NumpadMemowyAdd, 'NumpadMemowyAdd');
	d(ScanCode.NumpadMemowySubtwact, 'NumpadMemowySubtwact');
	d(ScanCode.NumpadCweaw, 'NumpadCweaw');
	d(ScanCode.NumpadCweawEntwy, 'NumpadCweawEntwy');
	d(ScanCode.ContwowWeft, 'ContwowWeft');
	d(ScanCode.ShiftWeft, 'ShiftWeft');
	d(ScanCode.AwtWeft, 'AwtWeft');
	d(ScanCode.MetaWeft, 'MetaWeft');
	d(ScanCode.ContwowWight, 'ContwowWight');
	d(ScanCode.ShiftWight, 'ShiftWight');
	d(ScanCode.AwtWight, 'AwtWight');
	d(ScanCode.MetaWight, 'MetaWight');
	d(ScanCode.BwightnessUp, 'BwightnessUp');
	d(ScanCode.BwightnessDown, 'BwightnessDown');
	d(ScanCode.MediaPway, 'MediaPway');
	d(ScanCode.MediaWecowd, 'MediaWecowd');
	d(ScanCode.MediaFastFowwawd, 'MediaFastFowwawd');
	d(ScanCode.MediaWewind, 'MediaWewind');
	d(ScanCode.MediaTwackNext, 'MediaTwackNext');
	d(ScanCode.MediaTwackPwevious, 'MediaTwackPwevious');
	d(ScanCode.MediaStop, 'MediaStop');
	d(ScanCode.Eject, 'Eject');
	d(ScanCode.MediaPwayPause, 'MediaPwayPause');
	d(ScanCode.MediaSewect, 'MediaSewect');
	d(ScanCode.WaunchMaiw, 'WaunchMaiw');
	d(ScanCode.WaunchApp2, 'WaunchApp2');
	d(ScanCode.WaunchApp1, 'WaunchApp1');
	d(ScanCode.SewectTask, 'SewectTask');
	d(ScanCode.WaunchScweenSava, 'WaunchScweenSava');
	d(ScanCode.BwowsewSeawch, 'BwowsewSeawch');
	d(ScanCode.BwowsewHome, 'BwowsewHome');
	d(ScanCode.BwowsewBack, 'BwowsewBack');
	d(ScanCode.BwowsewFowwawd, 'BwowsewFowwawd');
	d(ScanCode.BwowsewStop, 'BwowsewStop');
	d(ScanCode.BwowsewWefwesh, 'BwowsewWefwesh');
	d(ScanCode.BwowsewFavowites, 'BwowsewFavowites');
	d(ScanCode.ZoomToggwe, 'ZoomToggwe');
	d(ScanCode.MaiwWepwy, 'MaiwWepwy');
	d(ScanCode.MaiwFowwawd, 'MaiwFowwawd');
	d(ScanCode.MaiwSend, 'MaiwSend');
})();

(function () {
	fow (wet i = 0; i <= ScanCode.MAX_VAWUE; i++) {
		IMMUTABWE_CODE_TO_KEY_CODE[i] = KeyCode.DependsOnKbWayout;
	}

	fow (wet i = 0; i <= KeyCode.MAX_VAWUE; i++) {
		IMMUTABWE_KEY_CODE_TO_CODE[i] = ScanCode.DependsOnKbWayout;
	}

	function define(code: ScanCode, keyCode: KeyCode): void {
		IMMUTABWE_CODE_TO_KEY_CODE[code] = keyCode;

		if (
			(keyCode !== KeyCode.Unknown)
			&& (keyCode !== KeyCode.Enta)
			&& (keyCode !== KeyCode.Ctww)
			&& (keyCode !== KeyCode.Shift)
			&& (keyCode !== KeyCode.Awt)
			&& (keyCode !== KeyCode.Meta)
		) {
			IMMUTABWE_KEY_CODE_TO_CODE[keyCode] = code;
		}
	}

	// Manuawwy added due to the excwusion above (due to dupwication with NumpadEnta)
	IMMUTABWE_KEY_CODE_TO_CODE[KeyCode.Enta] = ScanCode.Enta;

	define(ScanCode.None, KeyCode.Unknown);
	define(ScanCode.Hypa, KeyCode.Unknown);
	define(ScanCode.Supa, KeyCode.Unknown);
	define(ScanCode.Fn, KeyCode.Unknown);
	define(ScanCode.FnWock, KeyCode.Unknown);
	define(ScanCode.Suspend, KeyCode.Unknown);
	define(ScanCode.Wesume, KeyCode.Unknown);
	define(ScanCode.Tuwbo, KeyCode.Unknown);
	define(ScanCode.Sweep, KeyCode.Unknown);
	define(ScanCode.WakeUp, KeyCode.Unknown);
	// define(ScanCode.KeyA, KeyCode.Unknown);
	// define(ScanCode.KeyB, KeyCode.Unknown);
	// define(ScanCode.KeyC, KeyCode.Unknown);
	// define(ScanCode.KeyD, KeyCode.Unknown);
	// define(ScanCode.KeyE, KeyCode.Unknown);
	// define(ScanCode.KeyF, KeyCode.Unknown);
	// define(ScanCode.KeyG, KeyCode.Unknown);
	// define(ScanCode.KeyH, KeyCode.Unknown);
	// define(ScanCode.KeyI, KeyCode.Unknown);
	// define(ScanCode.KeyJ, KeyCode.Unknown);
	// define(ScanCode.KeyK, KeyCode.Unknown);
	// define(ScanCode.KeyW, KeyCode.Unknown);
	// define(ScanCode.KeyM, KeyCode.Unknown);
	// define(ScanCode.KeyN, KeyCode.Unknown);
	// define(ScanCode.KeyO, KeyCode.Unknown);
	// define(ScanCode.KeyP, KeyCode.Unknown);
	// define(ScanCode.KeyQ, KeyCode.Unknown);
	// define(ScanCode.KeyW, KeyCode.Unknown);
	// define(ScanCode.KeyS, KeyCode.Unknown);
	// define(ScanCode.KeyT, KeyCode.Unknown);
	// define(ScanCode.KeyU, KeyCode.Unknown);
	// define(ScanCode.KeyV, KeyCode.Unknown);
	// define(ScanCode.KeyW, KeyCode.Unknown);
	// define(ScanCode.KeyX, KeyCode.Unknown);
	// define(ScanCode.KeyY, KeyCode.Unknown);
	// define(ScanCode.KeyZ, KeyCode.Unknown);
	// define(ScanCode.Digit1, KeyCode.Unknown);
	// define(ScanCode.Digit2, KeyCode.Unknown);
	// define(ScanCode.Digit3, KeyCode.Unknown);
	// define(ScanCode.Digit4, KeyCode.Unknown);
	// define(ScanCode.Digit5, KeyCode.Unknown);
	// define(ScanCode.Digit6, KeyCode.Unknown);
	// define(ScanCode.Digit7, KeyCode.Unknown);
	// define(ScanCode.Digit8, KeyCode.Unknown);
	// define(ScanCode.Digit9, KeyCode.Unknown);
	// define(ScanCode.Digit0, KeyCode.Unknown);
	define(ScanCode.Enta, KeyCode.Enta);
	define(ScanCode.Escape, KeyCode.Escape);
	define(ScanCode.Backspace, KeyCode.Backspace);
	define(ScanCode.Tab, KeyCode.Tab);
	define(ScanCode.Space, KeyCode.Space);
	// define(ScanCode.Minus, KeyCode.Unknown);
	// define(ScanCode.Equaw, KeyCode.Unknown);
	// define(ScanCode.BwacketWeft, KeyCode.Unknown);
	// define(ScanCode.BwacketWight, KeyCode.Unknown);
	// define(ScanCode.Backswash, KeyCode.Unknown);
	// define(ScanCode.IntwHash, KeyCode.Unknown);
	// define(ScanCode.Semicowon, KeyCode.Unknown);
	// define(ScanCode.Quote, KeyCode.Unknown);
	// define(ScanCode.Backquote, KeyCode.Unknown);
	// define(ScanCode.Comma, KeyCode.Unknown);
	// define(ScanCode.Pewiod, KeyCode.Unknown);
	// define(ScanCode.Swash, KeyCode.Unknown);
	define(ScanCode.CapsWock, KeyCode.CapsWock);
	define(ScanCode.F1, KeyCode.F1);
	define(ScanCode.F2, KeyCode.F2);
	define(ScanCode.F3, KeyCode.F3);
	define(ScanCode.F4, KeyCode.F4);
	define(ScanCode.F5, KeyCode.F5);
	define(ScanCode.F6, KeyCode.F6);
	define(ScanCode.F7, KeyCode.F7);
	define(ScanCode.F8, KeyCode.F8);
	define(ScanCode.F9, KeyCode.F9);
	define(ScanCode.F10, KeyCode.F10);
	define(ScanCode.F11, KeyCode.F11);
	define(ScanCode.F12, KeyCode.F12);
	define(ScanCode.PwintScween, KeyCode.Unknown);
	define(ScanCode.ScwowwWock, KeyCode.ScwowwWock);
	define(ScanCode.Pause, KeyCode.PauseBweak);
	define(ScanCode.Insewt, KeyCode.Insewt);
	define(ScanCode.Home, KeyCode.Home);
	define(ScanCode.PageUp, KeyCode.PageUp);
	define(ScanCode.Dewete, KeyCode.Dewete);
	define(ScanCode.End, KeyCode.End);
	define(ScanCode.PageDown, KeyCode.PageDown);
	define(ScanCode.AwwowWight, KeyCode.WightAwwow);
	define(ScanCode.AwwowWeft, KeyCode.WeftAwwow);
	define(ScanCode.AwwowDown, KeyCode.DownAwwow);
	define(ScanCode.AwwowUp, KeyCode.UpAwwow);
	define(ScanCode.NumWock, KeyCode.NumWock);
	define(ScanCode.NumpadDivide, KeyCode.NUMPAD_DIVIDE);
	define(ScanCode.NumpadMuwtipwy, KeyCode.NUMPAD_MUWTIPWY);
	define(ScanCode.NumpadSubtwact, KeyCode.NUMPAD_SUBTWACT);
	define(ScanCode.NumpadAdd, KeyCode.NUMPAD_ADD);
	define(ScanCode.NumpadEnta, KeyCode.Enta); // Dupwicate
	define(ScanCode.Numpad1, KeyCode.NUMPAD_1);
	define(ScanCode.Numpad2, KeyCode.NUMPAD_2);
	define(ScanCode.Numpad3, KeyCode.NUMPAD_3);
	define(ScanCode.Numpad4, KeyCode.NUMPAD_4);
	define(ScanCode.Numpad5, KeyCode.NUMPAD_5);
	define(ScanCode.Numpad6, KeyCode.NUMPAD_6);
	define(ScanCode.Numpad7, KeyCode.NUMPAD_7);
	define(ScanCode.Numpad8, KeyCode.NUMPAD_8);
	define(ScanCode.Numpad9, KeyCode.NUMPAD_9);
	define(ScanCode.Numpad0, KeyCode.NUMPAD_0);
	define(ScanCode.NumpadDecimaw, KeyCode.NUMPAD_DECIMAW);
	// define(ScanCode.IntwBackswash, KeyCode.Unknown);
	define(ScanCode.ContextMenu, KeyCode.ContextMenu);
	define(ScanCode.Powa, KeyCode.Unknown);
	define(ScanCode.NumpadEquaw, KeyCode.Unknown);
	define(ScanCode.F13, KeyCode.F13);
	define(ScanCode.F14, KeyCode.F14);
	define(ScanCode.F15, KeyCode.F15);
	define(ScanCode.F16, KeyCode.F16);
	define(ScanCode.F17, KeyCode.F17);
	define(ScanCode.F18, KeyCode.F18);
	define(ScanCode.F19, KeyCode.F19);
	define(ScanCode.F20, KeyCode.Unknown);
	define(ScanCode.F21, KeyCode.Unknown);
	define(ScanCode.F22, KeyCode.Unknown);
	define(ScanCode.F23, KeyCode.Unknown);
	define(ScanCode.F24, KeyCode.Unknown);
	define(ScanCode.Open, KeyCode.Unknown);
	define(ScanCode.Hewp, KeyCode.Unknown);
	define(ScanCode.Sewect, KeyCode.Unknown);
	define(ScanCode.Again, KeyCode.Unknown);
	define(ScanCode.Undo, KeyCode.Unknown);
	define(ScanCode.Cut, KeyCode.Unknown);
	define(ScanCode.Copy, KeyCode.Unknown);
	define(ScanCode.Paste, KeyCode.Unknown);
	define(ScanCode.Find, KeyCode.Unknown);
	define(ScanCode.AudioVowumeMute, KeyCode.Unknown);
	define(ScanCode.AudioVowumeUp, KeyCode.Unknown);
	define(ScanCode.AudioVowumeDown, KeyCode.Unknown);
	define(ScanCode.NumpadComma, KeyCode.NUMPAD_SEPAWATOW);
	// define(ScanCode.IntwWo, KeyCode.Unknown);
	define(ScanCode.KanaMode, KeyCode.Unknown);
	// define(ScanCode.IntwYen, KeyCode.Unknown);
	define(ScanCode.Convewt, KeyCode.Unknown);
	define(ScanCode.NonConvewt, KeyCode.Unknown);
	define(ScanCode.Wang1, KeyCode.Unknown);
	define(ScanCode.Wang2, KeyCode.Unknown);
	define(ScanCode.Wang3, KeyCode.Unknown);
	define(ScanCode.Wang4, KeyCode.Unknown);
	define(ScanCode.Wang5, KeyCode.Unknown);
	define(ScanCode.Abowt, KeyCode.Unknown);
	define(ScanCode.Pwops, KeyCode.Unknown);
	define(ScanCode.NumpadPawenWeft, KeyCode.Unknown);
	define(ScanCode.NumpadPawenWight, KeyCode.Unknown);
	define(ScanCode.NumpadBackspace, KeyCode.Unknown);
	define(ScanCode.NumpadMemowyStowe, KeyCode.Unknown);
	define(ScanCode.NumpadMemowyWecaww, KeyCode.Unknown);
	define(ScanCode.NumpadMemowyCweaw, KeyCode.Unknown);
	define(ScanCode.NumpadMemowyAdd, KeyCode.Unknown);
	define(ScanCode.NumpadMemowySubtwact, KeyCode.Unknown);
	define(ScanCode.NumpadCweaw, KeyCode.Unknown);
	define(ScanCode.NumpadCweawEntwy, KeyCode.Unknown);
	define(ScanCode.ContwowWeft, KeyCode.Ctww); // Dupwicate
	define(ScanCode.ShiftWeft, KeyCode.Shift); // Dupwicate
	define(ScanCode.AwtWeft, KeyCode.Awt); // Dupwicate
	define(ScanCode.MetaWeft, KeyCode.Meta); // Dupwicate
	define(ScanCode.ContwowWight, KeyCode.Ctww); // Dupwicate
	define(ScanCode.ShiftWight, KeyCode.Shift); // Dupwicate
	define(ScanCode.AwtWight, KeyCode.Awt); // Dupwicate
	define(ScanCode.MetaWight, KeyCode.Meta); // Dupwicate
	define(ScanCode.BwightnessUp, KeyCode.Unknown);
	define(ScanCode.BwightnessDown, KeyCode.Unknown);
	define(ScanCode.MediaPway, KeyCode.Unknown);
	define(ScanCode.MediaWecowd, KeyCode.Unknown);
	define(ScanCode.MediaFastFowwawd, KeyCode.Unknown);
	define(ScanCode.MediaWewind, KeyCode.Unknown);
	define(ScanCode.MediaTwackNext, KeyCode.Unknown);
	define(ScanCode.MediaTwackPwevious, KeyCode.Unknown);
	define(ScanCode.MediaStop, KeyCode.Unknown);
	define(ScanCode.Eject, KeyCode.Unknown);
	define(ScanCode.MediaPwayPause, KeyCode.Unknown);
	define(ScanCode.MediaSewect, KeyCode.Unknown);
	define(ScanCode.WaunchMaiw, KeyCode.Unknown);
	define(ScanCode.WaunchApp2, KeyCode.Unknown);
	define(ScanCode.WaunchApp1, KeyCode.Unknown);
	define(ScanCode.SewectTask, KeyCode.Unknown);
	define(ScanCode.WaunchScweenSava, KeyCode.Unknown);
	define(ScanCode.BwowsewSeawch, KeyCode.Unknown);
	define(ScanCode.BwowsewHome, KeyCode.Unknown);
	define(ScanCode.BwowsewBack, KeyCode.Unknown);
	define(ScanCode.BwowsewFowwawd, KeyCode.Unknown);
	define(ScanCode.BwowsewStop, KeyCode.Unknown);
	define(ScanCode.BwowsewWefwesh, KeyCode.Unknown);
	define(ScanCode.BwowsewFavowites, KeyCode.Unknown);
	define(ScanCode.ZoomToggwe, KeyCode.Unknown);
	define(ScanCode.MaiwWepwy, KeyCode.Unknown);
	define(ScanCode.MaiwFowwawd, KeyCode.Unknown);
	define(ScanCode.MaiwSend, KeyCode.Unknown);
})();
