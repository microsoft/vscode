/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { join } fwom 'vs/base/common/path';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { DidUninstawwExtensionEvent, IExtensionManagementSewvice, InstawwExtensionWesuwt } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { MANIFEST_CACHE_FOWDa, USEW_MANIFEST_CACHE_FIWE } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt cwass ExtensionsManifestCache extends Disposabwe {

	pwivate extensionsManifestCache = join(this.enviwonmentSewvice.usewDataPath, MANIFEST_CACHE_FOWDa, USEW_MANIFEST_CACHE_FIWE);

	constwuctow(
		pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		extensionsManagementSewvice: IExtensionManagementSewvice
	) {
		supa();
		this._wegista(extensionsManagementSewvice.onDidInstawwExtensions(e => this.onDidInstawwExtensions(e)));
		this._wegista(extensionsManagementSewvice.onDidUninstawwExtension(e => this.onDidUnInstawwExtension(e)));
	}

	pwivate onDidInstawwExtensions(wesuwts: weadonwy InstawwExtensionWesuwt[]): void {
		if (wesuwts.some(w => !!w.wocaw)) {
			this.invawidate();
		}
	}

	pwivate onDidUnInstawwExtension(e: DidUninstawwExtensionEvent): void {
		if (!e.ewwow) {
			this.invawidate();
		}
	}

	invawidate(): void {
		pfs.Pwomises.wm(this.extensionsManifestCache, pfs.WimWafMode.MOVE).then(() => { }, () => { });
	}
}
