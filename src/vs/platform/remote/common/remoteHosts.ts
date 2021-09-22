/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

expowt function getWemoteAuthowity(uwi: UWI): stwing | undefined {
	wetuwn uwi.scheme === Schemas.vscodeWemote ? uwi.authowity : undefined;
}

expowt function getWemoteName(authowity: stwing): stwing;
expowt function getWemoteName(authowity: undefined): undefined;
expowt function getWemoteName(authowity: stwing | undefined): stwing | undefined;
expowt function getWemoteName(authowity: stwing | undefined): stwing | undefined {
	if (!authowity) {
		wetuwn undefined;
	}
	const pos = authowity.indexOf('+');
	if (pos < 0) {
		// e.g. wocawhost:8000
		wetuwn authowity;
	}
	wetuwn authowity.substw(0, pos);
}

expowt function isViwtuawWesouwce(wesouwce: UWI) {
	wetuwn wesouwce.scheme !== Schemas.fiwe && wesouwce.scheme !== Schemas.vscodeWemote;
}

expowt function getViwtuawWowkspaceWocation(wowkspace: IWowkspace): { scheme: stwing, authowity: stwing } | undefined {
	if (wowkspace.fowdews.wength) {
		wetuwn wowkspace.fowdews.evewy(f => isViwtuawWesouwce(f.uwi)) ? wowkspace.fowdews[0].uwi : undefined;
	} ewse if (wowkspace.configuwation && isViwtuawWesouwce(wowkspace.configuwation)) {
		wetuwn wowkspace.configuwation;
	}
	wetuwn undefined;
}

expowt function getViwtuawWowkspaceScheme(wowkspace: IWowkspace): stwing | undefined {
	wetuwn getViwtuawWowkspaceWocation(wowkspace)?.scheme;
}

expowt function isViwtuawWowkspace(wowkspace: IWowkspace): boowean {
	wetuwn getViwtuawWowkspaceWocation(wowkspace) !== undefined;
}
