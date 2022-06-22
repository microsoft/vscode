/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { AllowedExtension, readAllowedExtensions, getAuthenticationProviderActivationEvent, addAccountUsage, readAccountUsages, removeAccountUsage } from 'vs/workbench/services/authentication/browser/authenticationService';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { ExtHostAuthenticationShape, ExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { fromNow } from 'vs/base/common/date';
import { ActivationKind, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import type { AuthenticationGetSessionOptions } from 'vscode';

interface TrustedExtensionsQuickPickItem {
	label: string;
	description: string;
	extension: AllowedExtension;
}

export class MainThreadAuthenticationProvider extends Disposable implements IAuthenticationProvider {
	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly label: string,
		public readonly supportsMultipleAccounts: boolean,
		private readonly notificationService: INotificationService,
		private readonly storageService: IStorageService,
		private readonly quickInputService: IQuickInputService,
		private readonly dialogService: IDialogService
	) {
		super();
	}
	public manageTrustedExtensions(accountName: string) {
		const allowedExtensions = readAllowedExtensions(this.storageService, this.id, accountName);

		if (!allowedExtensions.length) {
			this.dialogService.show(Severity.Info, nls.localize('noTrustedExtensions', "This account has not been used by any extensions."));
			return;
		}

		const quickPick = this.quickInputService.createQuickPick<TrustedExtensionsQuickPickItem>();
		quickPick.canSelectMany = true;
		quickPick.customButton = true;
		quickPick.customLabel = nls.localize('manageTrustedExtensions.cancel', 'Cancel');
		const usages = readAccountUsages(this.storageService, this.id, accountName);
		const items = allowedExtensions.map(extension => {
			const usage = usages.find(usage => extension.id === usage.extensionId);
			return {
				label: extension.name,
				description: usage
					? nls.localize({ key: 'accountLastUsedDate', comment: ['The placeholder {0} is a string with time information, such as "3 days ago"'] }, "Last used this account {0}", fromNow(usage.lastUsed, true))
					: nls.localize('notUsed', "Has not used this account"),
				extension
			};
		});

		quickPick.items = items;
		quickPick.selectedItems = items.filter(item => item.extension.allowed === undefined || item.extension.allowed);
		quickPick.title = nls.localize('manageTrustedExtensions', "Manage Trusted Extensions");
		quickPick.placeholder = nls.localize('manageExtensions', "Choose which extensions can access this account");

		quickPick.onDidAccept(() => {
			const updatedAllowedList = quickPick.items
				.map(i => (i as TrustedExtensionsQuickPickItem).extension);
			this.storageService.store(`${this.id}-${accountName}`, JSON.stringify(updatedAllowedList), StorageScope.PROFILE, StorageTarget.USER);

			quickPick.dispose();
		});

		quickPick.onDidChangeSelection((changed) => {
			quickPick.items.forEach(item => {
				if ((item as TrustedExtensionsQuickPickItem).extension) {
					(item as TrustedExtensionsQuickPickItem).extension.allowed = false;
				}
			});

			changed.forEach((item) => item.extension.allowed = true);
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});

		quickPick.onDidCustom(() => {
			quickPick.hide();
		});

		quickPick.show();
	}

	async removeAccountSessions(accountName: string, sessions: AuthenticationSession[]): Promise<void> {
		const accountUsages = readAccountUsages(this.storageService, this.id, accountName);

		const result = await this.dialogService.show(
			Severity.Info,
			accountUsages.length
				? nls.localize('signOutMessage', "The account '{0}' has been used by: \n\n{1}\n\n Sign out from these extensions?", accountName, accountUsages.map(usage => usage.extensionName).join('\n'))
				: nls.localize('signOutMessageSimple', "Sign out of '{0}'?", accountName),
			[
				nls.localize('signOut', "Sign Out"),
				nls.localize('cancel', "Cancel")
			],
			{
				cancelId: 1
			});

		if (result.choice === 0) {
			const removeSessionPromises = sessions.map(session => this.removeSession(session.id));
			await Promise.all(removeSessionPromises);
			removeAccountUsage(this.storageService, this.id, accountName);
			this.storageService.remove(`${this.id}-${accountName}`, StorageScope.PROFILE);
		}
	}

	async getSessions(scopes?: string[]) {
		return this._proxy.$getSessions(this.id, scopes);
	}

	createSession(scopes: string[]): Promise<AuthenticationSession> {
		return this._proxy.$createSession(this.id, scopes);
	}

	async removeSession(sessionId: string): Promise<void> {
		await this._proxy.$removeSession(this.id, sessionId);
		this.notificationService.info(nls.localize('signedOut', "Successfully signed out."));
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);

		this._register(this.authenticationService.onDidChangeSessions(e => {
			this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label);
		}));

		this._proxy.$setProviders(this.authenticationService.declaredProviders);

		this._register(this.authenticationService.onDidChangeDeclaredProviders(e => {
			this._proxy.$setProviders(e);
		}));
	}

	async $registerAuthenticationProvider(id: string, label: string, supportsMultipleAccounts: boolean): Promise<void> {
		const provider = new MainThreadAuthenticationProvider(this._proxy, id, label, supportsMultipleAccounts, this.notificationService, this.storageService, this.quickInputService, this.dialogService);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	$ensureProvider(id: string): Promise<void> {
		return this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), ActivationKind.Immediate);
	}

	$sendDidChangeSessions(id: string, event: AuthenticationSessionsChangeEvent): void {
		this.authenticationService.sessionsUpdate(id, event);
	}

	$removeSession(providerId: string, sessionId: string): Promise<void> {
		return this.authenticationService.removeSession(providerId, sessionId);
	}
	private async loginPrompt(providerName: string, extensionName: string, recreatingSession: boolean, detail?: string): Promise<boolean> {
		const message = recreatingSession
			? nls.localize('confirmRelogin', "The extension '{0}' wants you to sign in again using {1}.", extensionName, providerName)
			: nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, providerName);
		const { choice } = await this.dialogService.show(
			Severity.Info,
			message,
			[nls.localize('allow', "Allow"), nls.localize('cancel', "Cancel")],
			{
				cancelId: 1,
				detail
			}
		);

		return choice === 0;
	}

	private async setTrustedExtensionAndAccountPreference(providerId: string, accountName: string, extensionId: string, extensionName: string, sessionId: string): Promise<void> {
		this.authenticationService.updatedAllowedExtension(providerId, accountName, extensionId, extensionName, true);
		this.storageService.store(`${extensionName}-${providerId}`, sessionId, StorageScope.PROFILE, StorageTarget.MACHINE);

	}

	private async doGetSession(providerId: string, scopes: string[], extensionId: string, extensionName: string, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const sessions = await this.authenticationService.getSessions(providerId, scopes, true);
		const supportsMultipleAccounts = this.authenticationService.supportsMultipleAccounts(providerId);

		// Error cases
		if (options.forceNewSession && options.createIfNone) {
			throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, createIfNone');
		}
		if (options.forceNewSession && options.silent) {
			throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, silent');
		}
		if (options.createIfNone && options.silent) {
			throw new Error('Invalid combination of options. Please remove one of the following: createIfNone, silent');
		}

		// Check if the sessions we have are valid
		if (!options.forceNewSession && sessions.length) {
			if (supportsMultipleAccounts) {
				if (options.clearSessionPreference) {
					this.storageService.remove(`${extensionName}-${providerId}`, StorageScope.PROFILE);
				} else {
					const existingSessionPreference = this.storageService.get(`${extensionName}-${providerId}`, StorageScope.PROFILE);
					if (existingSessionPreference) {
						const matchingSession = sessions.find(session => session.id === existingSessionPreference);
						if (matchingSession && this.authenticationService.isAccessAllowed(providerId, matchingSession.account.label, extensionId)) {
							return matchingSession;
						}
					}
				}
			} else if (this.authenticationService.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
				return sessions[0];
			}
		}

		// We may need to prompt because we don't have a valid session
		// modal flows
		if (options.createIfNone || options.forceNewSession) {
			const providerName = this.authenticationService.getLabel(providerId);
			const detail = (typeof options.forceNewSession === 'object') ? options.forceNewSession!.detail : undefined;

			// We only want to show the "recreating session" prompt if we are using forceNewSession & there are sessions
			// that we will be "forcing through".
			const recreatingSession = !!(options.forceNewSession && sessions.length);
			const isAllowed = await this.loginPrompt(providerName, extensionName, recreatingSession, detail);
			if (!isAllowed) {
				throw new Error('User did not consent to login.');
			}

			const session = sessions?.length && !options.forceNewSession && supportsMultipleAccounts
				? await this.authenticationService.selectSession(providerId, extensionId, extensionName, scopes, sessions)
				: await this.authenticationService.createSession(providerId, scopes, true);
			await this.setTrustedExtensionAndAccountPreference(providerId, session.account.label, extensionId, extensionName, session.id);
			return session;
		}

		// passive flows (silent or default)

		const validSession = sessions.find(s => this.authenticationService.isAccessAllowed(providerId, s.account.label, extensionId));
		if (!options.silent && !validSession) {
			await this.authenticationService.requestNewSession(providerId, scopes, extensionId, extensionName);
		}
		return validSession;
	}

	async $getSession(providerId: string, scopes: string[], extensionId: string, extensionName: string, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const session = await this.doGetSession(providerId, scopes, extensionId, extensionName, options);

		if (session) {
			type AuthProviderUsageClassification = {
				owner: 'TylerLeonhardt';
				comment: 'Used to see which extensions are using which providers';
				extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
				providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider id.' };
			};
			this.telemetryService.publicLog2<{ extensionId: string; providerId: string }, AuthProviderUsageClassification>('authentication.providerUsage', { providerId, extensionId });

			addAccountUsage(this.storageService, providerId, session.account.label, extensionId, extensionName);
		}

		return session;
	}
}
