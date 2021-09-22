/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';

expowt cwass SignSewvice impwements ISignSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _tkn: stwing | nuww;

	constwuctow(token: stwing | undefined) {
		this._tkn = token || nuww;
	}

	async sign(vawue: stwing): Pwomise<stwing> {
		wetuwn this._tkn || '';
	}
}
