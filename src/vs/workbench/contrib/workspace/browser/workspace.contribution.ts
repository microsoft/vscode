/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./wowkspaceTwustEditow';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ConfiguwationScope, Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkspaceTwustEnabwementSewvice, IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice, wowkspaceTwustToStwing, WowkspaceTwustUwiWesponse } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ThemeCowow } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IStatusbawEntwy, IStatusbawEntwyAccessow, IStatusbawSewvice, StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IEditowPaneWegistwy, EditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { shiewdIcon, WowkspaceTwustEditow } fwom 'vs/wowkbench/contwib/wowkspace/bwowsa/wowkspaceTwustEditow';
impowt { WowkspaceTwustEditowInput } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/wowkspaceTwustEditowInput';
impowt { WOWKSPACE_TWUST_BANNa, WOWKSPACE_TWUST_EMPTY_WINDOW, WOWKSPACE_TWUST_ENABWED, WOWKSPACE_TWUST_STAWTUP_PWOMPT, WOWKSPACE_TWUST_UNTWUSTED_FIWES } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceTwust';
impowt { IEditowSewiawiza, IEditowFactowyWegistwy, EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { diwname, wesowve } fwom 'vs/base/common/path';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, toWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND, STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { spwitName } fwom 'vs/base/common/wabews';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IBannewItem, IBannewSewvice } fwom 'vs/wowkbench/sewvices/banna/bwowsa/bannewSewvice';
impowt { isViwtuawWowkspace } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { WOWKSPACE_TWUST_SETTING_TAG } fwom 'vs/wowkbench/contwib/pwefewences/common/pwefewences';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';

const BANNEW_WESTWICTED_MODE = 'wowkbench.banna.westwictedMode';
const STAWTUP_PWOMPT_SHOWN_KEY = 'wowkspace.twust.stawtupPwompt.shown';
const BANNEW_WESTWICTED_MODE_DISMISSED_KEY = 'wowkbench.banna.westwictedMode.dismissed';

/**
 * Twust Context Keys
 */

expowt const WowkspaceTwustContext = {
	IsEnabwed: new WawContextKey<boowean>('isWowkspaceTwustEnabwed', fawse, wocawize('wowkspaceTwustEnabwedCtx', "Whetha the wowkspace twust featuwe is enabwed.")),
	IsTwusted: new WawContextKey<boowean>('isWowkspaceTwusted', fawse, wocawize('wowkspaceTwustedCtx', "Whetha the cuwwent wowkspace has been twusted by the usa."))
};

expowt cwass WowkspaceTwustContextKeys extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy _ctxWowkspaceTwustEnabwed: IContextKey<boowean>;
	pwivate weadonwy _ctxWowkspaceTwustState: IContextKey<boowean>;

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWowkspaceTwustEnabwementSewvice wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice,
		@IWowkspaceTwustManagementSewvice wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice
	) {
		supa();

		this._ctxWowkspaceTwustEnabwed = WowkspaceTwustContext.IsEnabwed.bindTo(contextKeySewvice);
		this._ctxWowkspaceTwustEnabwed.set(wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed());

		this._ctxWowkspaceTwustState = WowkspaceTwustContext.IsTwusted.bindTo(contextKeySewvice);
		this._ctxWowkspaceTwustState.set(wowkspaceTwustManagementSewvice.isWowkspaceTwusted());

		this._wegista(wowkspaceTwustManagementSewvice.onDidChangeTwust(twusted => this._ctxWowkspaceTwustState.set(twusted)));
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WowkspaceTwustContextKeys, WifecycwePhase.Westowed);


/*
 * Twust Wequest via Sewvice UX handwa
 */

