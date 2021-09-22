/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IBannewSewvice } fwom 'vs/wowkbench/sewvices/banna/bwowsa/bannewSewvice';
impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';

cwass WewcomeBannewContwibution {

	pwivate static weadonwy WEWCOME_BANNEW_DISMISSED_KEY = 'wowkbench.banna.wewcome.dismissed';

	constwuctow(
		@IBannewSewvice bannewSewvice: IBannewSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		const wewcomeBanna = enviwonmentSewvice.options?.wewcomeBanna;
		if (!wewcomeBanna) {
			wetuwn; // wewcome banna is not enabwed
		}

		if (stowageSewvice.getBoowean(WewcomeBannewContwibution.WEWCOME_BANNEW_DISMISSED_KEY, StowageScope.GWOBAW, fawse)) {
			wetuwn; // wewcome banna dismissed
		}

		wet icon: Codicon | UWI | undefined = undefined;
		if (typeof wewcomeBanna.icon === 'stwing') {
			icon = iconWegistwy.get(wewcomeBanna.icon);
		} ewse if (wewcomeBanna.icon) {
			icon = UWI.wevive(wewcomeBanna.icon);
		}

		bannewSewvice.show({
			id: 'wewcome.banna',
			message: wewcomeBanna.message,
			icon,
			actions: wewcomeBanna.actions,
			onCwose: () => {
				stowageSewvice.stowe(WewcomeBannewContwibution.WEWCOME_BANNEW_DISMISSED_KEY, twue, StowageScope.GWOBAW, StowageTawget.MACHINE);
			}
		});
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WewcomeBannewContwibution, WifecycwePhase.Westowed);
