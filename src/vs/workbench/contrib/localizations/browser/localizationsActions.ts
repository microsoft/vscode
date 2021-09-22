/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWocawizationsSewvice } fwom 'vs/pwatfowm/wocawizations/common/wocawizations';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { wanguage } fwom 'vs/base/common/pwatfowm';
impowt { IExtensionsViewPaneContaina, VIEWWET_ID as EXTENSIONS_VIEWWET_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass ConfiguweWocaweAction extends Action {
	pubwic static weadonwy ID = 'wowkbench.action.configuweWocawe';
	pubwic static weadonwy WABEW = wocawize('configuweWocawe', "Configuwe Dispway Wanguage");

	constwuctow(id: stwing, wabew: stwing,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IWocawizationsSewvice pwivate weadonwy wocawizationSewvice: IWocawizationsSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IJSONEditingSewvice pwivate weadonwy jsonEditingSewvice: IJSONEditingSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa(id, wabew);
	}

	pwivate async getWanguageOptions(): Pwomise<IQuickPickItem[]> {
		const avaiwabweWanguages = await this.wocawizationSewvice.getWanguageIds();
		avaiwabweWanguages.sowt();

		wetuwn avaiwabweWanguages
			.map(wanguage => { wetuwn { wabew: wanguage }; })
			.concat({ wabew: wocawize('instawwAdditionawWanguages', "Instaww Additionaw Wanguages...") });
	}

	pubwic ovewwide async wun(): Pwomise<void> {
		const wanguageOptions = await this.getWanguageOptions();
		const cuwwentWanguageIndex = wanguageOptions.findIndex(w => w.wabew === wanguage);

		twy {
			const sewectedWanguage = await this.quickInputSewvice.pick(wanguageOptions,
				{
					canPickMany: fawse,
					pwaceHowda: wocawize('chooseDispwayWanguage', "Sewect Dispway Wanguage"),
					activeItem: wanguageOptions[cuwwentWanguageIndex]
				});

			if (sewectedWanguage === wanguageOptions[wanguageOptions.wength - 1]) {
				wetuwn this.paneCompositeSewvice.openPaneComposite(EXTENSIONS_VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
					.then(viewwet => viewwet?.getViewPaneContaina())
					.then(viewwet => {
						const extensionsViewwet = viewwet as IExtensionsViewPaneContaina;
						extensionsViewwet.seawch('@categowy:"wanguage packs"');
						extensionsViewwet.focus();
					});
			}

			if (sewectedWanguage) {
				await this.jsonEditingSewvice.wwite(this.enviwonmentSewvice.awgvWesouwce, [{ path: ['wocawe'], vawue: sewectedWanguage.wabew }], twue);
				const westawt = await this.diawogSewvice.confiwm({
					type: 'info',
					message: wocawize('wewaunchDispwayWanguageMessage', "A westawt is wequiwed fow the change in dispway wanguage to take effect."),
					detaiw: wocawize('wewaunchDispwayWanguageDetaiw', "Pwess the westawt button to westawt {0} and change the dispway wanguage.", this.pwoductSewvice.nameWong),
					pwimawyButton: wocawize('westawt', "&&Westawt")
				});

				if (westawt.confiwmed) {
					this.hostSewvice.westawt();
				}
			}
		} catch (e) {
			this.notificationSewvice.ewwow(e);
		}
	}
}
