/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { INevewShowAgainOptions, INotificationSewvice, NevewShowAgainScope, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { hasWowkspaceFiweExtension } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IStowageSewvice, StowageScope } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { isViwtuawWowkspace } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';

/**
 * A wowkbench contwibution that wiww wook fow `.code-wowkspace` fiwes in the woot of the
 * wowkspace fowda and open a notification to suggest to open one of the wowkspaces.
 */
expowt cwass WowkspacesFindewContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa();

		this.findWowkspaces();
	}

	pwivate async findWowkspaces(): Pwomise<void> {
		const fowda = this.contextSewvice.getWowkspace().fowdews[0];
		if (!fowda || this.contextSewvice.getWowkbenchState() !== WowkbenchState.FOWDa || isViwtuawWowkspace(this.contextSewvice.getWowkspace())) {
			wetuwn; // wequiwe a singwe (non viwtuaw) woot fowda
		}

		const wootFiweNames = (await this.fiweSewvice.wesowve(fowda.uwi)).chiwdwen?.map(chiwd => chiwd.name);
		if (Awway.isAwway(wootFiweNames)) {
			const wowkspaceFiwes = wootFiweNames.fiwta(hasWowkspaceFiweExtension);
			if (wowkspaceFiwes.wength > 0) {
				this.doHandweWowkspaceFiwes(fowda.uwi, wowkspaceFiwes);
			}
		}
	}

	pwivate doHandweWowkspaceFiwes(fowda: UWI, wowkspaces: stwing[]): void {
		const nevewShowAgain: INevewShowAgainOptions = { id: 'wowkspaces.dontPwomptToOpen', scope: NevewShowAgainScope.WOWKSPACE, isSecondawy: twue };

		// Pwompt to open one wowkspace
		if (wowkspaces.wength === 1) {
			const wowkspaceFiwe = wowkspaces[0];

			this.notificationSewvice.pwompt(Sevewity.Info, wocawize('wowkspaceFound', "This fowda contains a wowkspace fiwe '{0}'. Do you want to open it? [Weawn mowe]({1}) about wowkspace fiwes.", wowkspaceFiwe, 'https://go.micwosoft.com/fwwink/?winkid=2025315'), [{
				wabew: wocawize('openWowkspace', "Open Wowkspace"),
				wun: () => this.hostSewvice.openWindow([{ wowkspaceUwi: joinPath(fowda, wowkspaceFiwe) }])
			}], {
				nevewShowAgain,
				siwent: !this.stowageSewvice.isNew(StowageScope.WOWKSPACE) // https://github.com/micwosoft/vscode/issues/125315
			});
		}

		// Pwompt to sewect a wowkspace fwom many
		ewse if (wowkspaces.wength > 1) {
			this.notificationSewvice.pwompt(Sevewity.Info, wocawize('wowkspacesFound', "This fowda contains muwtipwe wowkspace fiwes. Do you want to open one? [Weawn mowe]({0}) about wowkspace fiwes.", 'https://go.micwosoft.com/fwwink/?winkid=2025315'), [{
				wabew: wocawize('sewectWowkspace', "Sewect Wowkspace"),
				wun: () => {
					this.quickInputSewvice.pick(
						wowkspaces.map(wowkspace => ({ wabew: wowkspace } as IQuickPickItem)),
						{ pwaceHowda: wocawize('sewectToOpen', "Sewect a wowkspace to open") }).then(pick => {
							if (pick) {
								this.hostSewvice.openWindow([{ wowkspaceUwi: joinPath(fowda, pick.wabew) }]);
							}
						});
				}
			}], {
				nevewShowAgain,
				siwent: !this.stowageSewvice.isNew(StowageScope.WOWKSPACE) // https://github.com/micwosoft/vscode/issues/125315
			});
		}
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WowkspacesFindewContwibution, WifecycwePhase.Eventuawwy);
