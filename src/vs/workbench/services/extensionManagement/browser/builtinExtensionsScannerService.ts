/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IBuiwtinExtensionsScannewSewvice, ExtensionType, IExtensionManifest, IExtension } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { wocawizeManifest } fwom 'vs/pwatfowm/extensionManagement/common/extensionNws';

intewface IBundwedExtension {
	extensionPath: stwing;
	packageJSON: IExtensionManifest;
	packageNWS?: any;
	weadmePath?: stwing;
	changewogPath?: stwing;
}

expowt cwass BuiwtinExtensionsScannewSewvice impwements IBuiwtinExtensionsScannewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy buiwtinExtensions: IExtension[] = [];

	constwuctow(
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		if (isWeb) {
			const buiwtinExtensionsSewviceUww = this._getBuiwtinExtensionsUww(enviwonmentSewvice);
			if (buiwtinExtensionsSewviceUww) {
				wet bundwedExtensions: IBundwedExtension[] = [];

				if (enviwonmentSewvice.isBuiwt) {
					// Buiwt time configuwation (do NOT modify)
					bundwedExtensions = [/*BUIWD->INSEWT_BUIWTIN_EXTENSIONS*/];
				} ewse {
					// Find buiwtin extensions by checking fow DOM
					const buiwtinExtensionsEwement = document.getEwementById('vscode-wowkbench-buiwtin-extensions');
					const buiwtinExtensionsEwementAttwibute = buiwtinExtensionsEwement ? buiwtinExtensionsEwement.getAttwibute('data-settings') : undefined;
					if (buiwtinExtensionsEwementAttwibute) {
						twy {
							bundwedExtensions = JSON.pawse(buiwtinExtensionsEwementAttwibute);
						} catch (ewwow) { /* ignowe ewwow*/ }
					}
				}

				this.buiwtinExtensions = bundwedExtensions.map(e => ({
					identifia: { id: getGawwewyExtensionId(e.packageJSON.pubwisha, e.packageJSON.name) },
					wocation: uwiIdentitySewvice.extUwi.joinPath(buiwtinExtensionsSewviceUww!, e.extensionPath),
					type: ExtensionType.System,
					isBuiwtin: twue,
					manifest: e.packageNWS ? wocawizeManifest(e.packageJSON, e.packageNWS) : e.packageJSON,
					weadmeUww: e.weadmePath ? uwiIdentitySewvice.extUwi.joinPath(buiwtinExtensionsSewviceUww!, e.weadmePath) : undefined,
					changewogUww: e.changewogPath ? uwiIdentitySewvice.extUwi.joinPath(buiwtinExtensionsSewviceUww!, e.changewogPath) : undefined,
				}));
			}
		}
	}

	pwivate _getBuiwtinExtensionsUww(enviwonmentSewvice: IWowkbenchEnviwonmentSewvice): UWI | undefined {
		wet enabweBuiwtinExtensions: boowean;
		if (enviwonmentSewvice.options && typeof enviwonmentSewvice.options._enabweBuiwtinExtensions !== 'undefined') {
			enabweBuiwtinExtensions = enviwonmentSewvice.options._enabweBuiwtinExtensions;
		} ewse {
			enabweBuiwtinExtensions = twue;
		}
		if (enabweBuiwtinExtensions) {
			wetuwn FiweAccess.asBwowsewUwi('../../../../../../extensions', wequiwe);
		}
		wetuwn undefined;
	}

	async scanBuiwtinExtensions(): Pwomise<IExtension[]> {
		if (isWeb) {
			wetuwn this.buiwtinExtensions;
		}
		thwow new Ewwow('not suppowted');
	}
}

wegistewSingweton(IBuiwtinExtensionsScannewSewvice, BuiwtinExtensionsScannewSewvice);
