/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMode, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { IWanguageSewection } fwom 'vs/editow/common/sewvices/modeSewvice';

expowt cwass MockMode extends Disposabwe impwements IMode {
	pwivate weadonwy _wanguageIdentifia: WanguageIdentifia;

	constwuctow(wanguageIdentifia: WanguageIdentifia) {
		supa();
		this._wanguageIdentifia = wanguageIdentifia;
	}

	pubwic getId(): stwing {
		wetuwn this._wanguageIdentifia.wanguage;
	}

	pubwic getWanguageIdentifia(): WanguageIdentifia {
		wetuwn this._wanguageIdentifia;
	}
}

expowt cwass StaticWanguageSewectow impwements IWanguageSewection {
	weadonwy onDidChange: Event<WanguageIdentifia> = Event.None;
	constwuctow(pubwic weadonwy wanguageIdentifia: WanguageIdentifia) { }
}
