/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Disposable, dispose, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { isString } from 'vs/base/common/types';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IAuthenticationCreateSessionOptions, AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { ActivationKind, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export function getAuthenticationProviderActivationEvent(id: string): string { return `onAuthenticationRequest:${id}`; }

interface IAccountUsage {
	extensionId: string;
	extensionName: string;
	lastUsed: number;
}

export function readAccountUsages(storageService: IStorageService, providerId: string, accountName: string,): IAccountUsage[] {
	const accountKey = `${providerId}-${accountName}-usages`;
	const storedUsages = storageService.get(accountKey, StorageScope.APPLICATION);
	let usages: IAccountUsage[] = [];
	if (storedUsages) {
		try {
			usages = JSON.parse(storedUsages);
		} catch (e) {
			// ignore
		}
	}

	return usages;
}

export function removeAccountUsage(storageService: IStorageService, providerId: string, accountName: string): void {
	const accountKey = `${providerId}-${accountName}-usages`;
	storageService.remove(accountKey, StorageScope.APPLICATION);
}

export function addAccountUsage(storageService: IStorageService, providerId: string, accountName: string, extensionId: string, extensionName: string) {
	const accountKey = `${providerId}-${accountName}-usages`;
	const usages = readAccountUsages(storageService, providerId, accountName);

	const existingUsageIndex = usages.findIndex(usage => usage.extensionId === extensionId);
	if (existingUsageIndex > -1) {
		usages.splice(existingUsageIndex, 1, {
			extensionId,
			extensionName,
			lastUsed: Date.now()
		});
	} else {
		usages.push({
			extensionId,
			extensionName,
			lastUsed: Date.now()
		});
	}

	storageService.store(accountKey, JSON.stringify(usages), StorageScope.APPLICATION, StorageTarget.MACHINE);
}

// TODO: pull this out into its own service
export type AuthenticationSessionInfo = { readonly id: string; readonly accessToken: string; readonly providerId: string; readonly canSignOut?: boolean };
export async function getCurrentAuthenticationSessionInfo(
	// TODO: Remove when all known embedders implement SecretStorageProviders instead of CredentialsProviders
	credentialsService: ICredentialsService,
	secretStorageService: ISecretStorageService,
	productService: IProductService
): Promise<AuthenticationSessionInfo | undefined> {
	const authenticationSessionValue =
		await secretStorageService.get(`${productService.urlProtocol}.loginAccount`)
		?? await credentialsService.getPassword(`${productService.urlProtocol}.login`, 'account');
	if (authenticationSessionValue) {
		try {
			const authenticationSessionInfo: AuthenticationSessionInfo = JSON.parse(authenticationSessionValue);
			if (authenticationSessionInfo
				&& isString(authenticationSessionInfo.id)
				&& isString(authenticationSessionInfo.accessToken)
				&& isString(authenticationSessionInfo.providerId)
			) {
				return authenticationSessionInfo;
			}
		} catch (e) {
			// This is a best effort operation.
			console.error(`Failed parsing current auth session value: ${e}`);
		}
	}
	return undefined;
}

export interface AllowedExtension {
	id: string;
	name: string;
	allowed?: boolean;
}

export function readAllowedExtensions(storageService: IStorageService, providerId: string, accountName: string): AllowedExtension[] {
	let trustedExtensions: AllowedExtension[] = [];
	try {
		const trustedExtensionSrc = storageService.get(`${providerId}-${accountName}`, StorageScope.APPLICATION);
		if (trustedExtensionSrc) {
			trustedExtensions = JSON.parse(trustedExtensionSrc);
		}
	} catch (err) { }

	return trustedExtensions;
}

// OAuth2 spec prohibits space in a scope, so use that to join them.
const SCOPESLIST_SEPARATOR = ' ';

interface SessionRequest {
	disposables: IDisposable[];
	requestingExtensionIds: string[];
}

interface SessionRequestInfo {
	[scopesList: string]: SessionRequest;
}

CommandsRegistry.registerCommand('workbench.getCodeExchangeProxyEndpoints', function (accessor, _) {
	const environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
	return environmentService.options?.codeExchangeProxyEndpoints;
});

const authenticationDefinitionSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		id: {
			type: 'string',
			description: nls.localize('authentication.id', 'The id of the authentication provider.')
		},
		label: {
			type: 'string',
			description: nls.localize('authentication.label', 'The human readable name of the authentication provider.'),
		}
	}
};

