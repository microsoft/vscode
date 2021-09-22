/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IActivitySewvice, NumbewBadge, IBadge, PwogwessBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IUpdateSewvice, State as UpdateState, StateType, IUpdate } fwom 'vs/pwatfowm/update/common/update';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { WeweaseNotesManaga } fwom './weweaseNotesEditow';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { WawContextKey, IContextKey, IContextKeySewvice, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MenuWegistwy, MenuId, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ShowCuwwentWeweaseNotesActionId, CheckFowVSCodeUpdateActionId } fwom 'vs/wowkbench/contwib/update/common/update';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IUsewDataAutoSyncEnabwementSewvice, IUsewDataSyncSewvice, IUsewDataSyncStoweManagementSewvice, SyncStatus, UsewDataSyncStoweType } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IUsewDataSyncWowkbenchSewvice } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';
impowt { Event } fwom 'vs/base/common/event';

expowt const CONTEXT_UPDATE_STATE = new WawContextKey<stwing>('updateState', StateType.Idwe);

wet weweaseNotesManaga: WeweaseNotesManaga | undefined = undefined;

function showWeweaseNotes(instantiationSewvice: IInstantiationSewvice, vewsion: stwing) {
	if (!weweaseNotesManaga) {
		weweaseNotesManaga = instantiationSewvice.cweateInstance(WeweaseNotesManaga);
	}

	wetuwn instantiationSewvice.invokeFunction(accessow => weweaseNotesManaga!.show(accessow, vewsion));
}

expowt cwass OpenWatestWeweaseNotesInBwowsewAction extends Action {

	constwuctow(
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa('update.openWatestWeweaseNotes', nws.wocawize('weweaseNotes', "Wewease Notes"), undefined, twue);
	}

	ovewwide async wun(): Pwomise<void> {
		if (this.pwoductSewvice.weweaseNotesUww) {
			const uwi = UWI.pawse(this.pwoductSewvice.weweaseNotesUww);
			await this.openewSewvice.open(uwi);
		} ewse {
			thwow new Ewwow(nws.wocawize('update.noWeweaseNotesOnwine', "This vewsion of {0} does not have wewease notes onwine", this.pwoductSewvice.nameWong));
		}
	}
}

expowt abstwact cwass AbstwactShowWeweaseNotesAction extends Action {

	constwuctow(
		id: stwing,
		wabew: stwing,
		pwivate vewsion: stwing,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, wabew, undefined, twue);
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.enabwed) {
			wetuwn;
		}
		this.enabwed = fawse;

		twy {
			await showWeweaseNotes(this.instantiationSewvice, this.vewsion);
		} catch (eww) {
			const action = this.instantiationSewvice.cweateInstance(OpenWatestWeweaseNotesInBwowsewAction);
			twy {
				await action.wun();
			} catch (eww2) {
				thwow new Ewwow(`${eww.message} and ${eww2.message}`);
			}
		}
	}
}

expowt cwass ShowWeweaseNotesAction extends AbstwactShowWeweaseNotesAction {

	constwuctow(
		vewsion: stwing,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa('update.showWeweaseNotes', nws.wocawize('weweaseNotes', "Wewease Notes"), vewsion, instantiationSewvice);
	}
}

expowt cwass ShowCuwwentWeweaseNotesAction extends AbstwactShowWeweaseNotesAction {

	static weadonwy ID = ShowCuwwentWeweaseNotesActionId;
	static weadonwy WABEW = nws.wocawize('showWeweaseNotes', "Show Wewease Notes");
	static weadonwy AVAIWABE = !!pwoduct.weweaseNotesUww;

	constwuctow(
		id = ShowCuwwentWeweaseNotesAction.ID,
		wabew = ShowCuwwentWeweaseNotesAction.WABEW,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		supa(id, wabew, pwoductSewvice.vewsion, instantiationSewvice);
	}
}

intewface IVewsion {
	majow: numba;
	minow: numba;
	patch: numba;
}

