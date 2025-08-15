/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService, IAuthenticationExtensionsService, AuthenticationSessionAccount, IAuthenticationProviderSessionOptions, isAuthenticationSessionRequest, IAuthenticationConstraint } from '../../services/authentication/common/authentication.js';
import { AuthenticationSessionRequest, ExtHostAuthenticationShape, ExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol.js';
import { IDialogService, IPromptButton } from '../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../base/common/severity.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { ActivationKind, IExtensionService } from '../../services/extensions/common/extensions.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationUsageService } from '../../services/authentication/browser/authenticationUsageService.js';
import { getAuthenticationProviderActivationEvent } from '../../services/authentication/browser/authenticationService.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { CancellationError } from '../../../base/common/errors.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ExtensionHostKind } from '../../services/extensions/common/extensionHostKind.js';
import { IURLService } from '../../../platform/url/common/url.js';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { IAuthorizationTokenResponse } from '../../../base/common/oauth.js';
import { IDynamicAuthenticationProviderStorageService } from '../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';

export interface AuthenticationInteractiveOptions {
	detail?: string;
	learnMore?: UriComponents;
	sessionToRecreate?: AuthenticationSession;
}

export interface AuthenticationGetSessionOptions {
	clearSessionPreference?: boolean;
	createIfNone?: boolean | AuthenticationInteractiveOptions;
	forceNewSession?: boolean | AuthenticationInteractiveOptions;
	silent?: boolean;
	account?: AuthenticationSessionAccount;
	authorizationServer?: UriComponents;
}

class MainThreadAuthenticationProvider extends Disposable implements IAuthenticationProvider {

	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;

	constructor(
		protected readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly label: string,
		public readonly supportsMultipleAccounts: boolean,
		public readonly authorizationServers: ReadonlyArray<URI>,
		onDidChangeSessionsEmitter: Emitter<AuthenticationSessionsChangeEvent>,
	) {
		super();
		this.onDidChangeSessions = onDidChangeSessionsEmitter.event;
	}

	async getSessions(scopes: string[] | undefined, options: IAuthenticationProviderSessionOptions) {
		return this._proxy.$getSessions(this.id, scopes, options);
	}

	createSession(scopes: string[], options: IAuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
		return this._proxy.$createSession(this.id, scopes, options);
	}

	async removeSession(sessionId: string): Promise<void> {
		await this._proxy.$removeSession(this.id, sessionId);
	}
}

class MainThreadAuthenticationProviderWithChallenges extends MainThreadAuthenticationProvider implements IAuthenticationProvider {

	constructor(
		proxy: ExtHostAuthenticationShape,
		id: string,
		label: string,
		supportsMultipleAccounts: boolean,
		authorizationServers: ReadonlyArray<URI>,
		onDidChangeSessionsEmitter: Emitter<AuthenticationSessionsChangeEvent>,
	) {
		super(
			proxy,
			id,
			label,
			supportsMultipleAccounts,
			authorizationServers,
			onDidChangeSessionsEmitter
		);
	}

	getSessionsFromChallenges(constraint: IAuthenticationConstraint, options: IAuthenticationProviderSessionOptions): Promise<readonly AuthenticationSession[]> {
		return this._proxy.$getSessionsFromChallenges(this.id, constraint, options);
	}

	createSessionFromChallenges(constraint: IAuthenticationConstraint, options: IAuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
		return this._proxy.$createSessionFromChallenges(this.id, constraint, options);
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;

	private readonly _registrations = this._register(new DisposableMap<string>());
	private _sentProviderUsageEvents = new Set<string>();
	private _suppressUnregisterEvent = false;

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IAuthenticationExtensionsService private readonly authenticationExtensionsService: IAuthenticationExtensionsService,
		@IAuthenticationAccessService private readonly authenticationAccessService: IAuthenticationAccessService,
		@IAuthenticationUsageService private readonly authenticationUsageService: IAuthenticationUsageService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@IURLService private readonly urlService: IURLService,
		@IDynamicAuthenticationProviderStorageService private readonly dynamicAuthProviderStorageService: IDynamicAuthenticationProviderStorageService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);

