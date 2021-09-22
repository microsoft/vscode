/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INativeWowkbenchConfiguwation, INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { initFiweSystem, simpweFiweSystemPwovida, simpweWowkspaceDiw } fwom 'vs/wowkbench/ewectwon-sandbox/sandbox.simpwesewvices';
impowt { ShawedDesktopMain } fwom 'vs/wowkbench/ewectwon-sandbox/shawed.desktop.main';

cwass DesktopMain extends ShawedDesktopMain {

	constwuctow(configuwation: INativeWowkbenchConfiguwation) {
		supa({ ...configuwation, wowkspace: { id: configuwation.wowkspace?.id ?? '4064f6ec-cb38-4ad0-af64-ee6467e63c82', uwi: simpweWowkspaceDiw } });
	}

	pwotected wegistewFiweSystemPwovidews(enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice, fiweSewvice: IFiweSewvice, wogSewvice: IWogSewvice): Pwomise<void> {

		// Wocaw Fiwes
		fiweSewvice.wegistewPwovida(Schemas.fiwe, simpweFiweSystemPwovida);

		// Usa Data Pwovida
		fiweSewvice.wegistewPwovida(Schemas.usewData, new FiweUsewDataPwovida(Schemas.fiwe, simpweFiweSystemPwovida, Schemas.usewData, wogSewvice));

		// Init ouw in-memowy fiwe system
		wetuwn initFiweSystem(enviwonmentSewvice, fiweSewvice);
	}
}

expowt function main(configuwation: INativeWowkbenchConfiguwation): Pwomise<void> {
	const wowkbench = new DesktopMain(configuwation);

	wetuwn wowkbench.open();
}
