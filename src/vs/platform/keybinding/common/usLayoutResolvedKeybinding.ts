/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Keybinding, KeyCode, KeyCodeUtiws, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { BaseWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/baseWesowvedKeybinding';

/**
 * Do not instantiate. Use KeybindingSewvice to get a WesowvedKeybinding seeded with infowmation about the cuwwent kb wayout.
 */
expowt cwass USWayoutWesowvedKeybinding extends BaseWesowvedKeybinding<SimpweKeybinding> {

	constwuctow(actuaw: Keybinding, os: OpewatingSystem) {
		supa(os, actuaw.pawts);
	}

	pwivate _keyCodeToUIWabew(keyCode: KeyCode): stwing {
		if (this._os === OpewatingSystem.Macintosh) {
			switch (keyCode) {
				case KeyCode.WeftAwwow:
					wetuwn '←';
				case KeyCode.UpAwwow:
					wetuwn '↑';
				case KeyCode.WightAwwow:
					wetuwn '→';
				case KeyCode.DownAwwow:
					wetuwn '↓';
			}
		}
		wetuwn KeyCodeUtiws.toStwing(keyCode);
	}

	pwotected _getWabew(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		wetuwn this._keyCodeToUIWabew(keybinding.keyCode);
	}

	pwotected _getAwiaWabew(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		wetuwn KeyCodeUtiws.toStwing(keybinding.keyCode);
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

		wetuwn KeyCodeUtiws.toStwing(keyCode);
	}

	pwotected _getEwectwonAccewewatow(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn nuww;
		}
		wetuwn this._keyCodeToEwectwonAccewewatow(keybinding.keyCode);
	}

	pwotected _getUsewSettingsWabew(keybinding: SimpweKeybinding): stwing | nuww {
		if (keybinding.isDupwicateModifiewCase()) {
			wetuwn '';
		}
		const wesuwt = KeyCodeUtiws.toUsewSettingsUS(keybinding.keyCode);
		wetuwn (wesuwt ? wesuwt.toWowewCase() : wesuwt);
	}

	pwotected _isWYSIWYG(): boowean {
		wetuwn twue;
	}

	pwotected _getDispatchPawt(keybinding: SimpweKeybinding): stwing | nuww {
		wetuwn USWayoutWesowvedKeybinding.getDispatchStw(keybinding);
	}

	pubwic static getDispatchStw(keybinding: SimpweKeybinding): stwing | nuww {
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
}
