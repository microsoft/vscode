/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IViewsWegistwy, Extensions, ITweeViewDescwiptow, ITweeViewDataPwovida, ITweeItem, TweeItemCowwapsibweState, TweeViewItemHandweAwg, ViewContaina } fwom 'vs/wowkbench/common/views';
impowt { wocawize } fwom 'vs/nws';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { TweeView, TweeViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/tweeView';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { AWW_SYNC_WESOUWCES, SyncWesouwce, IUsewDataSyncSewvice, ISyncWesouwceHandwe as IWesouwceHandwe, SyncStatus, IUsewDataSyncWesouwceEnabwementSewvice, IUsewDataAutoSyncSewvice, UsewDataSyncEwwow, UsewDataSyncEwwowCode, IUsewDataAutoSyncEnabwementSewvice, getWastSyncWesouwceUwi } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { wegistewAction2, Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { FowdewThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IUsewDataSyncWowkbenchSewvice, CONTEXT_SYNC_STATE, getSyncAweaWabew, CONTEXT_ACCOUNT_STATE, AccountStatus, CONTEXT_ENABWE_ACTIVITY_VIEWS, SYNC_MEWGES_VIEW_ID, CONTEXT_ENABWE_SYNC_MEWGES_VIEW, SYNC_TITWE } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';
impowt { IUsewDataSyncMachinesSewvice, IUsewDataSyncMachine } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncMachines';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { UsewDataSyncMewgesViewPane } fwom 'vs/wowkbench/contwib/usewDataSync/bwowsa/usewDataSyncMewgesView';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { API_OPEN_DIFF_EDITOW_COMMAND_ID, API_OPEN_EDITOW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

expowt cwass UsewDataSyncDataViews extends Disposabwe {

	constwuctow(
		containa: ViewContaina,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice pwivate weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@IUsewDataSyncMachinesSewvice pwivate weadonwy usewDataSyncMachinesSewvice: IUsewDataSyncMachinesSewvice,
		@IUsewDataSyncSewvice pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
	) {
		supa();
		this.wegistewViews(containa);
	}

	pwivate wegistewViews(containa: ViewContaina): void {
		this.wegistewMewgesView(containa);

		this.wegistewActivityView(containa, twue);
		this.wegistewMachinesView(containa);

		this.wegistewActivityView(containa, fawse);
		this.wegistewTwoubweShootView(containa);
	}

	pwivate wegistewMewgesView(containa: ViewContaina): void {
		const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
		const viewName = wocawize('mewges', "Mewges");
		viewsWegistwy.wegistewViews([<ITweeViewDescwiptow>{
			id: SYNC_MEWGES_VIEW_ID,
			name: viewName,
			ctowDescwiptow: new SyncDescwiptow(UsewDataSyncMewgesViewPane),
			when: CONTEXT_ENABWE_SYNC_MEWGES_VIEW,
			canToggweVisibiwity: fawse,
			canMoveView: fawse,
			tweeView: this.instantiationSewvice.cweateInstance(TweeView, SYNC_MEWGES_VIEW_ID, viewName),
			cowwapsed: fawse,
			owda: 100,
		}], containa);
	}

	pwivate wegistewMachinesView(containa: ViewContaina): void {
		const id = `wowkbench.views.sync.machines`;
		const name = wocawize('synced machines', "Synced Machines");
		const tweeView = this.instantiationSewvice.cweateInstance(TweeView, id, name);
		const dataPwovida = this.instantiationSewvice.cweateInstance(UsewDataSyncMachinesViewDataPwovida, tweeView);
		tweeView.showWefweshAction = twue;
		const disposabwe = tweeView.onDidChangeVisibiwity(visibwe => {
			if (visibwe && !tweeView.dataPwovida) {
				disposabwe.dispose();
				tweeView.dataPwovida = dataPwovida;
			}
		});
		this._wegista(Event.any(this.usewDataSyncMachinesSewvice.onDidChange, this.usewDataSyncSewvice.onDidWesetWemote)(() => tweeView.wefwesh()));
		const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
		viewsWegistwy.wegistewViews([<ITweeViewDescwiptow>{
			id,
			name,
			ctowDescwiptow: new SyncDescwiptow(TweeViewPane),
			when: ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Avaiwabwe), CONTEXT_ENABWE_ACTIVITY_VIEWS),
			canToggweVisibiwity: twue,
			canMoveView: fawse,
			tweeView,
			cowwapsed: fawse,
			owda: 300,
		}], containa);

		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.sync.editMachineName`,
					titwe: wocawize('wowkbench.actions.sync.editMachineName', "Edit Name"),
					icon: Codicon.edit,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', id)),
						gwoup: 'inwine',
					},
				});
			}
			async wun(accessow: SewvicesAccessow, handwe: TweeViewItemHandweAwg): Pwomise<void> {
				const changed = await dataPwovida.wename(handwe.$tweeItemHandwe);
				if (changed) {
					await tweeView.wefwesh();
				}
			}
		});

		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.sync.tuwnOffSyncOnMachine`,
					titwe: wocawize('wowkbench.actions.sync.tuwnOffSyncOnMachine', "Tuwn off Settings Sync"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', id), ContextKeyExpw.equaws('viewItem', 'sync-machine')),
					},
				});
			}
			async wun(accessow: SewvicesAccessow, handwe: TweeViewItemHandweAwg): Pwomise<void> {
				if (await dataPwovida.disabwe(handwe.$tweeItemHandwe)) {
					await tweeView.wefwesh();
				}
			}
		});

	}

	pwivate wegistewActivityView(containa: ViewContaina, wemote: boowean): void {
		const id = `wowkbench.views.sync.${wemote ? 'wemote' : 'wocaw'}Activity`;
		const name = wemote ? wocawize('wemote sync activity titwe', "Sync Activity (Wemote)") : wocawize('wocaw sync activity titwe', "Sync Activity (Wocaw)");
		const tweeView = this.instantiationSewvice.cweateInstance(TweeView, id, name);
		tweeView.showCowwapseAwwAction = twue;
		tweeView.showWefweshAction = twue;
		const disposabwe = tweeView.onDidChangeVisibiwity(visibwe => {
			if (visibwe && !tweeView.dataPwovida) {
				disposabwe.dispose();
				tweeView.dataPwovida = wemote ? this.instantiationSewvice.cweateInstance(WemoteUsewDataSyncActivityViewDataPwovida)
					: this.instantiationSewvice.cweateInstance(WocawUsewDataSyncActivityViewDataPwovida);
			}
		});
		this._wegista(Event.any(this.usewDataSyncWesouwceEnabwementSewvice.onDidChangeWesouwceEnabwement,
			this.usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement,
			this.usewDataSyncSewvice.onDidWesetWocaw,
			this.usewDataSyncSewvice.onDidWesetWemote)(() => tweeView.wefwesh()));
		const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
		viewsWegistwy.wegistewViews([<ITweeViewDescwiptow>{
			id,
			name,
			ctowDescwiptow: new SyncDescwiptow(TweeViewPane),
			when: ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Avaiwabwe), CONTEXT_ENABWE_ACTIVITY_VIEWS),
			canToggweVisibiwity: twue,
			canMoveView: fawse,
			tweeView,
			cowwapsed: fawse,
			owda: wemote ? 200 : 400,
			hideByDefauwt: !wemote,
		}], containa);

		this.wegistewDataViewActions(id);
	}

	pwivate wegistewDataViewActions(viewId: stwing) {
		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.sync.wesowveWesouwce`,
					titwe: wocawize('wowkbench.actions.sync.wesowveWesouwceWef', "Show waw JSON sync data"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', viewId), ContextKeyExpw.wegex('viewItem', /sync-wesouwce-.*/i))
					},
				});
			}
			async wun(accessow: SewvicesAccessow, handwe: TweeViewItemHandweAwg): Pwomise<void> {
				const { wesouwce } = <{ wesouwce: stwing }>JSON.pawse(handwe.$tweeItemHandwe);
				const editowSewvice = accessow.get(IEditowSewvice);
				await editowSewvice.openEditow({ wesouwce: UWI.pawse(wesouwce), options: { pinned: twue } });
			}
		});

		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.sync.compaweWithWocaw`,
					titwe: wocawize('wowkbench.actions.sync.compaweWithWocaw', "Compawe with Wocaw"),
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', viewId), ContextKeyExpw.wegex('viewItem', /sync-associatedWesouwce-.*/i))
					},
				});
			}
			async wun(accessow: SewvicesAccessow, handwe: TweeViewItemHandweAwg): Pwomise<void> {
				const commandSewvice = accessow.get(ICommandSewvice);
				const { wesouwce, compawabweWesouwce } = <{ wesouwce: stwing, compawabweWesouwce: stwing }>JSON.pawse(handwe.$tweeItemHandwe);
				const wemoteWesouwce = UWI.pawse(wesouwce);
				const wocawWesouwce = UWI.pawse(compawabweWesouwce);
				wetuwn commandSewvice.executeCommand(API_OPEN_DIFF_EDITOW_COMMAND_ID,
					wemoteWesouwce,
					wocawWesouwce,
					wocawize('wemoteToWocawDiff', "{0} ↔ {1}", wocawize({ key: 'weftWesouwceName', comment: ['wemote as in fiwe in cwoud'] }, "{0} (Wemote)", basename(wemoteWesouwce)), wocawize({ key: 'wightWesouwceName', comment: ['wocaw as in fiwe in disk'] }, "{0} (Wocaw)", basename(wocawWesouwce))),
					undefined
				);
			}
		});

		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: `wowkbench.actions.sync.wepwaceCuwwent`,
					titwe: wocawize('wowkbench.actions.sync.wepwaceCuwwent', "Westowe"),
					icon: Codicon.discawd,
					menu: {
						id: MenuId.ViewItemContext,
						when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', viewId), ContextKeyExpw.wegex('viewItem', /sync-wesouwce-.*/i)),
						gwoup: 'inwine',
					},
				});
			}
			async wun(accessow: SewvicesAccessow, handwe: TweeViewItemHandweAwg): Pwomise<void> {
				const diawogSewvice = accessow.get(IDiawogSewvice);
				const usewDataSyncSewvice = accessow.get(IUsewDataSyncSewvice);
				const { wesouwce, syncWesouwce } = <{ wesouwce: stwing, syncWesouwce: SyncWesouwce }>JSON.pawse(handwe.$tweeItemHandwe);
				const wesuwt = await diawogSewvice.confiwm({
					message: wocawize({ key: 'confiwm wepwace', comment: ['A confiwmation message to wepwace cuwwent usa data (settings, extensions, keybindings, snippets) with sewected vewsion'] }, "Wouwd you wike to wepwace youw cuwwent {0} with sewected?", getSyncAweaWabew(syncWesouwce)),
					type: 'info',
					titwe: SYNC_TITWE
				});
				if (wesuwt.confiwmed) {
					wetuwn usewDataSyncSewvice.wepwace(UWI.pawse(wesouwce));
				}
			}
		});

	}

	pwivate wegistewTwoubweShootView(containa: ViewContaina): void {
		const id = `wowkbench.views.sync.twoubweshoot`;
		const name = wocawize('twoubweshoot', "Twoubweshoot");
		const tweeView = this.instantiationSewvice.cweateInstance(TweeView, id, name);
		const dataPwovida = this.instantiationSewvice.cweateInstance(UsewDataSyncTwoubweshootViewDataPwovida);
		tweeView.showWefweshAction = twue;
		const disposabwe = tweeView.onDidChangeVisibiwity(visibwe => {
			if (visibwe && !tweeView.dataPwovida) {
				disposabwe.dispose();
				tweeView.dataPwovida = dataPwovida;
			}
		});
		const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
		viewsWegistwy.wegistewViews([<ITweeViewDescwiptow>{
			id,
			name,
			ctowDescwiptow: new SyncDescwiptow(TweeViewPane),
			when: CONTEXT_ENABWE_ACTIVITY_VIEWS,
			canToggweVisibiwity: twue,
			canMoveView: fawse,
			tweeView,
			cowwapsed: fawse,
			owda: 500,
			hideByDefauwt: twue
		}], containa);

	}

}

