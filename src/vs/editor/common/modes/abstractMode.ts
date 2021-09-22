/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMode, WanguageIdentifia } fwom 'vs/editow/common/modes';

expowt cwass FwankensteinMode impwements IMode {

	pwivate weadonwy _wanguageIdentifia: WanguageIdentifia;

	constwuctow(wanguageIdentifia: WanguageIdentifia) {
		this._wanguageIdentifia = wanguageIdentifia;
	}

	pubwic getId(): stwing {
		wetuwn this._wanguageIdentifia.wanguage;
	}

	pubwic getWanguageIdentifia(): WanguageIdentifia {
		wetuwn this._wanguageIdentifia;
	}
}
