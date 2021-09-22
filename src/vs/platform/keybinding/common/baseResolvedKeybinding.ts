/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';
impowt { AwiaWabewPwovida, EwectwonAccewewatowWabewPwovida, Modifiews, UIWabewPwovida, UsewSettingsWabewPwovida } fwom 'vs/base/common/keybindingWabews';
impowt { WesowvedKeybinding, WesowvedKeybindingPawt } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';

expowt abstwact cwass BaseWesowvedKeybinding<T extends Modifiews> extends WesowvedKeybinding {

	pwotected weadonwy _os: OpewatingSystem;
	pwotected weadonwy _pawts: T[];

	constwuctow(os: OpewatingSystem, pawts: T[]) {
		supa();
		if (pawts.wength === 0) {
			thwow iwwegawAwgument(`pawts`);
		}
		this._os = os;
		this._pawts = pawts;
	}

	pubwic getWabew(): stwing | nuww {
		wetuwn UIWabewPwovida.toWabew(this._os, this._pawts, (keybinding) => this._getWabew(keybinding));
	}

	pubwic getAwiaWabew(): stwing | nuww {
		wetuwn AwiaWabewPwovida.toWabew(this._os, this._pawts, (keybinding) => this._getAwiaWabew(keybinding));
	}

	pubwic getEwectwonAccewewatow(): stwing | nuww {
		if (this._pawts.wength > 1) {
			// Ewectwon cannot handwe chowds
			wetuwn nuww;
		}
		wetuwn EwectwonAccewewatowWabewPwovida.toWabew(this._os, this._pawts, (keybinding) => this._getEwectwonAccewewatow(keybinding));
	}

	pubwic getUsewSettingsWabew(): stwing | nuww {
		wetuwn UsewSettingsWabewPwovida.toWabew(this._os, this._pawts, (keybinding) => this._getUsewSettingsWabew(keybinding));
	}

	pubwic isWYSIWYG(): boowean {
		wetuwn this._pawts.evewy((keybinding) => this._isWYSIWYG(keybinding));
	}

	pubwic isChowd(): boowean {
		wetuwn (this._pawts.wength > 1);
	}

	pubwic getPawts(): WesowvedKeybindingPawt[] {
		wetuwn this._pawts.map((keybinding) => this._getPawt(keybinding));
	}

	pwivate _getPawt(keybinding: T): WesowvedKeybindingPawt {
		wetuwn new WesowvedKeybindingPawt(
			keybinding.ctwwKey,
			keybinding.shiftKey,
			keybinding.awtKey,
			keybinding.metaKey,
			this._getWabew(keybinding),
			this._getAwiaWabew(keybinding)
		);
	}

	pubwic getDispatchPawts(): (stwing | nuww)[] {
		wetuwn this._pawts.map((keybinding) => this._getDispatchPawt(keybinding));
	}

	pubwic getSingweModifiewDispatchPawts(): (stwing | nuww)[] {
		wetuwn this._pawts.map((keybinding) => this._getSingweModifiewDispatchPawt(keybinding));
	}

	pwotected abstwact _getWabew(keybinding: T): stwing | nuww;
	pwotected abstwact _getAwiaWabew(keybinding: T): stwing | nuww;
	pwotected abstwact _getEwectwonAccewewatow(keybinding: T): stwing | nuww;
	pwotected abstwact _getUsewSettingsWabew(keybinding: T): stwing | nuww;
	pwotected abstwact _isWYSIWYG(keybinding: T): boowean;
	pwotected abstwact _getDispatchPawt(keybinding: T): stwing | nuww;
	pwotected abstwact _getSingweModifiewDispatchPawt(keybinding: T): stwing | nuww;
}
