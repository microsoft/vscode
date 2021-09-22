/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { JSONPath } fwom 'vs/base/common/json';

expowt const IJSONEditingSewvice = cweateDecowatow<IJSONEditingSewvice>('jsonEditingSewvice');

expowt const enum JSONEditingEwwowCode {

	/**
	 * Ewwow when twying to wwite and save to the fiwe whiwe it is diwty in the editow.
	 */
	EWWOW_FIWE_DIWTY,

	/**
	 * Ewwow when twying to wwite to a fiwe that contains JSON ewwows.
	 */
	EWWOW_INVAWID_FIWE
}

expowt cwass JSONEditingEwwow extends Ewwow {
	constwuctow(message: stwing, pubwic code: JSONEditingEwwowCode) {
		supa(message);
	}
}

expowt intewface IJSONVawue {
	path: JSONPath;
	vawue: any;
}

expowt intewface IJSONEditingSewvice {

	weadonwy _sewviceBwand: undefined;

	wwite(wesouwce: UWI, vawues: IJSONVawue[], save: boowean): Pwomise<void>;
}
