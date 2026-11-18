/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationError, isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { scopesMatch } from '../../../../base/common/oauth.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IActivityService, NumberBadge } from '../../activity/common/activity.js';
import { IAuthenticationAccessService } from './authenticationAccessService.js';
import { IAuthenticationUsageService } from './authenticationUsageService.js';
import { AuthenticationSession, IAuthenticationProvider, IAuthenticationService, IAuthenticationExtensionsService, AuthenticationSessionAccount, IAuthenticationWwwAuthenticateRequest, isAuthenticationWwwAuthenticateRequest, IAuthenticationProviderSessionOptions, getAuthenticationSessionRequestKey } from '../common/authentication.js';
import { Emitter } from '../../../../base/common/event.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';

// OAuth2 spec prohibits space in a scope, so use that to join them.
const SCOPESLIST_SEPARATOR = ' ';

interface SessionRequest {
	disposables: IDisposable[];
	requestingExtensionIds: string[];
	scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest;
	options: IAuthenticationProviderSessionOptions;
}

interface SessionRequestInfo {
	[requestKey: string]: SessionRequest;
}

interface SessionAccessRequest {
	disposables: IDisposable[];
	possibleSessions: AuthenticationSession[];
	extensionId: string;
	scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest;
	options: IAuthenticationProviderSessionOptions;
}

// TODO@TylerLeonhardt: This should all go in MainThreadAuthentication
export class AuthenticationExtensionsService extends Disposable implements IAuthenticationExtensionsService {
	declare readonly _serviceBrand: undefined;
	private _signInRequestItems = new Map<string, SessionRequestInfo>();
	private readonly _signInRequestUpdates = new SequencerByKey<SessionRequestInfo>();
	private _sessionAccessRequestItems = new Map<string, Record<string, SessionAccessRequest>>();
	private readonly _accountBadgeDisposable = this._register(new MutableDisposable());

	private _onDidAccountPreferenceChange: Emitter<{ providerId: string; extensionIds: string[] }> = this._register(new Emitter<{ providerId: string; extensionIds: string[] }>());
	readonly onDidChangeAccountPreference = this._onDidAccountPreferenceChange.event;