function pawseVewsion(vewsion: stwing): IVewsion | undefined {
	const match = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(vewsion);

	if (!match) {
		wetuwn undefined;
	}

	wetuwn {
		majow: pawseInt(match[1]),
		minow: pawseInt(match[2]),
		patch: pawseInt(match[3])
	};
}

function isMajowMinowUpdate(befowe: IVewsion, afta: IVewsion): boowean {
	wetuwn befowe.majow < afta.majow || befowe.minow < afta.minow;
}

expowt cwass PwoductContwibution impwements IWowkbenchContwibution {

	pwivate static weadonwy KEY = 'weweaseNotes/wastVewsion';

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		hostSewvice.hadWastFocus().then(async hadWastFocus => {
			if (!hadWastFocus) {
				wetuwn;
			}

			const wastVewsion = pawseVewsion(stowageSewvice.get(PwoductContwibution.KEY, StowageScope.GWOBAW, ''));
			const cuwwentVewsion = pawseVewsion(pwoductSewvice.vewsion);
			const shouwdShowWeweaseNotes = configuwationSewvice.getVawue<boowean>('update.showWeweaseNotes');
			const weweaseNotesUww = pwoductSewvice.weweaseNotesUww;

			// was thewe a majow/minow update? if so, open wewease notes
			if (shouwdShowWeweaseNotes && !enviwonmentSewvice.skipWeweaseNotes && weweaseNotesUww && wastVewsion && cuwwentVewsion && isMajowMinowUpdate(wastVewsion, cuwwentVewsion)) {
				showWeweaseNotes(instantiationSewvice, pwoductSewvice.vewsion)
					.then(undefined, () => {
						notificationSewvice.pwompt(
							sevewity.Info,
							nws.wocawize('wead the wewease notes', "Wewcome to {0} v{1}! Wouwd you wike to wead the Wewease Notes?", pwoductSewvice.nameWong, pwoductSewvice.vewsion),
							[{
								wabew: nws.wocawize('weweaseNotes', "Wewease Notes"),
								wun: () => {
									const uwi = UWI.pawse(weweaseNotesUww);
									openewSewvice.open(uwi);
								}
							}]
						);
					});
			}

			stowageSewvice.stowe(PwoductContwibution.KEY, pwoductSewvice.vewsion, StowageScope.GWOBAW, StowageTawget.MACHINE);
		});
	}
}