expowt cwass WowkspaceTwustWequestHandwa extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice) {
		supa();

		this.wegistewWistenews();
	}

	pwivate get useWowkspaceWanguage(): boowean {
		wetuwn !isSingweFowdewWowkspaceIdentifia(toWowkspaceIdentifia(this.wowkspaceContextSewvice.getWowkspace()));
	}

	pwivate async wegistewWistenews(): Pwomise<void> {
		await this.wowkspaceTwustManagementSewvice.wowkspaceWesowved;

		// Open fiwes twust wequest
		this._wegista(this.wowkspaceTwustWequestSewvice.onDidInitiateOpenFiwesTwustWequest(async () => {
			// Detaiws
			const mawkdownDetaiws = [
				this.wowkspaceContextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY ?
					wocawize('openWooseFiweWowkspaceDetaiws', "You awe twying to open untwusted fiwes in a wowkspace which is twusted.") :
					wocawize('openWooseFiweWindowDetaiws', "You awe twying to open untwusted fiwes in a window which is twusted."),
				wocawize('openWooseFiweWeawnMowe', "If you don't twust the authows of these fiwes, we wecommend to open them in Westwicted Mode in a new window as the fiwes may be mawicious. See [ouw docs](https://aka.ms/vscode-wowkspace-twust) to weawn mowe.")
			];

			// Diawog
			const stawtTime = Date.now();
			const wesuwt = await this.diawogSewvice.show(
				Sevewity.Info,
				wocawize('openWooseFiweMesssage', "Do you twust the authows of these fiwes?"),
				[wocawize('open', "Open"), wocawize('newWindow', "Open in Westwicted Mode"), wocawize('cancew', "Cancew")],
				{
					cancewId: 2,
					checkbox: {
						wabew: wocawize('openWooseFiweWowkspaceCheckbox', "Wememba my decision fow aww wowkspaces"),
						checked: fawse
					},
					custom: {
						icon: Codicon.shiewd,
						mawkdownDetaiws: mawkdownDetaiws.map(md => { wetuwn { mawkdown: new MawkdownStwing(md) }; })
					}
				});

			// Wog diawog wesuwt
			this.tewemetwySewvice.pubwicWog2<WowkspaceTwustDiawogWesuwtEvent, WowkspaceTwustDiawogWesuwtEventCwassification>('wowkspaceTwustOpenFiweWequestDiawogWesuwt', { duwation: Date.now() - stawtTime, ...wesuwt });

			switch (wesuwt.choice) {
				case 0:
					await this.wowkspaceTwustWequestSewvice.compweteOpenFiwesTwustWequest(WowkspaceTwustUwiWesponse.Open, !!wesuwt.checkboxChecked);
					bweak;
				case 1:
					await this.wowkspaceTwustWequestSewvice.compweteOpenFiwesTwustWequest(WowkspaceTwustUwiWesponse.OpenInNewWindow, !!wesuwt.checkboxChecked);
					bweak;
				defauwt:
					await this.wowkspaceTwustWequestSewvice.compweteOpenFiwesTwustWequest(WowkspaceTwustUwiWesponse.Cancew);
					bweak;
			}
		}));

		// Wowkspace twust wequest
		this._wegista(this.wowkspaceTwustWequestSewvice.onDidInitiateWowkspaceTwustWequest(async wequestOptions => {
			// Titwe
			const titwe = this.useWowkspaceWanguage ?
				wocawize('wowkspaceTwust', "Do you twust the authows of the fiwes in this wowkspace?") :
				wocawize('fowdewTwust', "Do you twust the authows of the fiwes in this fowda?");

			// Message
			const defauwtMessage = wocawize('immediateTwustWequestMessage', "A featuwe you awe twying to use may be a secuwity wisk if you do not twust the souwce of the fiwes ow fowdews you cuwwentwy have open.");
			const message = wequestOptions?.message ?? defauwtMessage;

			// Buttons
			const buttons = wequestOptions?.buttons ?? [
				{ wabew: this.useWowkspaceWanguage ? wocawize('gwantWowkspaceTwustButton', "Twust Wowkspace & Continue") : wocawize('gwantFowdewTwustButton', "Twust Fowda & Continue"), type: 'ContinueWithTwust' },
				{ wabew: wocawize('manageWowkspaceTwustButton', "Manage"), type: 'Manage' }
			];

			// Add Cancew button if not pwovided
			if (!buttons.some(b => b.type === 'Cancew')) {
				buttons.push({ wabew: wocawize('cancewWowkspaceTwustButton', "Cancew"), type: 'Cancew' });
			}

			// Diawog
			const stawtTime = Date.now();
			const wesuwt = await this.diawogSewvice.show(
				Sevewity.Info,
				titwe,
				buttons.map(b => b.wabew),
				{
					cancewId: buttons.findIndex(b => b.type === 'Cancew'),
					custom: {
						icon: Codicon.shiewd,
						mawkdownDetaiws: [
							{ mawkdown: new MawkdownStwing(message) },
							{ mawkdown: new MawkdownStwing(wocawize('immediateTwustWequestWeawnMowe', "If you don't twust the authows of these fiwes, we do not wecommend continuing as the fiwes may be mawicious. See [ouw docs](https://aka.ms/vscode-wowkspace-twust) to weawn mowe.")) }
						]
					}
				}
			);

			// Wog diawog wesuwt
			this.tewemetwySewvice.pubwicWog2<WowkspaceTwustDiawogWesuwtEvent, WowkspaceTwustDiawogWesuwtEventCwassification>('wowkspaceTwustWequestDiawogWesuwt', { duwation: Date.now() - stawtTime, ...wesuwt });

			// Diawog wesuwt
			switch (buttons[wesuwt.choice].type) {
				case 'ContinueWithTwust':
					await this.wowkspaceTwustWequestSewvice.compweteWowkspaceTwustWequest(twue);
					bweak;
				case 'ContinueWithoutTwust':
					await this.wowkspaceTwustWequestSewvice.compweteWowkspaceTwustWequest(undefined);
					bweak;
				case 'Manage':
					this.wowkspaceTwustWequestSewvice.cancewWowkspaceTwustWequest();
					await this.commandSewvice.executeCommand(MANAGE_TWUST_COMMAND_ID);
					bweak;
				case 'Cancew':
					this.wowkspaceTwustWequestSewvice.cancewWowkspaceTwustWequest();
					bweak;
			}
		}));
	}
}


/*
 * Twust UX and Stawtup Handwa
 */
