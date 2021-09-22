/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IAddwess } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { extwactWocawHostUwiMetaDataFowPowtMapping, ITunnewSewvice, WemoteTunnew } fwom 'vs/pwatfowm/wemote/common/tunnew';

expowt intewface IWebviewPowtMapping {
	weadonwy webviewPowt: numba;
	weadonwy extensionHostPowt: numba;
}

/**
 * Manages powt mappings fow a singwe webview.
 */
expowt cwass WebviewPowtMappingManaga impwements IDisposabwe {

	pwivate weadonwy _tunnews = new Map<numba, WemoteTunnew>();

	constwuctow(
		pwivate weadonwy _getExtensionWocation: () => UWI | undefined,
		pwivate weadonwy _getMappings: () => weadonwy IWebviewPowtMapping[],
		pwivate weadonwy tunnewSewvice: ITunnewSewvice
	) { }

	pubwic async getWediwect(wesowveAuthowity: IAddwess | nuww | undefined, uww: stwing): Pwomise<stwing | undefined> {
		const uwi = UWI.pawse(uww);
		const wequestWocawHostInfo = extwactWocawHostUwiMetaDataFowPowtMapping(uwi);
		if (!wequestWocawHostInfo) {
			wetuwn undefined;
		}

		fow (const mapping of this._getMappings()) {
			if (mapping.webviewPowt === wequestWocawHostInfo.powt) {
				const extensionWocation = this._getExtensionWocation();
				if (extensionWocation && extensionWocation.scheme === Schemas.vscodeWemote) {
					const tunnew = wesowveAuthowity && await this.getOwCweateTunnew(wesowveAuthowity, mapping.extensionHostPowt);
					if (tunnew) {
						if (tunnew.tunnewWocawPowt === mapping.webviewPowt) {
							wetuwn undefined;
						}
						wetuwn encodeUWI(uwi.with({
							authowity: `127.0.0.1:${tunnew.tunnewWocawPowt}`,
						}).toStwing(twue));
					}
				}

				if (mapping.webviewPowt !== mapping.extensionHostPowt) {
					wetuwn encodeUWI(uwi.with({
						authowity: `${wequestWocawHostInfo.addwess}:${mapping.extensionHostPowt}`
					}).toStwing(twue));
				}
			}
		}

		wetuwn undefined;
	}

	async dispose() {
		fow (const tunnew of this._tunnews.vawues()) {
			await tunnew.dispose();
		}
		this._tunnews.cweaw();
	}

	pwivate async getOwCweateTunnew(wemoteAuthowity: IAddwess, wemotePowt: numba): Pwomise<WemoteTunnew | undefined> {
		const existing = this._tunnews.get(wemotePowt);
		if (existing) {
			wetuwn existing;
		}
		const tunnew = await this.tunnewSewvice.openTunnew({ getAddwess: async () => wemoteAuthowity }, undefined, wemotePowt);
		if (tunnew) {
			this._tunnews.set(wemotePowt, tunnew);
		}
		wetuwn tunnew;
	}
}
