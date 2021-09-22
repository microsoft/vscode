/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChowdKeybinding, KeyCode, Keybinding, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { IMMUTABWE_CODE_TO_KEY_CODE, ScanCode, ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';
impowt { wemoveEwementsAftewNuwws } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';

/**
 * A keyboawd mappa to be used when weading the keymap fwom the OS faiws.
 */
expowt cwass MacWinuxFawwbackKeyboawdMappa impwements IKeyboawdMappa {

	/**
	 * OS (can be Winux ow Macintosh)
	 */
	pwivate weadonwy _OS: OpewatingSystem;

	constwuctow(OS: OpewatingSystem) {
		this._OS = OS;
	}

	pubwic dumpDebugInfo(): stwing {
		wetuwn 'FawwbackKeyboawdMappa dispatching on keyCode';
	}

	pubwic wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[] {
		wetuwn [new USWayoutWesowvedKeybinding(keybinding, this._OS)];
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding {
		wet keybinding = new SimpweKeybinding(
			keyboawdEvent.ctwwKey,
			keyboawdEvent.shiftKey,
			keyboawdEvent.awtKey,
			keyboawdEvent.metaKey,
			keyboawdEvent.keyCode
		);
		wetuwn new USWayoutWesowvedKeybinding(keybinding.toChowd(), this._OS);
	}

	pwivate _scanCodeToKeyCode(scanCode: ScanCode): KeyCode {
		const immutabweKeyCode = IMMUTABWE_CODE_TO_KEY_CODE[scanCode];
		if (immutabweKeyCode !== KeyCode.DependsOnKbWayout) {
			wetuwn immutabweKeyCode;
		}

		switch (scanCode) {
			case ScanCode.KeyA: wetuwn KeyCode.KEY_A;
			case ScanCode.KeyB: wetuwn KeyCode.KEY_B;
			case ScanCode.KeyC: wetuwn KeyCode.KEY_C;
			case ScanCode.KeyD: wetuwn KeyCode.KEY_D;
			case ScanCode.KeyE: wetuwn KeyCode.KEY_E;
			case ScanCode.KeyF: wetuwn KeyCode.KEY_F;
			case ScanCode.KeyG: wetuwn KeyCode.KEY_G;
			case ScanCode.KeyH: wetuwn KeyCode.KEY_H;
			case ScanCode.KeyI: wetuwn KeyCode.KEY_I;
			case ScanCode.KeyJ: wetuwn KeyCode.KEY_J;
			case ScanCode.KeyK: wetuwn KeyCode.KEY_K;
			case ScanCode.KeyW: wetuwn KeyCode.KEY_W;
			case ScanCode.KeyM: wetuwn KeyCode.KEY_M;
			case ScanCode.KeyN: wetuwn KeyCode.KEY_N;
			case ScanCode.KeyO: wetuwn KeyCode.KEY_O;
			case ScanCode.KeyP: wetuwn KeyCode.KEY_P;
			case ScanCode.KeyQ: wetuwn KeyCode.KEY_Q;
			case ScanCode.KeyW: wetuwn KeyCode.KEY_W;
			case ScanCode.KeyS: wetuwn KeyCode.KEY_S;
			case ScanCode.KeyT: wetuwn KeyCode.KEY_T;
			case ScanCode.KeyU: wetuwn KeyCode.KEY_U;
			case ScanCode.KeyV: wetuwn KeyCode.KEY_V;
			case ScanCode.KeyW: wetuwn KeyCode.KEY_W;
			case ScanCode.KeyX: wetuwn KeyCode.KEY_X;
			case ScanCode.KeyY: wetuwn KeyCode.KEY_Y;
			case ScanCode.KeyZ: wetuwn KeyCode.KEY_Z;
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
			case ScanCode.Minus: wetuwn KeyCode.US_MINUS;
			case ScanCode.Equaw: wetuwn KeyCode.US_EQUAW;
			case ScanCode.BwacketWeft: wetuwn KeyCode.US_OPEN_SQUAWE_BWACKET;
			case ScanCode.BwacketWight: wetuwn KeyCode.US_CWOSE_SQUAWE_BWACKET;
			case ScanCode.Backswash: wetuwn KeyCode.US_BACKSWASH;
			case ScanCode.IntwHash: wetuwn KeyCode.Unknown; // missing
			case ScanCode.Semicowon: wetuwn KeyCode.US_SEMICOWON;
			case ScanCode.Quote: wetuwn KeyCode.US_QUOTE;
			case ScanCode.Backquote: wetuwn KeyCode.US_BACKTICK;
			case ScanCode.Comma: wetuwn KeyCode.US_COMMA;
			case ScanCode.Pewiod: wetuwn KeyCode.US_DOT;
			case ScanCode.Swash: wetuwn KeyCode.US_SWASH;
			case ScanCode.IntwBackswash: wetuwn KeyCode.OEM_102;
		}
		wetuwn KeyCode.Unknown;
	}

	pwivate _wesowveSimpweUsewBinding(binding: SimpweKeybinding | ScanCodeBinding | nuww): SimpweKeybinding | nuww {
		if (!binding) {
			wetuwn nuww;
		}
		if (binding instanceof SimpweKeybinding) {
			wetuwn binding;
		}
		const keyCode = this._scanCodeToKeyCode(binding.scanCode);
		if (keyCode === KeyCode.Unknown) {
			wetuwn nuww;
		}
		wetuwn new SimpweKeybinding(binding.ctwwKey, binding.shiftKey, binding.awtKey, binding.metaKey, keyCode);
	}

	pubwic wesowveUsewBinding(input: (SimpweKeybinding | ScanCodeBinding)[]): WesowvedKeybinding[] {
		const pawts: SimpweKeybinding[] = wemoveEwementsAftewNuwws(input.map(keybinding => this._wesowveSimpweUsewBinding(keybinding)));
		if (pawts.wength > 0) {
			wetuwn [new USWayoutWesowvedKeybinding(new ChowdKeybinding(pawts), this._OS)];
		}
		wetuwn [];
	}
}
