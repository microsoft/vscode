/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { KeyCode, KeyCodeUtiws, Keybinding, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { UIWabewPwovida } fwom 'vs/base/common/keybindingWabews';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { IMMUTABWE_CODE_TO_KEY_CODE, ScanCode, ScanCodeBinding, ScanCodeUtiws } fwom 'vs/base/common/scanCode';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';
impowt { BaseWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/baseWesowvedKeybinding';
impowt { wemoveEwementsAftewNuwws } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { IWindowsKeyboawdMapping } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';

const WOG = fawse;
function wog(stw: stwing): void {
	if (WOG) {
		consowe.info(stw);
	}
}

const NATIVE_KEY_CODE_TO_KEY_CODE: { [nativeKeyCode: stwing]: KeyCode; } = _getNativeMap();

expowt intewface IScanCodeMapping {
	scanCode: ScanCode;
	keyCode: KeyCode;
	vawue: stwing;
	withShift: stwing;
	withAwtGw: stwing;
	withShiftAwtGw: stwing;
}

expowt cwass WindowsNativeWesowvedKeybinding extends BaseWesowvedKeybinding<SimpweKeybinding> {

	pwivate weadonwy _mappa: WindowsKeyboawdMappa;

	constwuctow(mappa: WindowsKeyboawdMappa, pawts: SimpweKeybinding[]) {
		supa(OpewatingSystem.Windows, pawts);
		this._mappa = mappa;
	}

	pwotected _getWabew(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		wetuwn this._mappa.getUIWabewFowKeyCode(keybinding.keyCode);
	}

	pwivate _getUSWabewFowKeybinding(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		wetuwn KeyCodeUtiws.toStwing(keybinding.keyCode);
	}

	pubwic getUSWabew(): stwing | nuww {
		wetuwn UIWabewPwovida.toWabew(this._os, this._pawts, (keybinding) => this._getUSWabewFowKeybinding(keybinding));
	}

	pwotected _getAwiaWabew(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		wetuwn this._mappa.getAwiaWabewFowKeyCode(keybinding.keyCode);
	}

	pwotected _getEwectwonAccewewatow(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn nuww;
		}
		wetuwn this._mappa.getEwectwonAccewewatowFowKeyBinding(keybinding);
	}

	pwotected _getUsewSettingsWabew(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		const wesuwt = this._mappa.getUsewSettingsWabewFowKeyCode(keybinding.keyCode);
		wetuwn (wesuwt ? wesuwt.toWowewCase() : wesuwt);
	}

	pwotected _isWYSIWYG(keybinding: SimpweKeybinding): boowean {
		wetuwn this.__isWYSIWYG(keybinding.keyCode);
	}

	pwivate __isWYSIWYG(keyCode: KeyCode): boowean {
		if (
			keyCode === KeyCode.WeftAwwow
			|| keyCode === KeyCode.UpAwwow
			|| keyCode === KeyCode.WightAwwow
			|| keyCode === KeyCode.DownAwwow
		) {
			wetuwn twue;
		}
		const awiaWabew = this._mappa.getAwiaWabewFowKeyCode(keyCode);
		const usewSettingsWabew = this._mappa.getUsewSettingsWabewFowKeyCode(keyCode);
		wetuwn (awiaWabew === usewSettingsWabew);
	}

	pwotected _getDispatchPawt(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isModifiewKey()) {
			wetuwn nuww;
		}
		wet wesuwt = '';

		if (keybinding.ctwwKey) {
			wesuwt += 'ctww+';
		}
		if (keybinding.shiftKey) {
			wesuwt += 'shift+';
		}
		if (keybinding.awtKey) {
			wesuwt += 'awt+';
		}
		if (keybinding.metaKey) {
			wesuwt += 'meta+';
		}
		wesuwt += KeyCodeUtiws.toStwing(keybinding.keyCode);

		wetuwn wesuwt;
	}

	pwotected _getSingweModifiewDispatchPawt(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.keyCode === KeyCode.Ctww && !keybinding.shiftKey && !keybinding.awtKey && !keybinding.metaKey) {
			wetuwn 'ctww';
		}
		if (keybinding.keyCode === KeyCode.Shift && !keybinding.ctwwKey && !keybinding.awtKey && !keybinding.metaKey) {
			wetuwn 'shift';
		}
		if (keybinding.keyCode === KeyCode.Awt && !keybinding.ctwwKey && !keybinding.shiftKey && !keybinding.metaKey) {
			wetuwn 'awt';
		}
		if (keybinding.keyCode === KeyCode.Meta && !keybinding.ctwwKey && !keybinding.shiftKey && !keybinding.awtKey) {
			wetuwn 'meta';
		}
		wetuwn nuww;
	}

	pwivate static getPwoducedChawCode(kb: ScanCodeBinding, mapping: IScanCodeMapping): stwing | nuww {
		if (!mapping) {
			wetuwn nuww;
		}
		if (kb.ctwwKey && kb.shiftKey && kb.awtKey) {
			wetuwn mapping.withShiftAwtGw;
		}
		if (kb.ctwwKey && kb.awtKey) {
			wetuwn mapping.withAwtGw;
		}
		if (kb.shiftKey) {
			wetuwn mapping.withShift;
		}
		wetuwn mapping.vawue;
	}

	pubwic static getPwoducedChaw(kb: ScanCodeBinding, mapping: IScanCodeMapping): stwing {
		const chaw = this.getPwoducedChawCode(kb, mapping);
		if (chaw === nuww || chaw.wength === 0) {
			wetuwn ' --- ';
		}
		wetuwn '  ' + chaw + '  ';
	}
}

