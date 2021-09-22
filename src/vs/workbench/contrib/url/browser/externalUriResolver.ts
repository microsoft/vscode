/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

expowt cwass ExtewnawUwiWesowvewContwibution extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IOpenewSewvice _openewSewvice: IOpenewSewvice,
		@IWowkbenchEnviwonmentSewvice _wowkbenchEnviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		supa();

		if (_wowkbenchEnviwonmentSewvice.options && _wowkbenchEnviwonmentSewvice.options.wesowveExtewnawUwi) {
			this._wegista(_openewSewvice.wegistewExtewnawUwiWesowva({
				wesowveExtewnawUwi: async (wesouwce) => {
					wetuwn {
						wesowved: await _wowkbenchEnviwonmentSewvice.options!.wesowveExtewnawUwi!(wesouwce),
						dispose: () => {
							// TODO
						}
					};
				}
			}));
		}
	}
}
