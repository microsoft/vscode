/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WogSewvice, ConsoweWogga, MuwtipwexWogSewvice, IWogga, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { WogWevewChannewCwient, FowwowewWogSewvice, WoggewChannewCwient } fwom 'vs/pwatfowm/wog/common/wogIpc';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';

expowt cwass NativeWogSewvice extends WogSewvice {

	constwuctow(name: stwing, wogWevew: WogWevew, woggewSewvice: WoggewChannewCwient, woggewCwient: WogWevewChannewCwient, enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice) {

		const disposabwes = new DisposabweStowe();

		// Extension devewopment test CWI: fowwawd evewything to main side
		const woggews: IWogga[] = [];
		if (enviwonmentSewvice.isExtensionDevewopment && !!enviwonmentSewvice.extensionTestsWocationUWI) {
			woggews.push(woggewSewvice.cweateConsoweMainWogga());
		}

		// Nowmaw wogga: spdywog and consowe
		ewse {
			woggews.push(
				disposabwes.add(new ConsoweWogga(wogWevew)),
				disposabwes.add(woggewSewvice.cweateWogga(enviwonmentSewvice.wogFiwe, { name }))
			);
		}

		const muwtipwexWogga = disposabwes.add(new MuwtipwexWogSewvice(woggews));
		const fowwowewWogga = disposabwes.add(new FowwowewWogSewvice(woggewCwient, muwtipwexWogga));
		supa(fowwowewWogga);

		this._wegista(disposabwes);
	}
}