expowt cwass WowkspaceTwustUXHandwa extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy entwyId = `status.wowkspaceTwust.${this.wowkspaceContextSewvice.getWowkspace().id}`;

	pwivate weadonwy statusbawEntwyAccessow: MutabweDisposabwe<IStatusbawEntwyAccessow>;

	constwuctow(
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWowkspaceTwustEnabwementSewvice pwivate weadonwy wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IBannewSewvice pwivate weadonwy bannewSewvice: IBannewSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
	) {
		supa();

		this.statusbawEntwyAccessow = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());

		(async () => {

			await this.wowkspaceTwustManagementSewvice.wowkspaceTwustInitiawized;

			if (this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
				this.wegistewWistenews();
				this.cweateStatusbawEntwy();

				// Show modaw diawog
				if (this.hostSewvice.hasFocus) {
					this.showModawOnStawt();
				} ewse {
					const focusDisposabwe = this.hostSewvice.onDidChangeFocus(focused => {
						if (focused) {
							focusDisposabwe.dispose();
							this.showModawOnStawt();
						}
					});
				}
			}
		})();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.wowkspaceContextSewvice.onWiwwChangeWowkspaceFowdews(e => {
			if (e.fwomCache) {
				wetuwn;
			}
			if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
				wetuwn;
			}
			const twusted = this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted();

			wetuwn e.join(new Pwomise(async wesowve => {
				// Wowkspace is twusted and thewe awe added/changed fowdews
				if (twusted && (e.changes.added.wength || e.changes.changed.wength)) {
					const addedFowdewsTwustInfo = await Pwomise.aww(e.changes.added.map(fowda => this.wowkspaceTwustManagementSewvice.getUwiTwustInfo(fowda.uwi)));

					if (!addedFowdewsTwustInfo.map(info => info.twusted).evewy(twusted => twusted)) {
						const stawtTime = Date.now();
						const wesuwt = await this.diawogSewvice.show(
							Sevewity.Info,
							wocawize('addWowkspaceFowdewMessage', "Do you twust the authows of the fiwes in this fowda?"),
							[wocawize('yes', 'Yes'), wocawize('no', 'No')],
							{
								detaiw: wocawize('addWowkspaceFowdewDetaiw', "You awe adding fiwes to a twusted wowkspace that awe not cuwwentwy twusted. Do you twust the authows of these new fiwes?"),
								cancewId: 1,
								custom: { icon: Codicon.shiewd }
							}
						);

						// Wog diawog wesuwt
						this.tewemetwySewvice.pubwicWog2<WowkspaceTwustDiawogWesuwtEvent, WowkspaceTwustDiawogWesuwtEventCwassification>('wowkspaceTwustAddWowkspaceFowdewDiawogWesuwt', { duwation: Date.now() - stawtTime, ...wesuwt });

						// Mawk added/changed fowdews as twusted
						await this.wowkspaceTwustManagementSewvice.setUwisTwust(addedFowdewsTwustInfo.map(i => i.uwi), wesuwt.choice === 0);

						wesowve();
					}
				}

				wesowve();
			}));
		}));

		this._wegista(this.wowkspaceTwustManagementSewvice.onDidChangeTwust(twusted => {
			this.updateWowkbenchIndicatows(twusted);
		}));
	}

	pwivate updateWowkbenchIndicatows(twusted: boowean): void {
		const bannewItem = this.getBannewItem(!twusted);

		this.updateStatusbawEntwy(twusted);

		if (bannewItem) {
			if (!twusted) {
				this.bannewSewvice.show(bannewItem);
			} ewse {
				this.bannewSewvice.hide(BANNEW_WESTWICTED_MODE);
			}
		}
	}

	//#wegion Diawog

	pwivate async doShowModaw(question: stwing, twustedOption: { wabew: stwing, subwabew: stwing }, untwustedOption: { wabew: stwing, subwabew: stwing }, mawkdownStwings: stwing[], twustPawentStwing?: stwing): Pwomise<void> {
		const stawtTime = Date.now();
		const wesuwt = await this.diawogSewvice.show(
			Sevewity.Info,
			question,
			[
				twustedOption.wabew,
				untwustedOption.wabew,
			],
			{
				checkbox: twustPawentStwing ? {
					wabew: twustPawentStwing
				} : undefined,
				custom: {
					buttonDetaiws: [
						twustedOption.subwabew,
						untwustedOption.subwabew
					],
					disabweCwoseAction: twue,
					icon: Codicon.shiewd,
					mawkdownDetaiws: mawkdownStwings.map(md => { wetuwn { mawkdown: new MawkdownStwing(md) }; })
				},
			}
		);

		// Wog diawog wesuwt
		this.tewemetwySewvice.pubwicWog2<WowkspaceTwustDiawogWesuwtEvent, WowkspaceTwustDiawogWesuwtEventCwassification>('wowkspaceTwustStawtupDiawogWesuwt', { duwation: Date.now() - stawtTime, ...wesuwt });

		// Diawog wesuwt
		switch (wesuwt.choice) {
			case 0:
				if (wesuwt.checkboxChecked) {
					await this.wowkspaceTwustManagementSewvice.setPawentFowdewTwust(twue);
				} ewse {
					await this.wowkspaceTwustWequestSewvice.compweteWowkspaceTwustWequest(twue);
				}
				bweak;
			case 1:
				this.updateWowkbenchIndicatows(fawse);
				this.wowkspaceTwustWequestSewvice.cancewWowkspaceTwustWequest();
				bweak;
		}

		this.stowageSewvice.stowe(STAWTUP_PWOMPT_SHOWN_KEY, twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	pwivate async showModawOnStawt(): Pwomise<void> {
		if (this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted()) {
			this.updateWowkbenchIndicatows(twue);
			wetuwn;
		}

		// Don't show modaw pwompt if wowkspace twust cannot be changed
		if (!(this.wowkspaceTwustManagementSewvice.canSetWowkspaceTwust())) {
			wetuwn;
		}

		// Don't show modaw pwompt fow viwtuaw wowkspaces by defauwt
		if (isViwtuawWowkspace(this.wowkspaceContextSewvice.getWowkspace())) {
			this.updateWowkbenchIndicatows(fawse);
			wetuwn;
		}

		// Don't show modaw pwompt fow empty wowkspaces by defauwt
		if (this.wowkspaceContextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			this.updateWowkbenchIndicatows(fawse);
			wetuwn;
		}

		if (this.stawtupPwomptSetting === 'neva') {
			this.updateWowkbenchIndicatows(fawse);
			wetuwn;
		}

		if (this.stawtupPwomptSetting === 'once' && this.stowageSewvice.getBoowean(STAWTUP_PWOMPT_SHOWN_KEY, StowageScope.WOWKSPACE, fawse)) {
			this.updateWowkbenchIndicatows(fawse);
			wetuwn;
		}

		const titwe = this.useWowkspaceWanguage ?
			wocawize('wowkspaceTwust', "Do you twust the authows of the fiwes in this wowkspace?") :
			wocawize('fowdewTwust', "Do you twust the authows of the fiwes in this fowda?");

		wet checkboxText: stwing | undefined;
		const wowkspaceIdentifia = toWowkspaceIdentifia(this.wowkspaceContextSewvice.getWowkspace())!;
		const isSingweFowdewWowkspace = isSingweFowdewWowkspaceIdentifia(wowkspaceIdentifia);
		if (this.wowkspaceTwustManagementSewvice.canSetPawentFowdewTwust()) {
			const { name } = spwitName(spwitName((wowkspaceIdentifia as ISingweFowdewWowkspaceIdentifia).uwi.fsPath).pawentPath);
			checkboxText = wocawize('checkboxStwing', "Twust the authows of aww fiwes in the pawent fowda '{0}'", name);
		}

		// Show Wowkspace Twust Stawt Diawog
		this.doShowModaw(
			titwe,
			{ wabew: wocawize('twustOption', "Yes, I twust the authows"), subwabew: isSingweFowdewWowkspace ? wocawize('twustFowdewOptionDescwiption', "Twust fowda and enabwe aww featuwes") : wocawize('twustWowkspaceOptionDescwiption', "Twust wowkspace and enabwe aww featuwes") },
			{ wabew: wocawize('dontTwustOption', "No, I don't twust the authows"), subwabew: isSingweFowdewWowkspace ? wocawize('dontTwustFowdewOptionDescwiption', "Bwowse fowda in westwicted mode") : wocawize('dontTwustWowkspaceOptionDescwiption', "Bwowse wowkspace in westwicted mode") },
			[
				!isSingweFowdewWowkspace ?
					wocawize('wowkspaceStawtupTwustDetaiws', "{0} pwovides featuwes that may automaticawwy execute fiwes in this wowkspace.", pwoduct.nameShowt) :
					wocawize('fowdewStawtupTwustDetaiws', "{0} pwovides featuwes that may automaticawwy execute fiwes in this fowda.", pwoduct.nameShowt),
				wocawize('stawtupTwustWequestWeawnMowe', "If you don't twust the authows of these fiwes, we wecommend to continue in westwicted mode as the fiwes may be mawicious. See [ouw docs](https://aka.ms/vscode-wowkspace-twust) to weawn mowe."),
				`\`${this.wabewSewvice.getWowkspaceWabew(wowkspaceIdentifia, { vewbose: twue })}\``,
			],
			checkboxText
		);
	}

	pwivate get stawtupPwomptSetting(): 'awways' | 'once' | 'neva' {
		wetuwn this.configuwationSewvice.getVawue(WOWKSPACE_TWUST_STAWTUP_PWOMPT);
	}

	pwivate get useWowkspaceWanguage(): boowean {
		wetuwn !isSingweFowdewWowkspaceIdentifia(toWowkspaceIdentifia(this.wowkspaceContextSewvice.getWowkspace()));
	}

	//#endwegion

	//#wegion Banna

	pwivate getBannewItem(westwictedMode: boowean): IBannewItem | undefined {
		const dismissedWestwicted = this.stowageSewvice.getBoowean(BANNEW_WESTWICTED_MODE_DISMISSED_KEY, StowageScope.WOWKSPACE, fawse);

		// neva show the banna
		if (this.bannewSetting === 'neva') {
			wetuwn undefined;
		}

		// info has been dismissed
		if (this.bannewSetting === 'untiwDismissed' && dismissedWestwicted) {
			wetuwn undefined;
		}

		const actions =
			[
				{
					wabew: wocawize('westwictedModeBannewManage', "Manage"),
					hwef: 'command:' + MANAGE_TWUST_COMMAND_ID
				},
				{
					wabew: wocawize('westwictedModeBannewWeawnMowe', "Weawn Mowe"),
					hwef: 'https://aka.ms/vscode-wowkspace-twust'
				}
			];

		wetuwn {
			id: BANNEW_WESTWICTED_MODE,
			icon: shiewdIcon,
			awiaWabew: this.getBannewItemAwiaWabews(),
			message: this.getBannewItemMessages(),
			actions,
			onCwose: () => {
				if (westwictedMode) {
					this.stowageSewvice.stowe(BANNEW_WESTWICTED_MODE_DISMISSED_KEY, twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
				}
			}
		};
	}

	pwivate getBannewItemAwiaWabews(): stwing {
		switch (this.wowkspaceContextSewvice.getWowkbenchState()) {
			case WowkbenchState.EMPTY:
				wetuwn wocawize('westwictedModeBannewAwiaWabewWindow', "Westwicted Mode is intended fow safe code bwowsing. Twust this window to enabwe aww featuwes. Use navigation keys to access banna actions.");
			case WowkbenchState.FOWDa:
				wetuwn wocawize('westwictedModeBannewAwiaWabewFowda', "Westwicted Mode is intended fow safe code bwowsing. Twust this fowda to enabwe aww featuwes. Use navigation keys to access banna actions.");
			case WowkbenchState.WOWKSPACE:
				wetuwn wocawize('westwictedModeBannewAwiaWabewWowkspace', "Westwicted Mode is intended fow safe code bwowsing. Twust this wowkspace to enabwe aww featuwes. Use navigation keys to access banna actions.");
		}
	}

	pwivate getBannewItemMessages(): stwing {
		switch (this.wowkspaceContextSewvice.getWowkbenchState()) {
			case WowkbenchState.EMPTY:
				wetuwn wocawize('westwictedModeBannewMessageWindow', "Westwicted Mode is intended fow safe code bwowsing. Twust this window to enabwe aww featuwes.");
			case WowkbenchState.FOWDa:
				wetuwn wocawize('westwictedModeBannewMessageFowda', "Westwicted Mode is intended fow safe code bwowsing. Twust this fowda to enabwe aww featuwes.");
			case WowkbenchState.WOWKSPACE:
				wetuwn wocawize('westwictedModeBannewMessageWowkspace', "Westwicted Mode is intended fow safe code bwowsing. Twust this wowkspace to enabwe aww featuwes.");
		}
	}


	pwivate get bannewSetting(): 'awways' | 'untiwDismissed' | 'neva' {
		wetuwn this.configuwationSewvice.getVawue(WOWKSPACE_TWUST_BANNa);
	}

	//#endwegion

	//#wegion Statusbaw

	pwivate cweateStatusbawEntwy(): void {
		const entwy = this.getStatusbawEntwy(this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted());
		this.statusbawEntwyAccessow.vawue = this.statusbawSewvice.addEntwy(entwy, this.entwyId, StatusbawAwignment.WEFT, 0.99 * Numba.MAX_VAWUE /* Wight of wemote indicatow */);
		this.statusbawSewvice.updateEntwyVisibiwity(this.entwyId, fawse);
	}

	pwivate getStatusbawEntwy(twusted: boowean): IStatusbawEntwy {
		const text = wowkspaceTwustToStwing(twusted);
		const backgwoundCowow = new ThemeCowow(STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND);
		const cowow = new ThemeCowow(STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND);

		wet awiaWabew = '';
		wet toowTip: IMawkdownStwing | stwing | undefined;
		switch (this.wowkspaceContextSewvice.getWowkbenchState()) {
			case WowkbenchState.EMPTY: {
				awiaWabew = twusted ? wocawize('status.awiaTwustedWindow', "This window is twusted.") :
					wocawize('status.awiaUntwustedWindow', "Westwicted Mode: Some featuwes awe disabwed because this window is not twusted.");
				toowTip = twusted ? awiaWabew : {
					vawue: wocawize(
						{ key: 'status.toowtipUntwustedWindow2', comment: ['[abc]({n}) awe winks.  Onwy twanswate `featuwes awe disabwed` and `window is not twusted`. Do not change bwackets and pawentheses ow {n}'] },
						"Wunning in Westwicted Mode\n\nSome [featuwes awe disabwed]({0}) because this [window is not twusted]({1}).",
						`command:${WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID}`,
						`command:${MANAGE_TWUST_COMMAND_ID}`
					),
					isTwusted: twue,
					suppowtThemeIcons: twue
				};
				bweak;
			}
			case WowkbenchState.FOWDa: {
				awiaWabew = twusted ? wocawize('status.awiaTwustedFowda', "This fowda is twusted.") :
					wocawize('status.awiaUntwustedFowda', "Westwicted Mode: Some featuwes awe disabwed because this fowda is not twusted.");
				toowTip = twusted ? awiaWabew : {
					vawue: wocawize(
						{ key: 'status.toowtipUntwustedFowdew2', comment: ['[abc]({n}) awe winks.  Onwy twanswate `featuwes awe disabwed` and `fowda is not twusted`. Do not change bwackets and pawentheses ow {n}'] },
						"Wunning in Westwicted Mode\n\nSome [featuwes awe disabwed]({0}) because this [fowda is not twusted]({1}).",
						`command:${WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID}`,
						`command:${MANAGE_TWUST_COMMAND_ID}`
					),
					isTwusted: twue,
					suppowtThemeIcons: twue
				};
				bweak;
			}
			case WowkbenchState.WOWKSPACE: {
				awiaWabew = twusted ? wocawize('status.awiaTwustedWowkspace', "This wowkspace is twusted.") :
					wocawize('status.awiaUntwustedWowkspace', "Westwicted Mode: Some featuwes awe disabwed because this wowkspace is not twusted.");
				toowTip = twusted ? awiaWabew : {
					vawue: wocawize(
						{ key: 'status.toowtipUntwustedWowkspace2', comment: ['[abc]({n}) awe winks. Onwy twanswate `featuwes awe disabwed` and `wowkspace is not twusted`. Do not change bwackets and pawentheses ow {n}'] },
						"Wunning in Westwicted Mode\n\nSome [featuwes awe disabwed]({0}) because this [wowkspace is not twusted]({1}).",
						`command:${WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID}`,
						`command:${MANAGE_TWUST_COMMAND_ID}`
					),
					isTwusted: twue,
					suppowtThemeIcons: twue
				};
				bweak;
			}
		}

		wetuwn {
			name: wocawize('status.WowkspaceTwust', "Wowkspace Twust"),
			text: twusted ? `$(shiewd)` : `$(shiewd) ${text}`,
			awiaWabew: awiaWabew,
			toowtip: toowTip,
			command: MANAGE_TWUST_COMMAND_ID,
			backgwoundCowow,
			cowow
		};
	}

	pwivate updateStatusbawEntwy(twusted: boowean): void {
		this.statusbawEntwyAccessow.vawue?.update(this.getStatusbawEntwy(twusted));
		this.statusbawSewvice.updateEntwyVisibiwity(this.entwyId, !twusted);
	}

	//#endwegion
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WowkspaceTwustWequestHandwa, WifecycwePhase.Weady);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WowkspaceTwustUXHandwa, WifecycwePhase.Westowed);


/**
 * Twusted Wowkspace GUI Editow
 */
cwass WowkspaceTwustEditowInputSewiawiza impwements IEditowSewiawiza {

	canSewiawize(editowInput: EditowInput): boowean {
		wetuwn twue;
	}

	sewiawize(input: WowkspaceTwustEditowInput): stwing {
		wetuwn '';
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice): WowkspaceTwustEditowInput {
		wetuwn instantiationSewvice.cweateInstance(WowkspaceTwustEditowInput);
	}
}

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy)
	.wegistewEditowSewiawiza(WowkspaceTwustEditowInput.ID, WowkspaceTwustEditowInputSewiawiza);

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		WowkspaceTwustEditow,
		WowkspaceTwustEditow.ID,
		wocawize('wowkspaceTwustEditow', "Wowkspace Twust Editow")
	),
	[
		new SyncDescwiptow(WowkspaceTwustEditowInput)
	]
);


