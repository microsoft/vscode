/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataSyncEnablementService, IAuthenticationProvider, getUserDataSyncStore, isAuthenticationProvider } from 'vs/platform/userDataSync/common/userDataSync';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUserDataSyncWorkbenchService, IUserDataSyncAccount, AccountStatus, CONTEXT_SYNC_ENABLEMENT, CONTEXT_SYNC_STATE, CONTEXT_ACCOUNT_STATE } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vs/editor/common/modes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { flatten } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';
import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { IQuickInputService, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, IWorkspaceStorageChangeEvent, StorageScope } from 'vs/platform/storage/common/storage';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { localize } from 'vs/nls';
import { canceled } from 'vs/base/common/errors';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

type UserAccountClassification = {
	id: { classification: 'EndUserPseudonymizedInformation', purpose: 'BusinessInsight' };
};

type FirstTimeSyncClassification = {
	action: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

type UserAccountEvent = {
	id: string;
};

type AccountQuickPickItem = { label: string, authenticationProvider: IAuthenticationProvider, account?: UserDataSyncAccount, description?: string };

class UserDataSyncAccount implements IUserDataSyncAccount {

	constructor(readonly authenticationProviderId: string, private readonly session: AuthenticationSession) { }

	get sessionId(): string { return this.session.id; }
	get accountName(): string { return this.session.account.displayName; }
	get accountId(): string { return this.session.account.id; }
	get token(): string { return this.session.accessToken; }
}

export class UserDataSyncWorkbenchService extends Disposable implements IUserDataSyncWorkbenchService {

	_serviceBrand: any;

	private static DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY = 'userDataSyncAccount.donotUseWorkbenchSession';
	private static CACHED_SESSION_STORAGE_KEY = 'userDataSyncAccountPreference';

	readonly authenticationProviders: IAuthenticationProvider[];

	private _accountStatus: AccountStatus = AccountStatus.Uninitialized;
	get accountStatus(): AccountStatus { return this._accountStatus; }
	private readonly _onDidChangeAccountStatus = this._register(new Emitter<AccountStatus>());
	readonly onDidChangeAccountStatus = this._onDidChangeAccountStatus.event;

	private _all: Map<string, UserDataSyncAccount[]> = new Map<string, UserDataSyncAccount[]>();
	get all(): UserDataSyncAccount[] { return flatten(values(this._all)); }

	get current(): UserDataSyncAccount | undefined { return this.all.filter(account => this.isCurrentAccount(account))[0]; }

	private readonly syncEnablementContext: IContextKey<boolean>;
	private readonly syncStatusContext: IContextKey<string>;
	private readonly accountStatusContext: IContextKey<string>;

	constructor(
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IAuthenticationTokenService private readonly authenticationTokenService: IAuthenticationTokenService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.authenticationProviders = getUserDataSyncStore(productService, configurationService)?.authenticationProviders || [];
		this.syncEnablementContext = CONTEXT_SYNC_ENABLEMENT.bindTo(contextKeyService);
		this.syncStatusContext = CONTEXT_SYNC_STATE.bindTo(contextKeyService);
		this.accountStatusContext = CONTEXT_ACCOUNT_STATE.bindTo(contextKeyService);

		if (this.authenticationProviders.length) {

			this.syncStatusContext.set(this.userDataSyncService.status);
			this._register(userDataSyncService.onDidChangeStatus(status => this.syncStatusContext.set(status)));
			this.syncEnablementContext.set(this.userDataSyncEnablementService.isEnabled());
			this._register(this.userDataSyncEnablementService.onDidChangeEnablement(enabled => this.syncEnablementContext.set(enabled)));

			extensionService.whenInstalledExtensionsRegistered().then(() => {
				if (this.authenticationProviders.every(({ id }) => authenticationService.isAuthenticationProviderRegistered(id))) {
					this.initialize();
				} else {
					const disposable = this.authenticationService.onDidRegisterAuthenticationProvider(() => {
						if (this.authenticationProviders.every(({ id }) => authenticationService.isAuthenticationProviderRegistered(id))) {
							disposable.dispose();
							this.initialize();
						}
					});
				}
			});
		}
	}

	private async initialize(): Promise<void> {
		if (this.currentSessionId === undefined && this.useWorkbenchSessionId && this.environmentService.options?.authenticationSessionId) {
			this.currentSessionId = this.environmentService.options.authenticationSessionId;
			this.useWorkbenchSessionId = false;
		}

		await this.update();

		this._register(
			Event.any(
				Event.filter(
					Event.any(
						this.authenticationService.onDidRegisterAuthenticationProvider,
						this.authenticationService.onDidUnregisterAuthenticationProvider,
					), authenticationProviderId => this.isSupportedAuthenticationProviderId(authenticationProviderId)),
				this.authenticationTokenService.onTokenFailed)
				(() => this.update()));

		this._register(Event.filter(this.authenticationService.onDidChangeSessions, e => this.isSupportedAuthenticationProviderId(e.providerId))(({ event }) => this.onDidChangeSessions(event)));
		this._register(this.storageService.onDidChangeStorage(e => this.onDidChangeStorage(e)));
	}

	private async update(): Promise<void> {
		const allAccounts: Map<string, UserDataSyncAccount[]> = new Map<string, UserDataSyncAccount[]>();
		for (const { id } of this.authenticationProviders) {
			const accounts = await this.getAccounts(id);
			allAccounts.set(id, accounts);
		}

		this._all = allAccounts;
		const current = this.current;
		await this.updateToken(current);
		this.updateAccountStatus(current);
	}

	private async getAccounts(authenticationProviderId: string): Promise<UserDataSyncAccount[]> {
		let accounts: Map<string, UserDataSyncAccount> = new Map<string, UserDataSyncAccount>();
		let currentAccount: UserDataSyncAccount | null = null;

		const sessions = await this.authenticationService.getSessions(authenticationProviderId) || [];
		for (const session of sessions) {
			const account: UserDataSyncAccount = new UserDataSyncAccount(authenticationProviderId, session);
			accounts.set(account.accountName, account);
			if (this.isCurrentAccount(account)) {
				currentAccount = account;
			}
		}

		if (currentAccount) {
			// Always use current account if available
			accounts.set(currentAccount.accountName, currentAccount);
		}

		return values(accounts);
	}

	private async updateToken(current: UserDataSyncAccount | undefined): Promise<void> {
		let value: { token: string, authenticationProviderId: string } | undefined = undefined;
		if (current) {
			try {
				this.logService.trace('Preferences Sync: Updating the token for the account', current.accountName);
				const token = current.token;
				this.logService.trace('Preferences Sync: Token updated for the account', current.accountName);
				value = { token, authenticationProviderId: current.authenticationProviderId };
			} catch (e) {
				this.logService.error(e);
			}
		}
		await this.authenticationTokenService.setToken(value);
	}

	private updateAccountStatus(current: UserDataSyncAccount | undefined): void {
		// set status
		const accountStatus: AccountStatus = current ? AccountStatus.Available : AccountStatus.Unavailable;

		if (this._accountStatus !== accountStatus) {
			const previous = this._accountStatus;
			this.logService.debug('Sync account status changed', previous, accountStatus);

			if (previous === AccountStatus.Available && accountStatus === AccountStatus.Unavailable) {
				this.turnoff(false);
			}

			this._accountStatus = accountStatus;
			this.accountStatusContext.set(accountStatus);
			this._onDidChangeAccountStatus.fire(accountStatus);
		}
	}

	async turnOn(): Promise<void> {
		const picked = await this.pick();
		if (!picked) {
			throw canceled();
		}

		// User did not pick an account or login failed
		if (this.accountStatus !== AccountStatus.Available) {
			throw new Error(localize('no account', "No account available"));
		}

		await this.handleFirstTimeSync();
		this.userDataSyncEnablementService.setEnablement(true);
		this.notificationService.info(localize('sync turned on', "Preferences sync is turned on"));
	}

	async turnoff(everywhere: boolean): Promise<void> {
		if (everywhere) {
			this.telemetryService.publicLog2('sync/turnOffEveryWhere');
			await this.userDataSyncService.reset();
		} else {
			await this.userDataSyncService.resetLocal();
		}
		this.userDataSyncEnablementService.setEnablement(false);
	}

	private async handleFirstTimeSync(): Promise<void> {
		const isFirstSyncWithMerge = await this.userDataSyncService.isFirstTimeSyncWithMerge();
		if (!isFirstSyncWithMerge) {
			return;
		}
		const result = await this.dialogService.show(
			Severity.Info,
			localize('firs time sync', "Sync"),
			[
				localize('merge', "Merge"),
				localize('cancel', "Cancel"),
				localize('replace', "Replace Local"),
			],
			{
				cancelId: 1,
				detail: localize('first time sync detail', "It looks like this is the first time sync is set up.\nWould you like to merge or replace with the data from the cloud?"),
			}
		);
		switch (result.choice) {
			case 0:
				this.telemetryService.publicLog2<{ action: string }, FirstTimeSyncClassification>('sync/firstTimeSync', { action: 'merge' });
				break;
			case 1:
				this.telemetryService.publicLog2<{ action: string }, FirstTimeSyncClassification>('sync/firstTimeSync', { action: 'cancelled' });
				throw canceled();
			case 2:
				this.telemetryService.publicLog2<{ action: string }, FirstTimeSyncClassification>('sync/firstTimeSync', { action: 'replace-local' });
				await this.userDataSyncService.pull();
				break;
		}
	}

	private isSupportedAuthenticationProviderId(authenticationProviderId: string): boolean {
		return this.authenticationProviders.some(({ id }) => id === authenticationProviderId);
	}

	private isCurrentAccount(account: UserDataSyncAccount): boolean {
		return account.sessionId === this.currentSessionId;
	}

	async pickAccount(): Promise<void> {
		await this.pick();
	}

	private async pick(): Promise<boolean> {
		const result = await this.doPick();
		if (!result) {
			return false;
		}
		let sessionId: string, accountName: string, accountId: string;
		if (isAuthenticationProvider(result)) {
			const session = await this.authenticationService.login(result.id, result.scopes);
			sessionId = session.id;
			accountName = session.account.displayName;
			accountId = session.account.id;
		} else {
			sessionId = result.sessionId;
			accountName = result.accountName;
			accountId = result.accountId;
		}
		await this.switch(sessionId, accountName, accountId);
		return true;
	}

	private async doPick(): Promise<UserDataSyncAccount | IAuthenticationProvider | undefined> {
		if (this.authenticationProviders.length === 0) {
			return undefined;
		}

		await this.update();

		// Single auth provider and no accounts available
		if (this.authenticationProviders.length === 1 && !this.all.length) {
			return this.authenticationProviders[0];
		}

		return new Promise<UserDataSyncAccount | IAuthenticationProvider | undefined>(async (c, e) => {
			let result: UserDataSyncAccount | IAuthenticationProvider | undefined;
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<AccountQuickPickItem>();
			disposables.add(quickPick);

			quickPick.title = localize('pick an account', "Preferences Sync");
			quickPick.ok = false;
			quickPick.placeholder = localize('choose account placeholder', "Select an account");
			quickPick.ignoreFocusOut = true;
			quickPick.items = this.createQuickpickItems();

			disposables.add(quickPick.onDidAccept(() => {
				result = quickPick.selectedItems[0]?.account ? quickPick.selectedItems[0]?.account : quickPick.selectedItems[0]?.authenticationProvider;
				quickPick.hide();
			}));
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c(result);
			}));
			quickPick.show();
		});
	}

	private createQuickpickItems(): (AccountQuickPickItem | IQuickPickSeparator)[] {
		const quickPickItems: (AccountQuickPickItem | IQuickPickSeparator)[] = [];

		// Signed in Accounts
		if (this.all.length) {
			const authenticationProviders = [...this.authenticationProviders].sort(({ id }) => id === this.current?.authenticationProviderId ? -1 : 1);
			quickPickItems.push({ type: 'separator', label: localize('signed in', "Signed in") });
			for (const authenticationProvider of authenticationProviders) {
				const accounts = (this._all.get(authenticationProvider.id) || []).sort(({ sessionId }) => sessionId === this.current?.sessionId ? -1 : 1);
				const providerName = this.authenticationService.getDisplayName(authenticationProvider.id);
				for (const account of accounts) {
					quickPickItems.push({
						label: `${account.accountName} (${providerName})`,
						description: account.sessionId === this.current?.sessionId ? localize('last used', "Last Used with Sync") : undefined,
						account,
						authenticationProvider,
					});
				}
			}
			quickPickItems.push({ type: 'separator', label: localize('others', "Others") });
		}

		// Account proviers
		for (const authenticationProvider of this.authenticationProviders) {
			const providerName = this.authenticationService.getDisplayName(authenticationProvider.id);
			quickPickItems.push({ label: localize('sign in using account', "Sign in with {0}", providerName), authenticationProvider });
		}

		return quickPickItems;
	}

	private async switch(sessionId: string, accountName: string, accountId: string): Promise<void> {
		const currentAccount = this.current;
		if (this.userDataSyncEnablementService.isEnabled() && (currentAccount && currentAccount.accountName !== accountName)) {
			// accounts are switched while sync is enabled.
		}
		this.currentSessionId = sessionId;
		this.telemetryService.publicLog2<UserAccountEvent, UserAccountClassification>('sync.userAccount', { id: accountId });
		await this.update();
	}

	private onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.currentSessionId && e.removed.includes(this.currentSessionId)) {
			this.currentSessionId = undefined;
		}
		this.update();
	}

	private onDidChangeStorage(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY && e.scope === StorageScope.GLOBAL
			&& this.currentSessionId !== this.getStoredCachedSessionId() /* This checks if current window changed the value or not */) {
			this._cachedCurrentSessionId = null;
			this.update();
		}
	}

	private _cachedCurrentSessionId: string | undefined | null = null;
	private get currentSessionId(): string | undefined {
		if (this._cachedCurrentSessionId === null) {
			this._cachedCurrentSessionId = this.getStoredCachedSessionId();
		}
		return this._cachedCurrentSessionId;
	}

	private set currentSessionId(cachedSessionId: string | undefined) {
		if (this._cachedCurrentSessionId !== cachedSessionId) {
			this._cachedCurrentSessionId = cachedSessionId;
			if (cachedSessionId === undefined) {
				this.storageService.remove(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.GLOBAL);
			} else {
				this.storageService.store(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, cachedSessionId, StorageScope.GLOBAL);
			}
		}
	}

	private getStoredCachedSessionId(): string | undefined {
		return this.storageService.get(UserDataSyncWorkbenchService.CACHED_SESSION_STORAGE_KEY, StorageScope.GLOBAL);
	}

	private get useWorkbenchSessionId(): boolean {
		return !this.storageService.getBoolean(UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, StorageScope.GLOBAL, false);
	}

	private set useWorkbenchSessionId(useWorkbenchSession: boolean) {
		this.storageService.store(UserDataSyncWorkbenchService.DONOT_USE_WORKBENCH_SESSION_STORAGE_KEY, !useWorkbenchSession, StorageScope.GLOBAL);
	}

}

registerSingleton(IUserDataSyncWorkbenchService, UserDataSyncWorkbenchService);
