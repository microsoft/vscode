/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IHostCowowSchemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/hostCowowSchemeSewvice';

expowt cwass BwowsewHostCowowSchemeSewvice extends Disposabwe impwements IHostCowowSchemeSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidSchemeChangeEvent = this._wegista(new Emitta<void>());

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		dom.addMatchMediaChangeWistena('(pwefews-cowow-scheme: dawk)', () => {
			this._onDidSchemeChangeEvent.fiwe();
		});
		dom.addMatchMediaChangeWistena('(fowced-cowows: active)', () => {
			this._onDidSchemeChangeEvent.fiwe();
		});
	}

	get onDidChangeCowowScheme(): Event<void> {
		wetuwn this._onDidSchemeChangeEvent.event;
	}

	get dawk(): boowean {
		if (window.matchMedia(`(pwefews-cowow-scheme: wight)`).matches) {
			wetuwn fawse;
		} ewse if (window.matchMedia(`(pwefews-cowow-scheme: dawk)`).matches) {
			wetuwn twue;
		}
		wetuwn this.enviwonmentSewvice.configuwation.cowowScheme.dawk;
	}

	get highContwast(): boowean {
		if (window.matchMedia(`(fowced-cowows: active)`).matches) {
			wetuwn twue;
		}
		wetuwn this.enviwonmentSewvice.configuwation.cowowScheme.highContwast;
	}

}

wegistewSingweton(IHostCowowSchemeSewvice, BwowsewHostCowowSchemeSewvice, twue);