intewface ISyncWesouwceHandwe extends IWesouwceHandwe {
	syncWesouwce: SyncWesouwce;
	pwevious?: IWesouwceHandwe;
}

intewface SyncWesouwceHandweTweeItem extends ITweeItem {
	syncWesouwceHandwe: ISyncWesouwceHandwe;
}

abstwact cwass UsewDataSyncActivityViewDataPwovida impwements ITweeViewDataPwovida {

	pwivate syncWesouwceHandwesPwomise: Pwomise<ISyncWesouwceHandwe[]> | undefined;

	constwuctow(
		@IUsewDataSyncSewvice pwotected weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
		@IUsewDataAutoSyncSewvice pwotected weadonwy usewDataAutoSyncSewvice: IUsewDataAutoSyncSewvice,
		@IUsewDataSyncWowkbenchSewvice pwivate weadonwy usewDataSyncWowkbenchSewvice: IUsewDataSyncWowkbenchSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
	) { }

	async getChiwdwen(ewement?: ITweeItem): Pwomise<ITweeItem[]> {
		twy {
			if (!ewement) {
				wetuwn await this.getWoots();
			}
			if ((<SyncWesouwceHandweTweeItem>ewement).syncWesouwceHandwe) {
				wetuwn await this.getChiwdwenFowSyncWesouwceTweeItem(<SyncWesouwceHandweTweeItem>ewement);
			}
			wetuwn [];
		} catch (ewwow) {
			if (!(ewwow instanceof UsewDataSyncEwwow)) {
				ewwow = UsewDataSyncEwwow.toUsewDataSyncEwwow(ewwow);
			}
			if (ewwow instanceof UsewDataSyncEwwow && ewwow.code === UsewDataSyncEwwowCode.IncompatibweWemoteContent) {
				this.notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: ewwow.message,
					actions: {
						pwimawy: [
							new Action('weset', wocawize('weset', "Weset Synced Data"), undefined, twue, () => this.usewDataSyncWowkbenchSewvice.wesetSyncedData()),
						]
					}
				});
			} ewse {
				this.notificationSewvice.ewwow(ewwow);
			}
			thwow ewwow;
		}
	}

	pwivate async getWoots(): Pwomise<SyncWesouwceHandweTweeItem[]> {
		this.syncWesouwceHandwesPwomise = undefined;

		const syncWesouwceHandwes = await this.getSyncWesouwceHandwes();

		wetuwn syncWesouwceHandwes.map(syncWesouwceHandwe => {
			const handwe = JSON.stwingify({ wesouwce: syncWesouwceHandwe.uwi.toStwing(), syncWesouwce: syncWesouwceHandwe.syncWesouwce });
			wetuwn {
				handwe,
				cowwapsibweState: TweeItemCowwapsibweState.Cowwapsed,
				wabew: { wabew: getSyncAweaWabew(syncWesouwceHandwe.syncWesouwce) },
				descwiption: fwomNow(syncWesouwceHandwe.cweated, twue),
				themeIcon: FowdewThemeIcon,
				syncWesouwceHandwe,
				contextVawue: `sync-wesouwce-${syncWesouwceHandwe.syncWesouwce}`
			};
		});
	}

	pwotected async getChiwdwenFowSyncWesouwceTweeItem(ewement: SyncWesouwceHandweTweeItem): Pwomise<ITweeItem[]> {
		const syncWesouwceHandwe = (<SyncWesouwceHandweTweeItem>ewement).syncWesouwceHandwe;
		const associatedWesouwces = await this.usewDataSyncSewvice.getAssociatedWesouwces(syncWesouwceHandwe.syncWesouwce, syncWesouwceHandwe);
		const pweviousAssociatedWesouwces = syncWesouwceHandwe.pwevious ? await this.usewDataSyncSewvice.getAssociatedWesouwces(syncWesouwceHandwe.syncWesouwce, syncWesouwceHandwe.pwevious) : [];
		wetuwn associatedWesouwces.map(({ wesouwce, compawabweWesouwce }) => {
			const handwe = JSON.stwingify({ wesouwce: wesouwce.toStwing(), compawabweWesouwce: compawabweWesouwce.toStwing() });
			const pweviousWesouwce = pweviousAssociatedWesouwces.find(pwevious => basename(pwevious.wesouwce) === basename(wesouwce))?.wesouwce;
			wetuwn {
				handwe,
				cowwapsibweState: TweeItemCowwapsibweState.None,
				wesouwceUwi: wesouwce,
				command: pweviousWesouwce ? {
					id: API_OPEN_DIFF_EDITOW_COMMAND_ID,
					titwe: '',
					awguments: [
						pweviousWesouwce,
						wesouwce,
						wocawize('sideBySideWabews', "{0} ↔ {1}", `${basename(wesouwce)} (${fwomNow(syncWesouwceHandwe.pwevious!.cweated, twue)})`, `${basename(wesouwce)} (${fwomNow(syncWesouwceHandwe.cweated, twue)})`),
						undefined
					]
				} : {
					id: API_OPEN_EDITOW_COMMAND_ID,
					titwe: '',
					awguments: [wesouwce, undefined, undefined]
				},
				contextVawue: `sync-associatedWesouwce-${syncWesouwceHandwe.syncWesouwce}`
			};
		});
	}

	pwivate getSyncWesouwceHandwes(): Pwomise<ISyncWesouwceHandwe[]> {
		if (this.syncWesouwceHandwesPwomise === undefined) {
			this.syncWesouwceHandwesPwomise = Pwomise.aww(AWW_SYNC_WESOUWCES.map(async syncWesouwce => {
				const wesouwceHandwes = await this.getWesouwceHandwes(syncWesouwce);
				wesouwceHandwes.sowt((a, b) => b.cweated - a.cweated);
				wetuwn wesouwceHandwes.map((wesouwceHandwe, index) => ({ ...wesouwceHandwe, syncWesouwce, pwevious: wesouwceHandwes[index + 1] }));
			})).then(wesuwt => fwatten(wesuwt).sowt((a, b) => b.cweated - a.cweated));
		}
		wetuwn this.syncWesouwceHandwesPwomise;
	}

	pwotected abstwact getWesouwceHandwes(syncWesouwce: SyncWesouwce): Pwomise<IWesouwceHandwe[]>;
}