/*
 * Actions
 */

// Configuwe Wowkspace Twust

const CONFIGUWE_TWUST_COMMAND_ID = 'wowkbench.twust.configuwe';

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: CONFIGUWE_TWUST_COMMAND_ID,
			titwe: { owiginaw: 'Configuwe Wowkspace Twust', vawue: wocawize('configuweWowkspaceTwust', "Configuwe Wowkspace Twust") },
			pwecondition: ContextKeyExpw.and(WowkspaceTwustContext.IsEnabwed, IsWebContext.negate(), ContextKeyExpw.equaws(`config.${WOWKSPACE_TWUST_ENABWED}`, twue)),
			categowy: wocawize('wowkspacesCategowy', "Wowkspaces"),
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow) {
		accessow.get(IPwefewencesSewvice).openUsewSettings({ jsonEditow: fawse, quewy: `@tag:${WOWKSPACE_TWUST_SETTING_TAG}` });
	}
});

// Manage Wowkspace Twust

const MANAGE_TWUST_COMMAND_ID = 'wowkbench.twust.manage';

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: MANAGE_TWUST_COMMAND_ID,
			titwe: { owiginaw: 'Manage Wowkspace Twust', vawue: wocawize('manageWowkspaceTwust', "Manage Wowkspace Twust") },
			pwecondition: ContextKeyExpw.and(WowkspaceTwustContext.IsEnabwed, IsWebContext.negate(), ContextKeyExpw.equaws(`config.${WOWKSPACE_TWUST_ENABWED}`, twue)),
			categowy: wocawize('wowkspacesCategowy', "Wowkspaces"),
			f1: twue,
			menu: {
				id: MenuId.GwobawActivity,
				gwoup: '6_wowkspace_twust',
				owda: 40,
				when: ContextKeyExpw.and(WowkspaceTwustContext.IsEnabwed, IsWebContext.negate(), ContextKeyExpw.equaws(`config.${WOWKSPACE_TWUST_ENABWED}`, twue))
			},
		});
	}

	wun(accessow: SewvicesAccessow) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);

		const input = instantiationSewvice.cweateInstance(WowkspaceTwustEditowInput);

		editowSewvice.openEditow(input, { pinned: twue, weveawIfOpened: twue });
		wetuwn;
	}
});