const authenticationExtPoint = ExtensionsRegistry.registerExtensionPoint<AuthenticationProviderInformation[]>({
	extensionPoint: 'authentication',
	jsonSchema: {
		description: nls.localize({ key: 'authenticationExtensionPoint', comment: [`'Contributes' means adds here`] }, 'Contributes authentication'),
		type: 'array',
		items: authenticationDefinitionSchema
	},
	activationEventsGenerator: (authenticationProviders, result) => {
		for (const authenticationProvider of authenticationProviders) {
			if (authenticationProvider.id) {
				result.push(`onAuthenticationRequest:${authenticationProvider.id}`);
			}
		}
	}
});

let placeholderMenuItem: IDisposable | undefined = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
	command: {
		id: 'noAuthenticationProviders',
		title: nls.localize('authentication.Placeholder', "No accounts requested yet..."),
		precondition: ContextKeyExpr.false()
	},
});

export class AuthenticationService extends Disposable implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;
	private _signInRequestItems = new Map<string, SessionRequestInfo>();
	private _sessionAccessRequestItems = new Map<string, { [extensionId: string]: { disposables: IDisposable[]; possibleSessions: AuthenticationSession[] } }>();
	private _accountBadgeDisposable = this._register(new MutableDisposable());

	private _authenticationProviders: Map<string, IAuthenticationProvider> = new Map<string, IAuthenticationProvider>();

	/**
	 * All providers that have been statically declared by extensions. These may not be registered.
	 */
	declaredProviders: AuthenticationProviderInformation[] = [];

	private _onDidRegisterAuthenticationProvider: Emitter<AuthenticationProviderInformation> = this._register(new Emitter<AuthenticationProviderInformation>());
	readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation> = this._onDidRegisterAuthenticationProvider.event;

	private _onDidUnregisterAuthenticationProvider: Emitter<AuthenticationProviderInformation> = this._register(new Emitter<AuthenticationProviderInformation>());
	readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation> = this._onDidUnregisterAuthenticationProvider.event;

	private _onDidChangeSessions: Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }> = this._register(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
	readonly onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }> = this._onDidChangeSessions.event;

	private _onDidChangeDeclaredProviders: Emitter<AuthenticationProviderInformation[]> = this._register(new Emitter<AuthenticationProviderInformation[]>());
	readonly onDidChangeDeclaredProviders: Event<AuthenticationProviderInformation[]> = this._onDidChangeDeclaredProviders.event;

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		authenticationExtPoint.setHandler((extensions, { added, removed }) => {
			added.forEach(point => {
				for (const provider of point.value) {
					if (isFalsyOrWhitespace(provider.id)) {
						point.collector.error(nls.localize('authentication.missingId', 'An authentication contribution must specify an id.'));
						continue;
					}

					if (isFalsyOrWhitespace(provider.label)) {
						point.collector.error(nls.localize('authentication.missingLabel', 'An authentication contribution must specify a label.'));
						continue;
					}

					if (!this.declaredProviders.some(p => p.id === provider.id)) {
						this.declaredProviders.push(provider);
					} else {
						point.collector.error(nls.localize('authentication.idConflict', "This authentication id '{0}' has already been registered", provider.id));
					}
				}
			});

			const removedExtPoints = flatten(removed.map(r => r.value));
			removedExtPoints.forEach(point => {
				const index = this.declaredProviders.findIndex(provider => provider.id === point.id);
				if (index > -1) {
					this.declaredProviders.splice(index, 1);
				}
			});

			this._onDidChangeDeclaredProviders.fire(this.declaredProviders);
		});
	}

	getProviderIds(): string[] {
		const providerIds: string[] = [];
		this._authenticationProviders.forEach(provider => {
			providerIds.push(provider.id);
		});
		return providerIds;
	}

	isAuthenticationProviderRegistered(id: string): boolean {
		return this._authenticationProviders.has(id);
	}

	registerAuthenticationProvider(id: string, authenticationProvider: IAuthenticationProvider): void {
		this._authenticationProviders.set(id, authenticationProvider);
		this._onDidRegisterAuthenticationProvider.fire({ id, label: authenticationProvider.label });

		if (placeholderMenuItem) {
			placeholderMenuItem.dispose();
			placeholderMenuItem = undefined;
		}
	}

	unregisterAuthenticationProvider(id: string): void {
		const provider = this._authenticationProviders.get(id);
		if (provider) {
			provider.dispose();
			this._authenticationProviders.delete(id);
			this._onDidUnregisterAuthenticationProvider.fire({ id, label: provider.label });

			const accessRequests = this._sessionAccessRequestItems.get(id) || {};
			Object.keys(accessRequests).forEach(extensionId => {
				this.removeAccessRequest(id, extensionId);
			});
		}

		if (!this._authenticationProviders.size) {
			placeholderMenuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
				command: {
					id: 'noAuthenticationProviders',
					title: nls.localize('loading', "Loading..."),
					precondition: ContextKeyExpr.false()
				},
			});
		}
	}

	async sessionsUpdate(id: string, event: AuthenticationSessionsChangeEvent): Promise<void> {
		const provider = this._authenticationProviders.get(id);
		if (provider) {
			this._onDidChangeSessions.fire({ providerId: id, label: provider.label, event: event });

			if (event.added) {
				await this.updateNewSessionRequests(provider, event.added);
			}

			if (event.removed) {
				await this.updateAccessRequests(id, event.removed);
			}

			this.updateBadgeCount();
		}
	}

	private async updateNewSessionRequests(provider: IAuthenticationProvider, addedSessions: readonly AuthenticationSession[]): Promise<void> {
		const existingRequestsForProvider = this._signInRequestItems.get(provider.id);
		if (!existingRequestsForProvider) {
			return;
		}

		Object.keys(existingRequestsForProvider).forEach(requestedScopes => {
			if (addedSessions.some(session => session.scopes.slice().join(SCOPESLIST_SEPARATOR) === requestedScopes)) {
				const sessionRequest = existingRequestsForProvider[requestedScopes];
				sessionRequest?.disposables.forEach(item => item.dispose());

				delete existingRequestsForProvider[requestedScopes];
				if (Object.keys(existingRequestsForProvider).length === 0) {
					this._signInRequestItems.delete(provider.id);
				} else {
					this._signInRequestItems.set(provider.id, existingRequestsForProvider);
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

	/**
	 * Check extension access to an account
	 * @param providerId The id of the authentication provider
	 * @param accountName The account name that access is checked for
	 * @param extensionId The id of the extension requesting access
	 * @returns Returns true or false if the user has opted to permanently grant or disallow access, and undefined
	 * if they haven't made a choice yet
	 */
	isAccessAllowed(providerId: string, accountName: string, extensionId: string): boolean | undefined {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		const extensionData = allowList.find(extension => extension.id === extensionId);
		if (extensionData) {
			// This property didn't exist on this data previously, inclusion in the list at all indicates allowance
			return extensionData.allowed !== undefined
				? extensionData.allowed
				: true;
		}

		if (this.productService.trustedExtensionAuthAccess?.includes(extensionId)) {
			return true;
		}

		return undefined;
	}

	updateAllowedExtension(providerId: string, accountName: string, extensionId: string, extensionName: string, isAllowed: boolean): void {
		const allowList = readAllowedExtensions(this.storageService, providerId, accountName);
		const index = allowList.findIndex(extension => extension.id === extensionId);
		if (index === -1) {
			allowList.push({ id: extensionId, name: extensionName, allowed: isAllowed });
		} else {
			allowList[index].allowed = isAllowed;
		}

		this.storageService.store(`${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.APPLICATION, StorageTarget.USER);
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

	async showGetSessionPrompt(providerId: string, accountName: string, extensionId: string, extensionName: string): Promise<boolean> {
		const providerName = this.getLabel(providerId);
		enum SessionPromptChoice {
			Allow = 0,
			Deny = 1,
			Cancel = 2
		}
		const { result } = await this.dialogService.prompt<SessionPromptChoice>({
			type: Severity.Info,
			message: nls.localize('confirmAuthenticationAccess', "The extension '{0}' wants to access the {1} account '{2}'.", extensionName, providerName, accountName),
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
			this.updateAllowedExtension(providerId, accountName, extensionId, extensionName, result === SessionPromptChoice.Allow);
			this.removeAccessRequest(providerId, extensionId);
		}

		return result === SessionPromptChoice.Allow;
	}

	async selectSession(providerId: string, extensionId: string, extensionName: string, scopes: string[], availableSessions: AuthenticationSession[]): Promise<AuthenticationSession> {
		return new Promise((resolve, reject) => {
			// This function should be used only when there are sessions to disambiguate.
			if (!availableSessions.length) {
				reject('No available sessions');
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

			const providerName = this.getLabel(providerId);

			quickPick.items = items;

			quickPick.title = nls.localize(
				{
					key: 'selectAccount',
					comment: ['The placeholder {0} is the name of an extension. {1} is the name of the type of account, such as Microsoft or GitHub.']
				},
				"The extension '{0}' wants to access a {1} account",
				extensionName,
				providerName);
			quickPick.placeholder = nls.localize('getSessionPlateholder', "Select an account for '{0}' to use or Esc to cancel", extensionName);

			quickPick.onDidAccept(async _ => {
				const session = quickPick.selectedItems[0].session ?? await this.createSession(providerId, scopes);
				const accountName = session.account.label;

				this.updateAllowedExtension(providerId, accountName, extensionId, extensionName, true);
				this.updateSessionPreference(providerId, extensionId, session);
				this.removeAccessRequest(providerId, extensionId);

				quickPick.dispose();
				resolve(session);
			});

			quickPick.onDidHide(_ => {
				if (!quickPick.selectedItems[0]) {
					reject('User did not consent to account access');
				}

				quickPick.dispose();
			});

			quickPick.show();
		});
	}

	async completeSessionAccessRequest(providerId: string, extensionId: string, extensionName: string, scopes: string[]): Promise<void> {
		const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
		const existingRequest = providerRequests[extensionId];
		if (!existingRequest) {
			return;
		}

		const possibleSessions = existingRequest.possibleSessions;
		const supportsMultipleAccounts = this.supportsMultipleAccounts(providerId);

		let session: AuthenticationSession | undefined;
		if (supportsMultipleAccounts) {
			try {
				session = await this.selectSession(providerId, extensionId, extensionName, scopes, possibleSessions);
			} catch (_) {
				// ignore cancel
			}
		} else {
			const approved = await this.showGetSessionPrompt(providerId, possibleSessions[0].account.label, extensionId, extensionName);
			if (approved) {
				session = possibleSessions[0];
			}
		}

		if (session) {
			addAccountUsage(this.storageService, providerId, session.account.label, extensionId, extensionName);
			const providerName = this.getLabel(providerId);
			this._onDidChangeSessions.fire({ providerId, label: providerName, event: { added: [], removed: [], changed: [session] } });
		}
	}

	requestSessionAccess(providerId: string, extensionId: string, extensionName: string, scopes: string[], possibleSessions: AuthenticationSession[]): void {
		const providerRequests = this._sessionAccessRequestItems.get(providerId) || {};
		const hasExistingRequest = providerRequests[extensionId];
		if (hasExistingRequest) {
			return;
		}

		const menuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
			group: '3_accessRequests',
			command: {
				id: `${providerId}${extensionId}Access`,
				title: nls.localize({
					key: 'accessRequest',
					comment: [`The placeholder {0} will be replaced with an authentication provider''s label. {1} will be replaced with an extension name. (1) is to indicate that this menu item contributes to a badge count`]
				},
					"Grant access to {0} for {1}... (1)",
					this.getLabel(providerId),
					extensionName)
			}
		});

		const accessCommand = CommandsRegistry.registerCommand({
			id: `${providerId}${extensionId}Access`,
			handler: async (accessor) => {
				const authenticationService = accessor.get(IAuthenticationService);
				authenticationService.completeSessionAccessRequest(providerId, extensionId, extensionName, scopes);
			}
		});

		providerRequests[extensionId] = { possibleSessions, disposables: [menuItem, accessCommand] };
		this._sessionAccessRequestItems.set(providerId, providerRequests);
		this.updateBadgeCount();
	}

	async requestNewSession(providerId: string, scopes: string[], extensionId: string, extensionName: string): Promise<void> {
		let provider = this._authenticationProviders.get(providerId);
		if (!provider) {
			// Activate has already been called for the authentication provider, but it cannot block on registering itself
			// since this is sync and returns a disposable. So, wait for registration event to fire that indicates the
			// provider is now in the map.
			await new Promise<void>((resolve, _) => {
				const dispose = this.onDidRegisterAuthenticationProvider(e => {
					if (e.id === providerId) {
						provider = this._authenticationProviders.get(providerId);
						dispose.dispose();
						resolve();
					}
				});
			});
		}

		if (!provider) {
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

				this.updateAllowedExtension(providerId, session.account.label, extensionId, extensionName, true);
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
	getLabel(id: string): string {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.label;
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	supportsMultipleAccounts(id: string): boolean {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.supportsMultipleAccounts;
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	private async tryActivateProvider(providerId: string, activateImmediate: boolean): Promise<IAuthenticationProvider> {
		await this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(providerId), activateImmediate ? ActivationKind.Immediate : ActivationKind.Normal);
		let provider = this._authenticationProviders.get(providerId);
		if (provider) {
			return provider;
		}

		// When activate has completed, the extension has made the call to `registerAuthenticationProvider`.
		// However, activate cannot block on this, so the renderer may not have gotten the event yet.
		const didRegister: Promise<IAuthenticationProvider> = new Promise((resolve, _) => {
			this.onDidRegisterAuthenticationProvider(e => {
				if (e.id === providerId) {
					provider = this._authenticationProviders.get(providerId);
					if (provider) {
						resolve(provider);
					} else {
						throw new Error(`No authentication provider '${providerId}' is currently registered.`);
					}
				}
			});
		});

		const didTimeout: Promise<IAuthenticationProvider> = new Promise((_, reject) => {
			setTimeout(() => {
				reject('Timed out waiting for authentication provider to register');
			}, 5000);
		});

		return Promise.race([didRegister, didTimeout]);
	}

	async getSessions(id: string, scopes?: string[], activateImmediate: boolean = false): Promise<ReadonlyArray<AuthenticationSession>> {
		const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, activateImmediate);
		if (authProvider) {
			return await authProvider.getSessions(scopes);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async createSession(id: string, scopes: string[], options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession> {
		const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, !!options?.activateImmediate);
		if (authProvider) {
			return await authProvider.createSession(scopes, {
				sessionToRecreate: options?.sessionToRecreate
			});
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async removeSession(id: string, sessionId: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.removeSession(sessionId);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async manageTrustedExtensionsForAccount(id: string, accountName: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.manageTrustedExtensions(accountName);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async removeAccountSessions(id: string, accountName: string, sessions: AuthenticationSession[]): Promise<void> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.removeAccountSessions(accountName, sessions);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}
}

registerSingleton(IAuthenticationService, AuthenticationService, InstantiationType.Delayed);
