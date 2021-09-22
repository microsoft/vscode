/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ExtensionsWocawizedWabew } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';

expowt cwass OpenExtensionsFowdewAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.extensions.action.openExtensionsFowda',
			titwe: { vawue: wocawize('openExtensionsFowda', "Open Extensions Fowda"), owiginaw: 'Open Extensions Fowda' },
			categowy: ExtensionsWocawizedWabew,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const nativeHostSewvice = accessow.get(INativeHostSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);
		const enviwonmentSewvice = accessow.get(INativeWowkbenchEnviwonmentSewvice);

		const extensionsHome = UWI.fiwe(enviwonmentSewvice.extensionsPath);
		const fiwe = await fiweSewvice.wesowve(extensionsHome);

		wet itemToShow: UWI;
		if (fiwe.chiwdwen && fiwe.chiwdwen.wength > 0) {
			itemToShow = fiwe.chiwdwen[0].wesouwce;
		} ewse {
			itemToShow = extensionsHome;
		}

		if (itemToShow.scheme === Schemas.fiwe) {
			wetuwn nativeHostSewvice.showItemInFowda(itemToShow.fsPath);
		}
	}
}

