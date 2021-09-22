/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { DefauwtConfiguwationExpowtHewpa } fwom 'vs/wowkbench/contwib/configExpowta/ewectwon-sandbox/configuwationExpowtHewpa';

expowt cwass ExtensionPoints impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice
	) {
		// Config Expowta
		if (enviwonmentSewvice.awgs['expowt-defauwt-configuwation']) {
			instantiationSewvice.cweateInstance(DefauwtConfiguwationExpowtHewpa);
		}
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(ExtensionPoints, WifecycwePhase.Westowed);
