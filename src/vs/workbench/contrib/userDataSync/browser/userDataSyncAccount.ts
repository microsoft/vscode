/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { AuthenticationSession } from 'vs/editor/common/modes';
import { Event, Emitter } from 'vs/base/common/event';
import { getUserDataSyncStore, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { distinct } from 'vs/base/common/arrays';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type UserAccountClassification = {
	id: { classification: 'EndUserPseudonymizedInformation', purpose: 'BusinessInsight' };
};

type UserAccountEvent = {
	id: string;
};

export interface IUserDataSyncAccount {
	providerId: string;
	sessionId: string;
	accountName: string;
}

export class UserDataSyncAccountManager extends Disposable {

	private static LAST_USED_SESSION_STORAGE_KEY = 'userDataSyncAccountPreference';

	_serviceBrand: any;

	readonly userDataSyncAccountProvider: string | undefined;

	private _activeAccount: IUserDataSyncAccount | undefined | null;
	get activeAccount(): IUserDataSyncAccount | undefined | null { return this._activeAccount; }
	private readonly _onDidChangeActiveAccount = this._register(new Emitter<{ previous: IUserDataSyncAccount | undefined | null, current: IUserDataSyncAccount | null }>());
	readonly onDidChangeActiveAccount = this._onDidChangeActiveAccount.event;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IAuthenticationTokenService private readonly authenticationTokenService: IAuthenticationTokenService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.userDataSyncAccountProvider = getUserDataSyncStore(productService, configurationService)?.authenticationProviderId;
		if (this.userDataSyncAccountProvider) {
			if (authenticationService.isAuthenticationProviderRegistered(this.userDataSyncAccountProvider)) {
				this.initialize();
			} else {
				this._register(Event.once(Event.filter(this.authenticationService.onDidRegisterAuthenticationProvider, providerId => providerId === this.userDataSyncAccountProvider))(() => this.initialize()));
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
						Event.map(this.authenticationService.onDidChangeSessions, e => e.providerId)
					), providerId => providerId === this.userDataSyncAccountProvider),
				this.authenticationTokenService.onTokenFailed)
				(() => this.update()));
	}

	private async update(): Promise<void> {
		if (!this.userDataSyncAccountProvider) {
			return;
		}
		let activeSession: AuthenticationSession | undefined = undefined;
		if (this.lastUsedSessionId) {
			const sessions = await this.authenticationService.getSessions(this.userDataSyncAccountProvider);
			if (sessions?.length) {
				activeSession = sessions.find(session => session.id === this.lastUsedSessionId);
			}
		}

		let activeAccount: IUserDataSyncAccount | null = null;
		if (activeSession) {
			try {
				const token = await activeSession.getAccessToken();
				await this.authenticationTokenService.setToken(token);
				activeAccount = {
					providerId: this.userDataSyncAccountProvider,
					sessionId: activeSession.id,
					accountName: activeSession.accountName
				};
			} catch (e) {
				// Ignore and log error
			}
		}

		if (!this.areSameAccounts(activeAccount, this._activeAccount)) {
			const previous = this._activeAccount;
			this._activeAccount = activeAccount;
			this._onDidChangeActiveAccount.fire({ previous, current: this._activeAccount });
		}
	}

	async login(): Promise<void> {
		if (this.userDataSyncAccountProvider) {
			const session = await this.authenticationService.login(this.userDataSyncAccountProvider, ['https://management.core.windows.net/.default', 'offline_access']);
			await this.switch(session.id);
		}
	}

	async select(): Promise<void> {
		if (!this.activeAccount) {
			throw new Error('Requires Login');
		}
		await this.update();
		if (!this.activeAccount) {
			throw new Error('Requires Login');
		}
		const { providerId, sessionId } = this.activeAccount;
		await new Promise(async (c, e) => {
			const disposables: DisposableStore = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick<{ label: string, session?: AuthenticationSession, detail?: string }>();
			disposables.add(quickPick);

			quickPick.title = localize('pick account', "{0}: Pick an account", this.authenticationService.getDisplayName(providerId));
			quickPick.ok = false;
			quickPick.placeholder = localize('choose account placeholder', "Pick an account for syncing");
			quickPick.ignoreFocusOut = true;
			disposables.add(quickPick.onDidAccept(async () => {
				const selected = quickPick.selectedItems[0];
				if (selected) {
					if (selected.session) {
						await this.switch(selected.session.id);
					} else {
						await this.login();
					}
					quickPick.hide();
					c();
				}
			}));
			disposables.add(quickPick.onDidHide(() => disposables.dispose()));
			quickPick.show();

			quickPick.busy = true;
			quickPick.items = await this.getSessionQuickPickItems(providerId, sessionId);
			quickPick.busy = false;

		});
	}

	async switch(sessionId: string): Promise<void> {
		if (this.userDataSyncEnablementService.isEnabled() && (this.lastUsedSessionId && this.lastUsedSessionId !== sessionId)) {
			// accounts are switched while sync is enabled.
		}
		this.lastUsedSessionId = sessionId;
		this.telemetryService.publicLog2<UserAccountEvent, UserAccountClassification>('sync.userAccount', { id: sessionId.split('/')[1] });
		await this.update();
	}

	private async getSessionQuickPickItems(providerId: string, sessionId: string): Promise<{ label: string, session?: AuthenticationSession, detail?: string }[]> {
		const quickPickItems: { label: string, session?: AuthenticationSession, detail?: string }[] = [];

		let sessions = await this.authenticationService.getSessions(providerId) || [];
		const lastUsedSession = sessions.filter(session => session.id === sessionId)[0];

		if (lastUsedSession) {
			sessions = sessions.filter(session => session.accountName !== lastUsedSession.accountName);
			quickPickItems.push({
				label: lastUsedSession.accountName,
				session: lastUsedSession,
				detail: localize('previously used', "Last used")
			});
		}

		quickPickItems.push(...distinct(sessions, session => session.accountName).map(session => ({ label: session.accountName, session })));
		quickPickItems.push({ label: localize('choose another', "Use another account") });
		return quickPickItems;
	}

	private get lastUsedSessionId(): string | undefined {
		return this.storageService.get(UserDataSyncAccountManager.LAST_USED_SESSION_STORAGE_KEY, StorageScope.GLOBAL);
	}

	private set lastUsedSessionId(lastUserSessionId: string | undefined) {
		if (lastUserSessionId === undefined) {
			this.storageService.remove(UserDataSyncAccountManager.LAST_USED_SESSION_STORAGE_KEY, StorageScope.GLOBAL);
		} else {
			this.storageService.store(UserDataSyncAccountManager.LAST_USED_SESSION_STORAGE_KEY, lastUserSessionId, StorageScope.GLOBAL);
		}
	}

	private areSameAccounts(a: IUserDataSyncAccount | undefined | null, b: IUserDataSyncAccount | undefined | null): boolean {
		if (a === b) {
			return true;
		}
		if (a && b
			&& a.providerId === b.providerId
			&& a.sessionId === b.sessionId
		) {
			return true;
		}
		return false;
	}

}
