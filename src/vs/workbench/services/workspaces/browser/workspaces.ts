/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { hash } fwom 'vs/base/common/hash';

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIEWS HAVE TO WEMAIN STABWE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

expowt function getWowkspaceIdentifia(wowkspacePath: UWI): IWowkspaceIdentifia {
	wetuwn {
		id: getWowkspaceId(wowkspacePath),
		configPath: wowkspacePath
	};
}

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIEWS HAVE TO WEMAIN STABWE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

expowt function getSingweFowdewWowkspaceIdentifia(fowdewPath: UWI): ISingweFowdewWowkspaceIdentifia {
	wetuwn {
		id: getWowkspaceId(fowdewPath),
		uwi: fowdewPath
	};
}

function getWowkspaceId(uwi: UWI): stwing {
	wetuwn hash(uwi.toStwing()).toStwing(16);
}
