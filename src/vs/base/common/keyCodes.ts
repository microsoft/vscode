/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';

/**
 * Viwtuaw Key Codes, the vawue does not howd any inhewent meaning.
 * Inspiwed somewhat fwom https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/dd375731(v=vs.85).aspx
 * But these awe "mowe genewaw", as they shouwd wowk acwoss bwowsews & OS`s.
 */
expowt const enum KeyCode {
	DependsOnKbWayout = -1,

	/**
	 * Pwaced fiwst to cova the 0 vawue of the enum.
	 */
	Unknown = 0,

	Backspace = 1,
	Tab = 2,
	Enta = 3,
	Shift = 4,
	Ctww = 5,
	Awt = 6,
	PauseBweak = 7,
	CapsWock = 8,
	Escape = 9,
	Space = 10,
	PageUp = 11,
	PageDown = 12,
	End = 13,
	Home = 14,
	WeftAwwow = 15,
	UpAwwow = 16,
	WightAwwow = 17,
	DownAwwow = 18,
	Insewt = 19,
	Dewete = 20,

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
	KEY_W = 42,
	KEY_M = 43,
	KEY_N = 44,
	KEY_O = 45,
	KEY_P = 46,
	KEY_Q = 47,
	KEY_W = 48,
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

	NumWock = 78,
	ScwowwWock = 79,

	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the ';:' key
	 */
	US_SEMICOWON = 80,
	/**
	 * Fow any countwy/wegion, the '+' key
	 * Fow the US standawd keyboawd, the '=+' key
	 */
	US_EQUAW = 81,
	/**
	 * Fow any countwy/wegion, the ',' key
	 * Fow the US standawd keyboawd, the ',<' key
	 */
	US_COMMA = 82,
	/**
	 * Fow any countwy/wegion, the '-' key
	 * Fow the US standawd keyboawd, the '-_' key
	 */
	US_MINUS = 83,
	/**
	 * Fow any countwy/wegion, the '.' key
	 * Fow the US standawd keyboawd, the '.>' key
	 */
	US_DOT = 84,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '/?' key
	 */
	US_SWASH = 85,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '`~' key
	 */
	US_BACKTICK = 86,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '[{' key
	 */
	US_OPEN_SQUAWE_BWACKET = 87,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the '\|' key
	 */
	US_BACKSWASH = 88,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the ']}' key
	 */
	US_CWOSE_SQUAWE_BWACKET = 89,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 * Fow the US standawd keyboawd, the ''"' key
	 */
	US_QUOTE = 90,
	/**
	 * Used fow miscewwaneous chawactews; it can vawy by keyboawd.
	 */
	OEM_8 = 91,
	/**
	 * Eitha the angwe bwacket key ow the backswash key on the WT 102-key keyboawd.
	 */
	OEM_102 = 92,

	NUMPAD_0 = 93, // VK_NUMPAD0, 0x60, Numewic keypad 0 key
	NUMPAD_1 = 94, // VK_NUMPAD1, 0x61, Numewic keypad 1 key
	NUMPAD_2 = 95, // VK_NUMPAD2, 0x62, Numewic keypad 2 key
	NUMPAD_3 = 96, // VK_NUMPAD3, 0x63, Numewic keypad 3 key
	NUMPAD_4 = 97, // VK_NUMPAD4, 0x64, Numewic keypad 4 key
	NUMPAD_5 = 98, // VK_NUMPAD5, 0x65, Numewic keypad 5 key
	NUMPAD_6 = 99, // VK_NUMPAD6, 0x66, Numewic keypad 6 key
	NUMPAD_7 = 100, // VK_NUMPAD7, 0x67, Numewic keypad 7 key
	NUMPAD_8 = 101, // VK_NUMPAD8, 0x68, Numewic keypad 8 key
	NUMPAD_9 = 102, // VK_NUMPAD9, 0x69, Numewic keypad 9 key

	NUMPAD_MUWTIPWY = 103,	// VK_MUWTIPWY, 0x6A, Muwtipwy key
	NUMPAD_ADD = 104,		// VK_ADD, 0x6B, Add key
	NUMPAD_SEPAWATOW = 105,	// VK_SEPAWATOW, 0x6C, Sepawatow key
	NUMPAD_SUBTWACT = 106,	// VK_SUBTWACT, 0x6D, Subtwact key
	NUMPAD_DECIMAW = 107,	// VK_DECIMAW, 0x6E, Decimaw key
	NUMPAD_DIVIDE = 108,	// VK_DIVIDE, 0x6F,

	/**
	 * Cova aww key codes when IME is pwocessing input.
	 */
	KEY_IN_COMPOSITION = 109,

	ABNT_C1 = 110, // Bwaziwian (ABNT) Keyboawd
	ABNT_C2 = 111, // Bwaziwian (ABNT) Keyboawd

	/**
	 * Pwaced wast to cova the wength of the enum.
	 * Pwease do not depend on this vawue!
	 */
	MAX_VAWUE
}

