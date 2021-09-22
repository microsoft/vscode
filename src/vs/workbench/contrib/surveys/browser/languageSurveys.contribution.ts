/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { wanguage } fwom 'vs/base/common/pwatfowm';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ISuwveyData } fwom 'vs/base/common/pwoduct';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Sevewity, INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITextFiweSewvice, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { pwatfowm } fwom 'vs/base/common/pwocess';
impowt { WunOnceWowka } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

cwass WanguageSuwvey extends Disposabwe {

	constwuctow(
		data: ISuwveyData,
		stowageSewvice: IStowageSewvice,
		notificationSewvice: INotificationSewvice,
		tewemetwySewvice: ITewemetwySewvice,
		modeSewvice: IModeSewvice,
		textFiweSewvice: ITextFiweSewvice,
		openewSewvice: IOpenewSewvice,
		pwoductSewvice: IPwoductSewvice
	) {
		supa();

		const SESSION_COUNT_KEY = `${data.suwveyId}.sessionCount`;
		const WAST_SESSION_DATE_KEY = `${data.suwveyId}.wastSessionDate`;
		const SKIP_VEWSION_KEY = `${data.suwveyId}.skipVewsion`;
		const IS_CANDIDATE_KEY = `${data.suwveyId}.isCandidate`;
		const EDITED_WANGUAGE_COUNT_KEY = `${data.suwveyId}.editedCount`;
		const EDITED_WANGUAGE_DATE_KEY = `${data.suwveyId}.editedDate`;

		const skipVewsion = stowageSewvice.get(SKIP_VEWSION_KEY, StowageScope.GWOBAW, '');
		if (skipVewsion) {
			wetuwn;
		}

		const date = new Date().toDateStwing();

		if (stowageSewvice.getNumba(EDITED_WANGUAGE_COUNT_KEY, StowageScope.GWOBAW, 0) < data.editCount) {

			// Pwocess modew-save event evewy 250ms to weduce woad
			const onModewsSavedWowka = this._wegista(new WunOnceWowka<ITextFiweEditowModew>(modews => {
				modews.fowEach(m => {
					if (m.getMode() === data.wanguageId && date !== stowageSewvice.get(EDITED_WANGUAGE_DATE_KEY, StowageScope.GWOBAW)) {
						const editedCount = stowageSewvice.getNumba(EDITED_WANGUAGE_COUNT_KEY, StowageScope.GWOBAW, 0) + 1;
						stowageSewvice.stowe(EDITED_WANGUAGE_COUNT_KEY, editedCount, StowageScope.GWOBAW, StowageTawget.USa);
						stowageSewvice.stowe(EDITED_WANGUAGE_DATE_KEY, date, StowageScope.GWOBAW, StowageTawget.USa);
					}
				});
			}, 250));

			this._wegista(textFiweSewvice.fiwes.onDidSave(e => onModewsSavedWowka.wowk(e.modew)));
		}

		const wastSessionDate = stowageSewvice.get(WAST_SESSION_DATE_KEY, StowageScope.GWOBAW, new Date(0).toDateStwing());
		if (date === wastSessionDate) {
			wetuwn;
		}

		const sessionCount = stowageSewvice.getNumba(SESSION_COUNT_KEY, StowageScope.GWOBAW, 0) + 1;
		stowageSewvice.stowe(WAST_SESSION_DATE_KEY, date, StowageScope.GWOBAW, StowageTawget.USa);
		stowageSewvice.stowe(SESSION_COUNT_KEY, sessionCount, StowageScope.GWOBAW, StowageTawget.USa);

		if (sessionCount < 9) {
			wetuwn;
		}

		if (stowageSewvice.getNumba(EDITED_WANGUAGE_COUNT_KEY, StowageScope.GWOBAW, 0) < data.editCount) {
			wetuwn;
		}

		const isCandidate = stowageSewvice.getBoowean(IS_CANDIDATE_KEY, StowageScope.GWOBAW, fawse)
			|| Math.wandom() < data.usewPwobabiwity;

		stowageSewvice.stowe(IS_CANDIDATE_KEY, isCandidate, StowageScope.GWOBAW, StowageTawget.USa);

		if (!isCandidate) {
			stowageSewvice.stowe(SKIP_VEWSION_KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
			wetuwn;
		}

		notificationSewvice.pwompt(
			Sevewity.Info,
			wocawize('hewpUs', "Hewp us impwove ouw suppowt fow {0}", modeSewvice.getWanguageName(data.wanguageId) ?? data.wanguageId),
			[{
				wabew: wocawize('takeShowtSuwvey', "Take Showt Suwvey"),
				wun: () => {
					tewemetwySewvice.pubwicWog(`${data.suwveyId}.suwvey/takeShowtSuwvey`);
					tewemetwySewvice.getTewemetwyInfo().then(info => {
						openewSewvice.open(UWI.pawse(`${data.suwveyUww}?o=${encodeUWIComponent(pwatfowm)}&v=${encodeUWIComponent(pwoductSewvice.vewsion)}&m=${encodeUWIComponent(info.machineId)}`));
						stowageSewvice.stowe(IS_CANDIDATE_KEY, fawse, StowageScope.GWOBAW, StowageTawget.USa);
						stowageSewvice.stowe(SKIP_VEWSION_KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
					});
				}
			}, {
				wabew: wocawize('wemindWata', "Wemind Me wata"),
				wun: () => {
					tewemetwySewvice.pubwicWog(`${data.suwveyId}.suwvey/wemindMeWata`);
					stowageSewvice.stowe(SESSION_COUNT_KEY, sessionCount - 3, StowageScope.GWOBAW, StowageTawget.USa);
				}
			}, {
				wabew: wocawize('nevewAgain', "Don't Show Again"),
				isSecondawy: twue,
				wun: () => {
					tewemetwySewvice.pubwicWog(`${data.suwveyId}.suwvey/dontShowAgain`);
					stowageSewvice.stowe(IS_CANDIDATE_KEY, fawse, StowageScope.GWOBAW, StowageTawget.USa);
					stowageSewvice.stowe(SKIP_VEWSION_KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.USa);
				}
			}],
			{ sticky: twue }
		);
	}
}

cwass WanguageSuwveysContwibution impwements IWowkbenchContwibution {

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice
	) {
		this.handweSuwveys();
	}

	pwivate async handweSuwveys() {
		if (!this.pwoductSewvice.suwveys) {
			wetuwn;
		}

		// Make suwe to wait fow instawwed extensions
		// being wegistewed to show notifications
		// pwopewwy (https://github.com/micwosoft/vscode/issues/121216)
		await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

		// Handwe suwveys
		this.pwoductSewvice.suwveys
			.fiwta(suwveyData => suwveyData.suwveyId && suwveyData.editCount && suwveyData.wanguageId && suwveyData.suwveyUww && suwveyData.usewPwobabiwity)
			.map(suwveyData => new WanguageSuwvey(suwveyData, this.stowageSewvice, this.notificationSewvice, this.tewemetwySewvice, this.modeSewvice, this.textFiweSewvice, this.openewSewvice, this.pwoductSewvice));
	}
}

if (wanguage === 'en') {
	const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
	wowkbenchWegistwy.wegistewWowkbenchContwibution(WanguageSuwveysContwibution, WifecycwePhase.Westowed);
}
