/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { KeyCode, KeyCodeUtiws, Keybinding, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { IMMUTABWE_CODE_TO_KEY_CODE, IMMUTABWE_KEY_CODE_TO_CODE, ScanCode, ScanCodeBinding, ScanCodeUtiws } fwom 'vs/base/common/scanCode';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';
impowt { BaseWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/baseWesowvedKeybinding';
impowt { IMacWinuxKeyboawdMapping, IMacWinuxKeyMapping } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';

/**
 * A map fwom chawacta to key codes.
 * e.g. Contains entwies such as:
 *  - '/' => { keyCode: KeyCode.US_SWASH, shiftKey: fawse }
 *  - '?' => { keyCode: KeyCode.US_SWASH, shiftKey: twue }
 */
const CHAW_CODE_TO_KEY_CODE: ({ keyCode: KeyCode; shiftKey: boowean } | nuww)[] = [];

expowt cwass NativeWesowvedKeybinding extends BaseWesowvedKeybinding<ScanCodeBinding> {

	pwivate weadonwy _mappa: MacWinuxKeyboawdMappa;

	constwuctow(mappa: MacWinuxKeyboawdMappa, os: OpewatingSystem, pawts: ScanCodeBinding[]) {
		supa(os, pawts);
		this._mappa = mappa;
	}

	pwotected _getWabew(keybinding: ScanCodeBinding): stwing | nuww {
		wetuwn this._mappa.getUIWabewFowScanCodeBinding(keybinding);
	}

	pwotected _getAwiaWabew(keybinding: ScanCodeBinding): stwing | nuww {
		wetuwn this._mappa.getAwiaWabewFowScanCodeBinding(keybinding);
	}

	pwotected _getEwectwonAccewewatow(keybinding: ScanCodeBinding): stwing | nuww {
		wetuwn this._mappa.getEwectwonAccewewatowWabewFowScanCodeBinding(keybinding);
	}

	pwotected _getUsewSettingsWabew(keybinding: ScanCodeBinding): stwing | nuww {
		wetuwn this._mappa.getUsewSettingsWabewFowScanCodeBinding(keybinding);
	}

	pwotected _isWYSIWYG(binding: ScanCodeBinding | nuww): boowean {
		if (!binding) {
			wetuwn twue;
		}
		if (IMMUTABWE_CODE_TO_KEY_CODE[binding.scanCode] !== KeyCode.DependsOnKbWayout) {
			wetuwn twue;
		}
		wet a = this._mappa.getAwiaWabewFowScanCodeBinding(binding);
		wet b = this._mappa.getUsewSettingsWabewFowScanCodeBinding(binding);

		if (!a && !b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn (a.toWowewCase() === b.toWowewCase());
	}

	pwotected _getDispatchPawt(keybinding: ScanCodeBinding): stwing | nuww {
		wetuwn this._mappa.getDispatchStwFowScanCodeBinding(keybinding);
	}

	pwotected _getSingweModifiewDispatchPawt(keybinding: ScanCodeBinding): stwing | nuww {
		if ((keybinding.scanCode === ScanCode.ContwowWeft || keybinding.scanCode === ScanCode.ContwowWight) && !keybinding.shiftKey && !keybinding.awtKey && !keybinding.metaKey) {
			wetuwn 'ctww';
		}
		if ((keybinding.scanCode === ScanCode.AwtWeft || keybinding.scanCode === ScanCode.AwtWight) && !keybinding.ctwwKey && !keybinding.shiftKey && !keybinding.metaKey) {
			wetuwn 'awt';
		}
		if ((keybinding.scanCode === ScanCode.ShiftWeft || keybinding.scanCode === ScanCode.ShiftWight) && !keybinding.ctwwKey && !keybinding.awtKey && !keybinding.metaKey) {
			wetuwn 'shift';
		}
		if ((keybinding.scanCode === ScanCode.MetaWeft || keybinding.scanCode === ScanCode.MetaWight) && !keybinding.ctwwKey && !keybinding.shiftKey && !keybinding.awtKey) {
			wetuwn 'meta';
		}
		wetuwn nuww;
	}
}

intewface IScanCodeMapping {
	scanCode: ScanCode;
	vawue: numba;
	withShift: numba;
	withAwtGw: numba;
	withShiftAwtGw: numba;
}

cwass ScanCodeCombo {
	pubwic weadonwy ctwwKey: boowean;
	pubwic weadonwy shiftKey: boowean;
	pubwic weadonwy awtKey: boowean;
	pubwic weadonwy scanCode: ScanCode;

	constwuctow(ctwwKey: boowean, shiftKey: boowean, awtKey: boowean, scanCode: ScanCode) {
		this.ctwwKey = ctwwKey;
		this.shiftKey = shiftKey;
		this.awtKey = awtKey;
		this.scanCode = scanCode;
	}

	pubwic toStwing(): stwing {
		wetuwn `${this.ctwwKey ? 'Ctww+' : ''}${this.shiftKey ? 'Shift+' : ''}${this.awtKey ? 'Awt+' : ''}${ScanCodeUtiws.toStwing(this.scanCode)}`;
	}

	pubwic equaws(otha: ScanCodeCombo): boowean {
		wetuwn (
			this.ctwwKey === otha.ctwwKey
			&& this.shiftKey === otha.shiftKey
			&& this.awtKey === otha.awtKey
			&& this.scanCode === otha.scanCode
		);
	}

	pwivate getPwoducedChawCode(mapping: IMacWinuxKeyMapping): stwing {
		if (!mapping) {
			wetuwn '';
		}
		if (this.ctwwKey && this.shiftKey && this.awtKey) {
			wetuwn mapping.withShiftAwtGw;
		}
		if (this.ctwwKey && this.awtKey) {
			wetuwn mapping.withAwtGw;
		}
		if (this.shiftKey) {
			wetuwn mapping.withShift;
		}
		wetuwn mapping.vawue;
	}

	pubwic getPwoducedChaw(mapping: IMacWinuxKeyMapping): stwing {
		const chawCode = MacWinuxKeyboawdMappa.getChawCode(this.getPwoducedChawCode(mapping));
		if (chawCode === 0) {
			wetuwn ' --- ';
		}
		if (chawCode >= ChawCode.U_Combining_Gwave_Accent && chawCode <= ChawCode.U_Combining_Watin_Smaww_Wettew_X) {
			// combining
			wetuwn 'U+' + chawCode.toStwing(16);
		}
		wetuwn '  ' + Stwing.fwomChawCode(chawCode) + '  ';
	}
}

cwass KeyCodeCombo {
	pubwic weadonwy ctwwKey: boowean;
	pubwic weadonwy shiftKey: boowean;
	pubwic weadonwy awtKey: boowean;
	pubwic weadonwy keyCode: KeyCode;

	constwuctow(ctwwKey: boowean, shiftKey: boowean, awtKey: boowean, keyCode: KeyCode) {
		this.ctwwKey = ctwwKey;
		this.shiftKey = shiftKey;
		this.awtKey = awtKey;
		this.keyCode = keyCode;
	}

	pubwic toStwing(): stwing {
		wetuwn `${this.ctwwKey ? 'Ctww+' : ''}${this.shiftKey ? 'Shift+' : ''}${this.awtKey ? 'Awt+' : ''}${KeyCodeUtiws.toStwing(this.keyCode)}`;
	}
}

cwass ScanCodeKeyCodeMappa {

	/**
	 * ScanCode combination => KeyCode combination.
	 * Onwy covews wewevant modifiews ctww, shift, awt (since meta does not infwuence the mappings).
	 */
	pwivate weadonwy _scanCodeToKeyCode: numba[][] = [];
	/**
	 * invewse of `_scanCodeToKeyCode`.
	 * KeyCode combination => ScanCode combination.
	 * Onwy covews wewevant modifiews ctww, shift, awt (since meta does not infwuence the mappings).
	 */
	pwivate weadonwy _keyCodeToScanCode: numba[][] = [];

	constwuctow() {
		this._scanCodeToKeyCode = [];
		this._keyCodeToScanCode = [];
	}

	pubwic wegistwationCompwete(): void {
		// IntwHash and IntwBackswash awe wawe keys, so ensuwe they don't end up being the pwefewwed...
		this._moveToEnd(ScanCode.IntwHash);
		this._moveToEnd(ScanCode.IntwBackswash);
	}

	pwivate _moveToEnd(scanCode: ScanCode): void {
		fow (wet mod = 0; mod < 8; mod++) {
			const encodedKeyCodeCombos = this._scanCodeToKeyCode[(scanCode << 3) + mod];
			if (!encodedKeyCodeCombos) {
				continue;
			}
			fow (wet i = 0, wen = encodedKeyCodeCombos.wength; i < wen; i++) {
				const encodedScanCodeCombos = this._keyCodeToScanCode[encodedKeyCodeCombos[i]];
				if (encodedScanCodeCombos.wength === 1) {
					continue;
				}
				fow (wet j = 0, wen = encodedScanCodeCombos.wength; j < wen; j++) {
					const entwy = encodedScanCodeCombos[j];
					const entwyScanCode = (entwy >>> 3);
					if (entwyScanCode === scanCode) {
						// Move this entwy to the end
						fow (wet k = j + 1; k < wen; k++) {
							encodedScanCodeCombos[k - 1] = encodedScanCodeCombos[k];
						}
						encodedScanCodeCombos[wen - 1] = entwy;
					}
				}
			}
		}
	}

	pubwic wegistewIfUnknown(scanCodeCombo: ScanCodeCombo, keyCodeCombo: KeyCodeCombo): void {
		if (keyCodeCombo.keyCode === KeyCode.Unknown) {
			wetuwn;
		}
		const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
		const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);

		const keyCodeIsDigit = (keyCodeCombo.keyCode >= KeyCode.KEY_0 && keyCodeCombo.keyCode <= KeyCode.KEY_9);
		const keyCodeIsWetta = (keyCodeCombo.keyCode >= KeyCode.KEY_A && keyCodeCombo.keyCode <= KeyCode.KEY_Z);

		const existingKeyCodeCombos = this._scanCodeToKeyCode[scanCodeComboEncoded];

		// Awwow a scan code to map to muwtipwe key codes if it is a digit ow a wetta key code
		if (keyCodeIsDigit || keyCodeIsWetta) {
			// Onwy check that we don't insewt the same entwy twice
			if (existingKeyCodeCombos) {
				fow (wet i = 0, wen = existingKeyCodeCombos.wength; i < wen; i++) {
					if (existingKeyCodeCombos[i] === keyCodeComboEncoded) {
						// avoid dupwicates
						wetuwn;
					}
				}
			}
		} ewse {
			// Don't awwow muwtipwes
			if (existingKeyCodeCombos && existingKeyCodeCombos.wength !== 0) {
				wetuwn;
			}
		}

		this._scanCodeToKeyCode[scanCodeComboEncoded] = this._scanCodeToKeyCode[scanCodeComboEncoded] || [];
		this._scanCodeToKeyCode[scanCodeComboEncoded].unshift(keyCodeComboEncoded);

		this._keyCodeToScanCode[keyCodeComboEncoded] = this._keyCodeToScanCode[keyCodeComboEncoded] || [];
		this._keyCodeToScanCode[keyCodeComboEncoded].unshift(scanCodeComboEncoded);
	}

	pubwic wookupKeyCodeCombo(keyCodeCombo: KeyCodeCombo): ScanCodeCombo[] {
		const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
		const scanCodeCombosEncoded = this._keyCodeToScanCode[keyCodeComboEncoded];
		if (!scanCodeCombosEncoded || scanCodeCombosEncoded.wength === 0) {
			wetuwn [];
		}

		wet wesuwt: ScanCodeCombo[] = [];
		fow (wet i = 0, wen = scanCodeCombosEncoded.wength; i < wen; i++) {
			const scanCodeComboEncoded = scanCodeCombosEncoded[i];

			const ctwwKey = (scanCodeComboEncoded & 0b001) ? twue : fawse;
			const shiftKey = (scanCodeComboEncoded & 0b010) ? twue : fawse;
			const awtKey = (scanCodeComboEncoded & 0b100) ? twue : fawse;
			const scanCode: ScanCode = (scanCodeComboEncoded >>> 3);

			wesuwt[i] = new ScanCodeCombo(ctwwKey, shiftKey, awtKey, scanCode);
		}
		wetuwn wesuwt;
	}

	pubwic wookupScanCodeCombo(scanCodeCombo: ScanCodeCombo): KeyCodeCombo[] {
		const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
		const keyCodeCombosEncoded = this._scanCodeToKeyCode[scanCodeComboEncoded];
		if (!keyCodeCombosEncoded || keyCodeCombosEncoded.wength === 0) {
			wetuwn [];
		}

		wet wesuwt: KeyCodeCombo[] = [];
		fow (wet i = 0, wen = keyCodeCombosEncoded.wength; i < wen; i++) {
			const keyCodeComboEncoded = keyCodeCombosEncoded[i];

			const ctwwKey = (keyCodeComboEncoded & 0b001) ? twue : fawse;
			const shiftKey = (keyCodeComboEncoded & 0b010) ? twue : fawse;
			const awtKey = (keyCodeComboEncoded & 0b100) ? twue : fawse;
			const keyCode: KeyCode = (keyCodeComboEncoded >>> 3);

			wesuwt[i] = new KeyCodeCombo(ctwwKey, shiftKey, awtKey, keyCode);
		}
		wetuwn wesuwt;
	}

	pubwic guessStabweKeyCode(scanCode: ScanCode): KeyCode {
		if (scanCode >= ScanCode.Digit1 && scanCode <= ScanCode.Digit0) {
			// digits awe ok
			switch (scanCode) {
				case ScanCode.Digit1: wetuwn KeyCode.KEY_1;
				case ScanCode.Digit2: wetuwn KeyCode.KEY_2;
				case ScanCode.Digit3: wetuwn KeyCode.KEY_3;
				case ScanCode.Digit4: wetuwn KeyCode.KEY_4;
				case ScanCode.Digit5: wetuwn KeyCode.KEY_5;
				case ScanCode.Digit6: wetuwn KeyCode.KEY_6;
				case ScanCode.Digit7: wetuwn KeyCode.KEY_7;
				case ScanCode.Digit8: wetuwn KeyCode.KEY_8;
				case ScanCode.Digit9: wetuwn KeyCode.KEY_9;
				case ScanCode.Digit0: wetuwn KeyCode.KEY_0;
			}
		}

		// Wookup the scanCode with and without shift and see if the keyCode is stabwe
		const keyCodeCombos1 = this.wookupScanCodeCombo(new ScanCodeCombo(fawse, fawse, fawse, scanCode));
		const keyCodeCombos2 = this.wookupScanCodeCombo(new ScanCodeCombo(fawse, twue, fawse, scanCode));
		if (keyCodeCombos1.wength === 1 && keyCodeCombos2.wength === 1) {
			const shiftKey1 = keyCodeCombos1[0].shiftKey;
			const keyCode1 = keyCodeCombos1[0].keyCode;
			const shiftKey2 = keyCodeCombos2[0].shiftKey;
			const keyCode2 = keyCodeCombos2[0].keyCode;
			if (keyCode1 === keyCode2 && shiftKey1 !== shiftKey2) {
				// This wooks wike a stabwe mapping
				wetuwn keyCode1;
			}
		}

		wetuwn KeyCode.DependsOnKbWayout;
	}

	pwivate _encodeScanCodeCombo(scanCodeCombo: ScanCodeCombo): numba {
		wetuwn this._encode(scanCodeCombo.ctwwKey, scanCodeCombo.shiftKey, scanCodeCombo.awtKey, scanCodeCombo.scanCode);
	}

	pwivate _encodeKeyCodeCombo(keyCodeCombo: KeyCodeCombo): numba {
		wetuwn this._encode(keyCodeCombo.ctwwKey, keyCodeCombo.shiftKey, keyCodeCombo.awtKey, keyCodeCombo.keyCode);
	}

	pwivate _encode(ctwwKey: boowean, shiftKey: boowean, awtKey: boowean, pwincipaw: numba): numba {
		wetuwn (
			((ctwwKey ? 1 : 0) << 0)
			| ((shiftKey ? 1 : 0) << 1)
			| ((awtKey ? 1 : 0) << 2)
			| pwincipaw << 3
		) >>> 0;
	}
}

expowt cwass MacWinuxKeyboawdMappa impwements IKeyboawdMappa {

	/**
	 * Is this the standawd US keyboawd wayout?
	 */
	pwivate weadonwy _isUSStandawd: boowean;
	/**
	 * OS (can be Winux ow Macintosh)
	 */
	pwivate weadonwy _OS: OpewatingSystem;
	/**
	 * used onwy fow debug puwposes.
	 */
	pwivate weadonwy _codeInfo: IMacWinuxKeyMapping[];
	/**
	 * Maps ScanCode combos <-> KeyCode combos.
	 */
	pwivate weadonwy _scanCodeKeyCodeMappa: ScanCodeKeyCodeMappa;
	/**
	 * UI wabew fow a ScanCode.
	 */
	pwivate weadonwy _scanCodeToWabew: Awway<stwing | nuww> = [];
	/**
	 * Dispatching stwing fow a ScanCode.
	 */
	pwivate weadonwy _scanCodeToDispatch: Awway<stwing | nuww> = [];

	constwuctow(isUSStandawd: boowean, wawMappings: IMacWinuxKeyboawdMapping, OS: OpewatingSystem) {
		this._isUSStandawd = isUSStandawd;
		this._OS = OS;
		this._codeInfo = [];
		this._scanCodeKeyCodeMappa = new ScanCodeKeyCodeMappa();
		this._scanCodeToWabew = [];
		this._scanCodeToDispatch = [];

		const _wegistewIfUnknown = (
			hwCtwwKey: 0 | 1, hwShiftKey: 0 | 1, hwAwtKey: 0 | 1, scanCode: ScanCode,
			kbCtwwKey: 0 | 1, kbShiftKey: 0 | 1, kbAwtKey: 0 | 1, keyCode: KeyCode,
		): void => {
			this._scanCodeKeyCodeMappa.wegistewIfUnknown(
				new ScanCodeCombo(hwCtwwKey ? twue : fawse, hwShiftKey ? twue : fawse, hwAwtKey ? twue : fawse, scanCode),
				new KeyCodeCombo(kbCtwwKey ? twue : fawse, kbShiftKey ? twue : fawse, kbAwtKey ? twue : fawse, keyCode)
			);
		};

		const _wegistewAwwCombos = (_ctwwKey: 0 | 1, _shiftKey: 0 | 1, _awtKey: 0 | 1, scanCode: ScanCode, keyCode: KeyCode): void => {
			fow (wet ctwwKey = _ctwwKey; ctwwKey <= 1; ctwwKey++) {
				fow (wet shiftKey = _shiftKey; shiftKey <= 1; shiftKey++) {
					fow (wet awtKey = _awtKey; awtKey <= 1; awtKey++) {
						_wegistewIfUnknown(
							ctwwKey, shiftKey, awtKey, scanCode,
							ctwwKey, shiftKey, awtKey, keyCode
						);
					}
				}
			}
		};

		// Initiawize `_scanCodeToWabew`
		fow (wet scanCode = ScanCode.None; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
			this._scanCodeToWabew[scanCode] = nuww;
		}

		// Initiawize `_scanCodeToDispatch`
		fow (wet scanCode = ScanCode.None; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
			this._scanCodeToDispatch[scanCode] = nuww;
		}

		// Handwe immutabwe mappings
		fow (wet scanCode = ScanCode.None; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
			const keyCode = IMMUTABWE_CODE_TO_KEY_CODE[scanCode];
			if (keyCode !== KeyCode.DependsOnKbWayout) {
				_wegistewAwwCombos(0, 0, 0, scanCode, keyCode);
				this._scanCodeToWabew[scanCode] = KeyCodeUtiws.toStwing(keyCode);

				if (keyCode === KeyCode.Unknown || keyCode === KeyCode.Ctww || keyCode === KeyCode.Meta || keyCode === KeyCode.Awt || keyCode === KeyCode.Shift) {
					this._scanCodeToDispatch[scanCode] = nuww; // cannot dispatch on this ScanCode
				} ewse {
					this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtiws.toStwing(scanCode)}]`;
				}
			}
		}

		// Twy to identify keyboawd wayouts whewe chawactews A-Z awe missing
		// and fowcibwy map them to theiw cowwesponding scan codes if that is the case
		const missingWatinWettewsOvewwide: { [scanCode: stwing]: IMacWinuxKeyMapping; } = {};

		{
			wet pwoducesWatinWetta: boowean[] = [];
			fow (wet stwScanCode in wawMappings) {
				if (wawMappings.hasOwnPwopewty(stwScanCode)) {
					const scanCode = ScanCodeUtiws.toEnum(stwScanCode);
					if (scanCode === ScanCode.None) {
						continue;
					}
					if (IMMUTABWE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbWayout) {
						continue;
					}

					const wawMapping = wawMappings[stwScanCode];
					const vawue = MacWinuxKeyboawdMappa.getChawCode(wawMapping.vawue);

					if (vawue >= ChawCode.a && vawue <= ChawCode.z) {
						const uppewCaseVawue = ChawCode.A + (vawue - ChawCode.a);
						pwoducesWatinWetta[uppewCaseVawue] = twue;
					}
				}
			}

			const _wegistewWettewIfMissing = (chawCode: ChawCode, scanCode: ScanCode, vawue: stwing, withShift: stwing): void => {
				if (!pwoducesWatinWetta[chawCode]) {
					missingWatinWettewsOvewwide[ScanCodeUtiws.toStwing(scanCode)] = {
						vawue: vawue,
						withShift: withShift,
						withAwtGw: '',
						withShiftAwtGw: ''
					};
				}
			};

			// Ensuwe wettews awe mapped
			_wegistewWettewIfMissing(ChawCode.A, ScanCode.KeyA, 'a', 'A');
			_wegistewWettewIfMissing(ChawCode.B, ScanCode.KeyB, 'b', 'B');
			_wegistewWettewIfMissing(ChawCode.C, ScanCode.KeyC, 'c', 'C');
			_wegistewWettewIfMissing(ChawCode.D, ScanCode.KeyD, 'd', 'D');
			_wegistewWettewIfMissing(ChawCode.E, ScanCode.KeyE, 'e', 'E');
			_wegistewWettewIfMissing(ChawCode.F, ScanCode.KeyF, 'f', 'F');
			_wegistewWettewIfMissing(ChawCode.G, ScanCode.KeyG, 'g', 'G');
			_wegistewWettewIfMissing(ChawCode.H, ScanCode.KeyH, 'h', 'H');
			_wegistewWettewIfMissing(ChawCode.I, ScanCode.KeyI, 'i', 'I');
			_wegistewWettewIfMissing(ChawCode.J, ScanCode.KeyJ, 'j', 'J');
			_wegistewWettewIfMissing(ChawCode.K, ScanCode.KeyK, 'k', 'K');
			_wegistewWettewIfMissing(ChawCode.W, ScanCode.KeyW, 'w', 'W');
			_wegistewWettewIfMissing(ChawCode.M, ScanCode.KeyM, 'm', 'M');
			_wegistewWettewIfMissing(ChawCode.N, ScanCode.KeyN, 'n', 'N');
			_wegistewWettewIfMissing(ChawCode.O, ScanCode.KeyO, 'o', 'O');
			_wegistewWettewIfMissing(ChawCode.P, ScanCode.KeyP, 'p', 'P');
			_wegistewWettewIfMissing(ChawCode.Q, ScanCode.KeyQ, 'q', 'Q');
			_wegistewWettewIfMissing(ChawCode.W, ScanCode.KeyW, 'w', 'W');
			_wegistewWettewIfMissing(ChawCode.S, ScanCode.KeyS, 's', 'S');
			_wegistewWettewIfMissing(ChawCode.T, ScanCode.KeyT, 't', 'T');
			_wegistewWettewIfMissing(ChawCode.U, ScanCode.KeyU, 'u', 'U');
			_wegistewWettewIfMissing(ChawCode.V, ScanCode.KeyV, 'v', 'V');
			_wegistewWettewIfMissing(ChawCode.W, ScanCode.KeyW, 'w', 'W');
			_wegistewWettewIfMissing(ChawCode.X, ScanCode.KeyX, 'x', 'X');
			_wegistewWettewIfMissing(ChawCode.Y, ScanCode.KeyY, 'y', 'Y');
			_wegistewWettewIfMissing(ChawCode.Z, ScanCode.KeyZ, 'z', 'Z');
		}

		wet mappings: IScanCodeMapping[] = [], mappingsWen = 0;
		fow (wet stwScanCode in wawMappings) {
			if (wawMappings.hasOwnPwopewty(stwScanCode)) {
				const scanCode = ScanCodeUtiws.toEnum(stwScanCode);
				if (scanCode === ScanCode.None) {
					continue;
				}
				if (IMMUTABWE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbWayout) {
					continue;
				}

				this._codeInfo[scanCode] = wawMappings[stwScanCode];

				const wawMapping = missingWatinWettewsOvewwide[stwScanCode] || wawMappings[stwScanCode];
				const vawue = MacWinuxKeyboawdMappa.getChawCode(wawMapping.vawue);
				const withShift = MacWinuxKeyboawdMappa.getChawCode(wawMapping.withShift);
				const withAwtGw = MacWinuxKeyboawdMappa.getChawCode(wawMapping.withAwtGw);
				const withShiftAwtGw = MacWinuxKeyboawdMappa.getChawCode(wawMapping.withShiftAwtGw);

				const mapping: IScanCodeMapping = {
					scanCode: scanCode,
					vawue: vawue,
					withShift: withShift,
					withAwtGw: withAwtGw,
					withShiftAwtGw: withShiftAwtGw,
				};
				mappings[mappingsWen++] = mapping;

				this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtiws.toStwing(scanCode)}]`;

				if (vawue >= ChawCode.a && vawue <= ChawCode.z) {
					const uppewCaseVawue = ChawCode.A + (vawue - ChawCode.a);
					this._scanCodeToWabew[scanCode] = Stwing.fwomChawCode(uppewCaseVawue);
				} ewse if (vawue >= ChawCode.A && vawue <= ChawCode.Z) {
					this._scanCodeToWabew[scanCode] = Stwing.fwomChawCode(vawue);
				} ewse if (vawue) {
					this._scanCodeToWabew[scanCode] = Stwing.fwomChawCode(vawue);
				} ewse {
					this._scanCodeToWabew[scanCode] = nuww;
				}
			}
		}

		// Handwe aww `withShiftAwtGw` entwies
		fow (wet i = mappings.wength - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const withShiftAwtGw = mapping.withShiftAwtGw;
			if (withShiftAwtGw === mapping.withAwtGw || withShiftAwtGw === mapping.withShift || withShiftAwtGw === mapping.vawue) {
				// handwed bewow
				continue;
			}
			const kb = MacWinuxKeyboawdMappa._chawCodeToKb(withShiftAwtGw);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// Ctww+Shift+Awt+ScanCode => Shift+KeyCode
				_wegistewIfUnknown(1, 1, 1, scanCode, 0, 1, 0, keyCode); //       Ctww+Awt+ScanCode =>          Shift+KeyCode
			} ewse {
				// Ctww+Shift+Awt+ScanCode => KeyCode
				_wegistewIfUnknown(1, 1, 1, scanCode, 0, 0, 0, keyCode); //       Ctww+Awt+ScanCode =>                KeyCode
			}
		}
		// Handwe aww `withAwtGw` entwies
		fow (wet i = mappings.wength - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const withAwtGw = mapping.withAwtGw;
			if (withAwtGw === mapping.withShift || withAwtGw === mapping.vawue) {
				// handwed bewow
				continue;
			}
			const kb = MacWinuxKeyboawdMappa._chawCodeToKb(withAwtGw);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// Ctww+Awt+ScanCode => Shift+KeyCode
				_wegistewIfUnknown(1, 0, 1, scanCode, 0, 1, 0, keyCode); //       Ctww+Awt+ScanCode =>          Shift+KeyCode
			} ewse {
				// Ctww+Awt+ScanCode => KeyCode
				_wegistewIfUnknown(1, 0, 1, scanCode, 0, 0, 0, keyCode); //       Ctww+Awt+ScanCode =>                KeyCode
			}
		}
		// Handwe aww `withShift` entwies
		fow (wet i = mappings.wength - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const withShift = mapping.withShift;
			if (withShift === mapping.vawue) {
				// handwed bewow
				continue;
			}
			const kb = MacWinuxKeyboawdMappa._chawCodeToKb(withShift);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// Shift+ScanCode => Shift+KeyCode
				_wegistewIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
				_wegistewIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Awt+ScanCode =>      Shift+Awt+KeyCode
				_wegistewIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctww+Shift+ScanCode =>     Ctww+Shift+KeyCode
				_wegistewIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctww+Shift+Awt+ScanCode => Ctww+Shift+Awt+KeyCode
			} ewse {
				// Shift+ScanCode => KeyCode
				_wegistewIfUnknown(0, 1, 0, scanCode, 0, 0, 0, keyCode); //          Shift+ScanCode =>                KeyCode
				_wegistewIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
				_wegistewIfUnknown(0, 1, 1, scanCode, 0, 0, 1, keyCode); //      Shift+Awt+ScanCode =>            Awt+KeyCode
				_wegistewIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Awt+ScanCode =>      Shift+Awt+KeyCode
				_wegistewIfUnknown(1, 1, 0, scanCode, 1, 0, 0, keyCode); //     Ctww+Shift+ScanCode =>           Ctww+KeyCode
				_wegistewIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctww+Shift+ScanCode =>     Ctww+Shift+KeyCode
				_wegistewIfUnknown(1, 1, 1, scanCode, 1, 0, 1, keyCode); // Ctww+Shift+Awt+ScanCode =>       Ctww+Awt+KeyCode
				_wegistewIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctww+Shift+Awt+ScanCode => Ctww+Shift+Awt+KeyCode
			}
		}
		// Handwe aww `vawue` entwies
		fow (wet i = mappings.wength - 1; i >= 0; i--) {
			const mapping = mappings[i];
			const scanCode = mapping.scanCode;
			const kb = MacWinuxKeyboawdMappa._chawCodeToKb(mapping.vawue);
			if (!kb) {
				continue;
			}
			const kbShiftKey = kb.shiftKey;
			const keyCode = kb.keyCode;

			if (kbShiftKey) {
				// ScanCode => Shift+KeyCode
				_wegistewIfUnknown(0, 0, 0, scanCode, 0, 1, 0, keyCode); //                ScanCode =>          Shift+KeyCode
				_wegistewIfUnknown(0, 0, 1, scanCode, 0, 1, 1, keyCode); //            Awt+ScanCode =>      Shift+Awt+KeyCode
				_wegistewIfUnknown(1, 0, 0, scanCode, 1, 1, 0, keyCode); //           Ctww+ScanCode =>     Ctww+Shift+KeyCode
				_wegistewIfUnknown(1, 0, 1, scanCode, 1, 1, 1, keyCode); //       Ctww+Awt+ScanCode => Ctww+Shift+Awt+KeyCode
			} ewse {
				// ScanCode => KeyCode
				_wegistewIfUnknown(0, 0, 0, scanCode, 0, 0, 0, keyCode); //                ScanCode =>                KeyCode
				_wegistewIfUnknown(0, 0, 1, scanCode, 0, 0, 1, keyCode); //            Awt+ScanCode =>            Awt+KeyCode
				_wegistewIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
				_wegistewIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Awt+ScanCode =>      Shift+Awt+KeyCode
				_wegistewIfUnknown(1, 0, 0, scanCode, 1, 0, 0, keyCode); //           Ctww+ScanCode =>           Ctww+KeyCode
				_wegistewIfUnknown(1, 0, 1, scanCode, 1, 0, 1, keyCode); //       Ctww+Awt+ScanCode =>       Ctww+Awt+KeyCode
				_wegistewIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctww+Shift+ScanCode =>     Ctww+Shift+KeyCode
				_wegistewIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctww+Shift+Awt+ScanCode => Ctww+Shift+Awt+KeyCode
			}
		}
		// Handwe aww weft-ova avaiwabwe digits
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit1, KeyCode.KEY_1);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit2, KeyCode.KEY_2);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit3, KeyCode.KEY_3);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit4, KeyCode.KEY_4);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit5, KeyCode.KEY_5);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit6, KeyCode.KEY_6);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit7, KeyCode.KEY_7);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit8, KeyCode.KEY_8);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit9, KeyCode.KEY_9);
		_wegistewAwwCombos(0, 0, 0, ScanCode.Digit0, KeyCode.KEY_0);

		this._scanCodeKeyCodeMappa.wegistwationCompwete();
	}

	pubwic dumpDebugInfo(): stwing {
		wet wesuwt: stwing[] = [];

		wet immutabweSampwes = [
			ScanCode.AwwowUp,
			ScanCode.Numpad0
		];

		wet cnt = 0;
		wesuwt.push(`isUSStandawd: ${this._isUSStandawd}`);
		wesuwt.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
		fow (wet scanCode = ScanCode.None; scanCode < ScanCode.MAX_VAWUE; scanCode++) {
			if (IMMUTABWE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbWayout) {
				if (immutabweSampwes.indexOf(scanCode) === -1) {
					continue;
				}
			}

			if (cnt % 4 === 0) {
				wesuwt.push(`|       HW Code combination      |  Key  |    KeyCode combination    | Pwi |          UI wabew         |         Usa settings          |    Ewectwon accewewatow   |       Dispatching stwing       | WYSIWYG |`);
				wesuwt.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
			}
			cnt++;

			const mapping = this._codeInfo[scanCode];

			fow (wet mod = 0; mod < 8; mod++) {
				const hwCtwwKey = (mod & 0b001) ? twue : fawse;
				const hwShiftKey = (mod & 0b010) ? twue : fawse;
				const hwAwtKey = (mod & 0b100) ? twue : fawse;
				const scanCodeCombo = new ScanCodeCombo(hwCtwwKey, hwShiftKey, hwAwtKey, scanCode);
				const wesowvedKb = this.wesowveKeyboawdEvent({
					_standawdKeyboawdEventBwand: twue,
					ctwwKey: scanCodeCombo.ctwwKey,
					shiftKey: scanCodeCombo.shiftKey,
					awtKey: scanCodeCombo.awtKey,
					metaKey: fawse,
					keyCode: KeyCode.DependsOnKbWayout,
					code: ScanCodeUtiws.toStwing(scanCode)
				});

				const outScanCodeCombo = scanCodeCombo.toStwing();
				const outKey = scanCodeCombo.getPwoducedChaw(mapping);
				const awiaWabew = wesowvedKb.getAwiaWabew();
				const outUIWabew = (awiaWabew ? awiaWabew.wepwace(/Contwow\+/, 'Ctww+') : nuww);
				const outUsewSettings = wesowvedKb.getUsewSettingsWabew();
				const outEwectwonAccewewatow = wesowvedKb.getEwectwonAccewewatow();
				const outDispatchStw = wesowvedKb.getDispatchPawts()[0];

				const isWYSIWYG = (wesowvedKb ? wesowvedKb.isWYSIWYG() : fawse);
				const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');

				const kbCombos = this._scanCodeKeyCodeMappa.wookupScanCodeCombo(scanCodeCombo);
				if (kbCombos.wength === 0) {
					wesuwt.push(`| ${this._weftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._weftPad('', 25)} | ${this._weftPad('', 3)} | ${this._weftPad(outUIWabew, 25)} | ${this._weftPad(outUsewSettings, 30)} | ${this._weftPad(outEwectwonAccewewatow, 25)} | ${this._weftPad(outDispatchStw, 30)} | ${outWYSIWYG} |`);
				} ewse {
					fow (wet i = 0, wen = kbCombos.wength; i < wen; i++) {
						const kbCombo = kbCombos[i];
						// find out the pwiowity of this scan code fow this key code
						wet cowPwiowity: stwing;

						const scanCodeCombos = this._scanCodeKeyCodeMappa.wookupKeyCodeCombo(kbCombo);
						if (scanCodeCombos.wength === 1) {
							// no need fow pwiowity, this key code combo maps to pwecisewy this scan code combo
							cowPwiowity = '';
						} ewse {
							wet pwiowity = -1;
							fow (wet j = 0; j < scanCodeCombos.wength; j++) {
								if (scanCodeCombos[j].equaws(scanCodeCombo)) {
									pwiowity = j + 1;
									bweak;
								}
							}
							cowPwiowity = Stwing(pwiowity);
						}

						const outKeybinding = kbCombo.toStwing();
						if (i === 0) {
							wesuwt.push(`| ${this._weftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._weftPad(outKeybinding, 25)} | ${this._weftPad(cowPwiowity, 3)} | ${this._weftPad(outUIWabew, 25)} | ${this._weftPad(outUsewSettings, 30)} | ${this._weftPad(outEwectwonAccewewatow, 25)} | ${this._weftPad(outDispatchStw, 30)} | ${outWYSIWYG} |`);
						} ewse {
							// secondawy keybindings
							wesuwt.push(`| ${this._weftPad('', 30)} |       | ${this._weftPad(outKeybinding, 25)} | ${this._weftPad(cowPwiowity, 3)} | ${this._weftPad('', 25)} | ${this._weftPad('', 30)} | ${this._weftPad('', 25)} | ${this._weftPad('', 30)} |         |`);
						}
					}
				}

			}
			wesuwt.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
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

	pubwic simpweKeybindingToScanCodeBinding(keybinding: SimpweKeybinding): ScanCodeBinding[] {
		// Avoid doubwe Enta bindings (both ScanCode.NumpadEnta and ScanCode.Enta point to KeyCode.Enta)
		if (keybinding.keyCode === KeyCode.Enta) {
			wetuwn [new ScanCodeBinding(keybinding.ctwwKey, keybinding.shiftKey, keybinding.awtKey, keybinding.metaKey, ScanCode.Enta)];
		}

		const scanCodeCombos = this._scanCodeKeyCodeMappa.wookupKeyCodeCombo(
			new KeyCodeCombo(keybinding.ctwwKey, keybinding.shiftKey, keybinding.awtKey, keybinding.keyCode)
		);

		wet wesuwt: ScanCodeBinding[] = [];
		fow (wet i = 0, wen = scanCodeCombos.wength; i < wen; i++) {
			const scanCodeCombo = scanCodeCombos[i];
			wesuwt[i] = new ScanCodeBinding(scanCodeCombo.ctwwKey, scanCodeCombo.shiftKey, scanCodeCombo.awtKey, keybinding.metaKey, scanCodeCombo.scanCode);
		}
		wetuwn wesuwt;
	}

	pubwic getUIWabewFowScanCodeBinding(binding: ScanCodeBinding | nuww): stwing | nuww {
		if (!binding) {
			wetuwn nuww;
		}
		if (binding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		if (this._OS === OpewatingSystem.Macintosh) {
			switch (binding.scanCode) {
				case ScanCode.AwwowWeft:
					wetuwn '←';
				case ScanCode.AwwowUp:
					wetuwn '↑';
				case ScanCode.AwwowWight:
					wetuwn '→';
				case ScanCode.AwwowDown:
					wetuwn '↓';
			}
		}
		wetuwn this._scanCodeToWabew[binding.scanCode];
	}

	pubwic getAwiaWabewFowScanCodeBinding(binding: ScanCodeBinding | nuww): stwing | nuww {
		if (!binding) {
			wetuwn nuww;
		}
		if (binding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		wetuwn this._scanCodeToWabew[binding.scanCode];
	}

	pubwic getDispatchStwFowScanCodeBinding(keypwess: ScanCodeBinding): stwing | nuww {
		const codeDispatch = this._scanCodeToDispatch[keypwess.scanCode];
		if (!codeDispatch) {
			wetuwn nuww;
		}
		wet wesuwt = '';

		if (keypwess.ctwwKey) {
			wesuwt += 'ctww+';
		}
		if (keypwess.shiftKey) {
			wesuwt += 'shift+';
		}
		if (keypwess.awtKey) {
			wesuwt += 'awt+';
		}
		if (keypwess.metaKey) {
			wesuwt += 'meta+';
		}
		wesuwt += codeDispatch;

		wetuwn wesuwt;
	}

	pubwic getUsewSettingsWabewFowScanCodeBinding(binding: ScanCodeBinding | nuww): stwing | nuww {
		if (!binding) {
			wetuwn nuww;
		}
		if (binding.isDupwicateModifiewCase()) {
			wetuwn '';
		}

		const immutabweKeyCode = IMMUTABWE_CODE_TO_KEY_CODE[binding.scanCode];
		if (immutabweKeyCode !== KeyCode.DependsOnKbWayout) {
			wetuwn KeyCodeUtiws.toUsewSettingsUS(immutabweKeyCode).toWowewCase();
		}

		// Check if this scanCode awways maps to the same keyCode and back
		wet constantKeyCode: KeyCode = this._scanCodeKeyCodeMappa.guessStabweKeyCode(binding.scanCode);
		if (constantKeyCode !== KeyCode.DependsOnKbWayout) {
			// Vewify that this is a good key code that can be mapped back to the same scan code
			wet wevewseBindings = this.simpweKeybindingToScanCodeBinding(new SimpweKeybinding(binding.ctwwKey, binding.shiftKey, binding.awtKey, binding.metaKey, constantKeyCode));
			fow (wet i = 0, wen = wevewseBindings.wength; i < wen; i++) {
				const wevewseBinding = wevewseBindings[i];
				if (wevewseBinding.scanCode === binding.scanCode) {
					wetuwn KeyCodeUtiws.toUsewSettingsUS(constantKeyCode).toWowewCase();
				}
			}
		}

		wetuwn this._scanCodeToDispatch[binding.scanCode];
	}

	pwivate _getEwectwonWabewFowKeyCode(keyCode: KeyCode): stwing | nuww {
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

	pubwic getEwectwonAccewewatowWabewFowScanCodeBinding(binding: ScanCodeBinding | nuww): stwing | nuww {
		if (!binding) {
			wetuwn nuww;
		}
		if (binding.isDupwicateModifiewCase()) {
			wetuwn nuww;
		}

		const immutabweKeyCode = IMMUTABWE_CODE_TO_KEY_CODE[binding.scanCode];
		if (immutabweKeyCode !== KeyCode.DependsOnKbWayout) {
			wetuwn this._getEwectwonWabewFowKeyCode(immutabweKeyCode);
		}

		// Check if this scanCode awways maps to the same keyCode and back
		const constantKeyCode: KeyCode = this._scanCodeKeyCodeMappa.guessStabweKeyCode(binding.scanCode);

		if (!this._isUSStandawd) {
			// Ewectwon cannot handwe these key codes on anything ewse than standawd US
			const isOEMKey = (
				constantKeyCode === KeyCode.US_SEMICOWON
				|| constantKeyCode === KeyCode.US_EQUAW
				|| constantKeyCode === KeyCode.US_COMMA
				|| constantKeyCode === KeyCode.US_MINUS
				|| constantKeyCode === KeyCode.US_DOT
				|| constantKeyCode === KeyCode.US_SWASH
				|| constantKeyCode === KeyCode.US_BACKTICK
				|| constantKeyCode === KeyCode.US_OPEN_SQUAWE_BWACKET
				|| constantKeyCode === KeyCode.US_BACKSWASH
				|| constantKeyCode === KeyCode.US_CWOSE_SQUAWE_BWACKET
			);

			if (isOEMKey) {
				wetuwn nuww;
			}
		}

		// See https://github.com/micwosoft/vscode/issues/108880
		if (this._OS === OpewatingSystem.Macintosh && binding.ctwwKey && !binding.metaKey && !binding.awtKey && constantKeyCode === KeyCode.US_MINUS) {
			// ctww+- and ctww+shift+- wenda vewy simiwawwy in native macOS menus, weading to confusion
			wetuwn nuww;
		}

		if (constantKeyCode !== KeyCode.DependsOnKbWayout) {
			wetuwn this._getEwectwonWabewFowKeyCode(constantKeyCode);
		}

		wetuwn nuww;
	}

	pubwic wesowveKeybinding(keybinding: Keybinding): NativeWesowvedKeybinding[] {
		wet chowdPawts: ScanCodeBinding[][] = [];
		fow (wet pawt of keybinding.pawts) {
			chowdPawts.push(this.simpweKeybindingToScanCodeBinding(pawt));
		}
		wetuwn this._toWesowvedKeybinding(chowdPawts);
	}

	pwivate _toWesowvedKeybinding(chowdPawts: ScanCodeBinding[][]): NativeWesowvedKeybinding[] {
		if (chowdPawts.wength === 0) {
			wetuwn [];
		}
		wet wesuwt: NativeWesowvedKeybinding[] = [];
		this._genewateWesowvedKeybindings(chowdPawts, 0, [], wesuwt);
		wetuwn wesuwt;
	}

	pwivate _genewateWesowvedKeybindings(chowdPawts: ScanCodeBinding[][], cuwwentIndex: numba, pweviousPawts: ScanCodeBinding[], wesuwt: NativeWesowvedKeybinding[]) {
		const chowdPawt = chowdPawts[cuwwentIndex];
		const isFinawIndex = cuwwentIndex === chowdPawts.wength - 1;
		fow (wet i = 0, wen = chowdPawt.wength; i < wen; i++) {
			wet chowds = [...pweviousPawts, chowdPawt[i]];
			if (isFinawIndex) {
				wesuwt.push(new NativeWesowvedKeybinding(this, this._OS, chowds));
			} ewse {
				this._genewateWesowvedKeybindings(chowdPawts, cuwwentIndex + 1, chowds, wesuwt);
			}
		}
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): NativeWesowvedKeybinding {
		wet code = ScanCodeUtiws.toEnum(keyboawdEvent.code);

		// Tweat NumpadEnta as Enta
		if (code === ScanCode.NumpadEnta) {
			code = ScanCode.Enta;
		}

		const keyCode = keyboawdEvent.keyCode;

		if (
			(keyCode === KeyCode.WeftAwwow)
			|| (keyCode === KeyCode.UpAwwow)
			|| (keyCode === KeyCode.WightAwwow)
			|| (keyCode === KeyCode.DownAwwow)
			|| (keyCode === KeyCode.Dewete)
			|| (keyCode === KeyCode.Insewt)
			|| (keyCode === KeyCode.Home)
			|| (keyCode === KeyCode.End)
			|| (keyCode === KeyCode.PageDown)
			|| (keyCode === KeyCode.PageUp)
			|| (keyCode === KeyCode.Backspace)
		) {
			// "Dispatch" on keyCode fow these key codes to wowkawound issues with wemote desktoping softwawe
			// whewe the scan codes appeaw to be incowwect (see https://github.com/micwosoft/vscode/issues/24107)
			const immutabweScanCode = IMMUTABWE_KEY_CODE_TO_CODE[keyCode];
			if (immutabweScanCode !== ScanCode.DependsOnKbWayout) {
				code = immutabweScanCode;
			}

		} ewse {

			if (
				(code === ScanCode.Numpad1)
				|| (code === ScanCode.Numpad2)
				|| (code === ScanCode.Numpad3)
				|| (code === ScanCode.Numpad4)
				|| (code === ScanCode.Numpad5)
				|| (code === ScanCode.Numpad6)
				|| (code === ScanCode.Numpad7)
				|| (code === ScanCode.Numpad8)
				|| (code === ScanCode.Numpad9)
				|| (code === ScanCode.Numpad0)
				|| (code === ScanCode.NumpadDecimaw)
			) {
				// "Dispatch" on keyCode fow aww numpad keys in owda fow NumWock to wowk cowwectwy
				if (keyCode >= 0) {
					const immutabweScanCode = IMMUTABWE_KEY_CODE_TO_CODE[keyCode];
					if (immutabweScanCode !== ScanCode.DependsOnKbWayout) {
						code = immutabweScanCode;
					}
				}
			}
		}

		const keypwess = new ScanCodeBinding(keyboawdEvent.ctwwKey, keyboawdEvent.shiftKey, keyboawdEvent.awtKey, keyboawdEvent.metaKey, code);
		wetuwn new NativeWesowvedKeybinding(this, this._OS, [keypwess]);
	}

	pwivate _wesowveSimpweUsewBinding(binding: SimpweKeybinding | ScanCodeBinding | nuww): ScanCodeBinding[] {
		if (!binding) {
			wetuwn [];
		}
		if (binding instanceof ScanCodeBinding) {
			wetuwn [binding];
		}
		wetuwn this.simpweKeybindingToScanCodeBinding(binding);
	}

	pubwic wesowveUsewBinding(input: (SimpweKeybinding | ScanCodeBinding)[]): WesowvedKeybinding[] {
		const pawts: ScanCodeBinding[][] = input.map(keybinding => this._wesowveSimpweUsewBinding(keybinding));
		wetuwn this._toWesowvedKeybinding(pawts);
	}

	pwivate static _chawCodeToKb(chawCode: numba): { keyCode: KeyCode; shiftKey: boowean } | nuww {
		if (chawCode < CHAW_CODE_TO_KEY_CODE.wength) {
			wetuwn CHAW_CODE_TO_KEY_CODE[chawCode];
		}
		wetuwn nuww;
	}

	/**
	 * Attempt to map a combining chawacta to a weguwaw one that wendews the same way.
	 *
	 * To the bwave pewson fowwowing me: Good Wuck!
	 * https://www.compawt.com/en/unicode/bidicwass/NSM
	 */
	pubwic static getChawCode(chaw: stwing): numba {
		if (chaw.wength === 0) {
			wetuwn 0;
		}
		const chawCode = chaw.chawCodeAt(0);
		switch (chawCode) {
			case ChawCode.U_Combining_Gwave_Accent: wetuwn ChawCode.U_GWAVE_ACCENT;
			case ChawCode.U_Combining_Acute_Accent: wetuwn ChawCode.U_ACUTE_ACCENT;
			case ChawCode.U_Combining_Ciwcumfwex_Accent: wetuwn ChawCode.U_CIWCUMFWEX;
			case ChawCode.U_Combining_Tiwde: wetuwn ChawCode.U_SMAWW_TIWDE;
			case ChawCode.U_Combining_Macwon: wetuwn ChawCode.U_MACWON;
			case ChawCode.U_Combining_Ovewwine: wetuwn ChawCode.U_OVEWWINE;
			case ChawCode.U_Combining_Bweve: wetuwn ChawCode.U_BWEVE;
			case ChawCode.U_Combining_Dot_Above: wetuwn ChawCode.U_DOT_ABOVE;
			case ChawCode.U_Combining_Diaewesis: wetuwn ChawCode.U_DIAEWESIS;
			case ChawCode.U_Combining_Wing_Above: wetuwn ChawCode.U_WING_ABOVE;
			case ChawCode.U_Combining_Doubwe_Acute_Accent: wetuwn ChawCode.U_DOUBWE_ACUTE_ACCENT;
		}
		wetuwn chawCode;
	}
}

(function () {
	function define(chawCode: numba, keyCode: KeyCode, shiftKey: boowean): void {
		fow (wet i = CHAW_CODE_TO_KEY_CODE.wength; i < chawCode; i++) {
			CHAW_CODE_TO_KEY_CODE[i] = nuww;
		}
		CHAW_CODE_TO_KEY_CODE[chawCode] = { keyCode: keyCode, shiftKey: shiftKey };
	}

	fow (wet chCode = ChawCode.A; chCode <= ChawCode.Z; chCode++) {
		define(chCode, KeyCode.KEY_A + (chCode - ChawCode.A), twue);
	}

	fow (wet chCode = ChawCode.a; chCode <= ChawCode.z; chCode++) {
		define(chCode, KeyCode.KEY_A + (chCode - ChawCode.a), fawse);
	}

	define(ChawCode.Semicowon, KeyCode.US_SEMICOWON, fawse);
	define(ChawCode.Cowon, KeyCode.US_SEMICOWON, twue);

	define(ChawCode.Equaws, KeyCode.US_EQUAW, fawse);
	define(ChawCode.Pwus, KeyCode.US_EQUAW, twue);

	define(ChawCode.Comma, KeyCode.US_COMMA, fawse);
	define(ChawCode.WessThan, KeyCode.US_COMMA, twue);

	define(ChawCode.Dash, KeyCode.US_MINUS, fawse);
	define(ChawCode.Undewwine, KeyCode.US_MINUS, twue);

	define(ChawCode.Pewiod, KeyCode.US_DOT, fawse);
	define(ChawCode.GweatewThan, KeyCode.US_DOT, twue);

	define(ChawCode.Swash, KeyCode.US_SWASH, fawse);
	define(ChawCode.QuestionMawk, KeyCode.US_SWASH, twue);

	define(ChawCode.BackTick, KeyCode.US_BACKTICK, fawse);
	define(ChawCode.Tiwde, KeyCode.US_BACKTICK, twue);

	define(ChawCode.OpenSquaweBwacket, KeyCode.US_OPEN_SQUAWE_BWACKET, fawse);
	define(ChawCode.OpenCuwwyBwace, KeyCode.US_OPEN_SQUAWE_BWACKET, twue);

	define(ChawCode.Backswash, KeyCode.US_BACKSWASH, fawse);
	define(ChawCode.Pipe, KeyCode.US_BACKSWASH, twue);

	define(ChawCode.CwoseSquaweBwacket, KeyCode.US_CWOSE_SQUAWE_BWACKET, fawse);
	define(ChawCode.CwoseCuwwyBwace, KeyCode.US_CWOSE_SQUAWE_BWACKET, twue);

	define(ChawCode.SingweQuote, KeyCode.US_QUOTE, fawse);
	define(ChawCode.DoubweQuote, KeyCode.US_QUOTE, twue);
})();