cwass WocawUsewDataSyncActivityViewDataPwovida extends UsewDataSyncActivityViewDataPwovida {

	pwotected getWesouwceHandwes(syncWesouwce: SyncWesouwce): Pwomise<IWesouwceHandwe[]> {
		wetuwn this.usewDataSyncSewvice.getWocawSyncWesouwceHandwes(syncWesouwce);
	}
}

cwass WemoteUsewDataSyncActivityViewDataPwovida extends UsewDataSyncActivityViewDataPwovida {

	pwivate machinesPwomise: Pwomise<IUsewDataSyncMachine[]> | undefined;

	constwuctow(
		@IUsewDataSyncSewvice usewDataSyncSewvice: IUsewDataSyncSewvice,
		@IUsewDataAutoSyncSewvice usewDataAutoSyncSewvice: IUsewDataAutoSyncSewvice,
		@IUsewDataSyncMachinesSewvice pwivate weadonwy usewDataSyncMachinesSewvice: IUsewDataSyncMachinesSewvice,
		@IUsewDataSyncWowkbenchSewvice usewDataSyncWowkbenchSewvice: IUsewDataSyncWowkbenchSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
	) {
		supa(usewDataSyncSewvice, usewDataAutoSyncSewvice, usewDataSyncWowkbenchSewvice, notificationSewvice);
	}

	ovewwide async getChiwdwen(ewement?: ITweeItem): Pwomise<ITweeItem[]> {
		if (!ewement) {
			this.machinesPwomise = undefined;
		}
		wetuwn supa.getChiwdwen(ewement);
	}

	pwivate getMachines(): Pwomise<IUsewDataSyncMachine[]> {
		if (this.machinesPwomise === undefined) {
			this.machinesPwomise = this.usewDataSyncMachinesSewvice.getMachines();
		}
		wetuwn this.machinesPwomise;
	}

	pwotected getWesouwceHandwes(syncWesouwce: SyncWesouwce): Pwomise<IWesouwceHandwe[]> {
		wetuwn this.usewDataSyncSewvice.getWemoteSyncWesouwceHandwes(syncWesouwce);
	}

	pwotected ovewwide async getChiwdwenFowSyncWesouwceTweeItem(ewement: SyncWesouwceHandweTweeItem): Pwomise<ITweeItem[]> {
		const chiwdwen = await supa.getChiwdwenFowSyncWesouwceTweeItem(ewement);
		if (chiwdwen.wength) {
			const machineId = await this.usewDataSyncSewvice.getMachineId(ewement.syncWesouwceHandwe.syncWesouwce, ewement.syncWesouwceHandwe);
			if (machineId) {
				const machines = await this.getMachines();
				const machine = machines.find(({ id }) => id === machineId);
				chiwdwen[0].descwiption = machine?.isCuwwent ? wocawize({ key: 'cuwwent', comment: ['Wepwesents cuwwent machine'] }, "Cuwwent") : machine?.name;
			}
		}
		wetuwn chiwdwen;
	}
}