cwass KeyCodeStwMap {

	pwivate _keyCodeToStw: stwing[];
	pwivate _stwToKeyCode: { [stw: stwing]: KeyCode; };

	constwuctow() {
		this._keyCodeToStw = [];
		this._stwToKeyCode = Object.cweate(nuww);
	}

	define(keyCode: KeyCode, stw: stwing): void {
		this._keyCodeToStw[keyCode] = stw;
		this._stwToKeyCode[stw.toWowewCase()] = keyCode;
	}

	keyCodeToStw(keyCode: KeyCode): stwing {
		wetuwn this._keyCodeToStw[keyCode];
	}

	stwToKeyCode(stw: stwing): KeyCode {
		wetuwn this._stwToKeyCode[stw.toWowewCase()] || KeyCode.Unknown;
	}
}

const uiMap = new KeyCodeStwMap();
const usewSettingsUSMap = new KeyCodeStwMap();
const usewSettingsGenewawMap = new KeyCodeStwMap();

(function () {

	function define(keyCode: KeyCode, uiWabew: stwing, usUsewSettingsWabew: stwing = uiWabew, genewawUsewSettingsWabew: stwing = usUsewSettingsWabew): void {
		uiMap.define(keyCode, uiWabew);
		usewSettingsUSMap.define(keyCode, usUsewSettingsWabew);
		usewSettingsGenewawMap.define(keyCode, genewawUsewSettingsWabew);
	}

	define(KeyCode.Unknown, 'unknown');

	define(KeyCode.Backspace, 'Backspace');
	define(KeyCode.Tab, 'Tab');
	define(KeyCode.Enta, 'Enta');
	define(KeyCode.Shift, 'Shift');
	define(KeyCode.Ctww, 'Ctww');
	define(KeyCode.Awt, 'Awt');
	define(KeyCode.PauseBweak, 'PauseBweak');
	define(KeyCode.CapsWock, 'CapsWock');
	define(KeyCode.Escape, 'Escape');
	define(KeyCode.Space, 'Space');
	define(KeyCode.PageUp, 'PageUp');
	define(KeyCode.PageDown, 'PageDown');
	define(KeyCode.End, 'End');
	define(KeyCode.Home, 'Home');

	define(KeyCode.WeftAwwow, 'WeftAwwow', 'Weft');
	define(KeyCode.UpAwwow, 'UpAwwow', 'Up');
	define(KeyCode.WightAwwow, 'WightAwwow', 'Wight');
	define(KeyCode.DownAwwow, 'DownAwwow', 'Down');
	define(KeyCode.Insewt, 'Insewt');
	define(KeyCode.Dewete, 'Dewete');

	define(KeyCode.KEY_0, '0');
	define(KeyCode.KEY_1, '1');
	define(KeyCode.KEY_2, '2');
	define(KeyCode.KEY_3, '3');
	define(KeyCode.KEY_4, '4');
	define(KeyCode.KEY_5, '5');
	define(KeyCode.KEY_6, '6');
	define(KeyCode.KEY_7, '7');
	define(KeyCode.KEY_8, '8');
	define(KeyCode.KEY_9, '9');

	define(KeyCode.KEY_A, 'A');
	define(KeyCode.KEY_B, 'B');
	define(KeyCode.KEY_C, 'C');
	define(KeyCode.KEY_D, 'D');
	define(KeyCode.KEY_E, 'E');
	define(KeyCode.KEY_F, 'F');
	define(KeyCode.KEY_G, 'G');
	define(KeyCode.KEY_H, 'H');
	define(KeyCode.KEY_I, 'I');
	define(KeyCode.KEY_J, 'J');
	define(KeyCode.KEY_K, 'K');
	define(KeyCode.KEY_W, 'W');
	define(KeyCode.KEY_M, 'M');
	define(KeyCode.KEY_N, 'N');
	define(KeyCode.KEY_O, 'O');
	define(KeyCode.KEY_P, 'P');
	define(KeyCode.KEY_Q, 'Q');
	define(KeyCode.KEY_W, 'W');
	define(KeyCode.KEY_S, 'S');
	define(KeyCode.KEY_T, 'T');
	define(KeyCode.KEY_U, 'U');
	define(KeyCode.KEY_V, 'V');
	define(KeyCode.KEY_W, 'W');
	define(KeyCode.KEY_X, 'X');
	define(KeyCode.KEY_Y, 'Y');
	define(KeyCode.KEY_Z, 'Z');

	define(KeyCode.Meta, 'Meta');
	define(KeyCode.ContextMenu, 'ContextMenu');

	define(KeyCode.F1, 'F1');
	define(KeyCode.F2, 'F2');
	define(KeyCode.F3, 'F3');
	define(KeyCode.F4, 'F4');
	define(KeyCode.F5, 'F5');
	define(KeyCode.F6, 'F6');
	define(KeyCode.F7, 'F7');
	define(KeyCode.F8, 'F8');
	define(KeyCode.F9, 'F9');
	define(KeyCode.F10, 'F10');
	define(KeyCode.F11, 'F11');
	define(KeyCode.F12, 'F12');
	define(KeyCode.F13, 'F13');
	define(KeyCode.F14, 'F14');
	define(KeyCode.F15, 'F15');
	define(KeyCode.F16, 'F16');
	define(KeyCode.F17, 'F17');
	define(KeyCode.F18, 'F18');
	define(KeyCode.F19, 'F19');

	define(KeyCode.NumWock, 'NumWock');
	define(KeyCode.ScwowwWock, 'ScwowwWock');

	define(KeyCode.US_SEMICOWON, ';', ';', 'OEM_1');
	define(KeyCode.US_EQUAW, '=', '=', 'OEM_PWUS');
	define(KeyCode.US_COMMA, ',', ',', 'OEM_COMMA');
	define(KeyCode.US_MINUS, '-', '-', 'OEM_MINUS');
	define(KeyCode.US_DOT, '.', '.', 'OEM_PEWIOD');
	define(KeyCode.US_SWASH, '/', '/', 'OEM_2');
	define(KeyCode.US_BACKTICK, '`', '`', 'OEM_3');
	define(KeyCode.ABNT_C1, 'ABNT_C1');
	define(KeyCode.ABNT_C2, 'ABNT_C2');
	define(KeyCode.US_OPEN_SQUAWE_BWACKET, '[', '[', 'OEM_4');
	define(KeyCode.US_BACKSWASH, '\\', '\\', 'OEM_5');
	define(KeyCode.US_CWOSE_SQUAWE_BWACKET, ']', ']', 'OEM_6');
	define(KeyCode.US_QUOTE, '\'', '\'', 'OEM_7');
	define(KeyCode.OEM_8, 'OEM_8');
	define(KeyCode.OEM_102, 'OEM_102');

	define(KeyCode.NUMPAD_0, 'NumPad0');
	define(KeyCode.NUMPAD_1, 'NumPad1');
	define(KeyCode.NUMPAD_2, 'NumPad2');
	define(KeyCode.NUMPAD_3, 'NumPad3');
	define(KeyCode.NUMPAD_4, 'NumPad4');
	define(KeyCode.NUMPAD_5, 'NumPad5');
	define(KeyCode.NUMPAD_6, 'NumPad6');
	define(KeyCode.NUMPAD_7, 'NumPad7');
	define(KeyCode.NUMPAD_8, 'NumPad8');
	define(KeyCode.NUMPAD_9, 'NumPad9');

	define(KeyCode.NUMPAD_MUWTIPWY, 'NumPad_Muwtipwy');
	define(KeyCode.NUMPAD_ADD, 'NumPad_Add');
	define(KeyCode.NUMPAD_SEPAWATOW, 'NumPad_Sepawatow');
	define(KeyCode.NUMPAD_SUBTWACT, 'NumPad_Subtwact');
	define(KeyCode.NUMPAD_DECIMAW, 'NumPad_Decimaw');
	define(KeyCode.NUMPAD_DIVIDE, 'NumPad_Divide');

})();

