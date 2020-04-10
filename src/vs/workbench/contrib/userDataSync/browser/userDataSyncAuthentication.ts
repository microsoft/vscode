/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { distinct } from 'vs/base/common/arrays';
import Severity from 'vs/base/common/severity';
import { Action } from 'vs/base/common/actions';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { AuthenticationSession, AuthenticationSessionsChangeEvent } from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';
import { IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';

export interface IUserDataSyncAuthenticationService {
	_serviceBrand: undefined;
}

export const enum AuthStatus {
	Initializing = 'Initializing',
	SignedIn = 'SignedIn', // Signed in indicates that there is an active account
	SignedOut = 'SignedOut',
	Unavailable = 'Unavailable'
}

export const CONTEXT_AUTH_TOKEN_STATE = new RawContextKey<AuthStatus>('authTokenStatus', AuthStatus.Initializing);
const USER_DATA_SYNC_ACCOUNT_PREFERENCE_KEY = 'userDataSyncAccountPreference';

export interface IUserDataSyncAuthentication {
	providerDisplayName: string | undefined;
	activeAccountName: string | undefined;
	authenticationState: AuthStatus;

	initializeActiveAccount(): Promise<void>;
	confirmActiveAccount(): Promise<void>;

	login(): Promise<void>;
	logout(): Promise<void>;

	readonly onAccountsAvailable: Event<void>;
	readonly onDidChangeActiveAccount: Event<void>;
}
export class UserDataSyncAuthentication extends Disposable implements IUserDataSyncAuthentication {
	private readonly _authenticationState: IContextKey<AuthStatus>;
	private _activeAccount: AuthenticationSession | undefined;
	private loginInProgress: boolean = false;

	private _onDidChangeActiveAccount: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeActiveAccount: Event<void> = this._onDidChangeActiveAccount.event;

	private _onAccountsAvailable: Emitter<void> = this._register(new Emitter<void>());
	readonly onAccountsAvailable: Event<void> = this._onAccountsAvailable.event;

	constructor(
		private readonly _authenticationProviderId: string,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAuthenticationTokenService private readonly authTokenService: IAuthenticationTokenService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService readonly productService: IProductService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService
	) {
		super();
		this._authenticationState = CONTEXT_AUTH_TOKEN_STATE.bindTo(contextKeyService);
		this._register(this.authTokenService.onTokenFailed(_ => this.onTokenFailed()));
		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(e => this.onDidRegisterAuthenticationProvider(e)));
		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => this.onDidUnregisterAuthenticationProvider(e)));
		this._register(this.authenticationService.onDidChangeSessions(e => this.onDidChangeSessions(e)));
	}

	get providerDisplayName(): string | undefined {
		try {
			return this.authenticationService.getDisplayName(this._authenticationProviderId);
		} catch (e) {
			// Ignore, provider is not yet registered
			return undefined;
		}
	}

	get authenticationState(): AuthStatus {
		return this._authenticationState.get()!;
	}

	get activeAccountName(): string | undefined {
		return this.activeAccount?.accountName;
	}

	async initializeActiveAccount(): Promise<void> {
		if (!this.userDataSyncEnablementService.isEnabled()) {
			return;
		}

		const sessions = await this.authenticationService.getSessions(this._authenticationProviderId);
		// Auth provider has not yet been registered
		if (!sessions) {
			return;
		}

		if (sessions.length === 0) {
			await this.setActiveAccount(undefined);
			return;
		}

		if (sessions.length === 1) {
			this.logAuthenticatedEvent(sessions[0]);
			await this.setActiveAccount(sessions[0]);
			return;
		}

		const accountPreference = this.storageService.get(USER_DATA_SYNC_ACCOUNT_PREFERENCE_KEY, StorageScope.GLOBAL);
		if (accountPreference) {
			const matchingSession = sessions.find(session => session.id === accountPreference);
			if (matchingSession) {
				this.setActiveAccount(matchingSession);
				return;
			}
		}

		await this.showSwitchAccountPicker(sessions);
	}

	async confirmActiveAccount(): Promise<void> {
		const sessions = await this.authenticationService.getSessions(this._authenticationProviderId) || [];
		if (sessions.length) {
			await new Promise((resolve, _) => {
				const disposables: DisposableStore = new DisposableStore();
				const quickPick = this.quickInputService.createQuickPick<{ id: string, label: string, session?: AuthenticationSession, detail?: string }>();
				disposables.add(quickPick);

				quickPick.title = localize('pick account', "{0}: Pick an account", this.providerDisplayName);
				quickPick.ok = false;
				quickPick.placeholder = localize('choose account placeholder', "Pick an account for syncing");
				quickPick.ignoreFocusOut = true;

				const chooseAnotherItemId = 'chooseAnother';
				const accountPreference = this.storageService.get(USER_DATA_SYNC_ACCOUNT_PREFERENCE_KEY, StorageScope.GLOBAL);

				// Move previously used account to first item
				const orderedSessions = sessions.slice().sort(session => {
					if (session.id === accountPreference) {
						return -1;
					} else {
						return 0;
					}
				});

				quickPick.items = orderedSessions.map(session => {
					return {
						id: session.id,
						label: session.accountName,
						session: session,
						detail: session.id === accountPreference ? localize('previously used', "Previously used") : ''
					};
				}).concat([{
					id: chooseAnotherItemId,
					label: localize('choose another', "Use another account")
				} as any]);

				disposables.add(quickPick.onDidAccept(async () => {
					const selected = quickPick.selectedItems[0];
					if (selected) {
						if (selected.id === chooseAnotherItemId) {
							this.login();
						} else {
							this.setActiveAccount(selected.session);
						}

						quickPick.hide();
						resolve();
					}
				}));

				disposables.add(quickPick.onDidHide(() => disposables.dispose()));
				quickPick.show();
			});
		} else {
			await this.login();
		}
	}

	async login(): Promise<void> {
		try {
			this.loginInProgress = true;
			await this.setActiveAccount(await this.authenticationService.login(this._authenticationProviderId, ['https://management.core.windows.net/.default', 'offline_access']));
			this.loginInProgress = false;
		} catch (e) {
			this.notificationService.error(localize('loginFailed', "Logging in failed: {0}", e.message));
		}
	}

	async logout(): Promise<void> {
		if (this.activeAccount) {
			await this.authenticationService.logout(this._authenticationProviderId, this.activeAccount.id);
		}
	}

	private logAuthenticatedEvent(session: AuthenticationSession): void {
		type UserAuthenticatedClassification = {
			id: { classification: 'EndUserPseudonymizedInformation', purpose: 'BusinessInsight' };
		};

		type UserAuthenticatedEvent = {
			id: string;
		};

		const id = session.id.split('/')[1];
		this.telemetryService.publicLog2<UserAuthenticatedEvent, UserAuthenticatedClassification>('user.authenticated', { id });
	}

	get activeAccount(): AuthenticationSession | undefined {
		return this._activeAccount;
	}

	async setActiveAccount(account: AuthenticationSession | undefined) {
		this._activeAccount = account;

		if (account) {
			try {
				const token = await account.getAccessToken();
				this.authTokenService.setToken(token);
				this.storageService.store(USER_DATA_SYNC_ACCOUNT_PREFERENCE_KEY, account.id, StorageScope.GLOBAL);
				this._authenticationState.set(AuthStatus.SignedIn);
			} catch (e) {
				this.authTokenService.setToken(undefined);
				this._authenticationState.set(AuthStatus.Unavailable);
			}
		} else {
			this.authTokenService.setToken(undefined);
			this._authenticationState.set(AuthStatus.SignedOut);
		}

		this._onDidChangeActiveAccount.fire();
	}

	private async showSwitchAccountPicker(sessions: readonly AuthenticationSession[]): Promise<void> {
		return new Promise((resolve, _) => {
			const quickPick = this.quickInputService.createQuickPick<{ label: string, session: AuthenticationSession }>();
			quickPick.title = localize('chooseAccountTitle', "Preferences Sync: Choose Account");
			quickPick.placeholder = localize('chooseAccount', "Choose an account you would like to use for preferences sync");
			const dedupedSessions = distinct(sessions, (session) => session.accountName);
			quickPick.items = dedupedSessions.map(session => {
				return {
					label: session.accountName,
					session: session
				};
			});

			quickPick.onDidHide(() => {
				quickPick.dispose();
				resolve();
			});

			quickPick.onDidAccept(() => {
				const selected = quickPick.selectedItems[0];
				this.setActiveAccount(selected.session);
				quickPick.dispose();
				resolve();
			});

			quickPick.show();
		});
	}

	private async onDidChangeSessions(e: { providerId: string, event: AuthenticationSessionsChangeEvent }): Promise<void> {
		const { providerId, event } = e;
		if (!this.userDataSyncEnablementService.isEnabled()) {
			if (event.added) {
				this._onAccountsAvailable.fire();
			}
			return;
		}

		if (providerId === this._authenticationProviderId) {
			if (this.loginInProgress) {
				return;
			}

			if (this.activeAccount) {
				if (event.removed.length) {
					const activeWasRemoved = !!event.removed.find(removed => removed === this.activeAccount!.id);
					if (activeWasRemoved) {
						this.setActiveAccount(undefined);
						this.notificationService.notify({
							severity: Severity.Info,
							message: localize('turned off on logout', "Sync has stopped because you are no longer signed in."),
							actions: {
								primary: [new Action('sign in', localize('sign in', "Sign in"), undefined, true, () => this.login())]
							}
						});
						return;
					}
				}

				if (event.added.length) {
					// Offer to switch accounts
					const accounts = (await this.authenticationService.getSessions(this._authenticationProviderId) || []);
					await this.showSwitchAccountPicker(accounts);
					return;
				}

				if (event.changed.length) {
					const activeWasChanged = !!event.changed.find(changed => changed === this.activeAccount!.id);
					if (activeWasChanged) {
						// Try to update existing account, case where access token has been refreshed
						const accounts = (await this.authenticationService.getSessions(this._authenticationProviderId) || []);
						const matchingAccount = accounts.filter(a => a.id === this.activeAccount?.id)[0];
						this.setActiveAccount(matchingAccount);
					}
				}
			} else {
				this.initializeActiveAccount();
			}
		}
	}

	private async onTokenFailed(): Promise<void> {
		if (this.activeAccount) {
			const accounts = (await this.authenticationService.getSessions(this._authenticationProviderId) || []);
			const matchingAccount = accounts.filter(a => a.id === this.activeAccount?.id)[0];
			this.setActiveAccount(matchingAccount);
		} else {
			this.setActiveAccount(undefined);
		}
	}

	private async onDidRegisterAuthenticationProvider(providerId: string) {
		if (providerId === this._authenticationProviderId) {
			await this.initializeActiveAccount();
		}
	}

	private onDidUnregisterAuthenticationProvider(providerId: string) {
		if (providerId === this._authenticationProviderId) {
			this.setActiveAccount(undefined);
			this._authenticationState.reset();
		}
	}
}

