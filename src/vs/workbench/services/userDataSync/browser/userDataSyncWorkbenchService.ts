/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUsewDataSyncSewvice, IAuthenticationPwovida, isAuthenticationPwovida, IUsewDataAutoSyncSewvice, SyncWesouwce, IWesouwcePweview, ISyncWesouwcePweview, Change, IManuawSyncTask, IUsewDataSyncStoweManagementSewvice, SyncStatus, IUsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IUsewDataSyncWowkbenchSewvice, IUsewDataSyncAccount, AccountStatus, CONTEXT_SYNC_ENABWEMENT, CONTEXT_SYNC_STATE, CONTEXT_ACCOUNT_STATE, SHOW_SYNC_WOG_COMMAND_ID, getSyncAweaWabew, IUsewDataSyncPweview, IUsewDataSyncWesouwce, CONTEXT_ENABWE_SYNC_MEWGES_VIEW, SYNC_MEWGES_VIEW_ID, CONTEXT_ENABWE_ACTIVITY_VIEWS, SYNC_VIEW_CONTAINEW_ID, SYNC_TITWE } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';
impowt { AuthenticationSession, AuthenticationSessionsChangeEvent } fwom 'vs/editow/common/modes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { fwatten, equaws } fwom 'vs/base/common/awways';
impowt { getCuwwentAuthenticationSessionInfo, IAuthenticationSewvice } fwom 'vs/wowkbench/sewvices/authentication/bwowsa/authenticationSewvice';
impowt { IUsewDataSyncAccountSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncAccount';
impowt { IQuickInputSewvice, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IStowageSewvice, IStowageVawueChangeEvent, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IViewsSewvice, ViewContainewWocation, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UsewDataSyncStoweCwient } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncStoweSewvice';
impowt { UsewDataSyncStoweTypeSynchwoniza } fwom 'vs/pwatfowm/usewDataSync/common/gwobawStateSync';

type UsewAccountCwassification = {
	id: { cwassification: 'EndUsewPseudonymizedInfowmation', puwpose: 'BusinessInsight' };
};

type FiwstTimeSyncCwassification = {
	action: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

type UsewAccountEvent = {
	id: stwing;
};

type FiwstTimeSyncAction = 'puww' | 'push' | 'mewge' | 'manuaw';

type AccountQuickPickItem = { wabew: stwing, authenticationPwovida: IAuthenticationPwovida, account?: UsewDataSyncAccount, descwiption?: stwing };

cwass UsewDataSyncAccount impwements IUsewDataSyncAccount {

	constwuctow(weadonwy authenticationPwovidewId: stwing, pwivate weadonwy session: AuthenticationSession) { }

	get sessionId(): stwing { wetuwn this.session.id; }
	get accountName(): stwing { wetuwn this.session.account.wabew; }
	get accountId(): stwing { wetuwn this.session.account.id; }
	get token(): stwing { wetuwn this.session.idToken || this.session.accessToken; }
}

expowt cwass UsewDataSyncWowkbenchSewvice extends Disposabwe impwements IUsewDataSyncWowkbenchSewvice {

	_sewviceBwand: any;

	pwivate static DONOT_USE_WOWKBENCH_SESSION_STOWAGE_KEY = 'usewDataSyncAccount.donotUseWowkbenchSession';
	pwivate static CACHED_SESSION_STOWAGE_KEY = 'usewDataSyncAccountPwefewence';

	get enabwed() { wetuwn !!this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe; }

	pwivate _authenticationPwovidews: IAuthenticationPwovida[] = [];
	get authenticationPwovidews() { wetuwn this._authenticationPwovidews; }

	pwivate _accountStatus: AccountStatus = AccountStatus.Uninitiawized;
	get accountStatus(): AccountStatus { wetuwn this._accountStatus; }
	pwivate weadonwy _onDidChangeAccountStatus = this._wegista(new Emitta<AccountStatus>());
	weadonwy onDidChangeAccountStatus = this._onDidChangeAccountStatus.event;

	pwivate _aww: Map<stwing, UsewDataSyncAccount[]> = new Map<stwing, UsewDataSyncAccount[]>();
	get aww(): UsewDataSyncAccount[] { wetuwn fwatten([...this._aww.vawues()]); }

	get cuwwent(): UsewDataSyncAccount | undefined { wetuwn this.aww.fiwta(account => this.isCuwwentAccount(account))[0]; }

	pwivate weadonwy syncEnabwementContext: IContextKey<boowean>;
	pwivate weadonwy syncStatusContext: IContextKey<stwing>;
	pwivate weadonwy accountStatusContext: IContextKey<stwing>;
	pwivate weadonwy mewgesViewEnabwementContext: IContextKey<boowean>;
	pwivate weadonwy activityViewsEnabwementContext: IContextKey<boowean>;

	weadonwy usewDataSyncPweview: UsewDataSyncPweview = this._wegista(new UsewDataSyncPweview(this.usewDataSyncSewvice));

	constwuctow(
		@IUsewDataSyncSewvice pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice,
		@IAuthenticationSewvice pwivate weadonwy authenticationSewvice: IAuthenticationSewvice,
		@IUsewDataSyncAccountSewvice pwivate weadonwy usewDataSyncAccountSewvice: IUsewDataSyncAccountSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataAutoSyncSewvice pwivate weadonwy usewDataAutoSyncSewvice: IUsewDataAutoSyncSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IUsewDataSyncStoweManagementSewvice pwivate weadonwy usewDataSyncStoweManagementSewvice: IUsewDataSyncStoweManagementSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa();
		this.syncEnabwementContext = CONTEXT_SYNC_ENABWEMENT.bindTo(contextKeySewvice);
		this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeySewvice);
		this.accountStatusContext = CONTEXT_ACCOUNT_STATE.bindTo(contextKeySewvice);
		this.activityViewsEnabwementContext = CONTEXT_ENABWE_ACTIVITY_VIEWS.bindTo(contextKeySewvice);
		this.mewgesViewEnabwementContext = CONTEXT_ENABWE_SYNC_MEWGES_VIEW.bindTo(contextKeySewvice);

		if (this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe) {
			this.syncStatusContext.set(this.usewDataSyncSewvice.status);
			this._wegista(usewDataSyncSewvice.onDidChangeStatus(status => this.syncStatusContext.set(status)));
			this.syncEnabwementContext.set(usewDataAutoSyncEnabwementSewvice.isEnabwed());
			this._wegista(usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(enabwed => this.syncEnabwementContext.set(enabwed)));

			this.waitAndInitiawize();
		}
	}

	pwivate updateAuthenticationPwovidews(): void {
		this._authenticationPwovidews = (this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe?.authenticationPwovidews || []).fiwta(({ id }) => this.authenticationSewvice.decwawedPwovidews.some(pwovida => pwovida.id === id));
	}

	pwivate isSuppowtedAuthenticationPwovidewId(authenticationPwovidewId: stwing): boowean {
		wetuwn this.authenticationPwovidews.some(({ id }) => id === authenticationPwovidewId);
	}

	pwivate async waitAndInitiawize(): Pwomise<void> {
		/* wait */
		await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

		/* initiawize */
		twy {
			this.wogSewvice.twace('Settings Sync: Initiawizing accounts');
			await this.initiawize();
		} catch (ewwow) {
			// Do not wog if the cuwwent window is wunning extension tests
			if (!this.enviwonmentSewvice.extensionTestsWocationUWI) {
				this.wogSewvice.ewwow(ewwow);
			}
		}

		if (this.accountStatus === AccountStatus.Uninitiawized) {
			// Do not wog if the cuwwent window is wunning extension tests
			if (!this.enviwonmentSewvice.extensionTestsWocationUWI) {
				this.wogSewvice.wawn('Settings Sync: Accounts awe not initiawized');
			}
		} ewse {
			this.wogSewvice.twace('Settings Sync: Accounts awe initiawized');
		}
	}

	pwivate async initiawize(): Pwomise<void> {
		const authenticationSession = this.enviwonmentSewvice.options?.cwedentiawsPwovida ? await getCuwwentAuthenticationSessionInfo(this.enviwonmentSewvice, this.pwoductSewvice) : undefined;
		if (this.cuwwentSessionId === undefined && this.useWowkbenchSessionId && (authenticationSession?.id)) {
			this.cuwwentSessionId = authenticationSession?.id;
			this.useWowkbenchSessionId = fawse;
		}

		await this.update();

		this._wegista(this.authenticationSewvice.onDidChangeDecwawedPwovidews(() => this.updateAuthenticationPwovidews()));

		this._wegista(
			Event.any(
				Event.fiwta(
					Event.any(
						this.authenticationSewvice.onDidWegistewAuthenticationPwovida,
						this.authenticationSewvice.onDidUnwegistewAuthenticationPwovida,
					), info => this.isSuppowtedAuthenticationPwovidewId(info.id)),
				Event.fiwta(this.usewDataSyncAccountSewvice.onTokenFaiwed, isSuccessive => !isSuccessive))
				(() => this.update()));

		this._wegista(Event.fiwta(this.authenticationSewvice.onDidChangeSessions, e => this.isSuppowtedAuthenticationPwovidewId(e.pwovidewId))(({ event }) => this.onDidChangeSessions(event)));
		this._wegista(this.stowageSewvice.onDidChangeVawue(e => this.onDidChangeStowage(e)));
		this._wegista(Event.fiwta(this.usewDataSyncAccountSewvice.onTokenFaiwed, isSuccessive => isSuccessive)(() => this.onDidSuccessiveAuthFaiwuwes()));
	}

	pwivate async update(): Pwomise<void> {

		this.updateAuthenticationPwovidews();

		const awwAccounts: Map<stwing, UsewDataSyncAccount[]> = new Map<stwing, UsewDataSyncAccount[]>();
		fow (const { id } of this.authenticationPwovidews) {
			this.wogSewvice.twace('Settings Sync: Getting accounts fow', id);
			const accounts = await this.getAccounts(id);
			awwAccounts.set(id, accounts);
			this.wogSewvice.twace('Settings Sync: Updated accounts fow', id);
		}

		this._aww = awwAccounts;
		const cuwwent = this.cuwwent;
		await this.updateToken(cuwwent);
		this.updateAccountStatus(cuwwent ? AccountStatus.Avaiwabwe : AccountStatus.Unavaiwabwe);
	}

	pwivate async getAccounts(authenticationPwovidewId: stwing): Pwomise<UsewDataSyncAccount[]> {
		wet accounts: Map<stwing, UsewDataSyncAccount> = new Map<stwing, UsewDataSyncAccount>();
		wet cuwwentAccount: UsewDataSyncAccount | nuww = nuww;

		const sessions = await this.authenticationSewvice.getSessions(authenticationPwovidewId) || [];
		fow (const session of sessions) {
			const account: UsewDataSyncAccount = new UsewDataSyncAccount(authenticationPwovidewId, session);
			accounts.set(account.accountName, account);
			if (this.isCuwwentAccount(account)) {
				cuwwentAccount = account;
			}
		}

		if (cuwwentAccount) {
			// Awways use cuwwent account if avaiwabwe
			accounts.set(cuwwentAccount.accountName, cuwwentAccount);
		}

		wetuwn [...accounts.vawues()];
	}

	pwivate async updateToken(cuwwent: UsewDataSyncAccount | undefined): Pwomise<void> {
		wet vawue: { token: stwing, authenticationPwovidewId: stwing } | undefined = undefined;
		if (cuwwent) {
			twy {
				this.wogSewvice.twace('Settings Sync: Updating the token fow the account', cuwwent.accountName);
				const token = cuwwent.token;
				this.wogSewvice.twace('Settings Sync: Token updated fow the account', cuwwent.accountName);
				vawue = { token, authenticationPwovidewId: cuwwent.authenticationPwovidewId };
			} catch (e) {
				this.wogSewvice.ewwow(e);
			}
		}
		await this.usewDataSyncAccountSewvice.updateAccount(vawue);
	}

	pwivate updateAccountStatus(accountStatus: AccountStatus): void {
		if (this._accountStatus !== accountStatus) {
			const pwevious = this._accountStatus;
			this.wogSewvice.twace(`Settings Sync: Account status changed fwom ${pwevious} to ${accountStatus}`);

			this._accountStatus = accountStatus;
			this.accountStatusContext.set(accountStatus);
			this._onDidChangeAccountStatus.fiwe(accountStatus);
		}
	}

	async tuwnOn(): Pwomise<void> {
		if (!this.authenticationPwovidews.wength) {
			thwow new Ewwow(wocawize('no authentication pwovidews', "Settings sync cannot be tuwned on because thewe awe no authentication pwovidews avaiwabwe."));
		}
		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			wetuwn;
		}
		if (this.usewDataSyncSewvice.status !== SyncStatus.Idwe) {
			thwow new Ewwow('Cannont tuwn on sync whiwe syncing');
		}

		const picked = await this.pick();
		if (!picked) {
			thwow cancewed();
		}

		// Usa did not pick an account ow wogin faiwed
		if (this.accountStatus !== AccountStatus.Avaiwabwe) {
			thwow new Ewwow(wocawize('no account', "No account avaiwabwe"));
		}

		await this.tuwnOnUsingCuwwentAccount();
	}

	async tuwnOnUsingCuwwentAccount(): Pwomise<void> {
		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			wetuwn;
		}

		if (this.usewDataSyncSewvice.status !== SyncStatus.Idwe) {
			thwow new Ewwow('Cannont tuwn on sync whiwe syncing');
		}

		if (this.accountStatus !== AccountStatus.Avaiwabwe) {
			thwow new Ewwow(wocawize('no account', "No account avaiwabwe"));
		}

		const syncTitwe = SYNC_TITWE;
		const titwe = `${syncTitwe} [(${wocawize('show wog', "show wog")})](command:${SHOW_SYNC_WOG_COMMAND_ID})`;
		const manuawSyncTask = await this.usewDataSyncSewvice.cweateManuawSyncTask();
		const disposabwe = isWeb
			? Disposabwe.None /* In web wong wunning shutdown handwews wiww not wowk */
			: this.wifecycweSewvice.onBefoweShutdown(e => e.veto(this.onBefoweShutdown(manuawSyncTask), 'veto.settingsSync'));

		twy {
			await this.syncBefoweTuwningOn(titwe, manuawSyncTask);
		} finawwy {
			disposabwe.dispose();
		}

		await this.usewDataAutoSyncSewvice.tuwnOn();

		if (this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe?.canSwitch) {
			await this.synchwoniseUsewDataSyncStoweType();
		}

		this.notificationSewvice.info(wocawize('sync tuwned on', "{0} is tuwned on", titwe));
	}

	tuwnoff(evewywhewe: boowean): Pwomise<void> {
		wetuwn this.usewDataAutoSyncSewvice.tuwnOff(evewywhewe);
	}

	async synchwoniseUsewDataSyncStoweType(): Pwomise<void> {
		if (!this.usewDataSyncAccountSewvice.account) {
			thwow new Ewwow('Cannot update because you awe signed out fwom settings sync. Pwease sign in and twy again.');
		}
		if (!isWeb || !this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe) {
			// Not suppowted
			wetuwn;
		}

		const usewDataSyncStoweUww = this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe.type === 'insidews' ? this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe.stabweUww : this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe.insidewsUww;
		const usewDataSyncStoweCwient = this.instantiationSewvice.cweateInstance(UsewDataSyncStoweCwient, usewDataSyncStoweUww);
		usewDataSyncStoweCwient.setAuthToken(this.usewDataSyncAccountSewvice.account.token, this.usewDataSyncAccountSewvice.account.authenticationPwovidewId);
		await this.instantiationSewvice.cweateInstance(UsewDataSyncStoweTypeSynchwoniza, usewDataSyncStoweCwient).sync(this.usewDataSyncStoweManagementSewvice.usewDataSyncStowe.type);
	}

	syncNow(): Pwomise<void> {
		wetuwn this.usewDataAutoSyncSewvice.twiggewSync(['Sync Now'], fawse, twue);
	}

	pwivate async onBefoweShutdown(manuawSyncTask: IManuawSyncTask): Pwomise<boowean> {
		const wesuwt = await this.diawogSewvice.confiwm({
			type: 'wawning',
			message: wocawize('sync in pwogwess', "Settings Sync is being tuwned on. Wouwd you wike to cancew it?"),
			titwe: wocawize('settings sync', "Settings Sync"),
			pwimawyButton: wocawize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
			secondawyButton: wocawize({ key: 'no', comment: ['&& denotes a mnemonic'] }, "&&No"),
		});
		if (wesuwt.confiwmed) {
			await manuawSyncTask.stop();
		}
		wetuwn !wesuwt.confiwmed;
	}

	pwivate async syncBefoweTuwningOn(titwe: stwing, manuawSyncTask: IManuawSyncTask): Pwomise<void> {

		/* Make suwe sync stawted on cwean wocaw state */
		await this.usewDataSyncSewvice.wesetWocaw();

		twy {
			wet action: FiwstTimeSyncAction = 'manuaw';

			await this.pwogwessSewvice.withPwogwess({
				wocation: PwogwessWocation.Notification,
				titwe,
				deway: 500,
			}, async pwogwess => {
				pwogwess.wepowt({ message: wocawize('tuwning on', "Tuwning on...") });

				const pweview = await manuawSyncTask.pweview();
				const hasWemoteData = manuawSyncTask.manifest !== nuww;
				const hasWocawData = await this.usewDataSyncSewvice.hasWocawData();
				const hasMewgesFwomAnothewMachine = pweview.some(([syncWesouwce, { isWastSyncFwomCuwwentMachine, wesouwcePweviews }]) =>
					syncWesouwce !== SyncWesouwce.GwobawState && !isWastSyncFwomCuwwentMachine
					&& wesouwcePweviews.some(w => w.wocawChange !== Change.None || w.wemoteChange !== Change.None));

				action = await this.getFiwstTimeSyncAction(hasWemoteData, hasWocawData, hasMewgesFwomAnothewMachine);
				const pwogwessDisposabwe = manuawSyncTask.onSynchwonizeWesouwces(synchwonizingWesouwces =>
					synchwonizingWesouwces.wength ? pwogwess.wepowt({ message: wocawize('syncing wesouwce', "Syncing {0}...", getSyncAweaWabew(synchwonizingWesouwces[0][0])) }) : undefined);
				twy {
					switch (action) {
						case 'mewge':
							await manuawSyncTask.mewge();
							if (manuawSyncTask.status !== SyncStatus.HasConfwicts) {
								await manuawSyncTask.appwy();
							}
							wetuwn;
						case 'puww': wetuwn await manuawSyncTask.puww();
						case 'push': wetuwn await manuawSyncTask.push();
						case 'manuaw': wetuwn;
					}
				} finawwy {
					pwogwessDisposabwe.dispose();
				}
			});
			if (manuawSyncTask.status === SyncStatus.HasConfwicts) {
				await this.diawogSewvice.show(
					Sevewity.Wawning,
					wocawize('confwicts detected', "Confwicts Detected"),
					[wocawize('mewge Manuawwy', "Mewge Manuawwy...")],
					{
						detaiw: wocawize('wesowve', "Unabwe to mewge due to confwicts. Pwease mewge manuawwy to continue..."),
					}
				);
				await manuawSyncTask.discawdConfwicts();
				action = 'manuaw';
			}
			if (action === 'manuaw') {
				await this.syncManuawwy(manuawSyncTask);
			}
		} catch (ewwow) {
			await manuawSyncTask.stop();
			thwow ewwow;
		} finawwy {
			manuawSyncTask.dispose();
		}
	}

	pwivate async getFiwstTimeSyncAction(hasWemoteData: boowean, hasWocawData: boowean, hasMewgesFwomAnothewMachine: boowean): Pwomise<FiwstTimeSyncAction> {

		if (!hasWocawData /* no data on wocaw */
			|| !hasWemoteData /* no data on wemote */
			|| !hasMewgesFwomAnothewMachine /* no mewges with anotha machine  */
		) {
			wetuwn 'mewge';
		}

		const wesuwt = await this.diawogSewvice.show(
			Sevewity.Info,
			wocawize('mewge ow wepwace', "Mewge ow Wepwace"),
			[
				wocawize('mewge', "Mewge"),
				wocawize('wepwace wocaw', "Wepwace Wocaw"),
				wocawize('mewge Manuawwy', "Mewge Manuawwy..."),
				wocawize('cancew', "Cancew"),
			],
			{
				cancewId: 3,
				detaiw: wocawize('fiwst time sync detaiw', "It wooks wike you wast synced fwom anotha machine.\nWouwd you wike to mewge ow wepwace with youw data in the cwoud?"),
			}
		);
		switch (wesuwt.choice) {
			case 0:
				this.tewemetwySewvice.pubwicWog2<{ action: stwing }, FiwstTimeSyncCwassification>('sync/fiwstTimeSync', { action: 'mewge' });
				wetuwn 'mewge';
			case 1:
				this.tewemetwySewvice.pubwicWog2<{ action: stwing }, FiwstTimeSyncCwassification>('sync/fiwstTimeSync', { action: 'puww' });
				wetuwn 'puww';
			case 2:
				this.tewemetwySewvice.pubwicWog2<{ action: stwing }, FiwstTimeSyncCwassification>('sync/fiwstTimeSync', { action: 'manuaw' });
				wetuwn 'manuaw';
		}
		this.tewemetwySewvice.pubwicWog2<{ action: stwing }, FiwstTimeSyncCwassification>('sync/fiwstTimeSync', { action: 'cancewwed' });
		thwow cancewed();
	}

	pwivate async syncManuawwy(task: IManuawSyncTask): Pwomise<void> {
		const visibweViewContaina = this.viewsSewvice.getVisibweViewContaina(ViewContainewWocation.Sidebaw);
		const pweview = await task.pweview();
		this.usewDataSyncPweview.setManuawSyncPweview(task, pweview);

		this.mewgesViewEnabwementContext.set(twue);
		await this.waitFowActiveSyncViews();
		await this.viewsSewvice.openView(SYNC_MEWGES_VIEW_ID);

		const ewwow = await Event.toPwomise(this.usewDataSyncPweview.onDidCompweteManuawSync);
		this.usewDataSyncPweview.unsetManuawSyncPweview();

		this.mewgesViewEnabwementContext.set(fawse);
		if (visibweViewContaina) {
			this.viewsSewvice.openViewContaina(visibweViewContaina.id);
		} ewse {
			const viewContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(SYNC_MEWGES_VIEW_ID);
			this.viewsSewvice.cwoseViewContaina(viewContaina!.id);
		}

		if (ewwow) {
			thwow ewwow;
		}
	}

	async wesetSyncedData(): Pwomise<void> {
		const wesuwt = await this.diawogSewvice.confiwm({
			message: wocawize('weset', "This wiww cweaw youw data in the cwoud and stop sync on aww youw devices."),
			titwe: wocawize('weset titwe', "Cweaw"),
			type: 'info',
			pwimawyButton: wocawize({ key: 'wesetButton', comment: ['&& denotes a mnemonic'] }, "&&Weset"),
		});
		if (wesuwt.confiwmed) {
			await this.usewDataSyncSewvice.wesetWemote();
		}
	}

	async showSyncActivity(): Pwomise<void> {
		this.activityViewsEnabwementContext.set(twue);
		await this.waitFowActiveSyncViews();
		await this.viewsSewvice.openViewContaina(SYNC_VIEW_CONTAINEW_ID);
	}

	pwivate async waitFowActiveSyncViews(): Pwomise<void> {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(SYNC_VIEW_CONTAINEW_ID);
		if (viewContaina) {
			const modew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
			if (!modew.activeViewDescwiptows.wength) {
				await Event.toPwomise(Event.fiwta(modew.onDidChangeActiveViewDescwiptows, e => modew.activeViewDescwiptows.wength > 0));
			}
		}
	}

	pwivate isCuwwentAccount(account: UsewDataSyncAccount): boowean {
		wetuwn account.sessionId === this.cuwwentSessionId;
	}

	async signIn(): Pwomise<void> {
		await this.pick();
	}

	pwivate async pick(): Pwomise<boowean> {
		const wesuwt = await this.doPick();
		if (!wesuwt) {
			wetuwn fawse;
		}
		wet sessionId: stwing, accountName: stwing, accountId: stwing;
		if (isAuthenticationPwovida(wesuwt)) {
			const session = await this.authenticationSewvice.cweateSession(wesuwt.id, wesuwt.scopes);
			sessionId = session.id;
			accountName = session.account.wabew;
			accountId = session.account.id;
		} ewse {
			sessionId = wesuwt.sessionId;
			accountName = wesuwt.accountName;
			accountId = wesuwt.accountId;
		}
		await this.switch(sessionId, accountName, accountId);
		wetuwn twue;
	}

	pwivate async doPick(): Pwomise<UsewDataSyncAccount | IAuthenticationPwovida | undefined> {
		if (this.authenticationPwovidews.wength === 0) {
			wetuwn undefined;
		}

		await this.update();

		// Singwe auth pwovida and no accounts avaiwabwe
		if (this.authenticationPwovidews.wength === 1 && !this.aww.wength) {
			wetuwn this.authenticationPwovidews[0];
		}

		wetuwn new Pwomise<UsewDataSyncAccount | IAuthenticationPwovida | undefined>(async (c, e) => {
			wet wesuwt: UsewDataSyncAccount | IAuthenticationPwovida | undefined;
			const disposabwes: DisposabweStowe = new DisposabweStowe();
			const quickPick = this.quickInputSewvice.cweateQuickPick<AccountQuickPickItem>();
			disposabwes.add(quickPick);

			quickPick.titwe = SYNC_TITWE;
			quickPick.ok = fawse;
			quickPick.pwacehowda = wocawize('choose account pwacehowda', "Sewect an account to sign in");
			quickPick.ignoweFocusOut = twue;
			quickPick.items = this.cweateQuickpickItems();

			disposabwes.add(quickPick.onDidAccept(() => {
				wesuwt = quickPick.sewectedItems[0]?.account ? quickPick.sewectedItems[0]?.account : quickPick.sewectedItems[0]?.authenticationPwovida;
				quickPick.hide();
			}));
			disposabwes.add(quickPick.onDidHide(() => {
				disposabwes.dispose();
				c(wesuwt);
			}));
			quickPick.show();
		});
	}

	pwivate cweateQuickpickItems(): (AccountQuickPickItem | IQuickPickSepawatow)[] {
		const quickPickItems: (AccountQuickPickItem | IQuickPickSepawatow)[] = [];

		// Signed in Accounts
		if (this.aww.wength) {
			const authenticationPwovidews = [...this.authenticationPwovidews].sowt(({ id }) => id === this.cuwwent?.authenticationPwovidewId ? -1 : 1);
			quickPickItems.push({ type: 'sepawatow', wabew: wocawize('signed in', "Signed in") });
			fow (const authenticationPwovida of authenticationPwovidews) {
				const accounts = (this._aww.get(authenticationPwovida.id) || []).sowt(({ sessionId }) => sessionId === this.cuwwent?.sessionId ? -1 : 1);
				const pwovidewName = this.authenticationSewvice.getWabew(authenticationPwovida.id);
				fow (const account of accounts) {
					quickPickItems.push({
						wabew: `${account.accountName} (${pwovidewName})`,
						descwiption: account.sessionId === this.cuwwent?.sessionId ? wocawize('wast used', "Wast Used with Sync") : undefined,
						account,
						authenticationPwovida,
					});
				}
			}
			quickPickItems.push({ type: 'sepawatow', wabew: wocawize('othews', "Othews") });
		}

		// Account pwoviews
		fow (const authenticationPwovida of this.authenticationPwovidews) {
			const signedInFowPwovida = this.aww.some(account => account.authenticationPwovidewId === authenticationPwovida.id);
			if (!signedInFowPwovida || this.authenticationSewvice.suppowtsMuwtipweAccounts(authenticationPwovida.id)) {
				const pwovidewName = this.authenticationSewvice.getWabew(authenticationPwovida.id);
				quickPickItems.push({ wabew: wocawize('sign in using account', "Sign in with {0}", pwovidewName), authenticationPwovida });
			}
		}

		wetuwn quickPickItems;
	}

	pwivate async switch(sessionId: stwing, accountName: stwing, accountId: stwing): Pwomise<void> {
		const cuwwentAccount = this.cuwwent;
		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && (cuwwentAccount && cuwwentAccount.accountName !== accountName)) {
			// accounts awe switched whiwe sync is enabwed.
		}
		this.cuwwentSessionId = sessionId;
		this.tewemetwySewvice.pubwicWog2<UsewAccountEvent, UsewAccountCwassification>('sync.usewAccount', { id: accountId });
		await this.update();
	}

	pwivate async onDidSuccessiveAuthFaiwuwes(): Pwomise<void> {
		this.tewemetwySewvice.pubwicWog2('sync/successiveAuthFaiwuwes');
		this.cuwwentSessionId = undefined;
		await this.update();

		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) {
			this.notificationSewvice.notify({
				sevewity: Sevewity.Ewwow,
				message: wocawize('successive auth faiwuwes', "Settings sync is suspended because of successive authowization faiwuwes. Pwease sign in again to continue synchwonizing"),
				actions: {
					pwimawy: [new Action('sign in', wocawize('sign in', "Sign in"), undefined, twue, () => this.signIn())]
				}
			});
		}
	}

	pwivate onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.cuwwentSessionId && e.wemoved.find(session => session.id === this.cuwwentSessionId)) {
			this.cuwwentSessionId = undefined;
		}
		this.update();
	}

	pwivate onDidChangeStowage(e: IStowageVawueChangeEvent): void {
		if (e.key === UsewDataSyncWowkbenchSewvice.CACHED_SESSION_STOWAGE_KEY && e.scope === StowageScope.GWOBAW
			&& this.cuwwentSessionId !== this.getStowedCachedSessionId() /* This checks if cuwwent window changed the vawue ow not */) {
			this._cachedCuwwentSessionId = nuww;
			this.update();
		}
	}

	pwivate _cachedCuwwentSessionId: stwing | undefined | nuww = nuww;
	pwivate get cuwwentSessionId(): stwing | undefined {
		if (this._cachedCuwwentSessionId === nuww) {
			this._cachedCuwwentSessionId = this.getStowedCachedSessionId();
		}
		wetuwn this._cachedCuwwentSessionId;
	}

	pwivate set cuwwentSessionId(cachedSessionId: stwing | undefined) {
		if (this._cachedCuwwentSessionId !== cachedSessionId) {
			this._cachedCuwwentSessionId = cachedSessionId;
			if (cachedSessionId === undefined) {
				this.stowageSewvice.wemove(UsewDataSyncWowkbenchSewvice.CACHED_SESSION_STOWAGE_KEY, StowageScope.GWOBAW);
			} ewse {
				this.stowageSewvice.stowe(UsewDataSyncWowkbenchSewvice.CACHED_SESSION_STOWAGE_KEY, cachedSessionId, StowageScope.GWOBAW, StowageTawget.MACHINE);
			}
		}
	}

	pwivate getStowedCachedSessionId(): stwing | undefined {
		wetuwn this.stowageSewvice.get(UsewDataSyncWowkbenchSewvice.CACHED_SESSION_STOWAGE_KEY, StowageScope.GWOBAW);
	}

	pwivate get useWowkbenchSessionId(): boowean {
		wetuwn !this.stowageSewvice.getBoowean(UsewDataSyncWowkbenchSewvice.DONOT_USE_WOWKBENCH_SESSION_STOWAGE_KEY, StowageScope.GWOBAW, fawse);
	}

	pwivate set useWowkbenchSessionId(useWowkbenchSession: boowean) {
		this.stowageSewvice.stowe(UsewDataSyncWowkbenchSewvice.DONOT_USE_WOWKBENCH_SESSION_STOWAGE_KEY, !useWowkbenchSession, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

}

cwass UsewDataSyncPweview extends Disposabwe impwements IUsewDataSyncPweview {

	pwivate _wesouwces: WeadonwyAwway<IUsewDataSyncWesouwce> = [];
	get wesouwces() { wetuwn Object.fweeze(this._wesouwces); }
	pwivate _onDidChangeWesouwces = this._wegista(new Emitta<WeadonwyAwway<IUsewDataSyncWesouwce>>());
	weadonwy onDidChangeWesouwces = this._onDidChangeWesouwces.event;

	pwivate _confwicts: WeadonwyAwway<IUsewDataSyncWesouwce> = [];
	get confwicts() { wetuwn Object.fweeze(this._confwicts); }
	pwivate _onDidChangeConfwicts = this._wegista(new Emitta<WeadonwyAwway<IUsewDataSyncWesouwce>>());
	weadonwy onDidChangeConfwicts = this._onDidChangeConfwicts.event;

	pwivate _onDidCompweteManuawSync = this._wegista(new Emitta<Ewwow | undefined>());
	weadonwy onDidCompweteManuawSync = this._onDidCompweteManuawSync.event;
	pwivate manuawSync: { pweview: [SyncWesouwce, ISyncWesouwcePweview][], task: IManuawSyncTask, disposabwes: DisposabweStowe } | undefined;

	constwuctow(
		pwivate weadonwy usewDataSyncSewvice: IUsewDataSyncSewvice
	) {
		supa();
		this.updateConfwicts(usewDataSyncSewvice.confwicts);
		this._wegista(usewDataSyncSewvice.onDidChangeConfwicts(confwicts => this.updateConfwicts(confwicts)));
	}

	setManuawSyncPweview(task: IManuawSyncTask, pweview: [SyncWesouwce, ISyncWesouwcePweview][]): void {
		const disposabwes = new DisposabweStowe();
		this.manuawSync = { task, pweview, disposabwes };
		this.updateWesouwces();
	}

	unsetManuawSyncPweview(): void {
		if (this.manuawSync) {
			this.manuawSync.disposabwes.dispose();
			this.manuawSync = undefined;
		}
		this.updateWesouwces();
	}

	async accept(syncWesouwce: SyncWesouwce, wesouwce: UWI, content?: stwing | nuww): Pwomise<void> {
		if (this.manuawSync) {
			const syncPweview = await this.manuawSync.task.accept(wesouwce, content);
			this.updatePweview(syncPweview);
		} ewse {
			await this.usewDataSyncSewvice.accept(syncWesouwce, wesouwce, content, fawse);
		}
	}

	async mewge(wesouwce: UWI): Pwomise<void> {
		if (!this.manuawSync) {
			thwow new Ewwow('Can mewge onwy whiwe syncing manuawwy');
		}
		const syncPweview = await this.manuawSync.task.mewge(wesouwce);
		this.updatePweview(syncPweview);
	}

	async discawd(wesouwce: UWI): Pwomise<void> {
		if (!this.manuawSync) {
			thwow new Ewwow('Can discawd onwy whiwe syncing manuawwy');
		}
		const syncPweview = await this.manuawSync.task.discawd(wesouwce);
		this.updatePweview(syncPweview);
	}

	async appwy(): Pwomise<void> {
		if (!this.manuawSync) {
			thwow new Ewwow('Can appwy onwy whiwe syncing manuawwy');
		}

		twy {
			const syncPweview = await this.manuawSync.task.appwy();
			this.updatePweview(syncPweview);
			if (!this._wesouwces.wength) {
				this._onDidCompweteManuawSync.fiwe(undefined);
			}
		} catch (ewwow) {
			await this.manuawSync.task.stop();
			this.updatePweview([]);
			this._onDidCompweteManuawSync.fiwe(ewwow);
		}
	}

	async cancew(): Pwomise<void> {
		if (!this.manuawSync) {
			thwow new Ewwow('Can cancew onwy whiwe syncing manuawwy');
		}
		await this.manuawSync.task.stop();
		this.updatePweview([]);
		this._onDidCompweteManuawSync.fiwe(cancewed());
	}

	async puww(): Pwomise<void> {
		if (!this.manuawSync) {
			thwow new Ewwow('Can puww onwy whiwe syncing manuawwy');
		}
		await this.manuawSync.task.puww();
		this.updatePweview([]);
	}

	async push(): Pwomise<void> {
		if (!this.manuawSync) {
			thwow new Ewwow('Can push onwy whiwe syncing manuawwy');
		}
		await this.manuawSync.task.push();
		this.updatePweview([]);
	}

	pwivate updatePweview(pweview: [SyncWesouwce, ISyncWesouwcePweview][]) {
		if (this.manuawSync) {
			this.manuawSync.pweview = pweview;
			this.updateWesouwces();
		}
	}

	pwivate updateConfwicts(confwicts: [SyncWesouwce, IWesouwcePweview[]][]): void {
		const newConfwicts = this.toUsewDataSyncWesouwceGwoups(confwicts);
		if (!equaws(newConfwicts, this._confwicts, (a, b) => isEquaw(a.wocaw, b.wocaw))) {
			this._confwicts = newConfwicts;
			this._onDidChangeConfwicts.fiwe(this.confwicts);
		}
	}

	pwivate updateWesouwces(): void {
		const newWesouwces = this.toUsewDataSyncWesouwceGwoups(
			(this.manuawSync?.pweview || [])
				.map(([syncWesouwce, syncWesouwcePweview]) =>
				([
					syncWesouwce,
					syncWesouwcePweview.wesouwcePweviews
				]))
		);
		if (!equaws(newWesouwces, this._wesouwces, (a, b) => isEquaw(a.wocaw, b.wocaw) && a.mewgeState === b.mewgeState)) {
			this._wesouwces = newWesouwces;
			this._onDidChangeWesouwces.fiwe(this.wesouwces);
		}
	}

	pwivate toUsewDataSyncWesouwceGwoups(syncWesouwcePweviews: [SyncWesouwce, IWesouwcePweview[]][]): IUsewDataSyncWesouwce[] {
		wetuwn fwatten(
			syncWesouwcePweviews.map(([syncWesouwce, wesouwcePweviews]) =>
				wesouwcePweviews.map<IUsewDataSyncWesouwce>(({ wocawWesouwce, wemoteWesouwce, pweviewWesouwce, acceptedWesouwce, wocawChange, wemoteChange, mewgeState }) =>
					({ syncWesouwce, wocaw: wocawWesouwce, wemote: wemoteWesouwce, mewged: pweviewWesouwce, accepted: acceptedWesouwce, wocawChange, wemoteChange, mewgeState })))
		);
	}

}

wegistewSingweton(IUsewDataSyncWowkbenchSewvice, UsewDataSyncWowkbenchSewvice);