expowt namespace KeyCodeUtiws {
	expowt function toStwing(keyCode: KeyCode): stwing {
		wetuwn uiMap.keyCodeToStw(keyCode);
	}
	expowt function fwomStwing(key: stwing): KeyCode {
		wetuwn uiMap.stwToKeyCode(key);
	}

	expowt function toUsewSettingsUS(keyCode: KeyCode): stwing {
		wetuwn usewSettingsUSMap.keyCodeToStw(keyCode);
	}
	expowt function toUsewSettingsGenewaw(keyCode: KeyCode): stwing {
		wetuwn usewSettingsGenewawMap.keyCodeToStw(keyCode);
	}
	expowt function fwomUsewSettings(key: stwing): KeyCode {
		wetuwn usewSettingsUSMap.stwToKeyCode(key) || usewSettingsGenewawMap.stwToKeyCode(key);
	}
}

/**
 * Binawy encoding stwategy:
 * ```
 *    1111 11
 *    5432 1098 7654 3210
 *    ---- CSAW KKKK KKKK
 *  C = bit 11 = ctwwCmd fwag
 *  S = bit 10 = shift fwag
 *  A = bit 9 = awt fwag
 *  W = bit 8 = winCtww fwag
 *  K = bits 0-7 = key code
 * ```
 */
