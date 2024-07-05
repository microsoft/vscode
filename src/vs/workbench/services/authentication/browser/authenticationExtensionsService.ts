/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, dispose, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Severity } from 'vs/platform/notification/common/notification';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IAuthenticationAccessService } from 'vs/workbench/services/authentication/browser/authenticationAccessService';
import { IAuthenticationUsageService } from 'vs/workbench/services/authentication/browser/authenticationUsageService';
import { AuthenticationSession, IAuthenticationProvider, IAuthenticationService, IAuthenticationExtensionsService } from 'vs/workbench/services/authentication/common/authentication';

// OAuth2 spec prohibits space in a scope, so use that to join them.
const SCOPESLIST_SEPARATOR = ' ';

interface SessionRequest {
	disposables: IDisposable[];
	requestingExtensionIds: string[];
}

interface SessionRequestInfo {
	[scopesList: string]: SessionRequest;
}

// TODO@TylerLeonhardt: This should all go in MainThreadAuthentication
export class AuthenticationExtensionsService extends Disposable implements IAuthenticationExtensionsService {
	declare readonly _serviceBrand: undefined;
	private _signInRequestItems = new Map<string, SessionRequestInfo>();
	private _sessionAccessRequestItems = new Map<string, { [extensionId: string]: { disposables: IDisposable[]; possibleSessions: AuthenticationSession[] } }>();
	private readonly _accountBadgeDisposable = this._register(new MutableDisposable());

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationUsageService private readonly _authenticationUsageService: IAuthenticationUsageService,
		@IAuthenticationAccessService private readonly _authenticationAccessService: IAuthenticationAccessService
	) {
		super();
		this.registerListeners();
	}

	private registerListeners() {
		this._register(this._authenticationService.onDidChangeSessions(async e => {
			if (e.event.added?.length) {
				await this.updateNewSessionRequests(e.providerId, e.event.added);
			}
			if (e.event.removed?.length) {
				await this.updateAccessRequests(e.providerId, e.event.removed);
			}
			this.updateBadgeCount();
		}));

		this._register(this._authenticationService.onDidUnregisterAuthenticationProvider(e => {
			const accessRequests = this._sessionAccessRequestItems.get(e.id) || {};
			Object.keys(accessRequests).forEach(extensionId => {
				this.removeAccessRequest(e.id, extensionId);
			});
		}));
	}

	private async updateNewSessionRequests(providerId: string, addedSessions: readonly AuthenticationSession[]): Promise<void> {
		const existingRequestsForProvider = this._signInRequestItems.get(providerId);
		if (!existingRequestsForProvider) {
			return;
		}

		Object.keys(existingRequestsForProvider).forEach(requestedScopes => {
			if (addedSessions.some(session => session.scopes.slice().join(SCOPESLIST_SEPARATOR) === requestedScopes)) {
				const sessionRequest = existingRequestsForProvider[requestedScopes];
				sessionRequest?.disposables.forEach(item => item.dispose());

				delete existingRequestsForProvider[requestedScopes];
				if (Object.keys(existingRequestsForProvider).length === 0) {
					this._signInRequestItems.delete(providerId);
				} else {
					this._signInRequestItems.set(providerId, existingRequestsForProvider);
				}
			}
		});
	}

	private async updateAccessRequests(providerId: string, removedSessions: readonly AuthenticationSession[]) {
		const providerRequests = this._sessionAccessRequestItems.get(providerId);
		if (providerRequests) {
			Object.keys(providerRequests).forEach(extensionId => {
				removedSessions.forEach(removed => {
					const indexOfSession = providerRequests[extensionId].possibleSessions.findIndex(session => session.id === removed.id);
					if (indexOfSession) {
						providerRequests[extensionId].possibleSessions.splice(indexOfSession, 1);
					}
				});

				if (!providerRequests[extensionId].possibleSessions.length) {
					this.removeAccessRequest(providerId, extensionId);
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

	private removeAccessRequest(providerId: string, extensionId: string): void {
		const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
		if (providerRequests[extensionId]) {
			dispose(providerRequests[extensionId].disposables);
			delete providerRequests[extensionId];
			this.updateBadgeCount();
		}
	}

	//#region Session Preference

	updateSessionPreference(providerId: string, extensionId: string, session: AuthenticationSession): void {
		// The 3 parts of this key are important:
		// * Extension id: The extension that has a preference
		// * Provider id: The provider that the preference is for
		// * The scopes: The subset of sessions that the preference applies to
		const key = `${extensionId}-${providerId}-${session.scopes.join(' ')}`;

		// Store the preference in the workspace and application storage. This allows new workspaces to
		// have a preference set already to limit the number of prompts that are shown... but also allows
		// a specific workspace to override the global preference.
		this.storageService.store(key, session.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.storageService.store(key, session.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	getSessionPreference(providerId: string, extensionId: string, scopes: string[]): string | undefined {
		// The 3 parts of this key are important:
		// * Extension id: The extension that has a preference
		// * Provider id: The provider that the preference is for
		// * The scopes: The subset of sessions that the preference applies to
		const key = `${extensionId}-${providerId}-${scopes.join(' ')}`;

		// If a preference is set in the workspace, use that. Otherwise, use the global preference.
		return this.storageService.get(key, StorageScope.WORKSPACE) ?? this.storageService.get(key, StorageScope.APPLICATION);
	}

	removeSessionPreference(providerId: string, extensionId: string, scopes: string[]): void {
		// The 3 parts of this key are important:
		// * Extension id: The extension that has a preference
		// * Provider id: The provider that the preference is for
		// * The scopes: The subset of sessions that the preference applies to
		const key = `${extensionId}-${providerId}-${scopes.join(' ')}`;

		// This won't affect any other workspaces that have a preference set, but it will remove the preference
		// for this workspace and the global preference. This is only paired with a call to updateSessionPreference...
		// so we really don't _need_ to remove them as they are about to be overridden anyway... but it's more correct
		// to remove them first... and in case this gets called from somewhere else in the future.
		this.storageService.remove(key, StorageScope.WORKSPACE);
		this.storageService.remove(key, StorageScope.APPLICATION);
	}

	//#endregion

	private async showGetSessionPrompt(provider: IAuthenticationProvider, accountName: string, extensionId: string, extensionName: string): Promise<boolean> {
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
			this.removeAccessRequest(provider.id, extensionId);
		}

		return result === SessionPromptChoice.Allow;
	}

	async selectSession(providerId: string, extensionId: string, extensionName: string, scopes: string[], availableSessions: AuthenticationSession[]): Promise<AuthenticationSession> {
		return new Promise((resolve, reject) => {
			// This function should be used only when there are sessions to disambiguate.
			if (!availableSessions.length) {
				reject('No available sessions');
				return;
			}

			const quickPick = this.quickInputService.createQuickPick<{ label: string; session?: AuthenticationSession }>();
			quickPick.ignoreFocusOut = true;
			const items: { label: string; session?: AuthenticationSession }[] = availableSessions.map(session => {
				return {
					label: session.account.label,
					session: session
				};
			});

			items.push({
				label: nls.localize('useOtherAccount', "Sign in to another account")
			});

			quickPick.items = items;

			quickPick.title = nls.localize(
				{
					key: 'selectAccount',
					comment: ['The placeholder {0} is the name of an extension. {1} is the name of the type of account, such as Microsoft or GitHub.']
				},
				"The extension '{0}' wants to access a {1} account",
				extensionName,
				this._authenticationService.getProvider(providerId).label);
			quickPick.placeholder = nls.localize('getSessionPlateholder', "Select an account for '{0}' to use or Esc to cancel", extensionName);

			quickPick.onDidAccept(async _ => {
				quickPick.dispose();
				let session = quickPick.selectedItems[0].session;
				if (!session) {
					try {
						session = await this._authenticationService.createSession(providerId, scopes);
					} catch (e) {
						reject(e);
						return;
					}
				}
				const accountName = session.account.label;

				this._authenticationAccessService.updateAllowedExtensions(providerId, accountName, [{ id: extensionId, name: extensionName, allowed: true }]);
				this.updateSessionPreference(providerId, extensionId, session);
				this.removeAccessRequest(providerId, extensionId);

				resolve(session);
			});

			quickPick.onDidHide(_ => {
				quickPick.dispose();
				if (!quickPick.selectedItems[0]) {
					reject('User did not consent to account access');
				}
			});

			quickPick.show();
		});
	}

	private async completeSessionAccessRequest(provider: IAuthenticationProvider, extensionId: string, extensionName: string, scopes: string[]): Promise<void> {
		const providerRequests = this._sessionAccessRequestItems.get(provider.id) || {};
		const existingRequest = providerRequests[extensionId];
		if (!existingRequest) {
			return;
		}

		if (!provider) {
			return;
		}
		const possibleSessions = existingRequest.possibleSessions;

		let session: AuthenticationSession | undefined;
		if (provider.supportsMultipleAccounts) {
			try {
				session = await this.selectSession(provider.id, extensionId, extensionName, scopes, possibleSessions);
			} catch (_) {
				// ignore cancel
			}
		} else {
			const approved = await this.showGetSessionPrompt(provider, possibleSessions[0].account.label, extensionId, extensionName);
			if (approved) {
				session = possibleSessions[0];
			}
		}

		if (session) {
			this._authenticationUsageService.addAccountUsage(provider.id, session.account.label, extensionId, extensionName);
		}
	}

	requestSessionAccess(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: AuthenticationSession[]): void {
		const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
		const hasExistingRequest = providerRequests[extensionId];
		if (hasExistingRequest) {
			return;
		}

		const provider = this._authenticationService.getProvider(providerId);
		const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '3_accessRequests',
			command: {
				id: `${providerId}${extensionId}Access`,
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
			id: `${providerId}${extensionId}Access`,
			handler: async (accessor) => {
				this.completeSessionAccessRequest(provider, extensionId, extensionName, scopes);
			}
		});

		providerRequests[extensionId] = { possibleSessions, disposables: [menuItem, accessCommand] };
		this._sessionAccessRequestItems.set(providerId, providerRequests);
		this.updateBadgeCount();
	}

	async requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void> {
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

		const providerRequests = this._signInRequestItems.get(providerId);
		const scopesList = scopes.join(SCOPESLIST_SEPARATOR);
		const extensionHasExistingRequest = providerRequests
			&& providerRequests[scopesList]
			&& providerRequests[scopesList].requestingExtensionIds.includes(extensionId);

		if (extensionHasExistingRequest) {
			return;
		}

		// Construct a commandId that won't clash with others generated here, nor likely with an extension's command
		const commandId = `${providerId}:${extensionId}:signIn${Object.keys(providerRequests || []).length}`;
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
			handler: async (accessor) => {
				const authenticationService = accessor.get(IAuthenticationService);
				const session = await authenticationService.createSession(providerId, scopes);

				this._authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
				this.updateSessionPreference(providerId, extensionId, session);
			}
		});


		if (providerRequests) {
			const existingRequest = providerRequests[scopesList] || { disposables: [], requestingExtensionIds: [] };

			providerRequests[scopesList] = {
				disposables: [...existingRequest.disposables, menuItem, signInCommand],
				requestingExtensionIds: [...existingRequest.requestingExtensionIds, extensionId]
			};
			this._signInRequestItems.set(providerId, providerRequests);
		} else {
			this._signInRequestItems.set(providerId, {
				[scopesList]: {
					disposables: [menuItem, signInCommand],
					requestingExtensionIds: [extensionId]
				}
			});
		}

		this.updateBadgeCount();
	}
}

registerSingleton(IAuthenticationExtensionsService, AuthenticationExtensionsService, InstantiationType.Delayed);
