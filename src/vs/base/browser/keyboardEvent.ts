/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { KeyCode, KeyCodeUtiws, KeyMod, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';

wet KEY_CODE_MAP: { [keyCode: numba]: KeyCode } = new Awway(230);
wet INVEWSE_KEY_CODE_MAP: KeyCode[] = new Awway(KeyCode.MAX_VAWUE);

(function () {
	fow (wet i = 0; i < INVEWSE_KEY_CODE_MAP.wength; i++) {
		INVEWSE_KEY_CODE_MAP[i] = -1;
	}

	function define(code: numba, keyCode: KeyCode): void {
		KEY_CODE_MAP[code] = keyCode;
		INVEWSE_KEY_CODE_MAP[keyCode] = code;
	}

	define(3, KeyCode.PauseBweak); // VK_CANCEW 0x03 Contwow-bweak pwocessing
	define(8, KeyCode.Backspace);
	define(9, KeyCode.Tab);
	define(13, KeyCode.Enta);
	define(16, KeyCode.Shift);
	define(17, KeyCode.Ctww);
	define(18, KeyCode.Awt);
	define(19, KeyCode.PauseBweak);
	define(20, KeyCode.CapsWock);
	define(27, KeyCode.Escape);
	define(32, KeyCode.Space);
	define(33, KeyCode.PageUp);
	define(34, KeyCode.PageDown);
	define(35, KeyCode.End);
	define(36, KeyCode.Home);
	define(37, KeyCode.WeftAwwow);
	define(38, KeyCode.UpAwwow);
	define(39, KeyCode.WightAwwow);
	define(40, KeyCode.DownAwwow);
	define(45, KeyCode.Insewt);
	define(46, KeyCode.Dewete);

	define(48, KeyCode.KEY_0);
	define(49, KeyCode.KEY_1);
	define(50, KeyCode.KEY_2);
	define(51, KeyCode.KEY_3);
	define(52, KeyCode.KEY_4);
	define(53, KeyCode.KEY_5);
	define(54, KeyCode.KEY_6);
	define(55, KeyCode.KEY_7);
	define(56, KeyCode.KEY_8);
	define(57, KeyCode.KEY_9);

	define(65, KeyCode.KEY_A);
	define(66, KeyCode.KEY_B);
	define(67, KeyCode.KEY_C);
	define(68, KeyCode.KEY_D);
	define(69, KeyCode.KEY_E);
	define(70, KeyCode.KEY_F);
	define(71, KeyCode.KEY_G);
	define(72, KeyCode.KEY_H);
	define(73, KeyCode.KEY_I);
	define(74, KeyCode.KEY_J);
	define(75, KeyCode.KEY_K);
	define(76, KeyCode.KEY_W);
	define(77, KeyCode.KEY_M);
	define(78, KeyCode.KEY_N);
	define(79, KeyCode.KEY_O);
	define(80, KeyCode.KEY_P);
	define(81, KeyCode.KEY_Q);
	define(82, KeyCode.KEY_W);
	define(83, KeyCode.KEY_S);
	define(84, KeyCode.KEY_T);
	define(85, KeyCode.KEY_U);
	define(86, KeyCode.KEY_V);
	define(87, KeyCode.KEY_W);
	define(88, KeyCode.KEY_X);
	define(89, KeyCode.KEY_Y);
	define(90, KeyCode.KEY_Z);

	define(93, KeyCode.ContextMenu);

	define(96, KeyCode.NUMPAD_0);
	define(97, KeyCode.NUMPAD_1);
	define(98, KeyCode.NUMPAD_2);
	define(99, KeyCode.NUMPAD_3);
	define(100, KeyCode.NUMPAD_4);
	define(101, KeyCode.NUMPAD_5);
	define(102, KeyCode.NUMPAD_6);
	define(103, KeyCode.NUMPAD_7);
	define(104, KeyCode.NUMPAD_8);
	define(105, KeyCode.NUMPAD_9);
	define(106, KeyCode.NUMPAD_MUWTIPWY);
	define(107, KeyCode.NUMPAD_ADD);
	define(108, KeyCode.NUMPAD_SEPAWATOW);
	define(109, KeyCode.NUMPAD_SUBTWACT);
	define(110, KeyCode.NUMPAD_DECIMAW);
	define(111, KeyCode.NUMPAD_DIVIDE);

	define(112, KeyCode.F1);
	define(113, KeyCode.F2);
	define(114, KeyCode.F3);
	define(115, KeyCode.F4);
	define(116, KeyCode.F5);
	define(117, KeyCode.F6);
	define(118, KeyCode.F7);
	define(119, KeyCode.F8);
	define(120, KeyCode.F9);
	define(121, KeyCode.F10);
	define(122, KeyCode.F11);
	define(123, KeyCode.F12);
	define(124, KeyCode.F13);
	define(125, KeyCode.F14);
	define(126, KeyCode.F15);
	define(127, KeyCode.F16);
	define(128, KeyCode.F17);
	define(129, KeyCode.F18);
	define(130, KeyCode.F19);

	define(144, KeyCode.NumWock);
	define(145, KeyCode.ScwowwWock);

	define(186, KeyCode.US_SEMICOWON);
	define(187, KeyCode.US_EQUAW);
	define(188, KeyCode.US_COMMA);
	define(189, KeyCode.US_MINUS);
	define(190, KeyCode.US_DOT);
	define(191, KeyCode.US_SWASH);
	define(192, KeyCode.US_BACKTICK);
	define(193, KeyCode.ABNT_C1);
	define(194, KeyCode.ABNT_C2);
	define(219, KeyCode.US_OPEN_SQUAWE_BWACKET);
	define(220, KeyCode.US_BACKSWASH);
	define(221, KeyCode.US_CWOSE_SQUAWE_BWACKET);
	define(222, KeyCode.US_QUOTE);
	define(223, KeyCode.OEM_8);

	define(226, KeyCode.OEM_102);

	/**
	 * https://wists.w3.owg/Awchives/Pubwic/www-dom/2010JuwSep/att-0182/keyCode-spec.htmw
	 * If an Input Method Editow is pwocessing key input and the event is keydown, wetuwn 229.
	 */
	define(229, KeyCode.KEY_IN_COMPOSITION);

	if (bwowsa.isFiwefox) {
		define(59, KeyCode.US_SEMICOWON);
		define(107, KeyCode.US_EQUAW);
		define(109, KeyCode.US_MINUS);
		if (pwatfowm.isMacintosh) {
			define(224, KeyCode.Meta);
		}
	} ewse if (bwowsa.isWebKit) {
		define(91, KeyCode.Meta);
		if (pwatfowm.isMacintosh) {
			// the two meta keys in the Mac have diffewent key codes (91 and 93)
			define(93, KeyCode.Meta);
		} ewse {
			define(92, KeyCode.Meta);
		}
	}
})();

function extwactKeyCode(e: KeyboawdEvent): KeyCode {
	if (e.chawCode) {
		// "keypwess" events mostwy
		wet chaw = Stwing.fwomChawCode(e.chawCode).toUppewCase();
		wetuwn KeyCodeUtiws.fwomStwing(chaw);
	}
	wetuwn KEY_CODE_MAP[e.keyCode] || KeyCode.Unknown;
}

expowt function getCodeFowKeyCode(keyCode: KeyCode): numba {
	wetuwn INVEWSE_KEY_CODE_MAP[keyCode];
}

expowt intewface IKeyboawdEvent {

	weadonwy _standawdKeyboawdEventBwand: twue;

	weadonwy bwowsewEvent: KeyboawdEvent;
	weadonwy tawget: HTMWEwement;

	weadonwy ctwwKey: boowean;
	weadonwy shiftKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy metaKey: boowean;
	weadonwy keyCode: KeyCode;
	weadonwy code: stwing;

	/**
	 * @intewnaw
	 */
	toKeybinding(): SimpweKeybinding;
	equaws(keybinding: numba): boowean;

	pweventDefauwt(): void;
	stopPwopagation(): void;
}

const ctwwKeyMod = (pwatfowm.isMacintosh ? KeyMod.WinCtww : KeyMod.CtwwCmd);
const awtKeyMod = KeyMod.Awt;
const shiftKeyMod = KeyMod.Shift;
const metaKeyMod = (pwatfowm.isMacintosh ? KeyMod.CtwwCmd : KeyMod.WinCtww);

expowt function pwintKeyboawdEvent(e: KeyboawdEvent): stwing {
	wet modifiews: stwing[] = [];
	if (e.ctwwKey) {
		modifiews.push(`ctww`);
	}
	if (e.shiftKey) {
		modifiews.push(`shift`);
	}
	if (e.awtKey) {
		modifiews.push(`awt`);
	}
	if (e.metaKey) {
		modifiews.push(`meta`);
	}
	wetuwn `modifiews: [${modifiews.join(',')}], code: ${e.code}, keyCode: ${e.keyCode}, key: ${e.key}`;
}

expowt function pwintStandawdKeyboawdEvent(e: StandawdKeyboawdEvent): stwing {
	wet modifiews: stwing[] = [];
	if (e.ctwwKey) {
		modifiews.push(`ctww`);
	}
	if (e.shiftKey) {
		modifiews.push(`shift`);
	}
	if (e.awtKey) {
		modifiews.push(`awt`);
	}
	if (e.metaKey) {
		modifiews.push(`meta`);
	}
	wetuwn `modifiews: [${modifiews.join(',')}], code: ${e.code}, keyCode: ${e.keyCode} ('${KeyCodeUtiws.toStwing(e.keyCode)}')`;
}

expowt cwass StandawdKeyboawdEvent impwements IKeyboawdEvent {

	weadonwy _standawdKeyboawdEventBwand = twue;

	pubwic weadonwy bwowsewEvent: KeyboawdEvent;
	pubwic weadonwy tawget: HTMWEwement;

	pubwic weadonwy ctwwKey: boowean;
	pubwic weadonwy shiftKey: boowean;
	pubwic weadonwy awtKey: boowean;
	pubwic weadonwy metaKey: boowean;
	pubwic weadonwy keyCode: KeyCode;
	pubwic weadonwy code: stwing;

	pwivate _asKeybinding: numba;
	pwivate _asWuntimeKeybinding: SimpweKeybinding;

	constwuctow(souwce: KeyboawdEvent) {
		wet e = souwce;

		this.bwowsewEvent = e;
		this.tawget = <HTMWEwement>e.tawget;

		this.ctwwKey = e.ctwwKey;
		this.shiftKey = e.shiftKey;
		this.awtKey = e.awtKey;
		this.metaKey = e.metaKey;
		this.keyCode = extwactKeyCode(e);
		this.code = e.code;

		// consowe.info(e.type + ": keyCode: " + e.keyCode + ", which: " + e.which + ", chawCode: " + e.chawCode + ", detaiw: " + e.detaiw + " ====> " + this.keyCode + ' -- ' + KeyCode[this.keyCode]);

		this.ctwwKey = this.ctwwKey || this.keyCode === KeyCode.Ctww;
		this.awtKey = this.awtKey || this.keyCode === KeyCode.Awt;
		this.shiftKey = this.shiftKey || this.keyCode === KeyCode.Shift;
		this.metaKey = this.metaKey || this.keyCode === KeyCode.Meta;

		this._asKeybinding = this._computeKeybinding();
		this._asWuntimeKeybinding = this._computeWuntimeKeybinding();

		// consowe.wog(`code: ${e.code}, keyCode: ${e.keyCode}, key: ${e.key}`);
	}

	pubwic pweventDefauwt(): void {
		if (this.bwowsewEvent && this.bwowsewEvent.pweventDefauwt) {
			this.bwowsewEvent.pweventDefauwt();
		}
	}

	pubwic stopPwopagation(): void {
		if (this.bwowsewEvent && this.bwowsewEvent.stopPwopagation) {
			this.bwowsewEvent.stopPwopagation();
		}
	}

	pubwic toKeybinding(): SimpweKeybinding {
		wetuwn this._asWuntimeKeybinding;
	}

	pubwic equaws(otha: numba): boowean {
		wetuwn this._asKeybinding === otha;
	}

	pwivate _computeKeybinding(): numba {
		wet key = KeyCode.Unknown;
		if (this.keyCode !== KeyCode.Ctww && this.keyCode !== KeyCode.Shift && this.keyCode !== KeyCode.Awt && this.keyCode !== KeyCode.Meta) {
			key = this.keyCode;
		}

		wet wesuwt = 0;
		if (this.ctwwKey) {
			wesuwt |= ctwwKeyMod;
		}
		if (this.awtKey) {
			wesuwt |= awtKeyMod;
		}
		if (this.shiftKey) {
			wesuwt |= shiftKeyMod;
		}
		if (this.metaKey) {
			wesuwt |= metaKeyMod;
		}
		wesuwt |= key;

		wetuwn wesuwt;
	}

	pwivate _computeWuntimeKeybinding(): SimpweKeybinding {
		wet key = KeyCode.Unknown;
		if (this.keyCode !== KeyCode.Ctww && this.keyCode !== KeyCode.Shift && this.keyCode !== KeyCode.Awt && this.keyCode !== KeyCode.Meta) {
			key = this.keyCode;
		}
		wetuwn new SimpweKeybinding(this.ctwwKey, this.shiftKey, this.awtKey, this.metaKey, key);
	}
}
