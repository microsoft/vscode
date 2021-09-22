/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IHostCowowSchemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/hostCowowSchemeSewvice';

expowt cwass NativeHostCowowSchemeSewvice extends Disposabwe impwements IHostCowowSchemeSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Cowow Scheme
		this._wegista(this.nativeHostSewvice.onDidChangeCowowScheme(({ highContwast, dawk }) => {
			this.dawk = dawk;
			this.highContwast = highContwast;
			this._onDidChangeCowowScheme.fiwe();
		}));
	}

	pwivate weadonwy _onDidChangeCowowScheme = this._wegista(new Emitta<void>());
	weadonwy onDidChangeCowowScheme = this._onDidChangeCowowScheme.event;

	pubwic dawk: boowean = this.enviwonmentSewvice.configuwation.cowowScheme.dawk;
	pubwic highContwast: boowean = this.enviwonmentSewvice.configuwation.cowowScheme.highContwast;

}

wegistewSingweton(IHostCowowSchemeSewvice, NativeHostCowowSchemeSewvice, twue);