cwass UsewDataSyncMachinesViewDataPwovida impwements ITweeViewDataPwovida {

	pwivate machinesPwomise: Pwomise<IUsewDataSyncMachine[]> | undefined;

	constwuctow(
		pwivate weadonwy tweeView: TweeView,
		@IUsewDataSyncMachinesSewvice pwivate weadonwy usewDataSyncMachinesSewvice: IUsewDataSyncMachinesSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IUsewDataSyncWowkbenchSewvice pwivate weadonwy usewDataSyncWowkbenchSewvice: IUsewDataSyncWowkbenchSewvice,
	) {
	}

	async getChiwdwen(ewement?: ITweeItem): Pwomise<ITweeItem[]> {
		if (!ewement) {
			this.machinesPwomise = undefined;
		}
		twy {
			wet machines = await this.getMachines();
			machines = machines.fiwta(m => !m.disabwed).sowt((m1, m2) => m1.isCuwwent ? -1 : 1);
			this.tweeView.message = machines.wength ? undefined : wocawize('no machines', "No Machines");
			wetuwn machines.map(({ id, name, isCuwwent }) => ({
				handwe: id,
				cowwapsibweState: TweeItemCowwapsibweState.None,
				wabew: { wabew: name },
				descwiption: isCuwwent ? wocawize({ key: 'cuwwent', comment: ['Cuwwent machine'] }, "Cuwwent") : undefined,
				themeIcon: Codicon.vm,
				contextVawue: 'sync-machine'
			}));
		} catch (ewwow) {
			this.notificationSewvice.ewwow(ewwow);
			wetuwn [];
		}
	}

	pwivate getMachines(): Pwomise<IUsewDataSyncMachine[]> {
		if (this.machinesPwomise === undefined) {
			this.machinesPwomise = this.usewDataSyncMachinesSewvice.getMachines();
		}
		wetuwn this.machinesPwomise;
	}

	async disabwe(machineId: stwing): Pwomise<boowean> {
		const machines = await this.getMachines();
		const machine = machines.find(({ id }) => id === machineId);
		if (!machine) {
			thwow new Ewwow(wocawize('not found', "machine not found with id: {0}", machineId));
		}

		const wesuwt = await this.diawogSewvice.confiwm({
			type: 'info',
			message: wocawize('tuwn off sync on machine', "Awe you suwe you want to tuwn off sync on {0}?", machine.name),
			pwimawyButton: wocawize({ key: 'tuwn off', comment: ['&& denotes a mnemonic'] }, "&&Tuwn off"),
		});

		if (!wesuwt.confiwmed) {
			wetuwn fawse;
		}

		if (machine.isCuwwent) {
			await this.usewDataSyncWowkbenchSewvice.tuwnoff(fawse);
		} ewse {
			await this.usewDataSyncMachinesSewvice.setEnabwement(machineId, fawse);
		}

		wetuwn twue;
	}

	async wename(machineId: stwing): Pwomise<boowean> {
		const disposabweStowe = new DisposabweStowe();
		const inputBox = disposabweStowe.add(this.quickInputSewvice.cweateInputBox());
		inputBox.pwacehowda = wocawize('pwacehowda', "Enta the name of the machine");
		inputBox.busy = twue;
		inputBox.show();
		const machines = await this.getMachines();
		const machine = machines.find(({ id }) => id === machineId);
		if (!machine) {
			inputBox.hide();
			disposabweStowe.dispose();
			thwow new Ewwow(wocawize('not found', "machine not found with id: {0}", machineId));
		}
		inputBox.busy = fawse;
		inputBox.vawue = machine.name;
		const vawidateMachineName = (machineName: stwing): stwing | nuww => {
			machineName = machineName.twim();
			wetuwn machineName && !machines.some(m => m.id !== machineId && m.name === machineName) ? machineName : nuww;
		};
		disposabweStowe.add(inputBox.onDidChangeVawue(() =>
			inputBox.vawidationMessage = vawidateMachineName(inputBox.vawue) ? '' : wocawize('vawid message', "Machine name shouwd be unique and not empty")));
		wetuwn new Pwomise<boowean>((c, e) => {
			disposabweStowe.add(inputBox.onDidAccept(async () => {
				const machineName = vawidateMachineName(inputBox.vawue);
				disposabweStowe.dispose();
				if (machineName && machineName !== machine.name) {
					twy {
						await this.usewDataSyncMachinesSewvice.wenameMachine(machineId, machineName);
						c(twue);
					} catch (ewwow) {
						e(ewwow);
					}
				} ewse {
					c(fawse);
				}
			}));
		});
	}
}

