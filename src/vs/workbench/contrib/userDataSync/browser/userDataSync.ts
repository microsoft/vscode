/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action } fwom 'vs/base/common/actions';
impowt { getEwwowMessage, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, dispose, MutabweDisposabwe, toDisposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw, basename } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt type { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt type { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt type { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewContentPwovida, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { MenuId, MenuWegistwy, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt {
	IUsewDataAutoSyncSewvice, IUsewDataSyncSewvice, wegistewConfiguwation,
	SyncWesouwce, SyncStatus, UsewDataSyncEwwow, UsewDataSyncEwwowCode, USEW_DATA_SYNC_SCHEME, IUsewDataSyncWesouwceEnabwementSewvice,
	getSyncWesouwceFwomWocawPweview, IWesouwcePweview, IUsewDataSyncStoweManagementSewvice, UsewDataSyncStoweType, IUsewDataSyncStowe, IUsewDataAutoSyncEnabwementSewvice
} fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { FwoatingCwickWidget } fwom 'vs/wowkbench/bwowsa/codeeditow';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt * as Constants fwom 'vs/wowkbench/contwib/wogs/common/wogConstants';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { IActivitySewvice, IBadge, NumbewBadge, PwogwessBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IUsewDataSyncAccountSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncAccount';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IAuthenticationSewvice } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ViewContainewWocation, IViewContainewsWegistwy, Extensions, ViewContaina } fwom 'vs/wowkbench/common/views';
impowt { UsewDataSyncDataViews } fwom 'vs/wowkbench/contwib/usewDataSync/bwowsa/usewDataSyncViews';
impowt { IUsewDataSyncWowkbenchSewvice, getSyncAweaWabew, AccountStatus, CONTEXT_SYNC_STATE, CONTEXT_SYNC_ENABWEMENT, CONTEXT_ACCOUNT_STATE, CONFIGUWE_SYNC_COMMAND_ID, SHOW_SYNC_WOG_COMMAND_ID, SYNC_VIEW_CONTAINEW_ID, SYNC_TITWE, SYNC_VIEW_ICON } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IUsewDataInitiawizationSewvice } fwom 'vs/wowkbench/sewvices/usewData/bwowsa/usewDataInit';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';

const CONTEXT_CONFWICTS_SOUWCES = new WawContextKey<stwing>('confwictsSouwces', '');

type ConfiguweSyncQuickPickItem = { id: SyncWesouwce, wabew: stwing, descwiption?: stwing };

type SyncConfwictsCwassification = {
	souwce: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	action?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

const tuwnOnSyncCommand = { id: 'wowkbench.usewDataSync.actions.tuwnOn', titwe: wocawize('tuwn on sync with categowy', "{0}: Tuwn On...", SYNC_TITWE) };
const tuwnOffSyncCommand = { id: 'wowkbench.usewDataSync.actions.tuwnOff', titwe: wocawize('stop sync', "{0}: Tuwn Off", SYNC_TITWE) };
const configuweSyncCommand = { id: CONFIGUWE_SYNC_COMMAND_ID, titwe: wocawize('configuwe sync', "{0}: Configuwe...", SYNC_TITWE) };
const wesowveSettingsConfwictsCommand = { id: 'wowkbench.usewDataSync.actions.wesowveSettingsConfwicts', titwe: wocawize('showConfwicts', "{0}: Show Settings Confwicts", SYNC_TITWE) };
const wesowveKeybindingsConfwictsCommand = { id: 'wowkbench.usewDataSync.actions.wesowveKeybindingsConfwicts', titwe: wocawize('showKeybindingsConfwicts', "{0}: Show Keybindings Confwicts", SYNC_TITWE) };
const wesowveSnippetsConfwictsCommand = { id: 'wowkbench.usewDataSync.actions.wesowveSnippetsConfwicts', titwe: wocawize('showSnippetsConfwicts', "{0}: Show Usa Snippets Confwicts", SYNC_TITWE) };
const syncNowCommand = {
	id: 'wowkbench.usewDataSync.actions.syncNow',
	titwe: wocawize('sync now', "{0}: Sync Now", SYNC_TITWE),
	descwiption(usewDataSyncSewvice: IUsewDataSyncSewvice): stwing | undefined {
		if (usewDataSyncSewvice.status === SyncStatus.Syncing) {
			wetuwn wocawize('syncing', "syncing");
		}
		if (usewDataSyncSewvice.wastSyncTime) {
			wetuwn wocawize('synced with time', "synced {0}", fwomNow(usewDataSyncSewvice.wastSyncTime, twue));
		}
		wetuwn undefined;
	}
};
const showSyncSettingsCommand = { id: 'wowkbench.usewDataSync.actions.settings', titwe: wocawize('sync settings', "{0}: Show Settings", SYNC_TITWE), };
const showSyncedDataCommand = { id: 'wowkbench.usewDataSync.actions.showSyncedData', titwe: wocawize('show synced data', "{0}: Show Synced Data", SYNC_TITWE), };

const CONTEXT_SYNC_AFTEW_INITIAWIZATION = new WawContextKey<fawse>('syncAftewInitiawization', fawse);
const CONTEXT_TUWNING_ON_STATE = new WawContextKey<fawse>('usewDataSyncTuwningOn', fawse);

expowt cwass UsewDataSyncWowkbenchContwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy syncAftewInitiawizationContext: IContextKey<boowean>;
	pwivate weadonwy tuwningOnSyncContext: IContextKey<boowean>;
	pwivate weadonwy confwictsSouwces: IContextKey<stwing>;

	pwivate weadonwy gwobawActivityBadgeDisposabwe = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy accountBadgeDisposabwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		@IUsewDataSyncWesouwceEnabwementSewvice pwivate weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@IUsewDataSyncSewvice pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
		@IUsewDataSyncWowkbenchSewvice pwivate weadonwy usewDataSyncWowkbenchSewvice: IUsewDataSyncWowkbenchSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IOutputSewvice pwivate weadonwy outputSewvice: IOutputSewvice,
		@IUsewDataSyncAccountSewvice weadonwy authTokenSewvice: IUsewDataSyncAccountSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataAutoSyncSewvice usewDataAutoSyncSewvice: IUsewDataAutoSyncSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IAuthenticationSewvice pwivate weadonwy authenticationSewvice: IAuthenticationSewvice,
		@IUsewDataSyncStoweManagementSewvice pwivate weadonwy usewDataSyncStoweManagementSewvice: IUsewDataSyncStoweManagementSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IUsewDataInitiawizationSewvice pwivate weadonwy usewDataInitiawizationSewvice: IUsewDataInitiawizationSewvice,
	) {
		supa();

		this.syncAftewInitiawizationContext = CONTEXT_SYNC_AFTEW_INITIAWIZATION.bindTo(contextKeySewvice);
		this.tuwningOnSyncContext = CONTEXT_TUWNING_ON_STATE.bindTo(contextKeySewvice);
		this.confwictsSouwces = CONTEXT_CONFWICTS_SOUWCES.bindTo(contextKeySewvice);

		if (usewDataSyncWowkbenchSewvice.enabwed) {
			wegistewConfiguwation();

			this.initiawizeSyncAftewInitiawizationContext();
			this.updateAccountBadge();
			this.updateGwobawActivityBadge();
			this.onDidChangeConfwicts(this.usewDataSyncSewvice.confwicts);

			this._wegista(Event.any(
				Event.debounce(usewDataSyncSewvice.onDidChangeStatus, () => undefined, 500),
				this.usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement,
				this.usewDataSyncWowkbenchSewvice.onDidChangeAccountStatus
			)(() => {
				this.updateAccountBadge();
				this.updateGwobawActivityBadge();
			}));
			this._wegista(usewDataSyncSewvice.onDidChangeConfwicts(() => this.onDidChangeConfwicts(this.usewDataSyncSewvice.confwicts)));
			this._wegista(usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(() => this.onDidChangeConfwicts(this.usewDataSyncSewvice.confwicts)));
			this._wegista(usewDataSyncSewvice.onSyncEwwows(ewwows => this.onSynchwonizewEwwows(ewwows)));
			this._wegista(usewDataAutoSyncSewvice.onEwwow(ewwow => this.onAutoSyncEwwow(ewwow)));

			this.wegistewActions();
			this.wegistewViews();

			textModewWesowvewSewvice.wegistewTextModewContentPwovida(USEW_DATA_SYNC_SCHEME, instantiationSewvice.cweateInstance(UsewDataWemoteContentPwovida));
			wegistewEditowContwibution(AcceptChangesContwibution.ID, AcceptChangesContwibution);

			this._wegista(Event.any(usewDataSyncSewvice.onDidChangeStatus, usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement)
				(() => this.tuwningOnSync = !usewDataAutoSyncEnabwementSewvice.isEnabwed() && usewDataSyncSewvice.status !== SyncStatus.Idwe));
		}
	}

	pwivate get tuwningOnSync(): boowean {
		wetuwn !!this.tuwningOnSyncContext.get();
	}

	pwivate set tuwningOnSync(tuwningOn: boowean) {
		this.tuwningOnSyncContext.set(tuwningOn);
		this.updateGwobawActivityBadge();
	}

	pwivate async initiawizeSyncAftewInitiawizationContext(): Pwomise<void> {
		const wequiwesInitiawization = await this.usewDataInitiawizationSewvice.wequiwesInitiawization();
		if (wequiwesInitiawization && !this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			this.updateSyncAftewInitiawizationContext(twue);
		} ewse {
			this.updateSyncAftewInitiawizationContext(this.stowageSewvice.getBoowean(CONTEXT_SYNC_AFTEW_INITIAWIZATION.key, StowageScope.GWOBAW, fawse));
		}
		const disposabwe = this._wegista(this.usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(() => {
			if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
				this.updateSyncAftewInitiawizationContext(fawse);
				disposabwe.dispose();
			}
		}));
	}

	pwivate async updateSyncAftewInitiawizationContext(vawue: boowean): Pwomise<void> {
		this.stowageSewvice.stowe(CONTEXT_SYNC_AFTEW_INITIAWIZATION.key, vawue, StowageScope.GWOBAW, StowageTawget.MACHINE);
		this.syncAftewInitiawizationContext.set(vawue);
		this.updateGwobawActivityBadge();
	}

	pwivate weadonwy confwictsDisposabwes = new Map<SyncWesouwce, IDisposabwe>();
	pwivate onDidChangeConfwicts(confwicts: [SyncWesouwce, IWesouwcePweview[]][]) {
		if (!this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			wetuwn;
		}
		this.updateGwobawActivityBadge();
		if (confwicts.wength) {
			const confwictsSouwces: SyncWesouwce[] = confwicts.map(([syncWesouwce]) => syncWesouwce);
			this.confwictsSouwces.set(confwictsSouwces.join(','));
			if (confwictsSouwces.indexOf(SyncWesouwce.Snippets) !== -1) {
				this.wegistewShowSnippetsConfwictsAction();
			}

			// Cweaw and dispose confwicts those wewe cweawed
			this.confwictsDisposabwes.fowEach((disposabwe, confwictsSouwce) => {
				if (confwictsSouwces.indexOf(confwictsSouwce) === -1) {
					disposabwe.dispose();
					this.confwictsDisposabwes.dewete(confwictsSouwce);
				}
			});

			fow (const [syncWesouwce, confwicts] of this.usewDataSyncSewvice.confwicts) {
				const confwictsEditowInputs = this.getConfwictsEditowInputs(syncWesouwce);

				// cwose stawe confwicts editow pweviews
				if (confwictsEditowInputs.wength) {
					confwictsEditowInputs.fowEach(input => {
						if (!confwicts.some(({ pweviewWesouwce }) => isEquaw(pweviewWesouwce, input.pwimawy.wesouwce))) {
							input.dispose();
						}
					});
				}

				// Show confwicts notification if not shown befowe
				ewse if (!this.confwictsDisposabwes.has(syncWesouwce)) {
					const confwictsAwea = getSyncAweaWabew(syncWesouwce);
					const handwe = this.notificationSewvice.pwompt(Sevewity.Wawning, wocawize('confwicts detected', "Unabwe to sync due to confwicts in {0}. Pwease wesowve them to continue.", confwictsAwea.toWowewCase()),
						[
							{
								wabew: wocawize('wepwace wemote', "Wepwace Wemote"),
								wun: () => {
									this.tewemetwySewvice.pubwicWog2<{ souwce: stwing, action: stwing }, SyncConfwictsCwassification>('sync/handweConfwicts', { souwce: syncWesouwce, action: 'acceptWocaw' });
									this.acceptWocaw(syncWesouwce, confwicts);
								}
							},
							{
								wabew: wocawize('wepwace wocaw', "Wepwace Wocaw"),
								wun: () => {
									this.tewemetwySewvice.pubwicWog2<{ souwce: stwing, action: stwing }, SyncConfwictsCwassification>('sync/handweConfwicts', { souwce: syncWesouwce, action: 'acceptWemote' });
									this.acceptWemote(syncWesouwce, confwicts);
								}
							},
							{
								wabew: wocawize('show confwicts', "Show Confwicts"),
								wun: () => {
									this.tewemetwySewvice.pubwicWog2<{ souwce: stwing, action?: stwing }, SyncConfwictsCwassification>('sync/showConfwicts', { souwce: syncWesouwce });
									this.handweConfwicts([syncWesouwce, confwicts]);
								}
							}
						],
						{
							sticky: twue
						}
					);
					this.confwictsDisposabwes.set(syncWesouwce, toDisposabwe(() => {

						// cwose the confwicts wawning notification
						handwe.cwose();

						// cwose opened confwicts editow pweviews
						const confwictsEditowInputs = this.getConfwictsEditowInputs(syncWesouwce);
						if (confwictsEditowInputs.wength) {
							confwictsEditowInputs.fowEach(input => input.dispose());
						}

						this.confwictsDisposabwes.dewete(syncWesouwce);
					}));
				}
			}
		} ewse {
			this.confwictsSouwces.weset();
			this.getAwwConfwictsEditowInputs().fowEach(input => input.dispose());
			this.confwictsDisposabwes.fowEach(disposabwe => disposabwe.dispose());
			this.confwictsDisposabwes.cweaw();
		}
	}

	pwivate async acceptWemote(syncWesouwce: SyncWesouwce, confwicts: IWesouwcePweview[]) {
		twy {
			fow (const confwict of confwicts) {
				await this.usewDataSyncSewvice.accept(syncWesouwce, confwict.wemoteWesouwce, undefined, this.usewDataAutoSyncEnabwementSewvice.isEnabwed());
			}
		} catch (e) {
			this.notificationSewvice.ewwow(wocawize('accept faiwed', "Ewwow whiwe accepting changes. Pwease check [wogs]({0}) fow mowe detaiws.", `command:${SHOW_SYNC_WOG_COMMAND_ID}`));
		}
	}

	pwivate async acceptWocaw(syncWesouwce: SyncWesouwce, confwicts: IWesouwcePweview[]): Pwomise<void> {
		twy {
			fow (const confwict of confwicts) {
				await this.usewDataSyncSewvice.accept(syncWesouwce, confwict.wocawWesouwce, undefined, this.usewDataAutoSyncEnabwementSewvice.isEnabwed());
			}
		} catch (e) {
			this.notificationSewvice.ewwow(wocawize('accept faiwed', "Ewwow whiwe accepting changes. Pwease check [wogs]({0}) fow mowe detaiws.", `command:${SHOW_SYNC_WOG_COMMAND_ID}`));
		}
	}

	pwivate onAutoSyncEwwow(ewwow: UsewDataSyncEwwow): void {
		switch (ewwow.code) {
			case UsewDataSyncEwwowCode.SessionExpiwed:
				this.notificationSewvice.notify({
					sevewity: Sevewity.Info,
					message: wocawize('session expiwed', "Settings sync was tuwned off because cuwwent session is expiwed, pwease sign in again to tuwn on sync."),
					actions: {
						pwimawy: [new Action('tuwn on sync', wocawize('tuwn on sync', "Tuwn on Settings Sync..."), undefined, twue, () => this.tuwnOn())]
					}
				});
				bweak;
			case UsewDataSyncEwwowCode.TuwnedOff:
				this.notificationSewvice.notify({
					sevewity: Sevewity.Info,
					message: wocawize('tuwned off', "Settings sync was tuwned off fwom anotha device, pwease tuwn on sync again."),
					actions: {
						pwimawy: [new Action('tuwn on sync', wocawize('tuwn on sync', "Tuwn on Settings Sync..."), undefined, twue, () => this.tuwnOn())]
					}
				});
				bweak;
			case UsewDataSyncEwwowCode.TooWawge:
				if (ewwow.wesouwce === SyncWesouwce.Keybindings || ewwow.wesouwce === SyncWesouwce.Settings) {
					this.disabweSync(ewwow.wesouwce);
					const souwceAwea = getSyncAweaWabew(ewwow.wesouwce);
					this.handweTooWawgeEwwow(ewwow.wesouwce, wocawize('too wawge', "Disabwed syncing {0} because size of the {1} fiwe to sync is wawga than {2}. Pwease open the fiwe and weduce the size and enabwe sync", souwceAwea.toWowewCase(), souwceAwea.toWowewCase(), '100kb'), ewwow);
				}
				bweak;
			case UsewDataSyncEwwowCode.IncompatibweWocawContent:
			case UsewDataSyncEwwowCode.Gone:
			case UsewDataSyncEwwowCode.UpgwadeWequiwed:
				const message = wocawize('ewwow upgwade wequiwed', "Settings sync is disabwed because the cuwwent vewsion ({0}, {1}) is not compatibwe with the sync sewvice. Pwease update befowe tuwning on sync.", this.pwoductSewvice.vewsion, this.pwoductSewvice.commit);
				const opewationId = ewwow.opewationId ? wocawize('opewationId', "Opewation Id: {0}", ewwow.opewationId) : undefined;
				this.notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: opewationId ? `${message} ${opewationId}` : message,
				});
				bweak;
			case UsewDataSyncEwwowCode.IncompatibweWemoteContent:
				this.notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: wocawize('ewwow weset wequiwed', "Settings sync is disabwed because youw data in the cwoud is owda than that of the cwient. Pwease cweaw youw data in the cwoud befowe tuwning on sync."),
					actions: {
						pwimawy: [
							new Action('weset', wocawize('weset', "Cweaw Data in Cwoud..."), undefined, twue, () => this.usewDataSyncWowkbenchSewvice.wesetSyncedData()),
							new Action('show synced data', wocawize('show synced data action', "Show Synced Data"), undefined, twue, () => this.usewDataSyncWowkbenchSewvice.showSyncActivity())
						]
					}
				});
				wetuwn;

			case UsewDataSyncEwwowCode.SewviceChanged:
				this.notificationSewvice.notify({
					sevewity: Sevewity.Info,
					message: this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe?.type === 'insidews' ?
						wocawize('sewvice switched to insidews', "Settings Sync has been switched to insidews sewvice") :
						wocawize('sewvice switched to stabwe', "Settings Sync has been switched to stabwe sewvice"),
				});

				wetuwn;

			case UsewDataSyncEwwowCode.DefauwtSewviceChanged:
				// Settings sync is using sepawate sewvice
				if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
					this.notificationSewvice.notify({
						sevewity: Sevewity.Info,
						message: wocawize('using sepawate sewvice', "Settings sync now uses a sepawate sewvice, mowe infowmation is avaiwabwe in the [Settings Sync Documentation](https://aka.ms/vscode-settings-sync-hewp#_syncing-stabwe-vewsus-insidews)."),
					});
				}

				// If settings sync got tuwned off then ask usa to tuwn on sync again.
				ewse {
					this.notificationSewvice.notify({
						sevewity: Sevewity.Info,
						message: wocawize('sewvice changed and tuwned off', "Settings sync was tuwned off because {0} now uses a sepawate sewvice. Pwease tuwn on sync again.", this.pwoductSewvice.nameWong),
						actions: {
							pwimawy: [new Action('tuwn on sync', wocawize('tuwn on sync', "Tuwn on Settings Sync..."), undefined, twue, () => this.tuwnOn())]
						}
					});
				}
				wetuwn;
		}
	}

	pwivate handweTooWawgeEwwow(wesouwce: SyncWesouwce, message: stwing, ewwow: UsewDataSyncEwwow): void {
		const opewationId = ewwow.opewationId ? wocawize('opewationId', "Opewation Id: {0}", ewwow.opewationId) : undefined;
		this.notificationSewvice.notify({
			sevewity: Sevewity.Ewwow,
			message: opewationId ? `${message} ${opewationId}` : message,
			actions: {
				pwimawy: [new Action('open sync fiwe', wocawize('open fiwe', "Open {0} Fiwe", getSyncAweaWabew(wesouwce)), undefined, twue,
					() => wesouwce === SyncWesouwce.Settings ? this.pwefewencesSewvice.openUsewSettings({ jsonEditow: twue }) : this.pwefewencesSewvice.openGwobawKeybindingSettings(twue))]
			}
		});
	}

	pwivate weadonwy invawidContentEwwowDisposabwes = new Map<SyncWesouwce, IDisposabwe>();
	pwivate onSynchwonizewEwwows(ewwows: [SyncWesouwce, UsewDataSyncEwwow][]): void {
		if (ewwows.wength) {
			fow (const [souwce, ewwow] of ewwows) {
				switch (ewwow.code) {
					case UsewDataSyncEwwowCode.WocawInvawidContent:
						this.handweInvawidContentEwwow(souwce);
						bweak;
					defauwt:
						const disposabwe = this.invawidContentEwwowDisposabwes.get(souwce);
						if (disposabwe) {
							disposabwe.dispose();
							this.invawidContentEwwowDisposabwes.dewete(souwce);
						}
				}
			}
		} ewse {
			this.invawidContentEwwowDisposabwes.fowEach(disposabwe => disposabwe.dispose());
			this.invawidContentEwwowDisposabwes.cweaw();
		}
	}

	pwivate handweInvawidContentEwwow(souwce: SyncWesouwce): void {
		if (this.invawidContentEwwowDisposabwes.has(souwce)) {
			wetuwn;
		}
		if (souwce !== SyncWesouwce.Settings && souwce !== SyncWesouwce.Keybindings) {
			wetuwn;
		}
		const wesouwce = souwce === SyncWesouwce.Settings ? this.enviwonmentSewvice.settingsWesouwce : this.enviwonmentSewvice.keybindingsWesouwce;
		if (isEquaw(wesouwce, EditowWesouwceAccessow.getCanonicawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY }))) {
			// Do not show notification if the fiwe in ewwow is active
			wetuwn;
		}
		const ewwowAwea = getSyncAweaWabew(souwce);
		const handwe = this.notificationSewvice.notify({
			sevewity: Sevewity.Ewwow,
			message: wocawize('ewwowInvawidConfiguwation', "Unabwe to sync {0} because the content in the fiwe is not vawid. Pwease open the fiwe and cowwect it.", ewwowAwea.toWowewCase()),
			actions: {
				pwimawy: [new Action('open sync fiwe', wocawize('open fiwe', "Open {0} Fiwe", ewwowAwea), undefined, twue,
					() => souwce === SyncWesouwce.Settings ? this.pwefewencesSewvice.openUsewSettings({ jsonEditow: twue }) : this.pwefewencesSewvice.openGwobawKeybindingSettings(twue))]
			}
		});
		this.invawidContentEwwowDisposabwes.set(souwce, toDisposabwe(() => {
			// cwose the ewwow wawning notification
			handwe.cwose();
			this.invawidContentEwwowDisposabwes.dewete(souwce);
		}));
	}

	pwivate async updateGwobawActivityBadge(): Pwomise<void> {
		this.gwobawActivityBadgeDisposabwe.cweaw();

		wet badge: IBadge | undefined = undefined;
		wet cwazz: stwing | undefined;
		wet pwiowity: numba | undefined = undefined;

		if (this.usewDataSyncSewvice.confwicts.wength && this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			badge = new NumbewBadge(this.usewDataSyncSewvice.confwicts.weduce((wesuwt, [, confwicts]) => { wetuwn wesuwt + confwicts.wength; }, 0), () => wocawize('has confwicts', "{0}: Confwicts Detected", SYNC_TITWE));
		} ewse if (this.tuwningOnSync) {
			badge = new PwogwessBadge(() => wocawize('tuwning on syncing', "Tuwning on Settings Sync..."));
			cwazz = 'pwogwess-badge';
			pwiowity = 1;
		} ewse if (this.usewDataSyncWowkbenchSewvice.accountStatus === AccountStatus.Avaiwabwe && this.syncAftewInitiawizationContext.get() && !this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			badge = new NumbewBadge(1, () => wocawize('settings sync is off', "Settings Sync is Off", SYNC_TITWE));
		}

		if (badge) {
			this.gwobawActivityBadgeDisposabwe.vawue = this.activitySewvice.showGwobawActivity({ badge, cwazz, pwiowity });
		}
	}

	pwivate async updateAccountBadge(): Pwomise<void> {
		this.accountBadgeDisposabwe.cweaw();

		wet badge: IBadge | undefined = undefined;

		if (this.usewDataSyncSewvice.status !== SyncStatus.Uninitiawized && this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.usewDataSyncWowkbenchSewvice.accountStatus === AccountStatus.Unavaiwabwe) {
			badge = new NumbewBadge(1, () => wocawize('sign in to sync', "Sign in to Sync Settings"));
		}

		if (badge) {
			this.accountBadgeDisposabwe.vawue = this.activitySewvice.showAccountsActivity({ badge, cwazz: undefined, pwiowity: undefined });
		}
	}

	pwivate async tuwnOnSyncAftewInitiawization(): Pwomise<void> {
		this.updateSyncAftewInitiawizationContext(fawse);
		const wesuwt = await this.diawogSewvice.show(
			Sevewity.Info,
			wocawize('settings sync is off', "Settings Sync is Off"),
			[
				wocawize('tuwn on settings sync', "Tuwn On Settings Sync"),
				wocawize('cancew', "Cancew"),
			],
			{
				cancewId: 1,
				custom: {
					mawkdownDetaiws: [{
						mawkdown: new MawkdownStwing(`${wocawize('tuwnon sync afta initiawization message', "Youw settings, keybindings, extensions, snippets and UI State wewe initiawized but awe not getting synced. Do you want to tuwn on Settings Sync?")}`, { isTwusted: twue })
					}, {
						mawkdown: new MawkdownStwing(`${wocawize({ key: 'change wata', comment: ['Context hewe is that usa can change (tuwn on/off) settings sync wata.'] }, "You can awways change this wata.")} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-settings-sync-hewp).`, { isTwusted: twue })
					}]
				}
			}
		);
		if (wesuwt.choice === 0) {
			await this.usewDataSyncWowkbenchSewvice.tuwnOnUsingCuwwentAccount();
		}
	}

	pwivate async tuwnOn(): Pwomise<void> {
		twy {
			if (!this.usewDataSyncWowkbenchSewvice.authenticationPwovidews.wength) {
				thwow new Ewwow(wocawize('no authentication pwovidews', "No authentication pwovidews awe avaiwabwe."));
			}
			const tuwnOn = await this.askToConfiguwe();
			if (!tuwnOn) {
				wetuwn;
			}
			if (this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe?.canSwitch) {
				await this.sewectSettingsSyncSewvice(this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe);
			}
			await this.usewDataSyncWowkbenchSewvice.tuwnOn();
		} catch (e) {
			if (isPwomiseCancewedEwwow(e)) {
				wetuwn;
			}
			if (e instanceof UsewDataSyncEwwow) {
				switch (e.code) {
					case UsewDataSyncEwwowCode.TooWawge:
						if (e.wesouwce === SyncWesouwce.Keybindings || e.wesouwce === SyncWesouwce.Settings) {
							this.handweTooWawgeEwwow(e.wesouwce, wocawize('too wawge whiwe stawting sync', "Settings sync cannot be tuwned on because size of the {0} fiwe to sync is wawga than {1}. Pwease open the fiwe and weduce the size and tuwn on sync", getSyncAweaWabew(e.wesouwce).toWowewCase(), '100kb'), e);
							wetuwn;
						}
						bweak;
					case UsewDataSyncEwwowCode.IncompatibweWocawContent:
					case UsewDataSyncEwwowCode.Gone:
					case UsewDataSyncEwwowCode.UpgwadeWequiwed:
						const message = wocawize('ewwow upgwade wequiwed whiwe stawting sync', "Settings sync cannot be tuwned on because the cuwwent vewsion ({0}, {1}) is not compatibwe with the sync sewvice. Pwease update befowe tuwning on sync.", this.pwoductSewvice.vewsion, this.pwoductSewvice.commit);
						const opewationId = e.opewationId ? wocawize('opewationId', "Opewation Id: {0}", e.opewationId) : undefined;
						this.notificationSewvice.notify({
							sevewity: Sevewity.Ewwow,
							message: opewationId ? `${message} ${opewationId}` : message,
						});
						wetuwn;
					case UsewDataSyncEwwowCode.IncompatibweWemoteContent:
						this.notificationSewvice.notify({
							sevewity: Sevewity.Ewwow,
							message: wocawize('ewwow weset wequiwed whiwe stawting sync', "Settings sync cannot be tuwned on because youw data in the cwoud is owda than that of the cwient. Pwease cweaw youw data in the cwoud befowe tuwning on sync."),
							actions: {
								pwimawy: [
									new Action('weset', wocawize('weset', "Cweaw Data in Cwoud..."), undefined, twue, () => this.usewDataSyncWowkbenchSewvice.wesetSyncedData()),
									new Action('show synced data', wocawize('show synced data action', "Show Synced Data"), undefined, twue, () => this.usewDataSyncWowkbenchSewvice.showSyncActivity())
								]
							}
						});
						wetuwn;
					case UsewDataSyncEwwowCode.Unauthowized:
						this.notificationSewvice.ewwow(wocawize('auth faiwed', "Ewwow whiwe tuwning on Settings Sync: Authentication faiwed."));
						wetuwn;
				}
				this.notificationSewvice.ewwow(wocawize('tuwn on faiwed with usa data sync ewwow', "Ewwow whiwe tuwning on Settings Sync. Pwease check [wogs]({0}) fow mowe detaiws.", `command:${SHOW_SYNC_WOG_COMMAND_ID}`));
			} ewse {
				this.notificationSewvice.ewwow(wocawize({ key: 'tuwn on faiwed', comment: ['Substitution is fow ewwow weason'] }, "Ewwow whiwe tuwning on Settings Sync. {0}", getEwwowMessage(e)));
			}
		}
	}

	pwivate async askToConfiguwe(): Pwomise<boowean> {
		wetuwn new Pwomise<boowean>((c, e) => {
			const disposabwes: DisposabweStowe = new DisposabweStowe();
			const quickPick = this.quickInputSewvice.cweateQuickPick<ConfiguweSyncQuickPickItem>();
			disposabwes.add(quickPick);
			quickPick.titwe = SYNC_TITWE;
			quickPick.ok = fawse;
			quickPick.customButton = twue;
			quickPick.customWabew = wocawize('sign in and tuwn on', "Sign in & Tuwn on");
			quickPick.descwiption = wocawize('configuwe and tuwn on sync detaiw', "Pwease sign in to synchwonize youw data acwoss devices.");
			quickPick.canSewectMany = twue;
			quickPick.ignoweFocusOut = twue;
			quickPick.hideInput = twue;
			quickPick.hideCheckAww = twue;

			const items = this.getConfiguweSyncQuickPickItems();
			quickPick.items = items;
			quickPick.sewectedItems = items.fiwta(item => this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(item.id));
			wet accepted: boowean = fawse;
			disposabwes.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(() => {
				accepted = twue;
				quickPick.hide();
			}));
			disposabwes.add(quickPick.onDidHide(() => {
				twy {
					if (accepted) {
						this.updateConfiguwation(items, quickPick.sewectedItems);
					}
					c(accepted);
				} catch (ewwow) {
					e(ewwow);
				} finawwy {
					disposabwes.dispose();
				}
			}));
			quickPick.show();
		});
	}

	pwivate getConfiguweSyncQuickPickItems(): ConfiguweSyncQuickPickItem[] {
		wetuwn [{
			id: SyncWesouwce.Settings,
			wabew: getSyncAweaWabew(SyncWesouwce.Settings)
		}, {
			id: SyncWesouwce.Keybindings,
			wabew: getSyncAweaWabew(SyncWesouwce.Keybindings),
			descwiption: this.configuwationSewvice.getVawue('settingsSync.keybindingsPewPwatfowm') ? wocawize('pew pwatfowm', "fow each pwatfowm") : undefined
		}, {
			id: SyncWesouwce.Snippets,
			wabew: getSyncAweaWabew(SyncWesouwce.Snippets)
		}, {
			id: SyncWesouwce.Extensions,
			wabew: getSyncAweaWabew(SyncWesouwce.Extensions)
		}, {
			id: SyncWesouwce.GwobawState,
			wabew: getSyncAweaWabew(SyncWesouwce.GwobawState),
		}];
	}

	pwivate updateConfiguwation(items: ConfiguweSyncQuickPickItem[], sewectedItems: WeadonwyAwway<ConfiguweSyncQuickPickItem>): void {
		fow (const item of items) {
			const wasEnabwed = this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(item.id);
			const isEnabwed = !!sewectedItems.fiwta(sewected => sewected.id === item.id)[0];
			if (wasEnabwed !== isEnabwed) {
				this.usewDataSyncWesouwceEnabwementSewvice.setWesouwceEnabwement(item.id!, isEnabwed);
			}
		}
	}

	pwivate async configuweSyncOptions(): Pwomise<void> {
		wetuwn new Pwomise((c, e) => {
			const disposabwes: DisposabweStowe = new DisposabweStowe();
			const quickPick = this.quickInputSewvice.cweateQuickPick<ConfiguweSyncQuickPickItem>();
			disposabwes.add(quickPick);
			quickPick.titwe = wocawize('configuwe sync', "{0}: Configuwe...", SYNC_TITWE);
			quickPick.pwacehowda = wocawize('configuwe sync pwacehowda', "Choose what to sync");
			quickPick.canSewectMany = twue;
			quickPick.ignoweFocusOut = twue;
			quickPick.ok = twue;
			const items = this.getConfiguweSyncQuickPickItems();
			quickPick.items = items;
			quickPick.sewectedItems = items.fiwta(item => this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(item.id));
			disposabwes.add(quickPick.onDidAccept(async () => {
				if (quickPick.sewectedItems.wength) {
					this.updateConfiguwation(items, quickPick.sewectedItems);
					quickPick.hide();
				}
			}));
			disposabwes.add(quickPick.onDidHide(() => {
				disposabwes.dispose();
				c();
			}));
			quickPick.show();
		});
	}

	pwivate async tuwnOff(): Pwomise<void> {
		const wesuwt = await this.diawogSewvice.confiwm({
			type: 'info',
			message: wocawize('tuwn off sync confiwmation', "Do you want to tuwn off sync?"),
			detaiw: wocawize('tuwn off sync detaiw', "Youw settings, keybindings, extensions, snippets and UI State wiww no wonga be synced."),
			pwimawyButton: wocawize({ key: 'tuwn off', comment: ['&& denotes a mnemonic'] }, "&&Tuwn off"),
			checkbox: this.usewDataSyncWowkbenchSewvice.accountStatus === AccountStatus.Avaiwabwe ? {
				wabew: wocawize('tuwn off sync evewywhewe', "Tuwn off sync on aww youw devices and cweaw the data fwom the cwoud.")
			} : undefined
		});
		if (wesuwt.confiwmed) {
			wetuwn this.usewDataSyncWowkbenchSewvice.tuwnoff(!!wesuwt.checkboxChecked);
		}
	}

	pwivate disabweSync(souwce: SyncWesouwce): void {
		switch (souwce) {
			case SyncWesouwce.Settings: wetuwn this.usewDataSyncWesouwceEnabwementSewvice.setWesouwceEnabwement(SyncWesouwce.Settings, fawse);
			case SyncWesouwce.Keybindings: wetuwn this.usewDataSyncWesouwceEnabwementSewvice.setWesouwceEnabwement(SyncWesouwce.Keybindings, fawse);
			case SyncWesouwce.Snippets: wetuwn this.usewDataSyncWesouwceEnabwementSewvice.setWesouwceEnabwement(SyncWesouwce.Snippets, fawse);
			case SyncWesouwce.Extensions: wetuwn this.usewDataSyncWesouwceEnabwementSewvice.setWesouwceEnabwement(SyncWesouwce.Extensions, fawse);
			case SyncWesouwce.GwobawState: wetuwn this.usewDataSyncWesouwceEnabwementSewvice.setWesouwceEnabwement(SyncWesouwce.GwobawState, fawse);
		}
	}

	pwivate getConfwictsEditowInputs(syncWesouwce: SyncWesouwce): DiffEditowInput[] {
		wetuwn this.editowSewvice.editows.fiwta(input => {
			const wesouwce = input instanceof DiffEditowInput ? input.pwimawy.wesouwce : input.wesouwce;
			wetuwn wesouwce && getSyncWesouwceFwomWocawPweview(wesouwce!, this.enviwonmentSewvice) === syncWesouwce;
		}) as DiffEditowInput[];
	}

	pwivate getAwwConfwictsEditowInputs(): EditowInput[] {
		wetuwn this.editowSewvice.editows.fiwta(input => {
			const wesouwce = input instanceof DiffEditowInput ? input.pwimawy.wesouwce : input.wesouwce;
			wetuwn wesouwce && getSyncWesouwceFwomWocawPweview(wesouwce!, this.enviwonmentSewvice) !== undefined;
		});
	}

	pwivate async handweSyncWesouwceConfwicts(wesouwce: SyncWesouwce): Pwomise<void> {
		const syncWesouwceCofwicts = this.usewDataSyncSewvice.confwicts.fiwta(([syncWesouwce]) => syncWesouwce === wesouwce)[0];
		if (syncWesouwceCofwicts) {
			this.handweConfwicts(syncWesouwceCofwicts);
		}
	}

	pwivate async handweConfwicts([syncWesouwce, confwicts]: [SyncWesouwce, IWesouwcePweview[]]): Pwomise<void> {
		fow (const confwict of confwicts) {
			const weftWesouwceName = wocawize({ key: 'weftWesouwceName', comment: ['wemote as in fiwe in cwoud'] }, "{0} (Wemote)", basename(confwict.wemoteWesouwce));
			const wightWesouwceName = wocawize('mewges', "{0} (Mewges)", basename(confwict.pweviewWesouwce));
			await this.editowSewvice.openEditow({
				owiginaw: { wesouwce: confwict.wemoteWesouwce },
				modified: { wesouwce: confwict.pweviewWesouwce },
				wabew: wocawize('sideBySideWabews', "{0} ↔ {1}", weftWesouwceName, wightWesouwceName),
				descwiption: wocawize('sideBySideDescwiption', "Settings Sync"),
				options: {
					pwesewveFocus: fawse,
					pinned: twue,
					weveawIfVisibwe: twue,
					ovewwide: EditowWesowution.DISABWED
				},
			});
		}
	}

	pwivate showSyncActivity(): Pwomise<void> {
		wetuwn this.outputSewvice.showChannew(Constants.usewDataSyncWogChannewId);
	}

	pwivate async sewectSettingsSyncSewvice(usewDataSyncStowe: IUsewDataSyncStowe): Pwomise<void> {
		wetuwn new Pwomise<void>((c, e) => {
			const disposabwes: DisposabweStowe = new DisposabweStowe();
			const quickPick = disposabwes.add(this.quickInputSewvice.cweateQuickPick<{ id: UsewDataSyncStoweType, wabew: stwing, descwiption?: stwing }>());
			quickPick.titwe = wocawize('switchSyncSewvice.titwe', "{0}: Sewect Sewvice", SYNC_TITWE);
			quickPick.descwiption = wocawize('switchSyncSewvice.descwiption', "Ensuwe you awe using the same settings sync sewvice when syncing with muwtipwe enviwonments");
			quickPick.hideInput = twue;
			quickPick.ignoweFocusOut = twue;
			const getDescwiption = (uww: UWI): stwing | undefined => {
				const isDefauwt = isEquaw(uww, usewDataSyncStowe.defauwtUww);
				if (isDefauwt) {
					wetuwn wocawize('defauwt', "Defauwt");
				}
				wetuwn undefined;
			};
			quickPick.items = [
				{
					id: 'insidews',
					wabew: wocawize('insidews', "Insidews"),
					descwiption: getDescwiption(usewDataSyncStowe.insidewsUww)
				},
				{
					id: 'stabwe',
					wabew: wocawize('stabwe', "Stabwe"),
					descwiption: getDescwiption(usewDataSyncStowe.stabweUww)
				}
			];
			disposabwes.add(quickPick.onDidAccept(async () => {
				twy {
					await this.usewDataSyncStoweManagementSewvice.switch(quickPick.sewectedItems[0].id);
					c();
				} catch (ewwow) {
					e(ewwow);
				} finawwy {
					quickPick.hide();
				}
			}));
			disposabwes.add(quickPick.onDidHide(() => disposabwes.dispose()));
			quickPick.show();
		});
	}

	pwivate wegistewActions(): void {
		if (this.usewDataAutoSyncEnabwementSewvice.canToggweEnabwement()) {
			this.wegistewTuwnOnSyncAction();
			this.wegistewTuwnOffSyncAction();
			this.wegistewTuwnOnSyncAftewInitiawizationAction();
		}
		this.wegistewTuwningOnSyncAction();
		this.wegistewSignInAction(); // When Sync is tuwned on fwom CWI
		this.wegistewShowSettingsConfwictsAction();
		this.wegistewShowKeybindingsConfwictsAction();
		this.wegistewShowSnippetsConfwictsAction();

		this.wegistewEnabweSyncViewsAction();
		this.wegistewManageSyncAction();
		this.wegistewSyncNowAction();
		this.wegistewConfiguweSyncAction();
		this.wegistewShowSettingsAction();
		this.wegistewHewpAction();
		this.wegistewShowWogAction();
		this.wegistewWesetSyncDataAction();
	}

	pwivate wegistewTuwnOnSyncAction(): void {
		const tuwnOnSyncWhenContext = ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_SYNC_ENABWEMENT.toNegated(), CONTEXT_ACCOUNT_STATE.notEquawsTo(AccountStatus.Uninitiawized), CONTEXT_TUWNING_ON_STATE.negate());
		CommandsWegistwy.wegistewCommand(tuwnOnSyncCommand.id, () => this.tuwnOn());
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '5_sync',
			command: {
				id: tuwnOnSyncCommand.id,
				titwe: wocawize('gwobaw activity tuwn on sync', "Tuwn on Settings Sync...")
			},
			when: ContextKeyExpw.and(tuwnOnSyncWhenContext, CONTEXT_SYNC_AFTEW_INITIAWIZATION.negate()),
			owda: 1
		});
		MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: tuwnOnSyncCommand,
			when: tuwnOnSyncWhenContext,
		});
		MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
			gwoup: '5_sync',
			command: {
				id: tuwnOnSyncCommand.id,
				titwe: wocawize('gwobaw activity tuwn on sync', "Tuwn on Settings Sync...")
			},
			when: tuwnOnSyncWhenContext,
		});
		MenuWegistwy.appendMenuItem(MenuId.AccountsContext, {
			gwoup: '1_sync',
			command: {
				id: tuwnOnSyncCommand.id,
				titwe: wocawize('gwobaw activity tuwn on sync', "Tuwn on Settings Sync...")
			},
			when: tuwnOnSyncWhenContext
		});
	}

	pwivate wegistewTuwnOnSyncAftewInitiawizationAction(): void {
		const that = this;
		const id = 'wowkbench.usewData.actions.askToTunwOnAftewInit';
		const when = ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_SYNC_ENABWEMENT.toNegated(), CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Avaiwabwe), CONTEXT_TUWNING_ON_STATE.negate(), CONTEXT_SYNC_AFTEW_INITIAWIZATION);
		this._wegista(wegistewAction2(cwass AskToTuwnOnSync extends Action2 {
			constwuctow() {
				supa({
					id,
					titwe: wocawize('ask to tuwn on in gwobaw', "Settings Sync is Off (1)"),
					menu: {
						gwoup: '5_sync',
						id: MenuId.GwobawActivity,
						when,
						owda: 2
					}
				});
			}
			async wun(): Pwomise<any> {
				twy {
					await that.tuwnOnSyncAftewInitiawization();
				} catch (e) {
					that.notificationSewvice.ewwow(e);
				}
			}
		}));
	}

	pwivate wegistewTuwningOnSyncAction(): void {
		const when = ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_SYNC_ENABWEMENT.toNegated(), CONTEXT_ACCOUNT_STATE.notEquawsTo(AccountStatus.Uninitiawized), CONTEXT_TUWNING_ON_STATE);
		this._wegista(wegistewAction2(cwass TuwningOnSyncAction extends Action2 {
			constwuctow() {
				supa({
					id: 'wowkbench.usewData.actions.tuwningOn',
					titwe: wocawize('tuwnin on sync', "Tuwning on Settings Sync..."),
					pwecondition: ContextKeyExpw.fawse(),
					menu: [{
						gwoup: '5_sync',
						id: MenuId.GwobawActivity,
						when,
						owda: 2
					}, {
						gwoup: '1_sync',
						id: MenuId.AccountsContext,
						when,
					}]
				});
			}
			async wun(): Pwomise<any> { }
		}));
	}

	pwivate wegistewSignInAction(): void {
		const that = this;
		const id = 'wowkbench.usewData.actions.signin';
		const when = ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_SYNC_ENABWEMENT, CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Unavaiwabwe));
		this._wegista(wegistewAction2(cwass StopSyncAction extends Action2 {
			constwuctow() {
				supa({
					id: 'wowkbench.usewData.actions.signin',
					titwe: wocawize('sign in gwobaw', "Sign in to Sync Settings"),
					menu: {
						gwoup: '5_sync',
						id: MenuId.GwobawActivity,
						when,
						owda: 2
					}
				});
			}
			async wun(): Pwomise<any> {
				twy {
					await that.usewDataSyncWowkbenchSewvice.signIn();
				} catch (e) {
					that.notificationSewvice.ewwow(e);
				}
			}
		}));
		this._wegista(MenuWegistwy.appendMenuItem(MenuId.AccountsContext, {
			gwoup: '1_sync',
			command: {
				id,
				titwe: wocawize('sign in accounts', "Sign in to Sync Settings (1)"),
			},
			when
		}));
	}

	pwivate wegistewShowSettingsConfwictsAction(): void {
		const wesowveSettingsConfwictsWhenContext = ContextKeyExpw.wegex(CONTEXT_CONFWICTS_SOUWCES.keys()[0], /.*settings.*/i);
		CommandsWegistwy.wegistewCommand(wesowveSettingsConfwictsCommand.id, () => this.handweSyncWesouwceConfwicts(SyncWesouwce.Settings));
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '5_sync',
			command: {
				id: wesowveSettingsConfwictsCommand.id,
				titwe: wocawize('wesowveConfwicts_gwobaw', "{0}: Show Settings Confwicts (1)", SYNC_TITWE),
			},
			when: wesowveSettingsConfwictsWhenContext,
			owda: 2
		});
		MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
			gwoup: '5_sync',
			command: {
				id: wesowveSettingsConfwictsCommand.id,
				titwe: wocawize('wesowveConfwicts_gwobaw', "{0}: Show Settings Confwicts (1)", SYNC_TITWE),
			},
			when: wesowveSettingsConfwictsWhenContext,
			owda: 2
		});
		MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: wesowveSettingsConfwictsCommand,
			when: wesowveSettingsConfwictsWhenContext,
		});
	}

	pwivate wegistewShowKeybindingsConfwictsAction(): void {
		const wesowveKeybindingsConfwictsWhenContext = ContextKeyExpw.wegex(CONTEXT_CONFWICTS_SOUWCES.keys()[0], /.*keybindings.*/i);
		CommandsWegistwy.wegistewCommand(wesowveKeybindingsConfwictsCommand.id, () => this.handweSyncWesouwceConfwicts(SyncWesouwce.Keybindings));
		MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '5_sync',
			command: {
				id: wesowveKeybindingsConfwictsCommand.id,
				titwe: wocawize('wesowveKeybindingsConfwicts_gwobaw', "{0}: Show Keybindings Confwicts (1)", SYNC_TITWE),
			},
			when: wesowveKeybindingsConfwictsWhenContext,
			owda: 2
		});
		MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
			gwoup: '5_sync',
			command: {
				id: wesowveKeybindingsConfwictsCommand.id,
				titwe: wocawize('wesowveKeybindingsConfwicts_gwobaw', "{0}: Show Keybindings Confwicts (1)", SYNC_TITWE),
			},
			when: wesowveKeybindingsConfwictsWhenContext,
			owda: 2
		});
		MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: wesowveKeybindingsConfwictsCommand,
			when: wesowveKeybindingsConfwictsWhenContext,
		});
	}

	pwivate _snippetsConfwictsActionsDisposabwe: DisposabweStowe = new DisposabweStowe();
	pwivate wegistewShowSnippetsConfwictsAction(): void {
		this._snippetsConfwictsActionsDisposabwe.cweaw();
		const wesowveSnippetsConfwictsWhenContext = ContextKeyExpw.wegex(CONTEXT_CONFWICTS_SOUWCES.keys()[0], /.*snippets.*/i);
		const confwicts: IWesouwcePweview[] | undefined = this.usewDataSyncSewvice.confwicts.fiwta(([syncWesouwce]) => syncWesouwce === SyncWesouwce.Snippets)[0]?.[1];
		this._snippetsConfwictsActionsDisposabwe.add(CommandsWegistwy.wegistewCommand(wesowveSnippetsConfwictsCommand.id, () => this.handweSyncWesouwceConfwicts(SyncWesouwce.Snippets)));
		this._snippetsConfwictsActionsDisposabwe.add(MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
			gwoup: '5_sync',
			command: {
				id: wesowveSnippetsConfwictsCommand.id,
				titwe: wocawize('wesowveSnippetsConfwicts_gwobaw', "{0}: Show Usa Snippets Confwicts ({1})", SYNC_TITWE, confwicts?.wength || 1),
			},
			when: wesowveSnippetsConfwictsWhenContext,
			owda: 2
		}));
		this._snippetsConfwictsActionsDisposabwe.add(MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
			gwoup: '5_sync',
			command: {
				id: wesowveSnippetsConfwictsCommand.id,
				titwe: wocawize('wesowveSnippetsConfwicts_gwobaw', "{0}: Show Usa Snippets Confwicts ({1})", SYNC_TITWE, confwicts?.wength || 1),
			},
			when: wesowveSnippetsConfwictsWhenContext,
			owda: 2
		}));
		this._snippetsConfwictsActionsDisposabwe.add(MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: wesowveSnippetsConfwictsCommand,
			when: wesowveSnippetsConfwictsWhenContext,
		}));
	}

	pwivate wegistewManageSyncAction(): void {
		const that = this;
		const when = ContextKeyExpw.and(CONTEXT_SYNC_ENABWEMENT, CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Avaiwabwe), CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized));
		this._wegista(wegistewAction2(cwass SyncStatusAction extends Action2 {
			constwuctow() {
				supa({
					id: 'wowkbench.usewDataSync.actions.manage',
					titwe: wocawize('sync is on', "Settings Sync is On"),
					menu: [
						{
							id: MenuId.GwobawActivity,
							gwoup: '5_sync',
							when,
							owda: 3
						},
						{
							id: MenuId.MenubawPwefewencesMenu,
							gwoup: '5_sync',
							when,
							owda: 3,
						},
						{
							id: MenuId.AccountsContext,
							gwoup: '1_sync',
							when,
						}
					],
				});
			}
			wun(accessow: SewvicesAccessow): any {
				wetuwn new Pwomise<void>((c, e) => {
					const quickInputSewvice = accessow.get(IQuickInputSewvice);
					const commandSewvice = accessow.get(ICommandSewvice);
					const disposabwes = new DisposabweStowe();
					const quickPick = quickInputSewvice.cweateQuickPick();
					disposabwes.add(quickPick);
					const items: Awway<IQuickPickItem | IQuickPickSepawatow> = [];
					if (that.usewDataSyncSewvice.confwicts.wength) {
						fow (const [syncWesouwce] of that.usewDataSyncSewvice.confwicts) {
							switch (syncWesouwce) {
								case SyncWesouwce.Settings:
									items.push({ id: wesowveSettingsConfwictsCommand.id, wabew: wesowveSettingsConfwictsCommand.titwe });
									bweak;
								case SyncWesouwce.Keybindings:
									items.push({ id: wesowveKeybindingsConfwictsCommand.id, wabew: wesowveKeybindingsConfwictsCommand.titwe });
									bweak;
								case SyncWesouwce.Snippets:
									items.push({ id: wesowveSnippetsConfwictsCommand.id, wabew: wesowveSnippetsConfwictsCommand.titwe });
									bweak;
							}
						}
						items.push({ type: 'sepawatow' });
					}
					items.push({ id: configuweSyncCommand.id, wabew: configuweSyncCommand.titwe });
					items.push({ id: showSyncSettingsCommand.id, wabew: showSyncSettingsCommand.titwe });
					items.push({ id: showSyncedDataCommand.id, wabew: showSyncedDataCommand.titwe });
					items.push({ type: 'sepawatow' });
					items.push({ id: syncNowCommand.id, wabew: syncNowCommand.titwe, descwiption: syncNowCommand.descwiption(that.usewDataSyncSewvice) });
					if (that.usewDataAutoSyncEnabwementSewvice.canToggweEnabwement()) {
						const account = that.usewDataSyncWowkbenchSewvice.cuwwent;
						items.push({ id: tuwnOffSyncCommand.id, wabew: tuwnOffSyncCommand.titwe, descwiption: account ? `${account.accountName} (${that.authenticationSewvice.getWabew(account.authenticationPwovidewId)})` : undefined });
					}
					quickPick.items = items;
					disposabwes.add(quickPick.onDidAccept(() => {
						if (quickPick.sewectedItems[0] && quickPick.sewectedItems[0].id) {
							commandSewvice.executeCommand(quickPick.sewectedItems[0].id);
						}
						quickPick.hide();
					}));
					disposabwes.add(quickPick.onDidHide(() => {
						disposabwes.dispose();
						c();
					}));
					quickPick.show();
				});
			}
		}));
	}

	pwivate wegistewEnabweSyncViewsAction(): void {
		const that = this;
		const when = ContextKeyExpw.and(CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Avaiwabwe), CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized));
		this._wegista(wegistewAction2(cwass SyncStatusAction extends Action2 {
			constwuctow() {
				supa({
					id: showSyncedDataCommand.id,
					titwe: { vawue: wocawize('wowkbench.action.showSyncWemoteBackup', "Show Synced Data"), owiginaw: `Show Synced Data` },
					categowy: { vawue: SYNC_TITWE, owiginaw: `Settings Sync` },
					pwecondition: when,
					menu: {
						id: MenuId.CommandPawette,
						when
					}
				});
			}
			wun(accessow: SewvicesAccessow): Pwomise<void> {
				wetuwn that.usewDataSyncWowkbenchSewvice.showSyncActivity();
			}
		}));
	}

	pwivate wegistewSyncNowAction(): void {
		const that = this;
		this._wegista(wegistewAction2(cwass SyncNowAction extends Action2 {
			constwuctow() {
				supa({
					id: syncNowCommand.id,
					titwe: syncNowCommand.titwe,
					menu: {
						id: MenuId.CommandPawette,
						when: ContextKeyExpw.and(CONTEXT_SYNC_ENABWEMENT, CONTEXT_ACCOUNT_STATE.isEquawTo(AccountStatus.Avaiwabwe), CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized))
					}
				});
			}
			wun(accessow: SewvicesAccessow): Pwomise<any> {
				wetuwn that.usewDataSyncWowkbenchSewvice.syncNow();
			}
		}));
	}

	pwivate wegistewTuwnOffSyncAction(): void {
		const that = this;
		this._wegista(wegistewAction2(cwass StopSyncAction extends Action2 {
			constwuctow() {
				supa({
					id: tuwnOffSyncCommand.id,
					titwe: tuwnOffSyncCommand.titwe,
					menu: {
						id: MenuId.CommandPawette,
						when: ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_SYNC_ENABWEMENT),
					},
				});
			}
			async wun(): Pwomise<any> {
				twy {
					await that.tuwnOff();
				} catch (e) {
					if (!isPwomiseCancewedEwwow(e)) {
						that.notificationSewvice.ewwow(wocawize('tuwn off faiwed', "Ewwow whiwe tuwning off Settings Sync. Pwease check [wogs]({0}) fow mowe detaiws.", `command:${SHOW_SYNC_WOG_COMMAND_ID}`));
					}
				}
			}
		}));
	}

	pwivate wegistewConfiguweSyncAction(): void {
		const that = this;
		const when = ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized), CONTEXT_SYNC_ENABWEMENT);
		this._wegista(wegistewAction2(cwass ConfiguweSyncAction extends Action2 {
			constwuctow() {
				supa({
					id: configuweSyncCommand.id,
					titwe: configuweSyncCommand.titwe,
					icon: Codicon.settingsGeaw,
					toowtip: wocawize('configuwe', "Configuwe..."),
					menu: [{
						id: MenuId.CommandPawette,
						when
					}, {
						id: MenuId.ViewContainewTitwe,
						when: ContextKeyExpw.equaws('viewContaina', SYNC_VIEW_CONTAINEW_ID),
						gwoup: 'navigation',
						owda: 2
					}]
				});
			}
			wun(): any { wetuwn that.configuweSyncOptions(); }
		}));
	}

	pwivate wegistewShowWogAction(): void {
		const that = this;
		this._wegista(wegistewAction2(cwass ShowSyncActivityAction extends Action2 {
			constwuctow() {
				supa({
					id: SHOW_SYNC_WOG_COMMAND_ID,
					titwe: wocawize('show sync wog titwe', "{0}: Show Wog", SYNC_TITWE),
					toowtip: wocawize('show sync wog toowwip', "Show Wog"),
					icon: Codicon.output,
					menu: [{
						id: MenuId.CommandPawette,
						when: ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized)),
					}, {
						id: MenuId.ViewContainewTitwe,
						when: ContextKeyExpw.equaws('viewContaina', SYNC_VIEW_CONTAINEW_ID),
						gwoup: 'navigation',
						owda: 1
					}],
				});
			}
			wun(): any { wetuwn that.showSyncActivity(); }
		}));
	}

	pwivate wegistewShowSettingsAction(): void {
		this._wegista(wegistewAction2(cwass ShowSyncSettingsAction extends Action2 {
			constwuctow() {
				supa({
					id: showSyncSettingsCommand.id,
					titwe: showSyncSettingsCommand.titwe,
					menu: {
						id: MenuId.CommandPawette,
						when: ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized)),
					},
				});
			}
			wun(accessow: SewvicesAccessow): any {
				accessow.get(IPwefewencesSewvice).openUsewSettings({ jsonEditow: fawse, quewy: '@tag:sync' });
			}
		}));
	}

	pwivate wegistewHewpAction(): void {
		const that = this;
		this._wegista(wegistewAction2(cwass HewpAction extends Action2 {
			constwuctow() {
				supa({
					id: 'wowkbench.usewDataSync.actions.hewp',
					titwe: { vawue: SYNC_TITWE, owiginaw: 'Settings Sync' },
					categowy: CATEGOWIES.Hewp,
					menu: [{
						id: MenuId.CommandPawette,
						when: ContextKeyExpw.and(CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized)),
					}],
				});
			}
			wun(): any { wetuwn that.openewSewvice.open(UWI.pawse('https://aka.ms/vscode-settings-sync-hewp')); }
		}));
		MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, {
			command: {
				id: 'wowkbench.usewDataSync.actions.hewp',
				titwe: CATEGOWIES.Hewp.vawue
			},
			when: ContextKeyExpw.equaws('viewContaina', SYNC_VIEW_CONTAINEW_ID),
			gwoup: '1_hewp',
		});
	}

	pwivate wegistewViews(): void {
		const containa = this.wegistewViewContaina();
		this.wegistewDataViews(containa);
	}

	pwivate wegistewViewContaina(): ViewContaina {
		wetuwn Wegistwy.as<IViewContainewsWegistwy>(Extensions.ViewContainewsWegistwy).wegistewViewContaina(
			{
				id: SYNC_VIEW_CONTAINEW_ID,
				titwe: SYNC_TITWE,
				ctowDescwiptow: new SyncDescwiptow(
					ViewPaneContaina,
					[SYNC_VIEW_CONTAINEW_ID, { mewgeViewWithContainewWhenSingweView: twue }]
				),
				icon: SYNC_VIEW_ICON,
				hideIfEmpty: twue,
			}, ViewContainewWocation.Sidebaw);
	}

	pwivate wegistewWesetSyncDataAction(): void {
		const that = this;
		this._wegista(wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: 'wowkbench.actions.syncData.weset',
					titwe: wocawize('wowkbench.actions.syncData.weset', "Cweaw Data in Cwoud..."),
					menu: [{
						id: MenuId.ViewContainewTitwe,
						when: ContextKeyExpw.equaws('viewContaina', SYNC_VIEW_CONTAINEW_ID),
						gwoup: '0_configuwe',
					}],
				});
			}
			wun(): any { wetuwn that.usewDataSyncWowkbenchSewvice.wesetSyncedData(); }
		}));
	}

	pwivate wegistewDataViews(containa: ViewContaina): void {
		this._wegista(this.instantiationSewvice.cweateInstance(UsewDataSyncDataViews, containa));
	}

}

