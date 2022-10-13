/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteTunnelService, TunnelStatus } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ILogger, ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/path';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IStringDictionary } from 'vs/base/common/collections';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { registerLogChannel } from 'vs/workbench/services/output/common/output';
import { IFileService } from 'vs/platform/files/common/files';

export const REMOTE_TUNNEL_CATEGORY: ILocalizedString = {
	original: 'Remote Tunnel',
	value: localize('remoteTunnel.category', 'Remote Tunnel')
};

export const REMOTE_TUNNEL_SIGNED_IN_KEY = 'remoteTunnelSignedIn';
export const REMOTE_TUNNEL_SIGNED_IN = new RawContextKey<boolean>(REMOTE_TUNNEL_SIGNED_IN_KEY, false);

const CACHED_SESSION_STORAGE_KEY = 'remoteTunnelAccountPreference';

type ExistingSession = IQuickPickItem & { session: AuthenticationSession & { providerId: string } };
type IAuthenticationProvider = { id: string; scopes: string[] };
type AuthenticationProviderOption = IQuickPickItem & { provider: IAuthenticationProvider };

export class RemoteTunnelWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly signedInContext: IContextKey<boolean>;

	private readonly serverConfiguration: { authenticationProviders: IStringDictionary<{ scopes: string[] }> };

	private initialized = false;
	#authenticationInfo: { sessionId: string; token: string; providerId: string } | undefined;

	private readonly logger: ILogger;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService,
		@ILogService logService: ILogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IRemoteTunnelService private remoteTunnelService: IRemoteTunnelService
	) {
		super();

		const logPathURI = URI.file(join(environmentService.logsPath, 'remoteTunnel.log'));

		this.logger = this._register(loggerService.createLogger(logPathURI, { name: 'remoteTunnel' }));

		const promise = registerLogChannel('remoteTunnel', localize('remoteTunnel.outputTitle', "Remote Tunnel"), logPathURI, fileService, logService);
		this._register(toDisposable(() => promise.cancel()));

		this.signedInContext = REMOTE_TUNNEL_SIGNED_IN.bindTo(this.contextKeyService);

		const serverConfiguration = productService.tunnelApplicationConfig;
		if (!serverConfiguration || !productService.tunnelApplicationName) {
			this.logger.error('Missing \'tunnelApplicationConfig\' or \'tunnelApplicationName\' in product.json. Remote tunneling is not available.');
			this.serverConfiguration = { authenticationProviders: {} };
			return;
		}
		this.serverConfiguration = serverConfiguration;

		this._register(this.remoteTunnelService.onDidTokenFailed(() => {
			this.logger.info('Clearing authentication preference because of successive token failures.');
			this.clearAuthenticationPreference();
		}));
		this._register(this.remoteTunnelService.onDidChangeTunnelStatus(status => {
			if (status === TunnelStatus.Disconnected) {
				this.logger.info('Clearing authentication preference because of tunnel disconnected.');
				this.clearAuthenticationPreference();
			}
		}));

		// If the user signs out of the current session, reset our cached auth state in memory and on disk
		this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));

		// If another window changes the preferred session storage, reset our cached auth state in memory
		this._register(this.storageService.onDidChangeValue(e => this.onDidChangeStorage(e)));

		this.registerTurnOnAction();
		this.registerTurnOffAction();

		this.signedInContext.set(this.existingSessionId !== undefined);

		if (this.existingSessionId) {
			this.initialize(true);
		}

	}

	private get existingSessionId() {
		return this.storageService.get(CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
	}

	private set existingSessionId(sessionId: string | undefined) {
		this.logger.trace(`Saving authentication preference for ID ${sessionId}.`);
		if (sessionId === undefined) {
			this.storageService.remove(CACHED_SESSION_STORAGE_KEY, StorageScope.APPLICATION);
		} else {
			this.storageService.store(CACHED_SESSION_STORAGE_KEY, sessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	public async initialize(silent: boolean = false) {
		if (this.initialized) {
			return true;
		}
		this.initialized = await this.doInitialize(silent);
		this.signedInContext.set(this.initialized);
		return this.initialized;
	}

	/**
	 *
	 * Ensures that the store client is initialized,
	 * meaning that authentication is configured and it
	 * can be used to communicate with the remote storage service
	 */
	private async doInitialize(silent: boolean): Promise<boolean> {
		// Wait for authentication extensions to be registered
		await this.extensionService.whenInstalledExtensionsRegistered();

		// If we already have an existing auth session in memory, use that
		if (this.#authenticationInfo !== undefined) {
			return true;
		}

		const authenticationSession = await this.getAuthenticationSession(silent);
		if (authenticationSession !== undefined) {
			this.#authenticationInfo = authenticationSession;
			this.remoteTunnelService.updateAccount({ token: authenticationSession.token, authenticationProviderId: authenticationSession.providerId });
		}

		return authenticationSession !== undefined;
	}

	private async getAuthenticationSession(silent: boolean) {
		// If the user signed in previously and the session is still available, reuse that without prompting the user again
		if (this.existingSessionId) {
			this.logger.info(`Searching for existing authentication session with ID ${this.existingSessionId}`);
			const existingSession = await this.getExistingSession();
			if (existingSession) {
				this.logger.info(`Found existing authentication session with ID ${existingSession.session.id}`);
				return { sessionId: existingSession.session.id, token: existingSession.session.idToken ?? existingSession.session.accessToken, providerId: existingSession.session.providerId };
			} else {
				//this._didSignOut.fire();
			}
		}

		// If we aren't supposed to prompt the user because
		// we're in a silent flow, just return here
		if (silent) {
			return;
		}

		// Ask the user to pick a preferred account
		const authenticationSession = await this.getAccountPreference();
		if (authenticationSession !== undefined) {
			this.existingSessionId = authenticationSession.id;
			return { sessionId: authenticationSession.id, token: authenticationSession.idToken ?? authenticationSession.accessToken, providerId: authenticationSession.providerId };
		}

		return undefined;
	}

	private async getAccountPreference(): Promise<AuthenticationSession & { providerId: string } | undefined> {
		const quickpick = this.quickInputService.createQuickPick<ExistingSession | AuthenticationProviderOption | IQuickPickItem>();
		quickpick.title = localize('accountPreference.title', 'Enable remote access by signing up to remote tunnels.');
		quickpick.ok = false;
		quickpick.placeholder = localize('accountPreference.placeholder', "Select an account to sign in");
		quickpick.ignoreFocusOut = true;
		quickpick.items = await this.createQuickpickItems();

		return new Promise((resolve, reject) => {
			quickpick.onDidHide((e) => {
				resolve(undefined);
				quickpick.dispose();
			});

			quickpick.onDidAccept(async (e) => {
				const selection = quickpick.selectedItems[0];
				const session = 'provider' in selection ? { ...await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes), providerId: selection.provider.id } : ('session' in selection ? selection.session : undefined);
				resolve(session);
				quickpick.hide();
			});

			quickpick.show();
		});
	}

	private async createQuickpickItems(): Promise<(ExistingSession | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[]> {
		const options: (ExistingSession | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[] = [];

		options.push({ type: 'separator', label: localize('signed in', "Signed In") });

		const sessions = await this.getAllSessions();
		options.push(...sessions);

		options.push({ type: 'separator', label: localize('others', "Others") });

		for (const authenticationProvider of (await this.getAuthenticationProviders())) {
			const signedInForProvider = sessions.some(account => account.session.providerId === authenticationProvider.id);
			if (!signedInForProvider || this.authenticationService.supportsMultipleAccounts(authenticationProvider.id)) {
				const providerName = this.authenticationService.getLabel(authenticationProvider.id);
				options.push({ label: localize('sign in using account', "Sign in with {0}", providerName), provider: authenticationProvider });
			}
		}

		return options;
	}


	private async getExistingSession() {
		const accounts = await this.getAllSessions();
		return accounts.find((account) => account.session.id === this.existingSessionId);
	}

	private async onDidChangeStorage(e: IStorageValueChangeEvent): Promise<void> {
		if (e.key === CACHED_SESSION_STORAGE_KEY && e.scope === StorageScope.APPLICATION) {
			const newSessionId = this.existingSessionId;
			const previousSessionId = this.#authenticationInfo?.sessionId;

			if (previousSessionId !== newSessionId) {
				this.logger.trace(`Resetting authentication state because authentication session ID preference changed from ${previousSessionId} to ${newSessionId}.`);
				this.#authenticationInfo = undefined;
				this.initialized = false;
			}
		}
	}

	private clearAuthenticationPreference(): void {
		this.#authenticationInfo = undefined;
		this.initialized = false;
		this.existingSessionId = undefined;
		this.signedInContext.set(false);
	}

	private onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.#authenticationInfo?.sessionId && e.removed.find(session => session.id === this.#authenticationInfo?.sessionId)) {
			this.clearAuthenticationPreference();
		}
	}

	/**
	 *
	 * Returns all authentication sessions available from {@link getAuthenticationProviders}.
	 */
	private async getAllSessions() {
		const authenticationProviders = await this.getAuthenticationProviders();
		const accounts = new Map<string, ExistingSession>();
		let currentSession: ExistingSession | undefined;

		for (const provider of authenticationProviders) {
			const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);

			for (const session of sessions) {
				const item = {
					label: session.account.label,
					description: this.authenticationService.getLabel(provider.id),
					session: { ...session, providerId: provider.id }
				};
				accounts.set(item.session.account.id, item);
				if (this.existingSessionId === session.id) {
					currentSession = item;
				}
			}
		}

		if (currentSession !== undefined) {
			accounts.set(currentSession.session.account.id, currentSession);
		}

		return [...accounts.values()];
	}

	/**
	 * Returns all authentication providers which can be used to authenticate
	 * to the remote storage service, based on product.json configuration
	 * and registered authentication providers.
	 */
	private async getAuthenticationProviders() {
		// Get the list of authentication providers configured in product.json
		const authenticationProviders = this.serverConfiguration.authenticationProviders;
		const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce<IAuthenticationProvider[]>((result, id) => {
			result.push({ id, scopes: authenticationProviders[id].scopes });
			return result;
		}, []);

		// Filter out anything that isn't currently available through the authenticationService
		const availableAuthenticationProviders = this.authenticationService.declaredProviders;

		return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some(provider => provider.id === id));
	}

	private registerTurnOnAction() {
		const that = this;
		this._register(registerAction2(class ShareMachineAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.remoteTunnel.actions.turnOn',
					title: localize('remoteTunnel.turnOn', 'Turn on Remote Tunnel Access...'),
					category: REMOTE_TUNNEL_CATEGORY,
					precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_SIGNED_IN_KEY, false),
					menu: [{
						id: MenuId.CommandPalette,
					},
					{
						id: MenuId.AccountsContext,
						group: '2_remoteTunnel',
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_SIGNED_IN_KEY, false),
					}]
				});
			}

			async run() {
				return await that.initialize(false);
			}
		}));
	}

	private registerTurnOffAction() {
		const that = this;
		this._register(registerAction2(class ResetShareMachineAuthenticationAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.remoteTunnel.actions.turnOff',
					title: localize('remoteTunnel.turnOff', 'Turn off Remote Tunnel Access...'),
					category: REMOTE_TUNNEL_CATEGORY,
					precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_SIGNED_IN_KEY, true),
					menu: [{
						id: MenuId.CommandPalette,
					},
					{
						id: MenuId.AccountsContext,
						group: '2_remoteTunnel',
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_SIGNED_IN_KEY, true),
					}]
				});
			}

			async run() {
				const result = await that.dialogService.confirm({
					type: 'info',
					message: localize('remoteTunnel.turnOff.confirm', 'Do you want to turn off Remote Tunnel Access?'),
					primaryButton: localize('remoteTunnel.turnOff.yesButton', 'Yes'),
				});
				if (result.confirmed) {
					that.clearAuthenticationPreference();
					that.remoteTunnelService.updateAccount(undefined);
				}
			}
		}));
	}

}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteTunnelWorkbenchContribution, LifecyclePhase.Restored);
