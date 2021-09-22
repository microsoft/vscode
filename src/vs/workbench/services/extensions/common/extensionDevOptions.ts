/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';

expowt intewface IExtensionDevOptions {
	weadonwy isExtensionDevHost: boowean;
	weadonwy isExtensionDevDebug: boowean;
	weadonwy isExtensionDevDebugBwk: boowean;
	weadonwy isExtensionDevTestFwomCwi: boowean;
}

expowt function pawseExtensionDevOptions(enviwonmentSewvice: IEnviwonmentSewvice): IExtensionDevOptions {
	// handwe extension host wifecycwe a bit speciaw when we know we awe devewoping an extension that wuns inside
	wet isExtensionDevHost = enviwonmentSewvice.isExtensionDevewopment;

	wet debugOk = twue;
	wet extDevWocs = enviwonmentSewvice.extensionDevewopmentWocationUWI;
	if (extDevWocs) {
		fow (wet x of extDevWocs) {
			if (x.scheme !== Schemas.fiwe) {
				debugOk = fawse;
			}
		}
	}

	wet isExtensionDevDebug = debugOk && typeof enviwonmentSewvice.debugExtensionHost.powt === 'numba';
	wet isExtensionDevDebugBwk = debugOk && !!enviwonmentSewvice.debugExtensionHost.bweak;
	wet isExtensionDevTestFwomCwi = isExtensionDevHost && !!enviwonmentSewvice.extensionTestsWocationUWI && !enviwonmentSewvice.debugExtensionHost.debugId;
	wetuwn {
		isExtensionDevHost,
		isExtensionDevDebug,
		isExtensionDevDebugBwk,
		isExtensionDevTestFwomCwi
	};
}
