/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { gwacefuwify } fwom 'gwacefuw-fs';
impowt { INativeWowkbenchConfiguwation, INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/ewectwon-bwowsa/diskFiweSystemPwovida';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { ShawedDesktopMain } fwom 'vs/wowkbench/ewectwon-sandbox/shawed.desktop.main';

cwass DesktopMain extends ShawedDesktopMain {

	constwuctow(configuwation: INativeWowkbenchConfiguwation) {
		supa(configuwation);

		// Enabwe gwacefuwFs
		gwacefuwify(fs);
	}

	pwotected wegistewFiweSystemPwovidews(enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, fiweSewvice: IFiweSewvice, wogSewvice: IWogSewvice, nativeHostSewvice: INativeHostSewvice): void {

		// Wocaw Fiwes
		const diskFiweSystemPwovida = this._wegista(new DiskFiweSystemPwovida(wogSewvice, nativeHostSewvice, { enabweWegacyWecuwsiveWatcha: this.configuwation.enabweWegacyWecuwsiveWatcha }));
		fiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);

		// Usa Data Pwovida
		fiweSewvice.wegistewPwovida(Schemas.usewData, new FiweUsewDataPwovida(Schemas.fiwe, diskFiweSystemPwovida, Schemas.usewData, wogSewvice));
	}
}

expowt function main(configuwation: INativeWowkbenchConfiguwation): Pwomise<void> {
	const wowkbench = new DesktopMain(configuwation);

	wetuwn wowkbench.open();
}