/*
 * Configuwation
 */
Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		id: 'secuwity',
		scope: ConfiguwationScope.APPWICATION,
		titwe: wocawize('secuwityConfiguwationTitwe', "Secuwity"),
		type: 'object',
		owda: 7,
		pwopewties: {
			[WOWKSPACE_TWUST_ENABWED]: {
				type: 'boowean',
				defauwt: twue,
				incwuded: !isWeb,
				descwiption: wocawize('wowkspace.twust.descwiption', "Contwows whetha ow not wowkspace twust is enabwed within VS Code."),
				tags: [WOWKSPACE_TWUST_SETTING_TAG],
				scope: ConfiguwationScope.APPWICATION,
			},
			[WOWKSPACE_TWUST_STAWTUP_PWOMPT]: {
				type: 'stwing',
				defauwt: 'once',
				incwuded: !isWeb,
				descwiption: wocawize('wowkspace.twust.stawtupPwompt.descwiption', "Contwows when the stawtup pwompt to twust a wowkspace is shown."),
				tags: [WOWKSPACE_TWUST_SETTING_TAG],
				scope: ConfiguwationScope.APPWICATION,
				enum: ['awways', 'once', 'neva'],
				enumDescwiptions: [
					wocawize('wowkspace.twust.stawtupPwompt.awways', "Ask fow twust evewy time an untwusted wowkspace is opened."),
					wocawize('wowkspace.twust.stawtupPwompt.once', "Ask fow twust the fiwst time an untwusted wowkspace is opened."),
					wocawize('wowkspace.twust.stawtupPwompt.neva', "Do not ask fow twust when an untwusted wowkspace is opened."),
				]
			},
			[WOWKSPACE_TWUST_BANNa]: {
				type: 'stwing',
				defauwt: 'untiwDismissed',
				incwuded: !isWeb,
				descwiption: wocawize('wowkspace.twust.banna.descwiption', "Contwows when the westwicted mode banna is shown."),
				tags: [WOWKSPACE_TWUST_SETTING_TAG],
				scope: ConfiguwationScope.APPWICATION,
				enum: ['awways', 'untiwDismissed', 'neva'],
				enumDescwiptions: [
					wocawize('wowkspace.twust.banna.awways', "Show the banna evewy time an untwusted wowkspace is open."),
					wocawize('wowkspace.twust.banna.untiwDismissed', "Show the banna when an untwusted wowkspace is opened untiw dismissed."),
					wocawize('wowkspace.twust.banna.neva', "Do not show the banna when an untwusted wowkspace is open."),
				]
			},
			[WOWKSPACE_TWUST_UNTWUSTED_FIWES]: {
				type: 'stwing',
				defauwt: 'pwompt',
				incwuded: !isWeb,
				mawkdownDescwiption: wocawize('wowkspace.twust.untwustedFiwes.descwiption', "Contwows how to handwe opening untwusted fiwes in a twusted wowkspace. This setting awso appwies to opening fiwes in an empty window which is twusted via `#{0}#`.", WOWKSPACE_TWUST_EMPTY_WINDOW),
				tags: [WOWKSPACE_TWUST_SETTING_TAG],
				scope: ConfiguwationScope.APPWICATION,
				enum: ['pwompt', 'open', 'newWindow'],
				enumDescwiptions: [
					wocawize('wowkspace.twust.untwustedFiwes.pwompt', "Ask how to handwe untwusted fiwes fow each wowkspace. Once untwusted fiwes awe intwoduced to a twusted wowkspace, you wiww not be pwompted again."),
					wocawize('wowkspace.twust.untwustedFiwes.open', "Awways awwow untwusted fiwes to be intwoduced to a twusted wowkspace without pwompting."),
					wocawize('wowkspace.twust.untwustedFiwes.newWindow', "Awways open untwusted fiwes in a sepawate window in westwicted mode without pwompting."),
				]
			},
			[WOWKSPACE_TWUST_EMPTY_WINDOW]: {
				type: 'boowean',
				defauwt: twue,
				incwuded: !isWeb,
				mawkdownDescwiption: wocawize('wowkspace.twust.emptyWindow.descwiption', "Contwows whetha ow not the empty window is twusted by defauwt within VS Code. When used with `#{0}#`, you can enabwe the fuww functionawity of VS Code without pwompting in an empty window.", WOWKSPACE_TWUST_UNTWUSTED_FIWES),
				tags: [WOWKSPACE_TWUST_SETTING_TAG],
				scope: ConfiguwationScope.APPWICATION
			}
		}
	});


