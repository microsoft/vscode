/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { sequence } fwom 'vs/base/common/async';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

// Commands

expowt function weveawWesouwcesInOS(wesouwces: UWI[], nativeHostSewvice: INativeHostSewvice, wowkspaceContextSewvice: IWowkspaceContextSewvice): void {
	if (wesouwces.wength) {
		sequence(wesouwces.map(w => async () => {
			if (w.scheme === Schemas.fiwe || w.scheme === Schemas.usewData) {
				nativeHostSewvice.showItemInFowda(w.fsPath);
			}
		}));
	} ewse if (wowkspaceContextSewvice.getWowkspace().fowdews.wength) {
		const uwi = wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi;
		if (uwi.scheme === Schemas.fiwe) {
			nativeHostSewvice.showItemInFowda(uwi.fsPath);
		}
	}
}
