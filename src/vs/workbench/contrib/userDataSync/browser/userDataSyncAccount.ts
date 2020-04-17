/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vs/editor/common/modes';
import { Event, Emitter } from 'vs/base/common/event';
import { getUserDataSyncStore, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { values } from 'vs/base/common/map';
import { ILogService } from 'vs/platform/log/common/log';

type UserAccountClassification = {
	id: { classification: 'EndUserPseudonymizedInformation', purpose: 'BusinessInsight' };
};

type UserAccountEvent = {
	id: string;
};

export interface IUserDataSyncAccount {
	readonly providerId: string;
	readonly sessionId: string;
	readonly accountName: string;
}

export const enum AccountStatus {
	Uninitialized = 'uninitialized',
	Unavailable = 'unavailable',
	Available = 'available',
}

export class UserDataSyncAccounts extends Disposable {

	private static CACHED_SESSION_STORAGE_KEY = 'userDataSyncAccountPreference';

	_serviceBrand: any;

	readonly accountProviderId: string | undefined;

	private _status: AccountStatus = AccountStatus.Uninitialized;
	get status(): AccountStatus { return this._status; }
	private readonly _onDidChangeStatus = this._register(new Emitter<AccountStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly _onDidSignOut = this._register(new Emitter<void>());
	readonly onDidSignOut = this._onDidSignOut.event;

	private _all: IUserDataSyncAccount[] = [];
	get all(): IUserDataSyncAccount[] { return this._all; }

	get current(): IUserDataSyncAccount | undefined { return this._all.filter(({ sessionId }) => sessionId === this.currentSessionId)[0]; }

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IAuthenticationTokenService private readonly authenticationTokenService: IAuthenticationTokenService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.accountProviderId = getUserDataSyncStore(productService, configurationService)?.authenticationProviderId;
		if (this.accountProviderId) {
			if (authenticationService.isAuthenticationProviderRegistered(this.accountProviderId)) {
				this.initialize();
			} else {
				this._register(Event.once(Event.filter(this.authenticationService.onDidRegisterAuthenticationProvider, providerId => providerId === this.accountProviderId))(() => this.initialize()));
			}
		}
	}

	private async initialize(): Promise<void> {
		await this.update();

		this._register(
			Event.any(
				Event.filter(
					Event.any(
						this.authenticationService.onDidRegisterAuthenticationProvider,
						this.authenticationService.onDidUnregisterAuthenticationProvider,
					), providerId => providerId === this.accountProviderId),
				this.authenticationTokenService.onTokenFailed)
				(() => this.update()));

		this._register(Event.filter(this.authenticationService.onDidChangeSessions, e => e.providerId === this.accountProviderId)(({ event }) => this.onDidChangeSessions(event)));
		this._register(this.storageService.onDidChangeStorage(e => this.onDidChangeStorage(e)));
	}

	private async update(): Promise<void> {

		let status = AccountStatus.Unavailable;
		let allAccounts: Map<string, IUserDataSyncAccount> = new Map<string, IUserDataSyncAccount>();

		if (this.accountProviderId) {

			let currentAccount: IUserDataSyncAccount | null = null;
			let currentSession: AuthenticationSession | undefined = undefined;

			const sessions = await this.authenticationService.getSessions(this.accountProviderId) || [];
			for (const session of sessions) {
				const account: IUserDataSyncAccount = { providerId: this.accountProviderId, sessionId: session.id, accountName: session.accountName };
				allAccounts.set(account.accountName, account);
				if (session.id === this.currentSessionId) {
					currentSession = session;
					currentAccount = account;
				}
			}

			if (currentAccount) {
				// Always use current account if available
				status = AccountStatus.Available;
				allAccounts.set(currentAccount.accountName, currentAccount);
			}

			// update access token
			if (currentSession) {
				try {
					const token = await currentSession.getAccessToken();
					await this.authenticationTokenService.setToken(token);
				} catch (e) {
					this.logService.error(e);
				}
			}

		}

		this._all = values(allAccounts);

		if (this._status !== status) {
			const previous = this._status;
			this.logService.debug('Sync account status changed', previous, status);

			if (previous === AccountStatus.Available && status === AccountStatus.Unavailable) {
				this._onDidSignOut.fire();
			}

			this._status = status;
			this._onDidChangeStatus.fire(status);
		}

	}

	async login(): Promise<void> {
		if (this.accountProviderId) {
			const session = await this.authenticationService.login(this.accountProviderId, ['https://management.core.windows.net/.default', 'offline_access']);
			await this.switch(session.id, session.accountName);
		}
	}

	async select(): Promise<void> {
		if (!this.accountProviderId) {
			return;
		}
		if (!this.all.length) {
			throw new Error('Requires Login');
		}
		await this.update();
		if (!this.all.length) {
			throw new Error('Requires Login');
		}
		await new Promise(async (c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<{ label: string, account?: IUserDataSyncAccount, detail?: string }>();
			disposables.add(quickPick);

			quickPick.title = localize('pick account', "{0}: Pick an account", this.authenticationService.getDisplayName(this.accountProviderId!));
			quickPick.ok = false;
			quickPick.placeholder = localize('choose account placeholder', "Pick an account for syncing");
			quickPick.ignoreFocusOut = true;

			const currentAccount = this.current;
			const accounts = currentAccount
				? [currentAccount, ...this._all.filter(account => account.sessionId !== this.current!.sessionId)]
				: this._all;
			quickPick.items = [...accounts.map(account => ({
				label: account.accountName,
				account: account,
				detail: account.sessionId === this.current?.sessionId ? localize('last used', "Last Used") : undefined
			})), { label: localize('choose another', "Use another account") }];

			disposables.add(quickPick.onDidAccept(async () => {
				const selected = quickPick.selectedItems[0];
				if (selected) {
					if (selected.account) {
						await this.switch(selected.account.sessionId, selected.account.accountName);
					} else {
						await this.login();
					}
					quickPick.hide();
				}
			}));
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c();
			}));
			quickPick.show();
		});
	}

	private async switch(sessionId: string, accountName: string): Promise<void> {
		const currentAccount = this.current;
		if (this.userDataSyncEnablementService.isEnabled() && (currentAccount && currentAccount.accountName !== accountName)) {
			// accounts are switched while sync is enabled.
		}
		this.currentSessionId = sessionId;
		this.telemetryService.publicLog2<UserAccountEvent, UserAccountClassification>('sync.userAccount', { id: sessionId.split('/')[1] });
		await this.update();
	}

	private onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.currentSessionId && e.removed.includes(this.currentSessionId)) {
			this.currentSessionId = undefined;
		}
		this.update();
	}

	private onDidChangeStorage(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === UserDataSyncAccounts.CACHED_SESSION_STORAGE_KEY && e.scope === StorageScope.GLOBAL
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
		if (this.currentSessionId !== cachedSessionId) {
			this._cachedCurrentSessionId = cachedSessionId;
			if (cachedSessionId === undefined) {
				this.storageService.remove(UserDataSyncAccounts.CACHED_SESSION_STORAGE_KEY, StorageScope.GLOBAL);
			} else {
				this.storageService.store(UserDataSyncAccounts.CACHED_SESSION_STORAGE_KEY, cachedSessionId, StorageScope.GLOBAL);
			}
		}
	}

	private getStoredCachedSessionId(): string | undefined {
		return this.storageService.get(UserDataSyncAccounts.CACHED_SESSION_STORAGE_KEY, StorageScope.GLOBAL);
	}

}
