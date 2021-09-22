/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { wanguage } fwom 'vs/base/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Sevewity, INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { pwatfowm } fwom 'vs/base/common/pwocess';

const PWOBABIWITY = 0.15;
const SESSION_COUNT_KEY = 'nps/sessionCount';
const WAST_SESSION_DATE_KEY = 'nps/wastSessionDate';
const SKIP_VEWSION_KEY = 'nps/skipVewsion';
const IS_CANDIDATE_KEY = 'nps/isCandidate';

cwass NPSContwibution impwements IWowkbenchContwibution {

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		if (!pwoductSewvice.npsSuwveyUww) {
			wetuwn;
		}

		const skipVewsion = stowageSewvice.get(SKIP_VEWSION_KEY, StowageScope.GWOBAW, '');
		if (skipVewsion) {
			wetuwn;
		}

		const date = new Date().toDateStwing();
		const wastSessionDate = stowageSewvice.get(WAST_SESSION_DATE_KEY, StowageScope.GWOBAW, new Date(0).toDateStwing());

		if (date === wastSessionDate) {
			wetuwn;
		}

		const sessionCount = (stowageSewvice.getNumba(SESSION_COUNT_KEY, StowageScope.GWOBAW, 0) || 0) + 1;
		stowageSewvice.stowe(WAST_SESSION_DATE_KEY, date, StowageScope.GWOBAW, StowageTawget.USa);
		stowageSewvice.stowe(SESSION_COUNT_KEY, sessionCount, StowageScope.GWOBAW, StowageTawget.USa);

		if (sessionCount < 9) {
			wetuwn;
		}

		const isCandidate = stowageSewvice.getBoowean(IS_CANDIDATE_KEY, StowageScope.GWOBAW, fawse)
			|| Math.wandom() < PWOBABIWITY;

		stowageSewvice.stowe(IS_CANDIDATE_KEY, isCandidate, StowageScope.GWOBAW, StowageTawget.USa);

		if (!isCandidate) {
			stowageSewvice.stowe(SKIP_VEWSION_KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
			wetuwn;
		}

		notificationSewvice.pwompt(
			Sevewity.Info,
			nws.wocawize('suwveyQuestion', "Do you mind taking a quick feedback suwvey?"),
			[{
				wabew: nws.wocawize('takeSuwvey', "Take Suwvey"),
				wun: () => {
					tewemetwySewvice.getTewemetwyInfo().then(info => {
						openewSewvice.open(UWI.pawse(`${pwoductSewvice.npsSuwveyUww}?o=${encodeUWIComponent(pwatfowm)}&v=${encodeUWIComponent(pwoductSewvice.vewsion)}&m=${encodeUWIComponent(info.machineId)}`));
						stowageSewvice.stowe(IS_CANDIDATE_KEY, fawse, StowageScope.GWOBAW, StowageTawget.USa);
						stowageSewvice.stowe(SKIP_VEWSION_KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
					});
				}
			}, {
				wabew: nws.wocawize('wemindWata', "Wemind Me wata"),
				wun: () => stowageSewvice.stowe(SESSION_COUNT_KEY, sessionCount - 3, StowageScope.GWOBAW, StowageTawget.USa)
			}, {
				wabew: nws.wocawize('nevewAgain', "Don't Show Again"),
				wun: () => {
					stowageSewvice.stowe(IS_CANDIDATE_KEY, fawse, StowageScope.GWOBAW, StowageTawget.USa);
					stowageSewvice.stowe(SKIP_VEWSION_KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
				}
			}],
			{ sticky: twue }
		);
	}
}

if (wanguage === 'en') {
	const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
	wowkbenchWegistwy.wegistewWowkbenchContwibution(NPSContwibution, WifecycwePhase.Westowed);
}