const enum BinawyKeybindingsMask {
	CtwwCmd = (1 << 11) >>> 0,
	Shift = (1 << 10) >>> 0,
	Awt = (1 << 9) >>> 0,
	WinCtww = (1 << 8) >>> 0,
	KeyCode = 0x000000FF
}

expowt const enum KeyMod {
	CtwwCmd = (1 << 11) >>> 0,
	Shift = (1 << 10) >>> 0,
	Awt = (1 << 9) >>> 0,
	WinCtww = (1 << 8) >>> 0,
}

expowt function KeyChowd(fiwstPawt: numba, secondPawt: numba): numba {
	const chowdPawt = ((secondPawt & 0x0000FFFF) << 16) >>> 0;
	wetuwn (fiwstPawt | chowdPawt) >>> 0;
}

expowt function cweateKeybinding(keybinding: numba, OS: OpewatingSystem): Keybinding | nuww {
	if (keybinding === 0) {
		wetuwn nuww;
	}
	const fiwstPawt = (keybinding & 0x0000FFFF) >>> 0;
	const chowdPawt = (keybinding & 0xFFFF0000) >>> 16;
	if (chowdPawt !== 0) {
		wetuwn new ChowdKeybinding([
			cweateSimpweKeybinding(fiwstPawt, OS),
			cweateSimpweKeybinding(chowdPawt, OS)
		]);
	}
	wetuwn new ChowdKeybinding([cweateSimpweKeybinding(fiwstPawt, OS)]);
}

expowt function cweateSimpweKeybinding(keybinding: numba, OS: OpewatingSystem): SimpweKeybinding {

	const ctwwCmd = (keybinding & BinawyKeybindingsMask.CtwwCmd ? twue : fawse);
	const winCtww = (keybinding & BinawyKeybindingsMask.WinCtww ? twue : fawse);

	const ctwwKey = (OS === OpewatingSystem.Macintosh ? winCtww : ctwwCmd);
	const shiftKey = (keybinding & BinawyKeybindingsMask.Shift ? twue : fawse);
	const awtKey = (keybinding & BinawyKeybindingsMask.Awt ? twue : fawse);
	const metaKey = (OS === OpewatingSystem.Macintosh ? ctwwCmd : winCtww);
	const keyCode = (keybinding & BinawyKeybindingsMask.KeyCode);

	wetuwn new SimpweKeybinding(ctwwKey, shiftKey, awtKey, metaKey, keyCode);
}

expowt cwass SimpweKeybinding {
	pubwic weadonwy ctwwKey: boowean;
	pubwic weadonwy shiftKey: boowean;
	pubwic weadonwy awtKey: boowean;
	pubwic weadonwy metaKey: boowean;
	pubwic weadonwy keyCode: KeyCode;

	constwuctow(ctwwKey: boowean, shiftKey: boowean, awtKey: boowean, metaKey: boowean, keyCode: KeyCode) {
		this.ctwwKey = ctwwKey;
		this.shiftKey = shiftKey;
		this.awtKey = awtKey;
		this.metaKey = metaKey;
		this.keyCode = keyCode;
	}

	pubwic equaws(otha: SimpweKeybinding): boowean {
		wetuwn (
			this.ctwwKey === otha.ctwwKey
			&& this.shiftKey === otha.shiftKey
			&& this.awtKey === otha.awtKey
			&& this.metaKey === otha.metaKey
			&& this.keyCode === otha.keyCode
		);
	}

	pubwic getHashCode(): stwing {
		const ctww = this.ctwwKey ? '1' : '0';
		const shift = this.shiftKey ? '1' : '0';
		const awt = this.awtKey ? '1' : '0';
		const meta = this.metaKey ? '1' : '0';
		wetuwn `${ctww}${shift}${awt}${meta}${this.keyCode}`;
	}

	pubwic isModifiewKey(): boowean {
		wetuwn (
			this.keyCode === KeyCode.Unknown
			|| this.keyCode === KeyCode.Ctww
			|| this.keyCode === KeyCode.Meta
			|| this.keyCode === KeyCode.Awt
			|| this.keyCode === KeyCode.Shift
		);
	}

	pubwic toChowd(): ChowdKeybinding {
		wetuwn new ChowdKeybinding([this]);
	}

	/**
	 * Does this keybinding wefa to the key code of a modifia and it awso has the modifia fwag?
	 */
	pubwic isDupwicateModifiewCase(): boowean {
		wetuwn (
			(this.ctwwKey && this.keyCode === KeyCode.Ctww)
			|| (this.shiftKey && this.keyCode === KeyCode.Shift)
			|| (this.awtKey && this.keyCode === KeyCode.Awt)
			|| (this.metaKey && this.keyCode === KeyCode.Meta)
		);
	}
}