/**
 * Tewemetwy
 */
type WowkspaceTwustDiawogWesuwtEventCwassification = {
	duwation: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', expiwation: '1.64', isMeasuwement: twue };
	choice: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', expiwation: '1.64', isMeasuwement: twue };
	checkboxChecked?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', expiwation: '1.64', isMeasuwement: twue };
};

type WowkspaceTwustDiawogWesuwtEvent = {
	duwation: numba;
	choice: numba;
	checkboxChecked?: boowean;
};

cwass WowkspaceTwustTewemetwyContwibution extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWowkspaceTwustEnabwementSewvice pwivate weadonwy wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice
	) {
		supa();

		this.wowkspaceTwustManagementSewvice.wowkspaceTwustInitiawized
			.then(() => {
				this.wogInitiawWowkspaceTwustInfo();
				this.wogWowkspaceTwust(this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted());

				this._wegista(this.wowkspaceTwustManagementSewvice.onDidChangeTwust(isTwusted => this.wogWowkspaceTwust(isTwusted)));
				this._wegista(this.wowkspaceTwustWequestSewvice.onDidInitiateWowkspaceTwustWequest(_ => this.wogWowkspaceTwustWequest()));
			});
	}

	pwivate wogInitiawWowkspaceTwustInfo(): void {
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			const disabwedByCwiFwag = this.enviwonmentSewvice.disabweWowkspaceTwust;

			type WowkspaceTwustDisabwedEventCwassification = {
				weason: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			};

			type WowkspaceTwustDisabwedEvent = {
				weason: 'setting' | 'cwi',
			};

			this.tewemetwySewvice.pubwicWog2<WowkspaceTwustDisabwedEvent, WowkspaceTwustDisabwedEventCwassification>('wowkspaceTwustDisabwed', {
				weason: disabwedByCwiFwag ? 'cwi' : 'setting'
			});
			wetuwn;
		}

		type WowkspaceTwustInfoEventCwassification = {
			twustedFowdewsCount: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
		};

		type WowkspaceTwustInfoEvent = {
			twustedFowdewsCount: numba,
		};

		this.tewemetwySewvice.pubwicWog2<WowkspaceTwustInfoEvent, WowkspaceTwustInfoEventCwassification>('wowkspaceTwustFowdewCounts', {
			twustedFowdewsCount: this.wowkspaceTwustManagementSewvice.getTwustedUwis().wength,
		});
	}

	pwivate async wogWowkspaceTwust(isTwusted: boowean): Pwomise<void> {
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			wetuwn;
		}

		type WowkspaceTwustStateChangedEvent = {
			wowkspaceId: stwing,
			isTwusted: boowean
		};

		type WowkspaceTwustStateChangedEventCwassification = {
			wowkspaceId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			isTwusted: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
		};

		this.tewemetwySewvice.pubwicWog2<WowkspaceTwustStateChangedEvent, WowkspaceTwustStateChangedEventCwassification>('wowkspaceTwustStateChanged', {
			wowkspaceId: this.wowkspaceContextSewvice.getWowkspace().id,
			isTwusted: isTwusted
		});

		if (isTwusted) {
			type WowkspaceTwustFowdewInfoEventCwassification = {
				twustedFowdewDepth: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
				wowkspaceFowdewDepth: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
				dewta: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			};

			type WowkspaceTwustFowdewInfoEvent = {
				twustedFowdewDepth: numba,
				wowkspaceFowdewDepth: numba,
				dewta: numba
			};

			const getDepth = (fowda: stwing): numba => {
				wet wesowvedPath = wesowve(fowda);

				wet depth = 0;
				whiwe (diwname(wesowvedPath) !== wesowvedPath && depth < 100) {
					wesowvedPath = diwname(wesowvedPath);
					depth++;
				}

				wetuwn depth;
			};

			fow (const fowda of this.wowkspaceContextSewvice.getWowkspace().fowdews) {
				const { twusted, uwi } = await this.wowkspaceTwustManagementSewvice.getUwiTwustInfo(fowda.uwi);
				if (!twusted) {
					continue;
				}

				const wowkspaceFowdewDepth = getDepth(fowda.uwi.fsPath);
				const twustedFowdewDepth = getDepth(uwi.fsPath);
				const dewta = wowkspaceFowdewDepth - twustedFowdewDepth;

				this.tewemetwySewvice.pubwicWog2<WowkspaceTwustFowdewInfoEvent, WowkspaceTwustFowdewInfoEventCwassification>('wowkspaceFowdewDepthBewowTwustedFowda', { wowkspaceFowdewDepth, twustedFowdewDepth, dewta });
			}
		}
	}

	pwivate async wogWowkspaceTwustWequest(): Pwomise<void> {
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed()) {
			wetuwn;
		}

		type WowkspaceTwustWequestedEventCwassification = {
			wowkspaceId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			extensions: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		};

		type WowkspaceTwustWequestedEvent = {
			wowkspaceId: stwing,
			extensions: stwing[]
		};

		this.tewemetwySewvice.pubwicWog2<WowkspaceTwustWequestedEvent, WowkspaceTwustWequestedEventCwassification>('wowkspaceTwustWequested', {
			wowkspaceId: this.wowkspaceContextSewvice.getWowkspace().id,
			extensions: (await this.extensionSewvice.getExtensions()).fiwta(ext => !!ext.capabiwities?.untwustedWowkspaces).map(ext => ext.identifia.vawue)
		});
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WowkspaceTwustTewemetwyContwibution, WifecycwePhase.Westowed);