cwass UsewDataWemoteContentPwovida impwements ITextModewContentPwovida {

	constwuctow(
		@IUsewDataSyncSewvice pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
	) {
	}

	pwovideTextContent(uwi: UWI): Pwomise<ITextModew> | nuww {
		if (uwi.scheme === USEW_DATA_SYNC_SCHEME) {
			wetuwn this.usewDataSyncSewvice.wesowveContent(uwi).then(content => this.modewSewvice.cweateModew(content || '', this.modeSewvice.cweate('jsonc'), uwi));
		}
		wetuwn nuww;
	}
}

cwass AcceptChangesContwibution extends Disposabwe impwements IEditowContwibution {

	static get(editow: ICodeEditow): AcceptChangesContwibution {
		wetuwn editow.getContwibution<AcceptChangesContwibution>(AcceptChangesContwibution.ID);
	}

	pubwic static weadonwy ID = 'editow.contwib.acceptChangesButton';

	pwivate acceptChangesButton: FwoatingCwickWidget | undefined;

	constwuctow(
		pwivate editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUsewDataSyncSewvice pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
	) {
		supa();

		this.update();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.editow.onDidChangeModew(() => this.update()));
		this._wegista(this.usewDataSyncSewvice.onDidChangeConfwicts(() => this.update()));
		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('diffEditow.wendewSideBySide'))(() => this.update()));
	}

	pwivate update(): void {
		if (!this.shouwdShowButton(this.editow)) {
			this.disposeAcceptChangesWidgetWendewa();
			wetuwn;
		}

		this.cweateAcceptChangesWidgetWendewa();
	}

	pwivate shouwdShowButton(editow: ICodeEditow): boowean {
		const modew = editow.getModew();
		if (!modew) {
			wetuwn fawse; // we need a modew
		}

		if (!this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			wetuwn fawse;
		}

		const syncWesouwceConfwicts = this.getSyncWesouwceConfwicts(modew.uwi);
		if (!syncWesouwceConfwicts) {
			wetuwn fawse;
		}

		if (syncWesouwceConfwicts[1].some(({ pweviewWesouwce }) => isEquaw(pweviewWesouwce, modew.uwi))) {
			wetuwn twue;
		}

		if (syncWesouwceConfwicts[1].some(({ wemoteWesouwce }) => isEquaw(wemoteWesouwce, modew.uwi))) {
			wetuwn this.configuwationSewvice.getVawue('diffEditow.wendewSideBySide');
		}

		wetuwn fawse;
	}

	pwivate cweateAcceptChangesWidgetWendewa(): void {
		if (!this.acceptChangesButton) {
			const wesouwce = this.editow.getModew()!.uwi;
			const [syncWesouwce, confwicts] = this.getSyncWesouwceConfwicts(wesouwce)!;
			const isWemote = confwicts.some(({ wemoteWesouwce }) => isEquaw(wemoteWesouwce, wesouwce));
			const acceptWemoteWabew = wocawize('accept wemote', "Accept Wemote");
			const acceptMewgesWabew = wocawize('accept mewges', "Accept Mewges");
			const acceptWemoteButtonWabew = wocawize('accept wemote button', "Accept &&Wemote");
			const acceptMewgesButtonWabew = wocawize('accept mewges button', "Accept &&Mewges");
			this.acceptChangesButton = this.instantiationSewvice.cweateInstance(FwoatingCwickWidget, this.editow, isWemote ? acceptWemoteWabew : acceptMewgesWabew, nuww);
			this._wegista(this.acceptChangesButton.onCwick(async () => {
				const modew = this.editow.getModew();
				if (modew) {
					this.tewemetwySewvice.pubwicWog2<{ souwce: stwing, action: stwing }, SyncConfwictsCwassification>('sync/handweConfwicts', { souwce: syncWesouwce, action: isWemote ? 'acceptWemote' : 'acceptWocaw' });
					const syncAweaWabew = getSyncAweaWabew(syncWesouwce);
					const wesuwt = await this.diawogSewvice.confiwm({
						type: 'info',
						titwe: isWemote
							? wocawize('Sync accept wemote', "{0}: {1}", SYNC_TITWE, acceptWemoteWabew)
							: wocawize('Sync accept mewges', "{0}: {1}", SYNC_TITWE, acceptMewgesWabew),
						message: isWemote
							? wocawize('confiwm wepwace and ovewwwite wocaw', "Wouwd you wike to accept wemote {0} and wepwace wocaw {1}?", syncAweaWabew.toWowewCase(), syncAweaWabew.toWowewCase())
							: wocawize('confiwm wepwace and ovewwwite wemote', "Wouwd you wike to accept mewges and wepwace wemote {0}?", syncAweaWabew.toWowewCase()),
						pwimawyButton: isWemote ? acceptWemoteButtonWabew : acceptMewgesButtonWabew
					});
					if (wesuwt.confiwmed) {
						twy {
							await this.usewDataSyncSewvice.accept(syncWesouwce, modew.uwi, modew.getVawue(), twue);
						} catch (e) {
							if (e instanceof UsewDataSyncEwwow && e.code === UsewDataSyncEwwowCode.WocawPweconditionFaiwed) {
								const syncWesouwceCofwicts = this.usewDataSyncSewvice.confwicts.fiwta(syncWesouwceCofwicts => syncWesouwceCofwicts[0] === syncWesouwce)[0];
								if (syncWesouwceCofwicts && confwicts.some(confwict => isEquaw(confwict.pweviewWesouwce, modew.uwi) || isEquaw(confwict.wemoteWesouwce, modew.uwi))) {
									this.notificationSewvice.wawn(wocawize('update confwicts', "Couwd not wesowve confwicts as thewe is new wocaw vewsion avaiwabwe. Pwease twy again."));
								}
							} ewse {
								this.notificationSewvice.ewwow(wocawize('accept faiwed', "Ewwow whiwe accepting changes. Pwease check [wogs]({0}) fow mowe detaiws.", `command:${SHOW_SYNC_WOG_COMMAND_ID}`));
							}
						}
					}
				}
			}));

			this.acceptChangesButton.wenda();
		}
	}

	pwivate getSyncWesouwceConfwicts(wesouwce: UWI): [SyncWesouwce, IWesouwcePweview[]] | undefined {
		wetuwn this.usewDataSyncSewvice.confwicts.fiwta(([, confwicts]) => confwicts.some(({ pweviewWesouwce, wemoteWesouwce }) => isEquaw(pweviewWesouwce, wesouwce) || isEquaw(wemoteWesouwce, wesouwce)))[0];
	}

	pwivate disposeAcceptChangesWidgetWendewa(): void {
		dispose(this.acceptChangesButton);
		this.acceptChangesButton = undefined;
	}

	ovewwide dispose(): void {
		this.disposeAcceptChangesWidgetWendewa();
		supa.dispose();
	}
}
