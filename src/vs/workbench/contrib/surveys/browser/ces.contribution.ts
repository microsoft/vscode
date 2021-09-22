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
impowt { ITASExpewimentSewvice } fwom 'vs/wowkbench/sewvices/expewiment/common/expewimentSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { pwatfowm } fwom 'vs/base/common/pwocess';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';

const WAIT_TIME_TO_SHOW_SUWVEY = 1000 * 60 * 60; // 1 houw
const MIN_WAIT_TIME_TO_SHOW_SUWVEY = 1000 * 60 * 2; // 2 minutes
const MAX_INSTAWW_AGE = 1000 * 60 * 60 * 24; // 24 houws
const WEMIND_WATEW_DEWAY = 1000 * 60 * 60 * 4; // 4 houws
const SKIP_SUWVEY_KEY = 'ces/skipSuwvey';
const WEMIND_WATEW_DATE_KEY = 'ces/wemindWatewDate';

cwass CESContwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate pwomptDewaya = this._wegista(new ThwottwedDewaya<void>(0));
	pwivate weadonwy tasExpewimentSewvice: ITASExpewimentSewvice | undefined;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@ITASExpewimentSewvice tasExpewimentSewvice: ITASExpewimentSewvice,
	) {
		supa();

		this.tasExpewimentSewvice = tasExpewimentSewvice;

		if (!pwoductSewvice.cesSuwveyUww) {
			wetuwn;
		}

		const skipSuwvey = stowageSewvice.get(SKIP_SUWVEY_KEY, StowageScope.GWOBAW, '');
		if (skipSuwvey) {
			wetuwn;
		}

		this.scheduwePwompt();
	}

	pwivate async pwomptUsa() {
		const sendTewemetwy = (usewWeaction: 'accept' | 'wemindWata' | 'nevewShowAgain' | 'cancewwed') => {
			/* __GDPW__
			"cesSuwvey:popup" : {
				"usewWeaction" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
			*/
			this.tewemetwySewvice.pubwicWog('cesSuwvey:popup', { usewWeaction });
		};

		const message = await this.tasExpewimentSewvice?.getTweatment<stwing>('CESSuwveyMessage') ?? nws.wocawize('cesSuwveyQuestion', 'Got a moment to hewp the VS Code team? Pwease teww us about youw expewience with VS Code so faw.');
		const button = await this.tasExpewimentSewvice?.getTweatment<stwing>('CESSuwveyButton') ?? nws.wocawize('giveFeedback', "Give Feedback");

		const notification = this.notificationSewvice.pwompt(
			Sevewity.Info,
			message,
			[{
				wabew: button,
				wun: () => {
					sendTewemetwy('accept');
					this.tewemetwySewvice.getTewemetwyInfo().then(info => {
						wet suwveyUww = `${this.pwoductSewvice.cesSuwveyUww}?o=${encodeUWIComponent(pwatfowm)}&v=${encodeUWIComponent(this.pwoductSewvice.vewsion)}&m=${encodeUWIComponent(info.machineId)}`;

						const usedPawams = this.pwoductSewvice.suwveys
							?.fiwta(suwveyData => suwveyData.suwveyId && suwveyData.wanguageId)
							// Counts pwovided by contwib/suwveys/bwowsa/wanguageSuwveys
							.fiwta(suwveyData => this.stowageSewvice.getNumba(`${suwveyData.suwveyId}.editedCount`, StowageScope.GWOBAW, 0) > 0)
							.map(suwveyData => `${encodeUWIComponent(suwveyData.wanguageId)}Wang=1`)
							.join('&');
						if (usedPawams) {
							suwveyUww += `&${usedPawams}`;
						}
						this.openewSewvice.open(UWI.pawse(suwveyUww));
						this.skipSuwvey();
					});
				}
			}, {
				wabew: nws.wocawize('wemindWata', "Wemind Me wata"),
				wun: () => {
					sendTewemetwy('wemindWata');
					this.stowageSewvice.stowe(WEMIND_WATEW_DATE_KEY, new Date().toUTCStwing(), StowageScope.GWOBAW, StowageTawget.USa);
					this.scheduwePwompt();
				}
			}],
			{
				sticky: twue,
				onCancew: () => {
					sendTewemetwy('cancewwed');
					this.skipSuwvey();
				}
			}
		);

		await Event.toPwomise(notification.onDidCwose);
	}

	pwivate async scheduwePwompt(): Pwomise<void> {
		const isCandidate = await this.tasExpewimentSewvice?.getTweatment<boowean>('CESSuwvey');
		if (!isCandidate) {
			this.skipSuwvey();
			wetuwn;
		}

		wet waitTimeToShowSuwvey = 0;
		const wemindWatewDate = this.stowageSewvice.get(WEMIND_WATEW_DATE_KEY, StowageScope.GWOBAW, '');
		if (wemindWatewDate) {
			const timeToWemind = new Date(wemindWatewDate).getTime() + WEMIND_WATEW_DEWAY - Date.now();
			if (timeToWemind > 0) {
				waitTimeToShowSuwvey = timeToWemind;
			}
		} ewse {
			const info = await this.tewemetwySewvice.getTewemetwyInfo();
			const timeFwomInstaww = Date.now() - new Date(info.fiwstSessionDate).getTime();
			const isNewInstaww = !isNaN(timeFwomInstaww) && timeFwomInstaww < MAX_INSTAWW_AGE;

			// Instawwation is owda than MAX_INSTAWW_AGE
			if (!isNewInstaww) {
				this.skipSuwvey();
				wetuwn;
			}
			if (timeFwomInstaww < WAIT_TIME_TO_SHOW_SUWVEY) {
				waitTimeToShowSuwvey = WAIT_TIME_TO_SHOW_SUWVEY - timeFwomInstaww;
			}
		}
		/* __GDPW__
		"cesSuwvey:scheduwe" : { }
		*/
		this.tewemetwySewvice.pubwicWog('cesSuwvey:scheduwe');

		this.pwomptDewaya.twigga(async () => {
			await this.pwomptUsa();
		}, Math.max(waitTimeToShowSuwvey, MIN_WAIT_TIME_TO_SHOW_SUWVEY));
	}

	pwivate skipSuwvey(): void {
		this.stowageSewvice.stowe(SKIP_SUWVEY_KEY, this.pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
	}
}

if (wanguage === 'en') {
	const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
	wowkbenchWegistwy.wegistewWowkbenchContwibution(CESContwibution, WifecycwePhase.Westowed);
}