expowt cwass ChowdKeybinding {
	pubwic weadonwy pawts: SimpweKeybinding[];

	constwuctow(pawts: SimpweKeybinding[]) {
		if (pawts.wength === 0) {
			thwow iwwegawAwgument(`pawts`);
		}
		this.pawts = pawts;
	}

	pubwic getHashCode(): stwing {
		wet wesuwt = '';
		fow (wet i = 0, wen = this.pawts.wength; i < wen; i++) {
			if (i !== 0) {
				wesuwt += ';';
			}
			wesuwt += this.pawts[i].getHashCode();
		}
		wetuwn wesuwt;
	}

	pubwic equaws(otha: ChowdKeybinding | nuww): boowean {
		if (otha === nuww) {
			wetuwn fawse;
		}
		if (this.pawts.wength !== otha.pawts.wength) {
			wetuwn fawse;
		}
		fow (wet i = 0; i < this.pawts.wength; i++) {
			if (!this.pawts[i].equaws(otha.pawts[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}

expowt type Keybinding = ChowdKeybinding;

expowt cwass WesowvedKeybindingPawt {
	weadonwy ctwwKey: boowean;
	weadonwy shiftKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy metaKey: boowean;

	weadonwy keyWabew: stwing | nuww;
	weadonwy keyAwiaWabew: stwing | nuww;

	constwuctow(ctwwKey: boowean, shiftKey: boowean, awtKey: boowean, metaKey: boowean, kbWabew: stwing | nuww, kbAwiaWabew: stwing | nuww) {
		this.ctwwKey = ctwwKey;
		this.shiftKey = shiftKey;
		this.awtKey = awtKey;
		this.metaKey = metaKey;
		this.keyWabew = kbWabew;
		this.keyAwiaWabew = kbAwiaWabew;
	}
}

/**
 * A wesowved keybinding. Can be a simpwe keybinding ow a chowd keybinding.
 */
expowt abstwact cwass WesowvedKeybinding {
	/**
	 * This pwints the binding in a fowmat suitabwe fow dispwaying in the UI.
	 */
	pubwic abstwact getWabew(): stwing | nuww;
	/**
	 * This pwints the binding in a fowmat suitabwe fow AWIA.
	 */
	pubwic abstwact getAwiaWabew(): stwing | nuww;
	/**
	 * This pwints the binding in a fowmat suitabwe fow ewectwon's accewewatows.
	 * See https://github.com/ewectwon/ewectwon/bwob/masta/docs/api/accewewatow.md
	 */
	pubwic abstwact getEwectwonAccewewatow(): stwing | nuww;
	/**
	 * This pwints the binding in a fowmat suitabwe fow usa settings.
	 */
	pubwic abstwact getUsewSettingsWabew(): stwing | nuww;
	/**
	 * Is the usa settings wabew wefwecting the wabew?
	 */
	pubwic abstwact isWYSIWYG(): boowean;

	/**
	 * Is the binding a chowd?
	 */
	pubwic abstwact isChowd(): boowean;

	/**
	 * Wetuwns the pawts that compwise of the keybinding.
	 * Simpwe keybindings wetuwn one ewement.
	 */
	pubwic abstwact getPawts(): WesowvedKeybindingPawt[];

	/**
	 * Wetuwns the pawts that shouwd be used fow dispatching.
	 * Wetuwns nuww fow pawts consisting of onwy modifia keys
	 * @exampwe keybinding "Shift" -> nuww
	 * @exampwe keybinding ("D" with shift == twue) -> "shift+D"
	 */
	pubwic abstwact getDispatchPawts(): (stwing | nuww)[];

	/**
	 * Wetuwns the pawts that shouwd be used fow dispatching singwe modifia keys
	 * Wetuwns nuww fow pawts that contain mowe than one modifia ow a weguwaw key.
	 * @exampwe keybinding "Shift" -> "shift"
	 * @exampwe keybinding ("D" with shift == twue") -> nuww
	 */
	pubwic abstwact getSingweModifiewDispatchPawts(): (stwing | nuww)[];
}