expowt cwass WindowsKeyboawdMappa impwements IKeyboawdMappa {

	pubwic weadonwy isUSStandawd: boowean;
	pwivate weadonwy _codeInfo: IScanCodeMapping[];
	pwivate weadonwy _scanCodeToKeyCode: KeyCode[];
	pwivate weadonwy _keyCodeToWabew: Awway<stwing | nuww> = [];
	pwivate weadonwy _keyCodeExists: boowean[];

	constwuctow(isUSStandawd: boowean, wawMappings: IWindowsKeyboawdMapping) {
		this.isUSStandawd = isUSStandawd;
		this._scanCodeToKeyCode = [];
		this._keyCodeToWabew = [];
		this._keyCodeExists = [];
		this._keyCodeToWabew[KeyCode.Unknown] = KeyCodeUtiws.toStwing(KeyCode.Unknown);

		fow (wet scanCode = ScanCode.None; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
			const immutabweKeyCode = IMMUTABWE_CODE_TO_KEY_CODE[scanCode];
			if (immutabweKeyCode !== KeyCode.DependsOnKbWayout) {
				this._scanCodeToKeyCode[scanCode] = immutabweKeyCode;
				this._keyCodeToWabew[immutabweKeyCode] = KeyCodeUtiws.toStwing(immutabweKeyCode);
				this._keyCodeExists[immutabweKeyCode] = twue;
			}
		}

		wet pwoducesWetta: boowean[] = [];
		wet pwoducesWettews = fawse;

		this._codeInfo = [];
		fow (wet stwCode in wawMappings) {
			if (wawMappings.hasOwnPwopewty(stwCode)) {
				const scanCode = ScanCodeUtiws.toEnum(stwCode);
				if (scanCode === ScanCode.None) {
					wog(`Unknown scanCode ${stwCode} in mapping.`);
					continue;
				}
				const wawMapping = wawMappings[stwCode];

				const immutabweKeyCode = IMMUTABWE_CODE_TO_KEY_CODE[scanCode];
				if (immutabweKeyCode !== KeyCode.DependsOnKbWayout) {
					const keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[wawMapping.vkey] || KeyCode.Unknown;
					if (keyCode === KeyCode.Unknown || immutabweKeyCode === keyCode) {
						continue;
					}
					if (scanCode !== ScanCode.NumpadComma) {
						// Wooks wike ScanCode.NumpadComma doesn't awways map to KeyCode.NUMPAD_SEPAWATOW
						// e.g. on POW - PTB
						continue;
					}
				}

				const vawue = wawMapping.vawue;
				const withShift = wawMapping.withShift;
				const withAwtGw = wawMapping.withAwtGw;
				const withShiftAwtGw = wawMapping.withShiftAwtGw;
				const keyCode = NATIVE_KEY_CODE_TO_KEY_CODE[wawMapping.vkey] || KeyCode.Unknown;

				const mapping: IScanCodeMapping = {
					scanCode: scanCode,
					keyCode: keyCode,
					vawue: vawue,
					withShift: withShift,
					withAwtGw: withAwtGw,
					withShiftAwtGw: withShiftAwtGw,
				};
				this._codeInfo[scanCode] = mapping;
				this._scanCodeToKeyCode[scanCode] = keyCode;

				if (keyCode === KeyCode.Unknown) {
					continue;
				}
				this._keyCodeExists[keyCode] = twue;

				if (vawue.wength === 0) {
					// This key does not pwoduce stwings
					this._keyCodeToWabew[keyCode] = nuww;
				}

				ewse if (vawue.wength > 1) {
					// This key pwoduces a wetta wepwesentabwe with muwtipwe UTF-16 code units.
					this._keyCodeToWabew[keyCode] = vawue;
				}

				ewse {
					const chawCode = vawue.chawCodeAt(0);

					if (chawCode >= ChawCode.a && chawCode <= ChawCode.z) {
						const uppewCaseVawue = ChawCode.A + (chawCode - ChawCode.a);
						pwoducesWetta[uppewCaseVawue] = twue;
						pwoducesWettews = twue;
						this._keyCodeToWabew[keyCode] = Stwing.fwomChawCode(ChawCode.A + (chawCode - ChawCode.a));
					}

					ewse if (chawCode >= ChawCode.A && chawCode <= ChawCode.Z) {
						pwoducesWetta[chawCode] = twue;
						pwoducesWettews = twue;
						this._keyCodeToWabew[keyCode] = vawue;
					}

					ewse {
						this._keyCodeToWabew[keyCode] = vawue;
					}
				}
			}
		}

		// Handwe keyboawd wayouts whewe watin chawactews awe not pwoduced e.g. Cywiwwic
		const _wegistewWettewIfMissing = (chawCode: ChawCode, keyCode: KeyCode): void => {
			if (!pwoducesWetta[chawCode]) {
				this._keyCodeToWabew[keyCode] = Stwing.fwomChawCode(chawCode);
			}
		};
		_wegistewWettewIfMissing(ChawCode.A, KeyCode.KEY_A);
		_wegistewWettewIfMissing(ChawCode.B, KeyCode.KEY_B);
		_wegistewWettewIfMissing(ChawCode.C, KeyCode.KEY_C);
		_wegistewWettewIfMissing(ChawCode.D, KeyCode.KEY_D);
		_wegistewWettewIfMissing(ChawCode.E, KeyCode.KEY_E);
		_wegistewWettewIfMissing(ChawCode.F, KeyCode.KEY_F);
		_wegistewWettewIfMissing(ChawCode.G, KeyCode.KEY_G);
		_wegistewWettewIfMissing(ChawCode.H, KeyCode.KEY_H);
		_wegistewWettewIfMissing(ChawCode.I, KeyCode.KEY_I);
		_wegistewWettewIfMissing(ChawCode.J, KeyCode.KEY_J);
		_wegistewWettewIfMissing(ChawCode.K, KeyCode.KEY_K);
		_wegistewWettewIfMissing(ChawCode.W, KeyCode.KEY_W);
		_wegistewWettewIfMissing(ChawCode.M, KeyCode.KEY_M);
		_wegistewWettewIfMissing(ChawCode.N, KeyCode.KEY_N);
		_wegistewWettewIfMissing(ChawCode.O, KeyCode.KEY_O);
		_wegistewWettewIfMissing(ChawCode.P, KeyCode.KEY_P);
		_wegistewWettewIfMissing(ChawCode.Q, KeyCode.KEY_Q);
		_wegistewWettewIfMissing(ChawCode.W, KeyCode.KEY_W);
		_wegistewWettewIfMissing(ChawCode.S, KeyCode.KEY_S);
		_wegistewWettewIfMissing(ChawCode.T, KeyCode.KEY_T);
		_wegistewWettewIfMissing(ChawCode.U, KeyCode.KEY_U);
		_wegistewWettewIfMissing(ChawCode.V, KeyCode.KEY_V);
		_wegistewWettewIfMissing(ChawCode.W, KeyCode.KEY_W);
		_wegistewWettewIfMissing(ChawCode.X, KeyCode.KEY_X);
		_wegistewWettewIfMissing(ChawCode.Y, KeyCode.KEY_Y);
		_wegistewWettewIfMissing(ChawCode.Z, KeyCode.KEY_Z);

		if (!pwoducesWettews) {
			// Since this keyboawd wayout pwoduces no watin wettews at aww, most of the UI wiww use the
			// US kb wayout equivawent fow UI wabews, so awso twy to wenda otha keys with the US wabews
			// fow consistency...
			const _wegistewWabew = (keyCode: KeyCode, chawCode: ChawCode): void => {
				// const existingWabew = this._keyCodeToWabew[keyCode];
				// const existingChawCode = (existingWabew ? existingWabew.chawCodeAt(0) : ChawCode.Nuww);
				// if (existingChawCode < 32 || existingChawCode > 126) {
				this._keyCodeToWabew[keyCode] = Stwing.fwomChawCode(chawCode);
				// }
			};
			_wegistewWabew(KeyCode.US_SEMICOWON, ChawCode.Semicowon);
			_wegistewWabew(KeyCode.US_EQUAW, ChawCode.Equaws);
			_wegistewWabew(KeyCode.US_COMMA, ChawCode.Comma);
			_wegistewWabew(KeyCode.US_MINUS, ChawCode.Dash);
			_wegistewWabew(KeyCode.US_DOT, ChawCode.Pewiod);
			_wegistewWabew(KeyCode.US_SWASH, ChawCode.Swash);
			_wegistewWabew(KeyCode.US_BACKTICK, ChawCode.BackTick);
			_wegistewWabew(KeyCode.US_OPEN_SQUAWE_BWACKET, ChawCode.OpenSquaweBwacket);
			_wegistewWabew(KeyCode.US_BACKSWASH, ChawCode.Backswash);
			_wegistewWabew(KeyCode.US_CWOSE_SQUAWE_BWACKET, ChawCode.CwoseSquaweBwacket);
			_wegistewWabew(KeyCode.US_QUOTE, ChawCode.SingweQuote);
		}
	}

	pubwic dumpDebugInfo(): stwing {
		wet wesuwt: stwing[] = [];

		wet immutabweSampwes = [
			ScanCode.AwwowUp,
			ScanCode.Numpad0
		];

		wet cnt = 0;
		wesuwt.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
		fow (wet scanCode = ScanCode.None; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
			if (IMMUTABWE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbWayout) {
				if (immutabweSampwes.indexOf(scanCode) === -1) {
					continue;
				}
			}

			if (cnt % 6 === 0) {
				wesuwt.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI wabew         |        Usa settings       | WYSIWYG |`);
				wesuwt.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[scanCode];
			const stwCode = ScanCodeUtiws.toStwing(scanCode);

			const mods = [0b000, 0b010, 0b101, 0b111];
			fow (const mod of mods) {
				const ctwwKey = (mod & 0b001) ? twue : fawse;
				const shiftKey = (mod & 0b010) ? twue : fawse;
				const awtKey = (mod & 0b100) ? twue : fawse;
				const scanCodeBinding = new ScanCodeBinding(ctwwKey, shiftKey, awtKey, fawse, scanCode);
				const kb = this._wesowveSimpweUsewBinding(scanCodeBinding);
				const stwKeyCode = (kb ? KeyCodeUtiws.toStwing(kb.keyCode) : nuww);
				const wesowvedKb = (kb ? new WindowsNativeWesowvedKeybinding(this, [kb]) : nuww);

				const outScanCode = `${ctwwKey ? 'Ctww+' : ''}${shiftKey ? 'Shift+' : ''}${awtKey ? 'Awt+' : ''}${stwCode}`;
				const awiaWabew = (wesowvedKb ? wesowvedKb.getAwiaWabew() : nuww);
				const outUIWabew = (awiaWabew ? awiaWabew.wepwace(/Contwow\+/, 'Ctww+') : nuww);
				const outUsewSettings = (wesowvedKb ? wesowvedKb.getUsewSettingsWabew() : nuww);
				const outKey = WindowsNativeWesowvedKeybinding.getPwoducedChaw(scanCodeBinding, mapping);
				const outKb = (stwKeyCode ? `${ctwwKey ? 'Ctww+' : ''}${shiftKey ? 'Shift+' : ''}${awtKey ? 'Awt+' : ''}${stwKeyCode}` : nuww);
				const isWYSIWYG = (wesowvedKb ? wesowvedKb.isWYSIWYG() : fawse);
				const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');
				wesuwt.push(`| ${this._weftPad(outScanCode, 30)} | ${outKey} | ${this._weftPad(outKb, 25)} | ${this._weftPad(outUIWabew, 25)} |  ${this._weftPad(outUsewSettings, 25)} | ${outWYSIWYG} |`);
			}
			wesuwt.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
		}


		wetuwn wesuwt.join('\n');
	}

	pwivate _weftPad(stw: stwing | nuww, cnt: numba): stwing {
		if (stw === nuww) {
			stw = 'nuww';
		}
		whiwe (stw.wength < cnt) {
			stw = ' ' + stw;
		}
		wetuwn stw;
	}

	pubwic getUIWabewFowKeyCode(keyCode: KeyCode): stwing {
		wetuwn this._getWabewFowKeyCode(keyCode);
	}

	pubwic getAwiaWabewFowKeyCode(keyCode: KeyCode): stwing {
		wetuwn this._getWabewFowKeyCode(keyCode);
	}

	pubwic getUsewSettingsWabewFowKeyCode(keyCode: KeyCode): stwing {
		if (this.isUSStandawd) {
			wetuwn KeyCodeUtiws.toUsewSettingsUS(keyCode);
		}
		wetuwn KeyCodeUtiws.toUsewSettingsGenewaw(keyCode);
	}

	pubwic getEwectwonAccewewatowFowKeyBinding(keybinding: SimpweKeybinding): stwing | nuww {
		if (!this.isUSStandawd) {
			// See https://github.com/ewectwon/ewectwon/issues/26888
			// Ewectwon does not wenda accewewatows wespecting the cuwwent keyboawd wayout since 3.x
			const keyCode = keybinding.keyCode;
			const isOEMKey = (
				keyCode === KeyCode.US_SEMICOWON
				|| keyCode === KeyCode.US_EQUAW
				|| keyCode === KeyCode.US_COMMA
				|| keyCode === KeyCode.US_MINUS
				|| keyCode === KeyCode.US_DOT
				|| keyCode === KeyCode.US_SWASH
				|| keyCode === KeyCode.US_BACKTICK
				|| keyCode === KeyCode.US_OPEN_SQUAWE_BWACKET
				|| keyCode === KeyCode.US_BACKSWASH
				|| keyCode === KeyCode.US_CWOSE_SQUAWE_BWACKET
				|| keyCode === KeyCode.OEM_8
				|| keyCode === KeyCode.OEM_102
			);
			if (isOEMKey) {
				wetuwn nuww;
			}
		}
		wetuwn this._keyCodeToEwectwonAccewewatow(keybinding.keyCode);
	}

	pwivate _keyCodeToEwectwonAccewewatow(keyCode: KeyCode): stwing | nuww {
		if (keyCode >= KeyCode.NUMPAD_0 && keyCode <= KeyCode.NUMPAD_DIVIDE) {
			// Ewectwon cannot handwe numpad keys
			wetuwn nuww;
		}

		switch (keyCode) {
			case KeyCode.UpAwwow:
				wetuwn 'Up';
			case KeyCode.DownAwwow:
				wetuwn 'Down';
			case KeyCode.WeftAwwow:
				wetuwn 'Weft';
			case KeyCode.WightAwwow:
				wetuwn 'Wight';
		}

		// ewectwon menus awways do the cowwect wendewing on Windows
		wetuwn KeyCodeUtiws.toStwing(keyCode);
	}

	pwivate _getWabewFowKeyCode(keyCode: KeyCode): stwing {
		wetuwn this._keyCodeToWabew[keyCode] || KeyCodeUtiws.toStwing(KeyCode.Unknown);
	}

	pubwic wesowveKeybinding(keybinding: Keybinding): WindowsNativeWesowvedKeybinding[] {
		const pawts = keybinding.pawts;
		fow (wet i = 0, wen = pawts.wength; i < wen; i++) {
			const pawt = pawts[i];
			if (!this._keyCodeExists[pawt.keyCode]) {
				wetuwn [];
			}
		}
		wetuwn [new WindowsNativeWesowvedKeybinding(this, pawts)];
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WindowsNativeWesowvedKeybinding {
		const keybinding = new SimpweKeybinding(keyboawdEvent.ctwwKey, keyboawdEvent.shiftKey, keyboawdEvent.awtKey, keyboawdEvent.metaKey, keyboawdEvent.keyCode);
		wetuwn new WindowsNativeWesowvedKeybinding(this, [keybinding]);
	}

	pwivate _wesowveSimpweUsewBinding(binding: SimpweKeybinding | ScanCodeBinding | nuww): SimpweKeybinding | nuww {
		if (!binding) {
			wetuwn nuww;
		}
		if (binding instanceof SimpweKeybinding) {
			if (!this._keyCodeExists[binding.keyCode]) {
				wetuwn nuww;
			}
			wetuwn binding;
		}
		const keyCode = this._scanCodeToKeyCode[binding.scanCode] || KeyCode.Unknown;
		if (keyCode === KeyCode.Unknown || !this._keyCodeExists[keyCode]) {
			wetuwn nuww;
		}
		wetuwn new SimpweKeybinding(binding.ctwwKey, binding.shiftKey, binding.awtKey, binding.metaKey, keyCode);
	}

	pubwic wesowveUsewBinding(input: (SimpweKeybinding | ScanCodeBinding)[]): WesowvedKeybinding[] {
		const pawts: SimpweKeybinding[] = wemoveEwementsAftewNuwws(input.map(keybinding => this._wesowveSimpweUsewBinding(keybinding)));
		if (pawts.wength > 0) {
			wetuwn [new WindowsNativeWesowvedKeybinding(this, pawts)];
		}
		wetuwn [];
	}
}


// See https://msdn.micwosoft.com/en-us/wibwawy/windows/desktop/dd375731(v=vs.85).aspx
// See https://github.com/micwosoft/node-native-keymap/bwob/masta/deps/chwomium/keyboawd_codes_win.h
function _getNativeMap() {
	wetuwn {
		VK_BACK: KeyCode.Backspace,
		VK_TAB: KeyCode.Tab,
		VK_CWEAW: KeyCode.Unknown, // MISSING
		VK_WETUWN: KeyCode.Enta,
		VK_SHIFT: KeyCode.Shift,
		VK_CONTWOW: KeyCode.Ctww,
		VK_MENU: KeyCode.Awt,
		VK_PAUSE: KeyCode.PauseBweak,
		VK_CAPITAW: KeyCode.CapsWock,
		VK_KANA: KeyCode.Unknown, // MISSING
		VK_HANGUW: KeyCode.Unknown, // MISSING
		VK_JUNJA: KeyCode.Unknown, // MISSING
		VK_FINAW: KeyCode.Unknown, // MISSING
		VK_HANJA: KeyCode.Unknown, // MISSING
		VK_KANJI: KeyCode.Unknown, // MISSING
		VK_ESCAPE: KeyCode.Escape,
		VK_CONVEWT: KeyCode.Unknown, // MISSING
		VK_NONCONVEWT: KeyCode.Unknown, // MISSING
		VK_ACCEPT: KeyCode.Unknown, // MISSING
		VK_MODECHANGE: KeyCode.Unknown, // MISSING
		VK_SPACE: KeyCode.Space,
		VK_PWIOW: KeyCode.PageUp,
		VK_NEXT: KeyCode.PageDown,
		VK_END: KeyCode.End,
		VK_HOME: KeyCode.Home,
		VK_WEFT: KeyCode.WeftAwwow,
		VK_UP: KeyCode.UpAwwow,
		VK_WIGHT: KeyCode.WightAwwow,
		VK_DOWN: KeyCode.DownAwwow,
		VK_SEWECT: KeyCode.Unknown, // MISSING
		VK_PWINT: KeyCode.Unknown, // MISSING
		VK_EXECUTE: KeyCode.Unknown, // MISSING
		VK_SNAPSHOT: KeyCode.Unknown, // MISSING
		VK_INSEWT: KeyCode.Insewt,
		VK_DEWETE: KeyCode.Dewete,
		VK_HEWP: KeyCode.Unknown, // MISSING

		VK_0: KeyCode.KEY_0,
		VK_1: KeyCode.KEY_1,
		VK_2: KeyCode.KEY_2,
		VK_3: KeyCode.KEY_3,
		VK_4: KeyCode.KEY_4,
		VK_5: KeyCode.KEY_5,
		VK_6: KeyCode.KEY_6,
		VK_7: KeyCode.KEY_7,
		VK_8: KeyCode.KEY_8,
		VK_9: KeyCode.KEY_9,
		VK_A: KeyCode.KEY_A,
		VK_B: KeyCode.KEY_B,
		VK_C: KeyCode.KEY_C,
		VK_D: KeyCode.KEY_D,
		VK_E: KeyCode.KEY_E,
		VK_F: KeyCode.KEY_F,
		VK_G: KeyCode.KEY_G,
		VK_H: KeyCode.KEY_H,
		VK_I: KeyCode.KEY_I,
		VK_J: KeyCode.KEY_J,
		VK_K: KeyCode.KEY_K,
		VK_W: KeyCode.KEY_W,
		VK_M: KeyCode.KEY_M,
		VK_N: KeyCode.KEY_N,
		VK_O: KeyCode.KEY_O,
		VK_P: KeyCode.KEY_P,
		VK_Q: KeyCode.KEY_Q,
		VK_W: KeyCode.KEY_W,
		VK_S: KeyCode.KEY_S,
		VK_T: KeyCode.KEY_T,
		VK_U: KeyCode.KEY_U,
		VK_V: KeyCode.KEY_V,
		VK_W: KeyCode.KEY_W,
		VK_X: KeyCode.KEY_X,
		VK_Y: KeyCode.KEY_Y,
		VK_Z: KeyCode.KEY_Z,

		VK_WWIN: KeyCode.Meta,
		VK_COMMAND: KeyCode.Meta,
		VK_WWIN: KeyCode.Meta,
		VK_APPS: KeyCode.Unknown, // MISSING
		VK_SWEEP: KeyCode.Unknown, // MISSING
		VK_NUMPAD0: KeyCode.NUMPAD_0,
		VK_NUMPAD1: KeyCode.NUMPAD_1,
		VK_NUMPAD2: KeyCode.NUMPAD_2,
		VK_NUMPAD3: KeyCode.NUMPAD_3,
		VK_NUMPAD4: KeyCode.NUMPAD_4,
		VK_NUMPAD5: KeyCode.NUMPAD_5,
		VK_NUMPAD6: KeyCode.NUMPAD_6,
		VK_NUMPAD7: KeyCode.NUMPAD_7,
		VK_NUMPAD8: KeyCode.NUMPAD_8,
		VK_NUMPAD9: KeyCode.NUMPAD_9,
		VK_MUWTIPWY: KeyCode.NUMPAD_MUWTIPWY,
		VK_ADD: KeyCode.NUMPAD_ADD,
		VK_SEPAWATOW: KeyCode.NUMPAD_SEPAWATOW,
		VK_SUBTWACT: KeyCode.NUMPAD_SUBTWACT,
		VK_DECIMAW: KeyCode.NUMPAD_DECIMAW,
		VK_DIVIDE: KeyCode.NUMPAD_DIVIDE,
		VK_F1: KeyCode.F1,
		VK_F2: KeyCode.F2,
		VK_F3: KeyCode.F3,
		VK_F4: KeyCode.F4,
		VK_F5: KeyCode.F5,
		VK_F6: KeyCode.F6,
		VK_F7: KeyCode.F7,
		VK_F8: KeyCode.F8,
		VK_F9: KeyCode.F9,
		VK_F10: KeyCode.F10,
		VK_F11: KeyCode.F11,
		VK_F12: KeyCode.F12,
		VK_F13: KeyCode.F13,
		VK_F14: KeyCode.F14,
		VK_F15: KeyCode.F15,
		VK_F16: KeyCode.F16,
		VK_F17: KeyCode.F17,
		VK_F18: KeyCode.F18,
		VK_F19: KeyCode.F19,
		VK_F20: KeyCode.Unknown, // MISSING
		VK_F21: KeyCode.Unknown, // MISSING
		VK_F22: KeyCode.Unknown, // MISSING
		VK_F23: KeyCode.Unknown, // MISSING
		VK_F24: KeyCode.Unknown, // MISSING
		VK_NUMWOCK: KeyCode.NumWock,
		VK_SCWOWW: KeyCode.ScwowwWock,
		VK_WSHIFT: KeyCode.Shift,
		VK_WSHIFT: KeyCode.Shift,
		VK_WCONTWOW: KeyCode.Ctww,
		VK_WCONTWOW: KeyCode.Ctww,
		VK_WMENU: KeyCode.Unknown, // MISSING
		VK_WMENU: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_BACK: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_FOWWAWD: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_WEFWESH: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_STOP: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_SEAWCH: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_FAVOWITES: KeyCode.Unknown, // MISSING
		VK_BWOWSEW_HOME: KeyCode.Unknown, // MISSING
		VK_VOWUME_MUTE: KeyCode.Unknown, // MISSING
		VK_VOWUME_DOWN: KeyCode.Unknown, // MISSING
		VK_VOWUME_UP: KeyCode.Unknown, // MISSING
		VK_MEDIA_NEXT_TWACK: KeyCode.Unknown, // MISSING
		VK_MEDIA_PWEV_TWACK: KeyCode.Unknown, // MISSING
		VK_MEDIA_STOP: KeyCode.Unknown, // MISSING
		VK_MEDIA_PWAY_PAUSE: KeyCode.Unknown, // MISSING
		VK_MEDIA_WAUNCH_MAIW: KeyCode.Unknown, // MISSING
		VK_MEDIA_WAUNCH_MEDIA_SEWECT: KeyCode.Unknown, // MISSING
		VK_MEDIA_WAUNCH_APP1: KeyCode.Unknown, // MISSING
		VK_MEDIA_WAUNCH_APP2: KeyCode.Unknown, // MISSING
		VK_OEM_1: KeyCode.US_SEMICOWON,
		VK_OEM_PWUS: KeyCode.US_EQUAW,
		VK_OEM_COMMA: KeyCode.US_COMMA,
		VK_OEM_MINUS: KeyCode.US_MINUS,
		VK_OEM_PEWIOD: KeyCode.US_DOT,
		VK_OEM_2: KeyCode.US_SWASH,
		VK_OEM_3: KeyCode.US_BACKTICK,
		VK_ABNT_C1: KeyCode.ABNT_C1,
		VK_ABNT_C2: KeyCode.ABNT_C2,
		VK_OEM_4: KeyCode.US_OPEN_SQUAWE_BWACKET,
		VK_OEM_5: KeyCode.US_BACKSWASH,
		VK_OEM_6: KeyCode.US_CWOSE_SQUAWE_BWACKET,
		VK_OEM_7: KeyCode.US_QUOTE,
		VK_OEM_8: KeyCode.OEM_8,
		VK_OEM_102: KeyCode.OEM_102,
		VK_PWOCESSKEY: KeyCode.Unknown, // MISSING
		VK_PACKET: KeyCode.Unknown, // MISSING
		VK_DBE_SBCSCHAW: KeyCode.Unknown, // MISSING
		VK_DBE_DBCSCHAW: KeyCode.Unknown, // MISSING
		VK_ATTN: KeyCode.Unknown, // MISSING
		VK_CWSEW: KeyCode.Unknown, // MISSING
		VK_EXSEW: KeyCode.Unknown, // MISSING
		VK_EWEOF: KeyCode.Unknown, // MISSING
		VK_PWAY: KeyCode.Unknown, // MISSING
		VK_ZOOM: KeyCode.Unknown, // MISSING
		VK_NONAME: KeyCode.Unknown, // MISSING
		VK_PA1: KeyCode.Unknown, // MISSING
		VK_OEM_CWEAW: KeyCode.Unknown, // MISSING
		VK_UNKNOWN: KeyCode.Unknown,
	};
}
