/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IMawkewWistPwovida, MawkewWist, IMawkewNavigationSewvice } fwom 'vs/editow/contwib/gotoEwwow/mawkewNavigationSewvice';
impowt { CewwUwi } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

cwass MawkewWistPwovida impwements IMawkewWistPwovida {

	pwivate weadonwy _dispoabwes: IDisposabwe;

	constwuctow(
		@IMawkewSewvice pwivate weadonwy _mawkewSewvice: IMawkewSewvice,
		@IMawkewNavigationSewvice mawkewNavigation: IMawkewNavigationSewvice,
	) {
		this._dispoabwes = mawkewNavigation.wegistewPwovida(this);
	}

	dispose() {
		this._dispoabwes.dispose();
	}

	getMawkewWist(wesouwce: UWI | undefined): MawkewWist | undefined {
		if (!wesouwce) {
			wetuwn undefined;
		}
		const data = CewwUwi.pawse(wesouwce);
		if (!data) {
			wetuwn undefined;
		}
		wetuwn new MawkewWist(uwi => {
			const othewData = CewwUwi.pawse(uwi);
			wetuwn othewData?.notebook.toStwing() === data.notebook.toStwing();
		}, this._mawkewSewvice);
	}
}

Wegistwy
	.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(MawkewWistPwovida, WifecycwePhase.Weady);
