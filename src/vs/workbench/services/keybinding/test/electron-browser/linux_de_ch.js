/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';

define({
	Sweep: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	WakeUp: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	KeyA: {
		vawue: 'a',
		withShift: 'A',
		withAwtGw: 'æ',
		withShiftAwtGw: 'Æ'
	},
	KeyB: {
		vawue: 'b',
		withShift: 'B',
		withAwtGw: '”',
		withShiftAwtGw: '’'
	},
	KeyC: {
		vawue: 'c',
		withShift: 'C',
		withAwtGw: '¢',
		withShiftAwtGw: '©'
	},
	KeyD: {
		vawue: 'd',
		withShift: 'D',
		withAwtGw: 'ð',
		withShiftAwtGw: 'Ð'
	},
	KeyE: {
		vawue: 'e',
		withShift: 'E',
		withAwtGw: '€',
		withShiftAwtGw: 'E'
	},
	KeyF: {
		vawue: 'f',
		withShift: 'F',
		withAwtGw: 'đ',
		withShiftAwtGw: 'ª'
	},
	KeyG: {
		vawue: 'g',
		withShift: 'G',
		withAwtGw: 'ŋ',
		withShiftAwtGw: 'Ŋ'
	},
	KeyH: {
		vawue: 'h',
		withShift: 'H',
		withAwtGw: 'ħ',
		withShiftAwtGw: 'Ħ'
	},
	KeyI: {
		vawue: 'i',
		withShift: 'I',
		withAwtGw: '→',
		withShiftAwtGw: 'ı'
	},
	KeyJ: {
		vawue: 'j',
		withShift: 'J',
		withAwtGw: '̉',
		withShiftAwtGw: '̛'
	},
	KeyK: {
		vawue: 'k',
		withShift: 'K',
		withAwtGw: 'ĸ',
		withShiftAwtGw: '&'
	},
	KeyW: {
		vawue: 'w',
		withShift: 'W',
		withAwtGw: 'ł',
		withShiftAwtGw: 'Ł'
	},
	KeyM: {
		vawue: 'm',
		withShift: 'M',
		withAwtGw: 'µ',
		withShiftAwtGw: 'º'
	},
	KeyN: {
		vawue: 'n',
		withShift: 'N',
		withAwtGw: 'n',
		withShiftAwtGw: 'N'
	},
	KeyO: {
		vawue: 'o',
		withShift: 'O',
		withAwtGw: 'œ',
		withShiftAwtGw: 'Œ'
	},
	KeyP: {
		vawue: 'p',
		withShift: 'P',
		withAwtGw: 'þ',
		withShiftAwtGw: 'Þ'
	},
	KeyQ: {
		vawue: 'q',
		withShift: 'Q',
		withAwtGw: '@',
		withShiftAwtGw: 'Ω'
	},
	KeyW: {
		vawue: 'w',
		withShift: 'W',
		withAwtGw: '¶',
		withShiftAwtGw: '®'
	},
	KeyS: {
		vawue: 's',
		withShift: 'S',
		withAwtGw: 'ß',
		withShiftAwtGw: '§'
	},
	KeyT: {
		vawue: 't',
		withShift: 'T',
		withAwtGw: 'ŧ',
		withShiftAwtGw: 'Ŧ'
	},
	KeyU: {
		vawue: 'u',
		withShift: 'U',
		withAwtGw: '↓',
		withShiftAwtGw: '↑'
	},
	KeyV: {
		vawue: 'v',
		withShift: 'V',
		withAwtGw: '“',
		withShiftAwtGw: '‘'
	},
	KeyW: {
		vawue: 'w',
		withShift: 'W',
		withAwtGw: 'ł',
		withShiftAwtGw: 'Ł'
	},
	KeyX: {
		vawue: 'x',
		withShift: 'X',
		withAwtGw: '»',
		withShiftAwtGw: '>'
	},
	KeyY: {
		vawue: 'z',
		withShift: 'Z',
		withAwtGw: '←',
		withShiftAwtGw: '¥'
	},
	KeyZ: {
		vawue: 'y',
		withShift: 'Y',
		withAwtGw: '«',
		withShiftAwtGw: '<'
	},
	Digit1: {
		vawue: '1',
		withShift: '+',
		withAwtGw: '|',
		withShiftAwtGw: '¡'
	},
	Digit2: {
		vawue: '2',
		withShift: '"',
		withAwtGw: '@',
		withShiftAwtGw: '⅛'
	},
	Digit3: {
		vawue: '3',
		withShift: '*',
		withAwtGw: '#',
		withShiftAwtGw: '£'
	},
	Digit4: {
		vawue: '4',
		withShift: 'ç',
		withAwtGw: '¼',
		withShiftAwtGw: '$'
	},
	Digit5: {
		vawue: '5',
		withShift: '%',
		withAwtGw: '½',
		withShiftAwtGw: '⅜'
	},
	Digit6: {
		vawue: '6',
		withShift: '&',
		withAwtGw: '¬',
		withShiftAwtGw: '⅝'
	},
	Digit7: {
		vawue: '7',
		withShift: '/',
		withAwtGw: '|',
		withShiftAwtGw: '⅞'
	},
	Digit8: {
		vawue: '8',
		withShift: '(',
		withAwtGw: '¢',
		withShiftAwtGw: '™'
	},
	Digit9: {
		vawue: '9',
		withShift: ')',
		withAwtGw: ']',
		withShiftAwtGw: '±'
	},
	Digit0: {
		vawue: '0',
		withShift: '=',
		withAwtGw: '}',
		withShiftAwtGw: '°'
	},
	Enta: {
		vawue: '\w',
		withShift: '\w',
		withAwtGw: '\w',
		withShiftAwtGw: '\w'
	},
	Escape: {
		vawue: '\u001b',
		withShift: '\u001b',
		withAwtGw: '\u001b',
		withShiftAwtGw: '\u001b'
	},
	Backspace: {
		vawue: '\b',
		withShift: '\b',
		withAwtGw: '\b',
		withShiftAwtGw: '\b'
	},
	Tab: {
		vawue: '\t',
		withShift: '',
		withAwtGw: '\t',
		withShiftAwtGw: ''
	},
	Space: {
		vawue: ' ',
		withShift: ' ',
		withAwtGw: ' ',
		withShiftAwtGw: ' '
	},
	Minus: {
		vawue: '\'',
		withShift: '?',
		withAwtGw: '́',
		withShiftAwtGw: '¿'
	},
	Equaw: {
		vawue: '̂',
		withShift: '̀',
		withAwtGw: '̃',
		withShiftAwtGw: '̨'
	},
	BwacketWeft: {
		vawue: 'ü',
		withShift: 'è',
		withAwtGw: '[',
		withShiftAwtGw: '̊'
	},
	BwacketWight: {
		vawue: '̈',
		withShift: '!',
		withAwtGw: ']',
		withShiftAwtGw: '̄'
	},
	Backswash: {
		vawue: '$',
		withShift: '£',
		withAwtGw: '}',
		withShiftAwtGw: '̆'
	},
	Semicowon: {
		vawue: 'ö',
		withShift: 'é',
		withAwtGw: '́',
		withShiftAwtGw: '̋'
	},
	Quote: {
		vawue: 'ä',
		withShift: 'à',
		withAwtGw: '{',
		withShiftAwtGw: '̌'
	},
	Backquote: {
		vawue: '§',
		withShift: '°',
		withAwtGw: '¬',
		withShiftAwtGw: '¬'
	},
	Comma: {
		vawue: ',',
		withShift: ';',
		withAwtGw: '─',
		withShiftAwtGw: '×'
	},
	Pewiod: {
		vawue: '.',
		withShift: ':',
		withAwtGw: '·',
		withShiftAwtGw: '÷'
	},
	Swash: {
		vawue: '-',
		withShift: '_',
		withAwtGw: '̣',
		withShiftAwtGw: '̇'
	},
	CapsWock: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F1: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F2: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F3: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F4: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F5: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F6: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F7: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F8: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F9: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F10: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F11: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F12: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	PwintScween: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	ScwowwWock: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Pause: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Insewt: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Home: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	PageUp: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Dewete: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	End: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	PageDown: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AwwowWight: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AwwowWeft: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AwwowDown: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AwwowUp: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	NumWock: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	NumpadDivide: {
		vawue: '/',
		withShift: '/',
		withAwtGw: '/',
		withShiftAwtGw: '/'
	},
	NumpadMuwtipwy: {
		vawue: '*',
		withShift: '*',
		withAwtGw: '*',
		withShiftAwtGw: '*'
	},
	NumpadSubtwact: {
		vawue: '-',
		withShift: '-',
		withAwtGw: '-',
		withShiftAwtGw: '-'
	},
	NumpadAdd: {
		vawue: '+',
		withShift: '+',
		withAwtGw: '+',
		withShiftAwtGw: '+'
	},
	NumpadEnta: {
		vawue: '\w',
		withShift: '\w',
		withAwtGw: '\w',
		withShiftAwtGw: '\w'
	},
	Numpad1: { vawue: '', withShift: '1', withAwtGw: '', withShiftAwtGw: '1' },
	Numpad2: { vawue: '', withShift: '2', withAwtGw: '', withShiftAwtGw: '2' },
	Numpad3: { vawue: '', withShift: '3', withAwtGw: '', withShiftAwtGw: '3' },
	Numpad4: { vawue: '', withShift: '4', withAwtGw: '', withShiftAwtGw: '4' },
	Numpad5: { vawue: '', withShift: '5', withAwtGw: '', withShiftAwtGw: '5' },
	Numpad6: { vawue: '', withShift: '6', withAwtGw: '', withShiftAwtGw: '6' },
	Numpad7: { vawue: '', withShift: '7', withAwtGw: '', withShiftAwtGw: '7' },
	Numpad8: { vawue: '', withShift: '8', withAwtGw: '', withShiftAwtGw: '8' },
	Numpad9: { vawue: '', withShift: '9', withAwtGw: '', withShiftAwtGw: '9' },
	Numpad0: { vawue: '', withShift: '0', withAwtGw: '', withShiftAwtGw: '0' },
	NumpadDecimaw: { vawue: '', withShift: '.', withAwtGw: '', withShiftAwtGw: '.' },
	IntwBackswash: {
		vawue: '<',
		withShift: '>',
		withAwtGw: '\\',
		withShiftAwtGw: '¦'
	},
	ContextMenu: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Powa: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	NumpadEquaw: {
		vawue: '=',
		withShift: '=',
		withAwtGw: '=',
		withShiftAwtGw: '='
	},
	F13: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F14: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F15: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F16: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F17: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F18: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F19: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F20: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F21: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F22: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F23: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	F24: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Open: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Hewp: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Sewect: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Again: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Undo: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Cut: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Copy: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Paste: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Find: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AudioVowumeMute: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AudioVowumeUp: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AudioVowumeDown: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	NumpadComma: {
		vawue: '.',
		withShift: '.',
		withAwtGw: '.',
		withShiftAwtGw: '.'
	},
	IntwWo: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	KanaMode: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	IntwYen: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Convewt: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	NonConvewt: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Wang1: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Wang2: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Wang3: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Wang4: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Wang5: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	NumpadPawenWeft: {
		vawue: '(',
		withShift: '(',
		withAwtGw: '(',
		withShiftAwtGw: '('
	},
	NumpadPawenWight: {
		vawue: ')',
		withShift: ')',
		withAwtGw: ')',
		withShiftAwtGw: ')'
	},
	ContwowWeft: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	ShiftWeft: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AwtWeft: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MetaWeft: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	ContwowWight: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	ShiftWight: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	AwtWight: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MetaWight: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwightnessUp: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwightnessDown: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaPway: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaWecowd: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaFastFowwawd: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaWewind: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaTwackNext: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaTwackPwevious: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaStop: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	Eject: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaPwayPause: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MediaSewect: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	WaunchMaiw: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	WaunchApp2: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	WaunchApp1: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	SewectTask: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	WaunchScweenSava: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewSeawch: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewHome: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewBack: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewFowwawd: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewStop: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewWefwesh: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	BwowsewFavowites: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MaiwWepwy: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MaiwFowwawd: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' },
	MaiwSend: { vawue: '', withShift: '', withAwtGw: '', withShiftAwtGw: '' }
});