		this._register(this.authenticationService.onDidChangeSessions(e => this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label)));
		this._register(this.authenticationService.onDidUnregisterAuthenticationProvider(e => {
			if (!this._suppressUnregisterEvent) {
				this._proxy.$onDidUnregisterAuthenticationProvider(e.id);
			}
		}));
		this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(e => {
			const providerInfo = this.authenticationService.getProvider(e.providerId);
			this._proxy.$onDidChangeAuthenticationSessions(providerInfo.id, providerInfo.label, e.extensionIds);
		}));

		// Listen for dynamic authentication provider token changes
		this._register(this.dynamicAuthProviderStorageService.onDidChangeTokens(e => {
			this._proxy.$onDidChangeDynamicAuthProviderTokens(e.authProviderId, e.clientId, e.tokens);
		}));

		this._register(authenticationService.registerAuthenticationProviderHostDelegate({
			// Prefer Node.js extension hosts when they're available. No CORS issues etc.
			priority: extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker ? 0 : 1,
			create: async (authorizationServer, serverMetadata, resource) => {
				// Auth Provider Id is a combination of the authorization server and the resource, if provided.
				const authProviderId = resource ? `${authorizationServer.toString(true)} ${resource.resource}` : authorizationServer.toString(true);
				const clientDetails = await this.dynamicAuthProviderStorageService.getClientRegistration(authProviderId);
				const clientId = clientDetails?.clientId;
				const clientSecret = clientDetails?.clientSecret;
				let initialTokens: (IAuthorizationTokenResponse & { created_at: number })[] | undefined = undefined;
				if (clientId) {
					initialTokens = await this.dynamicAuthProviderStorageService.getSessionsForDynamicAuthProvider(authProviderId, clientId);
				}
				return await this._proxy.$registerDynamicAuthProvider(
					authorizationServer,
					serverMetadata,
					resource,
					clientId,
					clientSecret,
					initialTokens
				);
			}
		}));
	}

	async $registerAuthenticationProvider(id: string, label: string, supportsMultipleAccounts: boolean, supportedAuthorizationServer: UriComponents[] = [], supportsChallenges?: boolean): Promise<void> {
		if (!this.authenticationService.declaredProviders.find(p => p.id === id)) {
			// If telemetry shows that this is not happening much, we can instead throw an error here.
			this.logService.warn(`Authentication provider ${id} was not declared in the Extension Manifest.`);
			type AuthProviderNotDeclaredClassification = {
				owner: 'TylerLeonhardt';
				comment: 'An authentication provider was not declared in the Extension Manifest.';
				id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider id.' };
			};
			this.telemetryService.publicLog2<{ id: string }, AuthProviderNotDeclaredClassification>('authentication.providerNotDeclared', { id });
		}
		const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
		this._registrations.set(id, emitter);
		const supportedAuthorizationServerUris = supportedAuthorizationServer.map(i => URI.revive(i));
		const provider =
			supportsChallenges
				? new MainThreadAuthenticationProviderWithChallenges(this._proxy, id, label, supportsMultipleAccounts, supportedAuthorizationServerUris, emitter)
				: new MainThreadAuthenticationProvider(this._proxy, id, label, supportsMultipleAccounts, supportedAuthorizationServerUris, emitter);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	async $unregisterAuthenticationProvider(id: string): Promise<void> {
		this._registrations.deleteAndDispose(id);
		// The ext host side already unregisters the provider, so we can suppress the event here.
		this._suppressUnregisterEvent = true;
		try {
			this.authenticationService.unregisterAuthenticationProvider(id);
		} finally {
			this._suppressUnregisterEvent = false;
		}
	}

	async $ensureProvider(id: string): Promise<void> {
		if (!this.authenticationService.isAuthenticationProviderRegistered(id)) {
			return await this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), ActivationKind.Immediate);
		}
	}

	async $sendDidChangeSessions(providerId: string, event: AuthenticationSessionsChangeEvent): Promise<void> {
		const obj = this._registrations.get(providerId);
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	$removeSession(providerId: string, sessionId: string): Promise<void> {
		return this.authenticationService.removeSession(providerId, sessionId);
	}

	async $waitForUriHandler(expectedUri: UriComponents): Promise<UriComponents> {
		const deferredPromise = new DeferredPromise<UriComponents>();
		const disposable = this.urlService.registerHandler({
			handleURL: async (uri: URI) => {
				if (uri.scheme !== expectedUri.scheme || uri.authority !== expectedUri.authority || uri.path !== expectedUri.path) {
					return false;
				}
				deferredPromise.complete(uri);
				disposable.dispose();
				return true;
			}
		});
		const result = await raceTimeout(deferredPromise.p, 5 * 60 * 1000); // 5 minutes
		if (!result) {
			throw new Error('Timed out waiting for URI handler');
		}
		return await deferredPromise.p;
	}

	$showContinueNotification(message: string): Promise<boolean> {
		const yes = nls.localize('yes', "Yes");
		const no = nls.localize('no', "No");
		const deferredPromise = new DeferredPromise<boolean>();
		let result = false;
		const handle = this.notificationService.prompt(
			Severity.Warning,
			message,
			[{
				label: yes,
				run: () => result = true
			}, {
				label: no,
				run: () => result = false
			}]);
		const disposable = handle.onDidClose(() => {
			deferredPromise.complete(result);
			disposable.dispose();
		});
		return deferredPromise.p;
	}

	async $registerDynamicAuthenticationProvider(id: string, label: string, authorizationServer: UriComponents, clientId: string, clientSecret?: string): Promise<void> {
		await this.$registerAuthenticationProvider(id, label, true, [authorizationServer]);
		await this.dynamicAuthProviderStorageService.storeClientRegistration(id, URI.revive(authorizationServer).toString(true), clientId, clientSecret, label);
	}

	async $setSessionsForDynamicAuthProvider(authProviderId: string, clientId: string, sessions: (IAuthorizationTokenResponse & { created_at: number })[]): Promise<void> {
		await this.dynamicAuthProviderStorageService.setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions);
	}

	async $sendDidChangeDynamicProviderInfo({ providerId, clientId, authorizationServer, label, clientSecret }: Partial<{ providerId: string; clientId: string; authorizationServer: UriComponents; label: string; clientSecret: string }>): Promise<void> {
		this.logService.info(`Client ID for authentication provider ${providerId} changed to ${clientId}`);
		const existing = this.dynamicAuthProviderStorageService.getInteractedProviders().find(p => p.providerId === providerId);
		if (!existing) {
			throw new Error(`Dynamic authentication provider ${providerId} not found. Has it been registered?`);
		}

		// Store client credentials together
		await this.dynamicAuthProviderStorageService.storeClientRegistration(
			providerId || existing.providerId,
			authorizationServer ? URI.revive(authorizationServer).toString(true) : existing.authorizationServer,
			clientId || existing.clientId,
			clientSecret,
			label || existing.label
		);
	}

	private async loginPrompt(provider: IAuthenticationProvider, extensionName: string, recreatingSession: boolean, options?: AuthenticationInteractiveOptions): Promise<boolean> {
		let message: string;

		// Check if the provider has a custom confirmation message
		const customMessage = provider.confirmation?.(extensionName, recreatingSession);
		if (customMessage) {
			message = customMessage;
		} else {
			message = recreatingSession
				? nls.localize('confirmRelogin', "The extension '{0}' wants you to sign in again using {1}.", extensionName, provider.label)
				: nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, provider.label);
		}

		const buttons: IPromptButton<boolean | undefined>[] = [
			{
				label: nls.localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
				run() {
					return true;
				},
			}
		];
		if (options?.learnMore) {
			buttons.push({
				label: nls.localize('learnMore', "Learn more"),
				run: async () => {
					const result = this.loginPrompt(provider, extensionName, recreatingSession, options);
					await this.openerService.open(URI.revive(options.learnMore!), { allowCommands: true });
					return await result;
				}
			});
		}
		const { result } = await this.dialogService.prompt({
			type: Severity.Info,
			message,
			buttons,
			detail: options?.detail,
			cancelButton: true,
		});

		return result ?? false;
	}

	private async continueWithIncorrectAccountPrompt(chosenAccountLabel: string, requestedAccountLabel: string): Promise<boolean> {
		const result = await this.dialogService.prompt({
			message: nls.localize('incorrectAccount', "Incorrect account detected"),
			detail: nls.localize('incorrectAccountDetail', "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
			type: Severity.Warning,
			cancelButton: true,
			buttons: [
				{
					label: nls.localize('keep', 'Keep {0}', chosenAccountLabel),
					run: () => chosenAccountLabel
				},
				{
					label: nls.localize('loginWith', 'Login with {0}', requestedAccountLabel),
					run: () => requestedAccountLabel
				}
			],
		});

		if (!result.result) {
			throw new CancellationError();
		}

		return result.result === chosenAccountLabel;
	}

	private async doGetSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationSessionRequest, extensionId: string, extensionName: string, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const authorizationServer = URI.revive(options.authorizationServer);
		const sessions = await this.authenticationService.getSessions(providerId, scopeListOrRequest, { account: options.account, authorizationServer }, true);
		const provider = this.authenticationService.getProvider(providerId);

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

		if (options.clearSessionPreference) {
			// Clearing the session preference is usually paired with createIfNone, so just remove the preference and
			// defer to the rest of the logic in this function to choose the session.
			this.authenticationExtensionsService.removeAccountPreference(extensionId, providerId);
		}

		const matchingAccountPreferenceSession =
			// If an account was passed in, that takes precedence over the account preference
			options.account
				// We only support one session per account per set of scopes so grab the first one here
				? sessions[0]
				: this._getAccountPreference(extensionId, providerId, sessions);

		// Check if the sessions we have are valid
		if (!options.forceNewSession && sessions.length) {
			// If we have an existing session preference, use that. If not, we'll return any valid session at the end of this function.
			if (matchingAccountPreferenceSession && this.authenticationAccessService.isAccessAllowed(providerId, matchingAccountPreferenceSession.account.label, extensionId)) {
				return matchingAccountPreferenceSession;
			}
			// If we only have one account for a single auth provider, lets just check if it's allowed and return it if it is.
			if (!provider.supportsMultipleAccounts && this.authenticationAccessService.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
				return sessions[0];
			}
		}

		// We may need to prompt because we don't have a valid session
		// modal flows
		if (options.createIfNone || options.forceNewSession) {
			let uiOptions: AuthenticationInteractiveOptions | undefined;
			if (typeof options.forceNewSession === 'object') {
				uiOptions = options.forceNewSession;
			} else if (typeof options.createIfNone === 'object') {
				uiOptions = options.createIfNone;
			}

			// We only want to show the "recreating session" prompt if we are using forceNewSession & there are sessions
			// that we will be "forcing through".
			const recreatingSession = !!(options.forceNewSession && sessions.length);
			const isAllowed = await this.loginPrompt(provider, extensionName, recreatingSession, uiOptions);
			if (!isAllowed) {
				throw new Error('User did not consent to login.');
			}

			let session: AuthenticationSession;
			if (sessions?.length && !options.forceNewSession) {
				session = provider.supportsMultipleAccounts && !options.account
					? await this.authenticationExtensionsService.selectSession(providerId, extensionId, extensionName, scopeListOrRequest, sessions)
					: sessions[0];
			} else {
				const accountToCreate: AuthenticationSessionAccount | undefined = options.account ?? matchingAccountPreferenceSession?.account;
				do {
					session = await this.authenticationService.createSession(
						providerId,
						scopeListOrRequest,
						{
							activateImmediate: true,
							account: accountToCreate,
							authorizationServer
						});
				} while (
					accountToCreate
					&& accountToCreate.label !== session.account.label
					&& !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label)
				);
			}

			this.authenticationAccessService.updateAllowedExtensions(providerId, session.account.label, [{ id: extensionId, name: extensionName, allowed: true }]);
			this.authenticationExtensionsService.updateNewSessionRequests(providerId, [session]);
			this.authenticationExtensionsService.updateAccountPreference(extensionId, providerId, session.account);
			return session;
		}

		// For the silent flows, if we have a session but we don't have a session preference, we'll return the first one that is valid.
		if (!matchingAccountPreferenceSession && !this.authenticationExtensionsService.getAccountPreference(extensionId, providerId)) {
			const validSession = sessions.find(session => this.authenticationAccessService.isAccessAllowed(providerId, session.account.label, extensionId));
			if (validSession) {
				return validSession;
			}
		}

		// passive flows (silent or default)
		if (!options.silent) {
			// If there is a potential session, but the extension doesn't have access to it, use the "grant access" flow,
			// otherwise request a new one.
			sessions.length
				? this.authenticationExtensionsService.requestSessionAccess(providerId, extensionId, extensionName, scopeListOrRequest, sessions)
				: await this.authenticationExtensionsService.requestNewSession(providerId, scopeListOrRequest, extensionId, extensionName);
		}
		return undefined;
	}

	async $getSession(providerId: string, scopeListOrRequest: ReadonlyArray<string> | AuthenticationSessionRequest, extensionId: string, extensionName: string, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const scopes = isAuthenticationSessionRequest(scopeListOrRequest) ? scopeListOrRequest.scopes : scopeListOrRequest;
		if (scopes) {
			this.sendClientIdUsageTelemetry(extensionId, providerId, scopes);
		}
		const session = await this.doGetSession(providerId, scopeListOrRequest, extensionId, extensionName, options);

		if (session) {
			this.sendProviderUsageTelemetry(extensionId, providerId);
			const scopes = isAuthenticationSessionRequest(scopeListOrRequest) ? scopeListOrRequest.scopes : scopeListOrRequest;
			this.authenticationUsageService.addAccountUsage(providerId, session.account.label, scopes, extensionId, extensionName);
		}

		return session;
	}

	async $getAccounts(providerId: string): Promise<ReadonlyArray<AuthenticationSessionAccount>> {
		const accounts = await this.authenticationService.getAccounts(providerId);
		return accounts;
	}

	// TODO@TylerLeonhardt this is a temporary addition to telemetry to understand what extensions are overriding the client id.
	// We can use this telemetry to reach out to these extension authors and let them know that they many need configuration changes
	// due to the adoption of the Microsoft broker.
	// Remove this in a few iterations.
	private _sentClientIdUsageEvents = new Set<string>();
	private sendClientIdUsageTelemetry(extensionId: string, providerId: string, scopes: readonly string[]): void {
		const containsVSCodeClientIdScope = scopes.some(scope => scope.startsWith('VSCODE_CLIENT_ID:'));
		const key = `${extensionId}|${providerId}|${containsVSCodeClientIdScope}`;
		if (this._sentClientIdUsageEvents.has(key)) {
			return;
		}
		this._sentClientIdUsageEvents.add(key);
		if (containsVSCodeClientIdScope) {
			type ClientIdUsageClassification = {
				owner: 'TylerLeonhardt';
				comment: 'Used to see which extensions are using the VSCode client id override';
				extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
			};
			this.telemetryService.publicLog2<{ extensionId: string }, ClientIdUsageClassification>('authentication.clientIdUsage', { extensionId });
		}
	}

	private sendProviderUsageTelemetry(extensionId: string, providerId: string): void {
		const key = `${extensionId}|${providerId}`;
		if (this._sentProviderUsageEvents.has(key)) {
			return;
		}
		this._sentProviderUsageEvents.add(key);
		type AuthProviderUsageClassification = {
			owner: 'TylerLeonhardt';
			comment: 'Used to see which extensions are using which providers';
			extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
			providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider id.' };
		};
		this.telemetryService.publicLog2<{ extensionId: string; providerId: string }, AuthProviderUsageClassification>('authentication.providerUsage', { providerId, extensionId });
	}

	//#region Account Preferences
	// TODO@TylerLeonhardt: Update this after a few iterations to no longer fallback to the session preference

	private _getAccountPreference(extensionId: string, providerId: string, sessions: ReadonlyArray<AuthenticationSession>): AuthenticationSession | undefined {
		if (sessions.length === 0) {
			return undefined;
		}
		const accountNamePreference = this.authenticationExtensionsService.getAccountPreference(extensionId, providerId);
		if (accountNamePreference) {
			const session = sessions.find(session => session.account.label === accountNamePreference);
			return session;
		}
		return undefined;
	}
	//#endregion

	async $showDeviceCodeModal(userCode: string, verificationUri: string): Promise<boolean> {
		const { result } = await this.dialogService.prompt({
			type: Severity.Info,
			message: nls.localize('deviceCodeTitle', "Device Code Authentication"),
			detail: nls.localize('deviceCodeDetail', "Your code: {0}\n\nTo complete authentication, navigate to {1} and enter the code above.", userCode, verificationUri),
			buttons: [
				{
					label: nls.localize('copyAndContinue', "Copy & Continue"),
					run: () => true
				}
			],
			cancelButton: true
		});

		if (result) {
			// Open verification URI
			try {
				await this.clipboardService.writeText(userCode);
				return await this.openerService.open(URI.parse(verificationUri));
			} catch (error) {
				this.notificationService.error(nls.localize('failedToOpenUri', "Failed to open {0}", verificationUri));
			}
		}
		return false;
	}

	async $promptForClientRegistration(authorizationServerUrl: string): Promise<{ clientId: string; clientSecret?: string } | undefined> {
		// Show modal dialog first to explain the situation and get user consent
		const result = await this.dialogService.prompt({
			type: Severity.Info,
			message: nls.localize('dcrNotSupported', "Dynamic Client Registration not supported"),
			detail: nls.localize('dcrNotSupportedDetail', "The authorization server '{0}' does not support automatic client registration. Do you want to proceed by manually providing a client registration (client ID)?\n\nNote: When registering your OAuth application, make sure to include these redirect URIs:\nhttp://127.0.0.1:33418\nhttps://vscode.dev/redirect", authorizationServerUrl),
			buttons: [
				{
					label: nls.localize('provideClientDetails', "Proceed"),
					run: () => true
				}
			],
			cancelButton: {
				label: nls.localize('cancel', "Cancel"),
				run: () => false
			}
		});

		if (!result) {
			return undefined;
		}

		const sharedTitle = nls.localize('addClientRegistrationDetails', "Add Client Registration Details");

		const clientId = await this.quickInputService.input({
			title: sharedTitle,
			prompt: nls.localize('clientIdPrompt', "Enter an existing client ID that has been registered with the following redirect URIs: http://127.0.0.1:33418, https://vscode.dev/redirect"),
			placeHolder: nls.localize('clientIdPlaceholder', "OAuth client ID (azye39d...)"),
			ignoreFocusLost: true,
			validateInput: async (value: string) => {
				if (!value || value.trim().length === 0) {
					return nls.localize('clientIdRequired', "Client ID is required");
				}
				return undefined;
			}
		});

		if (!clientId || clientId.trim().length === 0) {
			return undefined;
		}

		const clientSecret = await this.quickInputService.input({
			title: sharedTitle,
			prompt: nls.localize('clientSecretPrompt', "(optional) Enter an existing client secret associated with the client id '{0}' or leave this field blank", clientId),
			placeHolder: nls.localize('clientSecretPlaceholder', "OAuth client secret (wer32o50f...) or leave it blank"),
			password: true,
			ignoreFocusLost: true
		});

		return {
			clientId: clientId.trim(),
			clientSecret: clientSecret?.trim() || undefined
		};
	}
}
