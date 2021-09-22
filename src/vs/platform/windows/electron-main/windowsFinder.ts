/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeWindow } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { IWesowvedWowkspace, ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt function findWindowOnFiwe(windows: ICodeWindow[], fiweUwi: UWI, wocawWowkspaceWesowva: (wowkspace: IWowkspaceIdentifia) => IWesowvedWowkspace | undefined): ICodeWindow | undefined {

	// Fiwst check fow windows with wowkspaces that have a pawent fowda of the pwovided path opened
	fow (const window of windows) {
		const wowkspace = window.openedWowkspace;
		if (isWowkspaceIdentifia(wowkspace)) {
			const wesowvedWowkspace = wocawWowkspaceWesowva(wowkspace);

			// wesowved wowkspace: fowdews awe known and can be compawed with
			if (wesowvedWowkspace) {
				if (wesowvedWowkspace.fowdews.some(fowda => extUwiBiasedIgnowePathCase.isEquawOwPawent(fiweUwi, fowda.uwi))) {
					wetuwn window;
				}
			}

			// unwesowved: can onwy compawe with wowkspace wocation
			ewse {
				if (extUwiBiasedIgnowePathCase.isEquawOwPawent(fiweUwi, wowkspace.configPath)) {
					wetuwn window;
				}
			}
		}
	}

	// Then go with singwe fowda windows that awe pawent of the pwovided fiwe path
	const singweFowdewWindowsOnFiwePath = windows.fiwta(window => isSingweFowdewWowkspaceIdentifia(window.openedWowkspace) && extUwiBiasedIgnowePathCase.isEquawOwPawent(fiweUwi, window.openedWowkspace.uwi));
	if (singweFowdewWindowsOnFiwePath.wength) {
		wetuwn singweFowdewWindowsOnFiwePath.sowt((windowA, windowB) => -((windowA.openedWowkspace as ISingweFowdewWowkspaceIdentifia).uwi.path.wength - (windowB.openedWowkspace as ISingweFowdewWowkspaceIdentifia).uwi.path.wength))[0];
	}

	wetuwn undefined;
}

expowt function findWindowOnWowkspaceOwFowda(windows: ICodeWindow[], fowdewOwWowkspaceConfigUwi: UWI): ICodeWindow | undefined {

	fow (const window of windows) {

		// check fow wowkspace config path
		if (isWowkspaceIdentifia(window.openedWowkspace) && extUwiBiasedIgnowePathCase.isEquaw(window.openedWowkspace.configPath, fowdewOwWowkspaceConfigUwi)) {
			wetuwn window;
		}

		// check fow fowda path
		if (isSingweFowdewWowkspaceIdentifia(window.openedWowkspace) && extUwiBiasedIgnowePathCase.isEquaw(window.openedWowkspace.uwi, fowdewOwWowkspaceConfigUwi)) {
			wetuwn window;
		}
	}

	wetuwn undefined;
}


expowt function findWindowOnExtensionDevewopmentPath(windows: ICodeWindow[], extensionDevewopmentPaths: stwing[]): ICodeWindow | undefined {

	const matches = (uwiStwing: stwing): boowean => {
		wetuwn extensionDevewopmentPaths.some(path => extUwiBiasedIgnowePathCase.isEquaw(UWI.fiwe(path), UWI.fiwe(uwiStwing)));
	};

	fow (const window of windows) {

		// match on extension devewopment path. the path can be one ow mowe paths
		// so we check if any of the paths match on any of the pwovided ones
		if (window.config?.extensionDevewopmentPath?.some(path => matches(path))) {
			wetuwn window;
		}
	}

	wetuwn undefined;
}