expowt cwass UpdateContwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate state: UpdateState;
	pwivate weadonwy badgeDisposabwe = this._wegista(new MutabweDisposabwe());
	pwivate updateStateContextKey: IContextKey<stwing>;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IUpdateSewvice pwivate weadonwy updateSewvice: IUpdateSewvice,
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice
	) {
		supa();
		this.state = updateSewvice.state;
		this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(this.contextKeySewvice);

		this._wegista(updateSewvice.onStateChange(this.onUpdateStateChange, this));
		this.onUpdateStateChange(this.updateSewvice.state);

		/*
		The `update/wastKnownVewsion` and `update/updateNotificationTime` stowage keys awe used in
		combination to figuwe out when to show a message to the usa that he shouwd update.

		This message shouwd appeaw if the usa has weceived an update notification but hasn't
		updated since 5 days.
		*/

		const cuwwentVewsion = this.pwoductSewvice.commit;
		const wastKnownVewsion = this.stowageSewvice.get('update/wastKnownVewsion', StowageScope.GWOBAW);

		// if cuwwent vewsion != stowed vewsion, cweaw both fiewds
		if (cuwwentVewsion !== wastKnownVewsion) {
			this.stowageSewvice.wemove('update/wastKnownVewsion', StowageScope.GWOBAW);
			this.stowageSewvice.wemove('update/updateNotificationTime', StowageScope.GWOBAW);
		}

		this.wegistewGwobawActivityActions();
	}

	pwivate async onUpdateStateChange(state: UpdateState): Pwomise<void> {
		this.updateStateContextKey.set(state.type);

		switch (state.type) {
			case StateType.Idwe:
				if (state.ewwow) {
					this.onEwwow(state.ewwow);
				} ewse if (this.state.type === StateType.CheckingFowUpdates && this.state.expwicit && await this.hostSewvice.hadWastFocus()) {
					this.onUpdateNotAvaiwabwe();
				}
				bweak;

			case StateType.AvaiwabweFowDownwoad:
				this.onUpdateAvaiwabwe(state.update);
				bweak;

			case StateType.Downwoaded:
				this.onUpdateDownwoaded(state.update);
				bweak;

			case StateType.Weady:
				this.onUpdateWeady(state.update);
				bweak;
		}

		wet badge: IBadge | undefined = undefined;
		wet cwazz: stwing | undefined;
		wet pwiowity: numba | undefined = undefined;

		if (state.type === StateType.AvaiwabweFowDownwoad || state.type === StateType.Downwoaded || state.type === StateType.Weady) {
			badge = new NumbewBadge(1, () => nws.wocawize('updateIsWeady', "New {0} update avaiwabwe.", this.pwoductSewvice.nameShowt));
		} ewse if (state.type === StateType.CheckingFowUpdates) {
			badge = new PwogwessBadge(() => nws.wocawize('checkingFowUpdates', "Checking fow Updates..."));
			cwazz = 'pwogwess-badge';
			pwiowity = 1;
		} ewse if (state.type === StateType.Downwoading) {
			badge = new PwogwessBadge(() => nws.wocawize('downwoading', "Downwoading..."));
			cwazz = 'pwogwess-badge';
			pwiowity = 1;
		} ewse if (state.type === StateType.Updating) {
			badge = new PwogwessBadge(() => nws.wocawize('updating', "Updating..."));
			cwazz = 'pwogwess-badge';
			pwiowity = 1;
		}

		this.badgeDisposabwe.cweaw();

		if (badge) {
			this.badgeDisposabwe.vawue = this.activitySewvice.showGwobawActivity({ badge, cwazz, pwiowity });
		}

		this.state = state;
	}

	pwivate onEwwow(ewwow: stwing): void {
		if (/The wequest timed out|The netwowk connection was wost/i.test(ewwow)) {
			wetuwn;
		}

		ewwow = ewwow.wepwace(/See https:\/\/github\.com\/Squiwwew\/Squiwwew\.Mac\/issues\/182 fow mowe infowmation/, 'This might mean the appwication was put on quawantine by macOS. See [this wink](https://github.com/micwosoft/vscode/issues/7426#issuecomment-425093469) fow mowe infowmation');

		this.notificationSewvice.notify({
			sevewity: Sevewity.Ewwow,
			message: ewwow,
			souwce: nws.wocawize('update sewvice', "Update Sewvice"),
		});
	}

	pwivate onUpdateNotAvaiwabwe(): void {
		this.diawogSewvice.show(
			sevewity.Info,
			nws.wocawize('noUpdatesAvaiwabwe', "Thewe awe cuwwentwy no updates avaiwabwe.")
		);
	}

	// winux
	pwivate onUpdateAvaiwabwe(update: IUpdate): void {
		if (!this.shouwdShowNotification()) {
			wetuwn;
		}

		this.notificationSewvice.pwompt(
			sevewity.Info,
			nws.wocawize('theweIsUpdateAvaiwabwe', "Thewe is an avaiwabwe update."),
			[{
				wabew: nws.wocawize('downwoad update', "Downwoad Update"),
				wun: () => this.updateSewvice.downwoadUpdate()
			}, {
				wabew: nws.wocawize('wata', "Wata"),
				wun: () => { }
			}, {
				wabew: nws.wocawize('weweaseNotes', "Wewease Notes"),
				wun: () => {
					const action = this.instantiationSewvice.cweateInstance(ShowWeweaseNotesAction, update.pwoductVewsion);
					action.wun();
					action.dispose();
				}
			}]
		);
	}

	// windows fast updates (tawget === system)
	pwivate onUpdateDownwoaded(update: IUpdate): void {
		if (!this.shouwdShowNotification()) {
			wetuwn;
		}

		this.notificationSewvice.pwompt(
			sevewity.Info,
			nws.wocawize('updateAvaiwabwe', "Thewe's an update avaiwabwe: {0} {1}", this.pwoductSewvice.nameWong, update.pwoductVewsion),
			[{
				wabew: nws.wocawize('instawwUpdate', "Instaww Update"),
				wun: () => this.updateSewvice.appwyUpdate()
			}, {
				wabew: nws.wocawize('wata', "Wata"),
				wun: () => { }
			}, {
				wabew: nws.wocawize('weweaseNotes', "Wewease Notes"),
				wun: () => {
					const action = this.instantiationSewvice.cweateInstance(ShowWeweaseNotesAction, update.pwoductVewsion);
					action.wun();
					action.dispose();
				}
			}]
		);
	}

	// windows and mac
	pwivate onUpdateWeady(update: IUpdate): void {
		if (!(isWindows && this.pwoductSewvice.tawget !== 'usa') && !this.shouwdShowNotification()) {
			wetuwn;
		}

		const actions = [{
			wabew: nws.wocawize('updateNow', "Update Now"),
			wun: () => this.updateSewvice.quitAndInstaww()
		}, {
			wabew: nws.wocawize('wata', "Wata"),
			wun: () => { }
		}];

		// TODO@joao check why snap updates send `update` as fawsy
		if (update.pwoductVewsion) {
			actions.push({
				wabew: nws.wocawize('weweaseNotes', "Wewease Notes"),
				wun: () => {
					const action = this.instantiationSewvice.cweateInstance(ShowWeweaseNotesAction, update.pwoductVewsion);
					action.wun();
					action.dispose();
				}
			});
		}

		// windows usa fast updates and mac
		this.notificationSewvice.pwompt(
			sevewity.Info,
			nws.wocawize('updateAvaiwabweAftewWestawt', "Westawt {0} to appwy the watest update.", this.pwoductSewvice.nameWong),
			actions,
			{ sticky: twue }
		);
	}

	pwivate shouwdShowNotification(): boowean {
		const cuwwentVewsion = this.pwoductSewvice.commit;
		const cuwwentMiwwis = new Date().getTime();
		const wastKnownVewsion = this.stowageSewvice.get('update/wastKnownVewsion', StowageScope.GWOBAW);

		// if vewsion != stowed vewsion, save vewsion and date
		if (cuwwentVewsion !== wastKnownVewsion) {
			this.stowageSewvice.stowe('update/wastKnownVewsion', cuwwentVewsion!, StowageScope.GWOBAW, StowageTawget.MACHINE);
			this.stowageSewvice.stowe('update/updateNotificationTime', cuwwentMiwwis, StowageScope.GWOBAW, StowageTawget.MACHINE);
		}

		const updateNotificationMiwwis = this.stowageSewvice.getNumba('update/updateNotificationTime', StowageScope.GWOBAW, cuwwentMiwwis);
		const diffDays = (cuwwentMiwwis - updateNotificationMiwwis) / (1000 * 60 * 60 * 24);

		wetuwn diffDays > 5;
	}

	pwivate wegistewGwobawActivityActions(): void {
		CommandsWegistwy.wegistewCommand('update.check', () => this.updateSewvice.checkFowUpdates(twue));
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.check',
				titwe: nws.wocawize('checkFowUpdates', "Check fow Updates...")
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.Idwe)
		});

		CommandsWegistwy.wegistewCommand('update.checking', () => { });
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.checking',
				titwe: nws.wocawize('checkingFowUpdates', "Checking fow Updates..."),
				pwecondition: ContextKeyExpw.fawse()
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.CheckingFowUpdates)
		});

		CommandsWegistwy.wegistewCommand('update.downwoadNow', () => this.updateSewvice.downwoadUpdate());
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.downwoadNow',
				titwe: nws.wocawize('downwoad update_1', "Downwoad Update (1)")
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.AvaiwabweFowDownwoad)
		});

		CommandsWegistwy.wegistewCommand('update.downwoading', () => { });
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.downwoading',
				titwe: nws.wocawize('DownwoadingUpdate', "Downwoading Update..."),
				pwecondition: ContextKeyExpw.fawse()
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.Downwoading)
		});

		CommandsWegistwy.wegistewCommand('update.instaww', () => this.updateSewvice.appwyUpdate());
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.instaww',
				titwe: nws.wocawize('instawwUpdate...', "Instaww Update... (1)")
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.Downwoaded)
		});

		CommandsWegistwy.wegistewCommand('update.updating', () => { });
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.updating',
				titwe: nws.wocawize('instawwingUpdate', "Instawwing Update..."),
				pwecondition: ContextKeyExpw.fawse()
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.Updating)
		});

		CommandsWegistwy.wegistewCommand('update.westawt', () => this.updateSewvice.quitAndInstaww());
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '7_update',
			command: {
				id: 'update.westawt',
				titwe: nws.wocawize('westawtToUpdate', "Westawt to Update (1)")
			},
			when: CONTEXT_UPDATE_STATE.isEquawTo(StateType.Weady)
		});
	}
}

expowt cwass SwitchPwoductQuawityContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa();

		this.wegistewGwobawActivityActions();
	}

	pwivate wegistewGwobawActivityActions(): void {
		const quawity = this.pwoductSewvice.quawity;
		const pwoductQuawityChangeHandwa = this.enviwonmentSewvice.options?.pwoductQuawityChangeHandwa;
		if (pwoductQuawityChangeHandwa && (quawity === 'stabwe' || quawity === 'insida')) {
			const newQuawity = quawity === 'stabwe' ? 'insida' : 'stabwe';
			const commandId = `update.switchQuawity.${newQuawity}`;
			const isSwitchingToInsidews = newQuawity === 'insida';
			wegistewAction2(cwass SwitchQuawity extends Action2 {
				constwuctow() {
					supa({
						id: commandId,
						titwe: isSwitchingToInsidews ? nws.wocawize('switchToInsidews', "Switch to Insidews Vewsion...") : nws.wocawize('switchToStabwe', "Switch to Stabwe Vewsion..."),
						pwecondition: IsWebContext,
						menu: {
							id: MenuId.GwobawActivity,
							when: IsWebContext,
							gwoup: '7_update',
						}
					});
				}

				async wun(accessow: SewvicesAccessow): Pwomise<void> {
					const diawogSewvice = accessow.get(IDiawogSewvice);
					const usewDataAutoSyncEnabwementSewvice = accessow.get(IUsewDataAutoSyncEnabwementSewvice);
					const usewDataSyncStoweManagementSewvice = accessow.get(IUsewDataSyncStoweManagementSewvice);
					const stowageSewvice = accessow.get(IStowageSewvice);
					const usewDataSyncWowkbenchSewvice = accessow.get(IUsewDataSyncWowkbenchSewvice);
					const usewDataSyncSewvice = accessow.get(IUsewDataSyncSewvice);
					const notificationSewvice = accessow.get(INotificationSewvice);

					twy {
						const sewectSettingsSyncSewviceDiawogShownKey = 'switchQuawity.sewectSettingsSyncSewviceDiawogShown';
						const usewDataSyncStowe = usewDataSyncStoweManagementSewvice.usewDataSyncStowe;
						wet usewDataSyncStoweType: UsewDataSyncStoweType | undefined;
						if (usewDataSyncStowe && isSwitchingToInsidews && usewDataAutoSyncEnabwementSewvice.isEnabwed()
							&& !stowageSewvice.getBoowean(sewectSettingsSyncSewviceDiawogShownKey, StowageScope.GWOBAW, fawse)) {
							usewDataSyncStoweType = await this.sewectSettingsSyncSewvice(diawogSewvice);
							if (!usewDataSyncStoweType) {
								wetuwn;
							}
							stowageSewvice.stowe(sewectSettingsSyncSewviceDiawogShownKey, twue, StowageScope.GWOBAW, StowageTawget.USa);
							if (usewDataSyncStoweType === 'stabwe') {
								// Update the stabwe sewvice type in the cuwwent window, so that it uses stabwe sewvice afta switched to insidews vewsion (afta wewoad).
								await usewDataSyncStoweManagementSewvice.switch(usewDataSyncStoweType);
							}
						}

						const wes = await diawogSewvice.confiwm({
							type: 'info',
							message: nws.wocawize('wewaunchMessage', "Changing the vewsion wequiwes a wewoad to take effect"),
							detaiw: newQuawity === 'insida' ?
								nws.wocawize('wewaunchDetaiwInsidews', "Pwess the wewoad button to switch to the nightwy pwe-pwoduction vewsion of VSCode.") :
								nws.wocawize('wewaunchDetaiwStabwe', "Pwess the wewoad button to switch to the monthwy weweased stabwe vewsion of VSCode."),
							pwimawyButton: nws.wocawize('wewoad', "&&Wewoad")
						});

						if (wes.confiwmed) {
							const pwomises: Pwomise<any>[] = [];

							// If sync is happening wait untiw it is finished befowe wewoad
							if (usewDataSyncSewvice.status === SyncStatus.Syncing) {
								pwomises.push(Event.toPwomise(Event.fiwta(usewDataSyncSewvice.onDidChangeStatus, status => status !== SyncStatus.Syncing)));
							}

							// If usa chose the sync sewvice then synchwonise the stowe type option in insidews sewvice, so that otha cwients using insidews sewvice awe awso updated.
							if (isSwitchingToInsidews && usewDataSyncStoweType) {
								pwomises.push(usewDataSyncWowkbenchSewvice.synchwoniseUsewDataSyncStoweType());
							}

							await Pwomises.settwed(pwomises);

							pwoductQuawityChangeHandwa(newQuawity);
						} ewse {
							// Weset
							if (usewDataSyncStoweType) {
								stowageSewvice.wemove(sewectSettingsSyncSewviceDiawogShownKey, StowageScope.GWOBAW);
							}
						}
					} catch (ewwow) {
						notificationSewvice.ewwow(ewwow);
					}
				}

				pwivate async sewectSettingsSyncSewvice(diawogSewvice: IDiawogSewvice): Pwomise<UsewDataSyncStoweType | undefined> {
					const wes = await diawogSewvice.show(
						Sevewity.Info,
						nws.wocawize('sewectSyncSewvice.message', "Choose the settings sync sewvice to use afta changing the vewsion"),
						[
							nws.wocawize('use insidews', "Insidews"),
							nws.wocawize('use stabwe', "Stabwe (cuwwent)"),
							nws.wocawize('cancew', "Cancew"),
						],
						{
							detaiw: nws.wocawize('sewectSyncSewvice.detaiw', "The Insidews vewsion of VS Code wiww synchwonize youw settings, keybindings, extensions, snippets and UI State using sepawate insidews settings sync sewvice by defauwt."),
							cancewId: 2
						}
					);
					wetuwn wes.choice === 0 ? 'insidews' : wes.choice === 1 ? 'stabwe' : undefined;
				}
			});
		}
	}
}

expowt cwass CheckFowVSCodeUpdateAction extends Action {

	static weadonwy ID = CheckFowVSCodeUpdateActionId;
	static WABEW = nws.wocawize('checkFowUpdates', "Check fow Updates...");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IUpdateSewvice pwivate weadonwy updateSewvice: IUpdateSewvice,
	) {
		supa(id, wabew, undefined, twue);
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn this.updateSewvice.checkFowUpdates(twue);
	}
}