	private _inheritAuthAccountPreferenceParentToChildren: Record<string, string[]>;
	private _inheritAuthAccountPreferenceChildToParent: { [extensionId: string]: string };

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IProductService private readonly _productService: IProductService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationUsageService private readonly _authenticationUsageService: IAuthenticationUsageService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._inheritAuthAccountPreferenceParentToChildren = this._productService.inheritAuthAccountPreference || {};
		this._inheritAuthAccountPreferenceChildToParent = Object.entries(this._inheritAuthAccountPreferenceParentToChildren).reduce<{ [extensionId: string]: string }>((acc, [parent, children]) => {
			children.forEach((child: string) => {
				acc[child] = parent;
			});
			return acc;
		}, {});
		this.registerListeners();
	}

	private registerListeners() {
		this._register(this._authenticationService.onDidChangeSessions(e => {
			if (e.event.added?.length) {
				void this.updateNewSessionRequests(e.providerId, e.event.added).catch(onUnexpectedError);
			}
			if (e.event.removed?.length) {
				this.updateAccessRequests(e.providerId, e.event.removed);
			}
		}));

		this._register(this._authenticationService.onDidUnregisterAuthenticationProvider(e => {
			this.clearProviderRequests(e.id);
			this.updateBadgeCount();
		}));
	}

	override dispose(): void {
		for (const providerId of new Set([...this._signInRequestItems.keys(), ...this._sessionAccessRequestItems.keys()])) {
			this.clearProviderRequests(providerId);
		}
		super.dispose();
	}

	private clearProviderRequests(providerId: string): void {
		for (const request of [
			...Object.values(this._signInRequestItems.get(providerId) ?? {}),
			...Object.values(this._sessionAccessRequestItems.get(providerId) ?? {})
		]) {
			dispose(request.disposables);
		}
		this._signInRequestItems.delete(providerId);
		this._sessionAccessRequestItems.delete(providerId);
	}

	updateNewSessionRequests(providerId: string, addedSessions: readonly AuthenticationSession[]): Promise<void> {
		const providerRequests = this._signInRequestItems.get(providerId);
		if (!providerRequests || this._store.isDisposed) {
			return Promise.resolve();
		}
		const requests = Object.entries(providerRequests);
		return this._signInRequestUpdates.queue(providerRequests, async () => {
			for (const [requestKey, request] of requests) {
				await this.revalidateSignInRequest(providerId, providerRequests, requestKey, request, addedSessions);
			}
		});
	}

	private isCurrentSignInRequest(providerId: string, providerRequests: SessionRequestInfo, requestKey: string, request: SessionRequest): boolean {
		return !this._store.isDisposed
			&& this._signInRequestItems.get(providerId) === providerRequests
			&& providerRequests[requestKey] === request;
	}

	private async revalidateSignInRequest(providerId: string, providerRequests: SessionRequestInfo, requestKey: string, request: SessionRequest, addedSessions: readonly AuthenticationSession[]): Promise<void> {
		if (!this.isCurrentSignInRequest(providerId, providerRequests, requestKey, request)) {
			return;
		}

		try {
			if (await this.hasSessionForRequest(providerId, request, addedSessions)) {
				this.completeSignInRequest(providerId, providerRequests, requestKey, request);
			}
		} catch (error) {
			if (this.isCurrentSignInRequest(providerId, providerRequests, requestKey, request)) {
				this._logService.warn(`Failed to check a pending authentication request for '${providerId}'.`, error);
			}
		}
	}

	private async hasSessionForRequest(providerId: string, request: SessionRequest, addedSessions: readonly AuthenticationSession[]): Promise<boolean> {
		const { scopeListOrRequest, options } = request;
		if (!isAuthenticationWwwAuthenticateRequest(scopeListOrRequest) && !addedSessions.some(session => scopesMatch(session.scopes, scopeListOrRequest))) {
			return false;
		}
		const sessions = await this._authenticationService.getSessions(providerId, scopeListOrRequest, { ...options, silent: true });
		return sessions.length > 0;
	}

	private completeSignInRequest(providerId: string, providerRequests: SessionRequestInfo, requestKey: string, request: SessionRequest): void {
		if (!this.isCurrentSignInRequest(providerId, providerRequests, requestKey, request)) {
			return;
		}
		delete providerRequests[requestKey];
		if (Object.keys(providerRequests).length === 0) {
			this._signInRequestItems.delete(providerId);
		}
		dispose(request.disposables);
		this.updateBadgeCount();
	}

	private updateAccessRequests(providerId: string, removedSessions: readonly AuthenticationSession[]): void {
		const providerRequests = this._sessionAccessRequestItems.get(providerId);
		if (providerRequests) {
			Object.entries(providerRequests).forEach(([requestKey, request]) => {
				request.possibleSessions = request.possibleSessions.filter(session => !removedSessions.some(removed => removed.id === session.id));
				if (!request.possibleSessions.length) {
					this.removeAccessRequest(providerId, requestKey);
				}
			});
		}
	}

	private updateBadgeCount(): void {
		this._accountBadgeDisposable.clear();

		let numberOfRequests = 0;
		this._signInRequestItems.forEach(providerRequests => {
			Object.keys(providerRequests).forEach(request => {
				numberOfRequests += providerRequests[request].requestingExtensionIds.length;
			});
		});

		this._sessionAccessRequestItems.forEach(accessRequest => {
			numberOfRequests += Object.keys(accessRequest).length;
		});

		if (numberOfRequests > 0) {
			const badge = new NumberBadge(numberOfRequests, () => nls.localize('sign in', "Sign in requested"));
			this._accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
		}
	}

	private accessRequestKey(extensionId: string, scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, options: IAuthenticationProviderSessionOptions): string {
		return JSON.stringify([extensionId, getAuthenticationSessionRequestKey(scopeListOrRequest, options)]);
	}

	private removeAccessRequest(providerId: string, requestKey: string): void {
		const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
		if (providerRequests[requestKey]) {
			dispose(providerRequests[requestKey].disposables);
			delete providerRequests[requestKey];
			if (Object.keys(providerRequests).length === 0) {
				this._sessionAccessRequestItems.delete(providerId);
			}
			this.updateBadgeCount();
		}
	}

	private removeAllowedAccessRequests(providerId: string, extensionId: string, accountName: string): void {
		if (!this._authenticationAccessService.isAccessAllowed(providerId, accountName, extensionId)) {
			return;
		}
		for (const [requestKey, request] of Object.entries(this._sessionAccessRequestItems.get(providerId) ?? {})) {
			if (request.extensionId === extensionId && request.possibleSessions.some(session => session.account.label === accountName)) {
				this.removeAccessRequest(providerId, requestKey);
			}
		}
	}

	//#region Account/Session Preference

	updateAccountPreference(extensionId: string, providerId: string, account: AuthenticationSessionAccount): void {
		const realExtensionId = ExtensionIdentifier.toKey(extensionId);
		const parentExtensionId = this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId;
		const key = this._getKey(parentExtensionId, providerId);

		// Store the preference in the workspace and application storage. This allows new workspaces to
		// have a preference set already to limit the number of prompts that are shown... but also allows
		// a specific workspace to override the global preference.
		this.storageService.store(key, account.label, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.storageService.store(key, account.label, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const childrenExtensions = this._inheritAuthAccountPreferenceParentToChildren[parentExtensionId];
		const extensionIds = childrenExtensions ? [parentExtensionId, ...childrenExtensions] : [parentExtensionId];
		for (const id of extensionIds) {
			this.removeAllowedAccessRequests(providerId, id, account.label);
		}
		this._onDidAccountPreferenceChange.fire({ extensionIds, providerId });
	}

	getAccountPreference(extensionId: string, providerId: string): string | undefined {
		const realExtensionId = ExtensionIdentifier.toKey(extensionId);
		const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId, providerId);

		// If a preference is set in the workspace, use that. Otherwise, use the global preference.
		return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
	}

	removeAccountPreference(extensionId: string, providerId: string): void {
		const realExtensionId = ExtensionIdentifier.toKey(extensionId);
		const key = this._getKey(this._inheritAuthAccountPreferenceChildToParent[realExtensionId] ?? realExtensionId, providerId);

		// This won't affect any other workspaces that have a preference set, but it will remove the preference
		// for this workspace and the global preference. This is only paired with a call to updateSessionPreference...
		// so we really don't _need_ to remove them as they are about to be overridden anyway... but it's more correct
		// to remove them first... and in case this gets called from somewhere else in the future.
		this.storageService.remove(key, StorageScope.WORKSPACE);
		this.storageService.remove(key, StorageScope.APPLICATION);
	}

	private _getKey(extensionId: string, providerId: string): string {
		return `${extensionId}-${providerId}`;
	}

	// TODO@TylerLeonhardt: Remove all of this after a couple iterations

	updateSessionPreference(providerId: string, extensionId: string, session: AuthenticationSession): void {
		const realExtensionId = ExtensionIdentifier.toKey(extensionId);
		// The 3 parts of this key are important:
		// * Extension id: The extension that has a preference
		// * Provider id: The provider that the preference is for
		// * The scopes: The subset of sessions that the preference applies to
		const key = `${realExtensionId}-${providerId}-${session.scopes.join(SCOPESLIST_SEPARATOR)}`;

		// Store the preference in the workspace and application storage. This allows new workspaces to
		// have a preference set already to limit the number of prompts that are shown... but also allows
		// a specific workspace to override the global preference.
		this.storageService.store(key, session.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.storageService.store(key, session.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	getSessionPreference(providerId: string, extensionId: string, scopes: string[]): string | undefined {
		const realExtensionId = ExtensionIdentifier.toKey(extensionId);
		// The 3 parts of this key are important:
		// * Extension id: The extension that has a preference
		// * Provider id: The provider that the preference is for
		// * The scopes: The subset of sessions that the preference applies to
		const key = `${realExtensionId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;

		// If a preference is set in the workspace, use that. Otherwise, use the global preference.
		return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
	}

	removeSessionPreference(providerId: string, extensionId: string, scopes: string[]): void {
		const realExtensionId = ExtensionIdentifier.toKey(extensionId);
		// The 3 parts of this key are important:
		// * Extension id: The extension that has a preference
		// * Provider id: The provider that the preference is for
		// * The scopes: The subset of sessions that the preference applies to
		const key = `${realExtensionId}-${providerId}-${scopes.join(SCOPESLIST_SEPARATOR)}`;

		// This won't affect any other workspaces that have a preference set, but it will remove the preference
		// for this workspace and the global preference. This is only paired with a call to updateSessionPreference...
		// so we really don't _need_ to remove them as they are about to be overridden anyway... but it's more correct
		// to remove them first... and in case this gets called from somewhere else in the future.
		this.storageService.remove(key, StorageScope.WORKSPACE);
		this.storageService.remove(key, StorageScope.APPLICATION);
	}

	private _updateAccountAndSessionPreferences(providerId: string, extensionId: string, session: AuthenticationSession): void {
		this.updateAccountPreference(extensionId, providerId, session.account);
		this.updateSessionPreference(providerId, extensionId, session);
	}

	//#endregion

	private async showGetSessionPrompt(provider: IAuthenticationProvider, accountName: string, extensionId: string, extensionName: string, requestKey: string): Promise<boolean> {
		enum SessionPromptChoice {
			Allow = 0,
			Deny = 1,
			Cancel = 2
		}
		const { result } = await this.dialogService.prompt<SessionPromptChoice>({
			type: Severity.Info,
			message: nls.localize('confirmAuthenticationAccess', "The extension '{0}' wants to access the {1} account '{2}'.", extensionName, provider.label, accountName),
			buttons: [
				{
					label: nls.localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
					run: () => SessionPromptChoice.Allow
				},
				{
					label: nls.localize({ key: 'deny', comment: ['&& denotes a mnemonic'] }, "&&Deny"),
					run: () => SessionPromptChoice.Deny
				}
			],
			cancelButton: {
				run: () => SessionPromptChoice.Cancel
			}
		});

		if (result !== SessionPromptChoice.Cancel) {
			this._authenticationAccessService.updateAllowedExtensions(provider.id, accountName, [{ id: extensionId, name: extensionName, allowed: result === SessionPromptChoice.Allow }]);
			this.removeAccessRequest(provider.id, requestKey);
			if (result === SessionPromptChoice.Allow) {
				this.removeAllowedAccessRequests(provider.id, extensionId, accountName);
			}
		}

		return result === SessionPromptChoice.Allow;
	}

	/**
	 * This function should be used only when there are sessions to disambiguate.
	 */
	async selectSession(providerId: string, extensionId: string, extensionName: string, scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, availableSessions: readonly AuthenticationSession[], options: IAuthenticationProviderSessionOptions = {}): Promise<AuthenticationSession> {
		const allAccounts = await this._authenticationService.getAccounts(providerId);
		if (!allAccounts.length) {
			throw new Error('No accounts available');
		}
		const disposables = new DisposableStore();
		const quickPick = disposables.add(this.quickInputService.createQuickPick<{ label: string; session?: AuthenticationSession; account?: AuthenticationSessionAccount }>());
		quickPick.ignoreFocusOut = true;
		const accountsWithSessions = new Set<string>();
		const items: { label: string; session?: AuthenticationSession; account?: AuthenticationSessionAccount }[] = availableSessions
			// Only grab the first account
			.filter(session => !accountsWithSessions.has(session.account.label) && accountsWithSessions.add(session.account.label))
			.map(session => {
				return {
					label: session.account.label,
					session: session
				};
			});

		// Add the additional accounts that have been logged into the provider but are
		// don't have a session yet.
		allAccounts.forEach(account => {
			if (!accountsWithSessions.has(account.label)) {
				items.push({ label: account.label, account });
			}
		});
		items.push({ label: nls.localize('useOtherAccount', "Sign in to another account") });
		quickPick.items = items;
		quickPick.title = nls.localize(
			{
				key: 'selectAccount',
				comment: ['The placeholder {0} is the name of an extension. {1} is the name of the type of account, such as Microsoft or GitHub.']
			},
			"The extension '{0}' wants to access a {1} account",
			extensionName,
			this._authenticationService.getProvider(providerId).label
		);
		quickPick.placeholder = nls.localize('getSessionPlateholder', "Select an account for '{0}' to use or Esc to cancel", extensionName);

		return await new Promise((resolve, reject) => {
			disposables.add(quickPick.onDidAccept(async _ => {
				quickPick.dispose();
				let session = quickPick.selectedItems[0].session;
				if (!session) {
					const account = quickPick.selectedItems[0].account;
					try {
						session = await this._authenticationService.createSession(providerId, scopeListOrRequest, { ...options, account });
					} catch (e) {
						reject(e);
						return;
					}
				}
				const accountName = session.account.label;

				this._authenticationAccessService.updateAllowedExtensions(providerId, accountName, [{ id: extensionId, name: extensionName, allowed: true }]);
				this._updateAccountAndSessionPreferences(providerId, extensionId, session);
				this.removeAccessRequest(providerId, this.accessRequestKey(extensionId, scopeListOrRequest, options));

				resolve(session);
			}));

			disposables.add(quickPick.onDidHide(_ => {
				if (!quickPick.selectedItems[0]) {
					reject(new CancellationError());
				}
				disposables.dispose();
			}));

			quickPick.show();
		});
	}

	private async completeSessionAccessRequest(provider: IAuthenticationProvider, requestKey: string, extensionName: string): Promise<void> {
		const providerRequests = this._sessionAccessRequestItems.get(provider.id) || {};
		const existingRequest = providerRequests[requestKey];
		if (!existingRequest) {
			return;
		}

		if (!provider) {
			return;
		}
		const { possibleSessions, extensionId, scopeListOrRequest, options } = existingRequest;

		let session: AuthenticationSession | undefined;
		if (provider.supportsMultipleAccounts) {
			try {
				session = await this.selectSession(provider.id, extensionId, extensionName, scopeListOrRequest, possibleSessions, options);
			} catch (error) {
				if (!isCancellationError(error)) {
					throw error;
				}
			}
		} else {
			const approved = await this.showGetSessionPrompt(provider, possibleSessions[0].account.label, extensionId, extensionName, requestKey);
			if (approved) {
				session = possibleSessions[0];
			}
		}

		if (session) {
			this._authenticationUsageService.addAccountUsage(provider.id, session.account.label, session.scopes, extensionId, extensionName);
			this.removeAccessRequest(provider.id, requestKey);
		}
	}

	requestSessionAccess(providerId: string, extensionId: string, extensionName: string, scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, possibleSessions: readonly AuthenticationSession[], options: IAuthenticationProviderSessionOptions = {}): void {
		const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
		const requestKey = this.accessRequestKey(extensionId, scopeListOrRequest, options);
		const hasExistingRequest = providerRequests[requestKey];
		if (hasExistingRequest) {
			return;
		}

		const provider = this._authenticationService.getProvider(providerId);
		const commandId = `${providerId}:${extensionId}:access:${generateUuid()}`;
		const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '3_accessRequests',
			command: {
				id: commandId,
				title: nls.localize({
					key: 'accessRequest',
					comment: [`The placeholder {0} will be replaced with an authentication provider''s label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count`]
				},
					"Grant access to {0} for {1}... (1)",
					provider.label,
					extensionName)
			}
		});

		const accessCommand = CommandsRegistry.registerCommand({
			id: commandId,
			handler: () => this.completeSessionAccessRequest(provider, requestKey, extensionName)
		});

		providerRequests[requestKey] = { extensionId, scopeListOrRequest, options, possibleSessions: [...possibleSessions], disposables: [menuItem, accessCommand] };
		this._sessionAccessRequestItems.set(providerId, providerRequests);
		this.updateBadgeCount();
	}

	async requestNewSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | IAuthenticationWwwAuthenticateRequest, extensionId: string, extensionName: string, options: IAuthenticationProviderSessionOptions = {}): Promise<void> {
		if (!this._authenticationService.isAuthenticationProviderRegistered(providerId)) {
			// Activate has already been called for the authentication provider, but it cannot block on registering itself
			// since this is sync and returns a disposable. So, wait for registration event to fire that indicates the
			// provider is now in the map.
			await new Promise<void>((resolve, _) => {
				const dispose = this._authenticationService.onDidRegisterAuthenticationProvider(e => {
					if (e.id === providerId) {
						dispose.dispose();
						resolve();
					}
				});
			});
		}

		let provider: IAuthenticationProvider;
		try {
			provider = this._authenticationService.getProvider(providerId);
		} catch (_e) {
			return;
		}

		const providerRequests = this._signInRequestItems.get(providerId) ?? {};
		const signInRequestKey = getAuthenticationSessionRequestKey(scopeListOrRequest, options);
		if (providerRequests[signInRequestKey]?.requestingExtensionIds.includes(extensionId)) {
			return;
		}
		const request: SessionRequest = providerRequests[signInRequestKey] ?? {
			scopeListOrRequest,
			options,
			disposables: [],
			requestingExtensionIds: []
		};

		// Construct a commandId that won't clash with others generated here, nor likely with an extension's command
		const commandId = `${providerId}:${extensionId}:signIn:${generateUuid()}`;
		const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '2_signInRequests',
			command: {
				id: commandId,
				title: nls.localize({
					key: 'signInRequest',
					comment: [`The placeholder {0} will be replaced with an authentication provider's label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count.`]
				},
					"Sign in with {0} to use {1} (1)",
					provider.label,
					extensionName)
			}
		});

		const signInCommand = CommandsRegistry.registerCommand({
			id: commandId,
			handler: async () => {
				const session = await this._authenticationService.createSession(providerId, scopeListOrRequest, options);

				this._authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
				this._updateAccountAndSessionPreferences(providerId, extensionId, session);
				this.completeSignInRequest(providerId, providerRequests, signInRequestKey, request);
				void this.updateNewSessionRequests(providerId, [session]).catch(onUnexpectedError);
			}
		});

		request.disposables.push(menuItem, signInCommand);
		request.requestingExtensionIds.push(extensionId);
		providerRequests[signInRequestKey] = request;
		this._signInRequestItems.set(providerId, providerRequests);
		this.updateBadgeCount();
	}
}

registerSingleton(IAuthenticationExtensionsService, AuthenticationExtensionsService, InstantiationType.Delayed);
