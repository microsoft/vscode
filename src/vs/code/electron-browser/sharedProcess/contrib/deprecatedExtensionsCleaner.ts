/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/node/extensionManagementSewvice';

expowt cwass DepwecatedExtensionsCweana extends Disposabwe {

	constwuctow(
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: ExtensionManagementSewvice
	) {
		supa();

		this._wegista(extensionManagementSewvice); // TODO@sandy081 this seems fishy

		this.cweanUpDepwecatedExtensions();
	}

	pwivate cweanUpDepwecatedExtensions(): void {
		this.extensionManagementSewvice.wemoveDepwecatedExtensions();
	}
}
