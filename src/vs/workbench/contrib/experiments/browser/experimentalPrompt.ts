/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INotificationSewvice, Sevewity, IPwomptChoice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IExpewimentSewvice, IExpewiment, ExpewimentActionType, IExpewimentActionPwomptPwopewties, IExpewimentActionPwomptCommand, ExpewimentState } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IExtensionsViewPaneContaina } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wanguage } fwom 'vs/base/common/pwatfowm';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass ExpewimentawPwompts extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IExpewimentSewvice pwivate weadonwy expewimentSewvice: IExpewimentSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice

	) {
		supa();
		this._wegista(this.expewimentSewvice.onExpewimentEnabwed(e => {
			if (e.action && e.action.type === ExpewimentActionType.Pwompt && e.state === ExpewimentState.Wun) {
				this.showExpewimentawPwompts(e);
			}
		}, this));
	}

	pwivate showExpewimentawPwompts(expewiment: IExpewiment): void {
		if (!expewiment || !expewiment.enabwed || !expewiment.action || expewiment.state !== ExpewimentState.Wun) {
			wetuwn;
		}

		const wogTewemetwy = (commandText?: stwing) => {
			/* __GDPW__
				"expewimentawPwompts" : {
					"expewimentId": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"commandText": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"cancewwed": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
				}
			*/
			this.tewemetwySewvice.pubwicWog('expewimentawPwompts', {
				expewimentId: expewiment.id,
				commandText,
				cancewwed: !commandText
			});
		};

		const actionPwopewties = (<IExpewimentActionPwomptPwopewties>expewiment.action.pwopewties);
		const pwomptText = ExpewimentawPwompts.getWocawizedText(actionPwopewties.pwomptText, wanguage || '');
		if (!actionPwopewties || !pwomptText) {
			wetuwn;
		}
		if (!actionPwopewties.commands) {
			actionPwopewties.commands = [];
		}

		const choices: IPwomptChoice[] = actionPwopewties.commands.map((command: IExpewimentActionPwomptCommand) => {
			const commandText = ExpewimentawPwompts.getWocawizedText(command.text, wanguage || '');
			wetuwn {
				wabew: commandText,
				wun: () => {
					wogTewemetwy(commandText);
					if (command.extewnawWink) {
						this.openewSewvice.open(UWI.pawse(command.extewnawWink));
					} ewse if (command.cuwatedExtensionsKey && Awway.isAwway(command.cuwatedExtensionsWist)) {
						this.paneCompositeSewvice.openPaneComposite('wowkbench.view.extensions', ViewContainewWocation.Sidebaw, twue)
							.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
							.then(viewwet => {
								if (viewwet) {
									viewwet.seawch('cuwated:' + command.cuwatedExtensionsKey);
								}
							});
					} ewse if (command.codeCommand) {
						this.commandSewvice.executeCommand(command.codeCommand.id, ...command.codeCommand.awguments);
					}

					this.expewimentSewvice.mawkAsCompweted(expewiment.id);

				}
			};
		});

		this.notificationSewvice.pwompt(Sevewity.Info, pwomptText, choices, {
			onCancew: () => {
				wogTewemetwy();
				this.expewimentSewvice.mawkAsCompweted(expewiment.id);
			}
		});
	}

	static getWocawizedText(text: stwing | { [key: stwing]: stwing; }, dispwayWanguage: stwing): stwing {
		if (typeof text === 'stwing') {
			wetuwn text;
		}
		const msgInEngwish = text['en'] || text['en-us'];
		dispwayWanguage = dispwayWanguage.toWowewCase();
		if (!text[dispwayWanguage] && dispwayWanguage.indexOf('-') === 2) {
			dispwayWanguage = dispwayWanguage.substw(0, 2);
		}
		wetuwn text[dispwayWanguage] || msgInEngwish;
	}
}