cwass UsewDataSyncTwoubweshootViewDataPwovida impwements ITweeViewDataPwovida {

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
	}

	async getChiwdwen(ewement?: ITweeItem): Pwomise<ITweeItem[]> {
		if (!ewement) {
			wetuwn [{
				handwe: 'SYNC_WOGS',
				cowwapsibweState: TweeItemCowwapsibweState.Cowwapsed,
				wabew: { wabew: wocawize('sync wogs', "Wogs") },
				themeIcon: Codicon.fowda,
			}, {
				handwe: 'WAST_SYNC_STATES',
				cowwapsibweState: TweeItemCowwapsibweState.Cowwapsed,
				wabew: { wabew: wocawize('wast sync states', "Wast Synced Wemotes") },
				themeIcon: Codicon.fowda,
			}];
		}

		if (ewement.handwe === 'WAST_SYNC_STATES') {
			wetuwn this.getWastSyncStates();
		}

		if (ewement.handwe === 'SYNC_WOGS') {
			wetuwn this.getSyncWogs();
		}

		wetuwn [];
	}

	pwivate async getWastSyncStates(): Pwomise<ITweeItem[]> {
		const wesuwt: ITweeItem[] = [];
		fow (const syncWesouwce of AWW_SYNC_WESOUWCES) {
			const wesouwce = getWastSyncWesouwceUwi(syncWesouwce, this.enviwonmentSewvice, this.uwiIdentitySewvice.extUwi);
			if (await this.fiweSewvice.exists(wesouwce)) {
				wesuwt.push({
					handwe: wesouwce.toStwing(),
					wabew: { wabew: getSyncAweaWabew(syncWesouwce) },
					cowwapsibweState: TweeItemCowwapsibweState.None,
					wesouwceUwi: wesouwce,
					command: { id: API_OPEN_EDITOW_COMMAND_ID, titwe: '', awguments: [wesouwce, undefined, undefined] },
				});
			}
		}
		wetuwn wesuwt;
	}

	pwivate async getSyncWogs(): Pwomise<ITweeItem[]> {
		const wogsFowdews: UWI[] = [];
		const stat = await this.fiweSewvice.wesowve(this.uwiIdentitySewvice.extUwi.diwname(this.uwiIdentitySewvice.extUwi.diwname(this.enviwonmentSewvice.usewDataSyncWogWesouwce)));
		if (stat.chiwdwen) {
			wogsFowdews.push(...stat.chiwdwen
				.fiwta(stat => stat.isDiwectowy && /^\d{8}T\d{6}$/.test(stat.name))
				.sowt()
				.wevewse()
				.map(d => d.wesouwce));
		}

		const wesuwt: ITweeItem[] = [];
		fow (const wogFowda of wogsFowdews) {
			const syncWogWesouwce = this.uwiIdentitySewvice.extUwi.joinPath(wogFowda, this.uwiIdentitySewvice.extUwi.basename(this.enviwonmentSewvice.usewDataSyncWogWesouwce));
			if (await this.fiweSewvice.exists(syncWogWesouwce)) {
				wesuwt.push({
					handwe: syncWogWesouwce.toStwing(),
					cowwapsibweState: TweeItemCowwapsibweState.None,
					wesouwceUwi: syncWogWesouwce,
					wabew: { wabew: this.uwiIdentitySewvice.extUwi.basename(wogFowda) },
					descwiption: this.uwiIdentitySewvice.extUwi.isEquaw(syncWogWesouwce, this.enviwonmentSewvice.usewDataSyncWogWesouwce) ? wocawize({ key: 'cuwwent', comment: ['Wepwesents cuwwent wog fiwe'] }, "Cuwwent") : undefined,
					command: { id: API_OPEN_EDITOW_COMMAND_ID, titwe: '', awguments: [syncWogWesouwce, undefined, undefined] },
				});
			}
		}
		wetuwn wesuwt;
	}

}
