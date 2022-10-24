/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IProductService } from 'vs/platform/product/common/productService';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREFIX, ConnectionInfo, IRemoteTunnelService } from 'vs/platform/remoteTunnel/common/remoteTunnel';
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
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IStringDictionary } from 'vs/base/common/collections';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IOutputService } from 'vs/workbench/services/output/common/output';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Action } from 'vs/base/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import * as Constants from 'vs/workbench/contrib/logs/common/logConstants';

export const REMOTE_TUNNEL_CATEGORY: ILocalizedString = {
	original: 'Remote Tunnels',
	value: localize('remoteTunnel.category', 'Remote Tunnels')
};

type CONTEXT_KEY_STATES = 'connected' | 'connecting' | 'disconnected';

export const REMOTE_TUNNEL_CONNECTION_STATE_KEY = 'remoteTunnelConnection';
export const REMOTE_TUNNEL_CONNECTION_STATE = new RawContextKey<CONTEXT_KEY_STATES>(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected');


const SESSION_ID_STORAGE_KEY = 'remoteTunnelAccountPreference';

type ExistingSessionItem = { session: AuthenticationSession; providerId: string; label: string; description: string };
type IAuthenticationProvider = { id: string; scopes: string[] };
type AuthenticationProviderOption = IQuickPickItem & { provider: IAuthenticationProvider };

enum RemoteTunnelCommandIds {
	turnOn = 'workbench.remoteTunnel.actions.turnOn',
	turnOff = 'workbench.remoteTunnel.actions.turnOff',
	connecting = 'workbench.remoteTunnel.actions.connecting',
	manage = 'workbench.remoteTunnel.actions.manage',
	showLog = 'workbench.remoteTunnel.actions.showLog',
	configure = 'workbench.remoteTunnel.actions.configure',
	openBrowser = 'workbench.remoteTunnel.actions.openBrowser',
	learnMore = 'workbench.remoteTunnel.actions.learnMore',
}

namespace RemoteTunnelCommandLabels {
	export const turnOn = localize('remoteTunnel.actions.turnOn', 'Turn on Remote Tunnel Access...');
	export const turnOff = localize('remoteTunnel.actions.turnOff', 'Turn off Remote Tunnel Access...');
	export const showLog = localize('remoteTunnel.actions.showLog', 'Show Log');
	export const configure = localize('remoteTunnel.actions.configure', 'Configure Machine Name...');
	export const openBrowser = localize('remoteTunnel.actions.openBrowser', 'Open in Browser');
	export const learnMore = localize('remoteTunnel.actions.learnMore', 'Get Started with VS Code Tunnels');
}


export class RemoteTunnelWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly connectionStateContext: IContextKey<CONTEXT_KEY_STATES>;

	private readonly serverConfiguration: { authenticationProviders: IStringDictionary<{ scopes: string[] }> };

	private initialized = false;
	#authenticationSessionId: string | undefined;
	private connectionInfo: ConnectionInfo | undefined;

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
		@IRemoteTunnelService private remoteTunnelService: IRemoteTunnelService,
		@ICommandService private commandService: ICommandService,
	) {
		super();

		this.logger = this._register(loggerService.createLogger(environmentService.remoteTunnelLogResource, { name: 'remoteTunnel' }));

		this.connectionStateContext = REMOTE_TUNNEL_CONNECTION_STATE.bindTo(this.contextKeyService);

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
			if (status.type === 'disconnected') {
				this.logger.info('Clearing authentication preference because of tunnel disconnected.');
				this.clearAuthenticationPreference();
				this.connectionInfo = undefined;
			} else if (status.type === 'connecting') {
				this.connectionStateContext.set('connecting');
			} else if (status.type === 'connected') {
				this.connectionInfo = status.info;
				this.connectionStateContext.set('connected');
			}
		}));
		this.remoteTunnelService.getTunnelStatus().then(status => {
			if (status.type === 'connected') {
				this.connectionInfo = status.info;
				this.connectionStateContext.set('connected');
			}
		});

		// If the user signs out of the current session, reset our cached auth state in memory and on disk
		this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));

		// If another window changes the preferred session storage, reset our cached auth state in memory
		this._register(this.storageService.onDidChangeValue(e => this.onDidChangeStorage(e)));

		this.registerCommands();

		if (this.existingSessionId) {
			this.initialize(true);
		}

	}

	private get existingSessionId() {
		return this.storageService.get(SESSION_ID_STORAGE_KEY, StorageScope.APPLICATION);
	}

	private set existingSessionId(sessionId: string | undefined) {
		this.logger.trace(`Saving authentication preference for ID ${sessionId}.`);
		if (sessionId === undefined) {
			this.storageService.remove(SESSION_ID_STORAGE_KEY, StorageScope.APPLICATION);
		} else {
			this.storageService.store(SESSION_ID_STORAGE_KEY, sessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	public async initialize(silent: boolean = false) {
		if (this.initialized) {
			return true;
		}
		this.initialized = await this.doInitialize(silent);
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
		if (this.#authenticationSessionId !== undefined) {
			return true;
		}

		const authenticationSession = await this.getAuthenticationSession(silent);
		if (authenticationSession !== undefined) {
			this.#authenticationSessionId = authenticationSession.session.id;
			const token = authenticationSession.session.idToken ?? authenticationSession.session.accessToken;
			await this.remoteTunnelService.updateAccount({ token, authenticationProviderId: authenticationSession.providerId });
		}

		return authenticationSession !== undefined;
	}

	private async trackServerStart(progress: IProgress<IProgressStep>): Promise<ConnectionInfo | undefined> {
		const p = new Promise<ConnectionInfo | undefined>((s, e) => {
			const listener = this.remoteTunnelService.onDidChangeTunnelStatus(status => {
				switch (status.type) {
					case 'connecting':
						if (status.progress) {
							progress.report({ message: status.progress });
						}
						break;
					case 'connected':
						listener.dispose();
						s(status.info);
						break;
					case 'disconnected':
						listener.dispose();
						s(undefined);
						break;
				}
			});
		});

		const status = await this.remoteTunnelService.getTunnelStatus();
		if (status.type === 'connecting') {
			return p;
		}
		return status.type === 'connected' ? status.info : undefined;
	}


	private async getAuthenticationSession(silent: boolean): Promise<ExistingSessionItem | undefined> {
		// If the user signed in previously and the session is still available, reuse that without prompting the user again
		if (this.existingSessionId) {
			this.logger.info(`Searching for existing authentication session with ID ${this.existingSessionId}`);
			const existingSession = await this.getExistingSession();
			if (existingSession) {
				this.logger.info(`Found existing authentication session with ID ${existingSession.session.id}`);
				return existingSession;
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
			this.existingSessionId = authenticationSession.session.id;
			return authenticationSession;
		}
		return undefined;
	}

	private async getAccountPreference(): Promise<ExistingSessionItem | undefined> {
		const quickpick = this.quickInputService.createQuickPick<ExistingSessionItem | AuthenticationProviderOption | IQuickPickItem>();
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
				if ('provider' in selection) {
					const session = await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes);
					resolve(this.createExistingSessionItem(session, selection.provider.id));
				} else if ('session' in selection) {
					resolve(selection);
				} else {
					resolve(undefined);
				}
				quickpick.hide();
			});

			quickpick.show();
		});
	}

	private createExistingSessionItem(session: AuthenticationSession, providerId: string): ExistingSessionItem {
		return {
			label: session.account.label,
			description: this.authenticationService.getLabel(providerId),
			session,
			providerId
		};
	}

	private async createQuickpickItems(): Promise<(ExistingSessionItem | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[]> {
		const options: (ExistingSessionItem | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[] = [];

		options.push({ type: 'separator', label: localize('signed in', "Signed In") });

		const sessions = await this.getAllSessions();
		options.push(...sessions);

		options.push({ type: 'separator', label: localize('others', "Others") });

		for (const authenticationProvider of (await this.getAuthenticationProviders())) {
			const signedInForProvider = sessions.some(account => account.providerId === authenticationProvider.id);
			if (!signedInForProvider || this.authenticationService.supportsMultipleAccounts(authenticationProvider.id)) {
				const providerName = this.authenticationService.getLabel(authenticationProvider.id);
				options.push({ label: localize('sign in using account', "Sign in with {0}", providerName), provider: authenticationProvider });
			}
		}

		return options;
	}


	private async getExistingSession(): Promise<ExistingSessionItem | undefined> {
		const accounts = await this.getAllSessions();
		return accounts.find((account) => account.session.id === this.existingSessionId);
	}

	private async onDidChangeStorage(e: IStorageValueChangeEvent): Promise<void> {
		if (e.key === SESSION_ID_STORAGE_KEY && e.scope === StorageScope.APPLICATION) {
			const newSessionId = this.existingSessionId;
			const previousSessionId = this.#authenticationSessionId;

			if (previousSessionId !== newSessionId) {
				this.logger.trace(`Resetting authentication state because authentication session ID preference changed from ${previousSessionId} to ${newSessionId}.`);
				this.#authenticationSessionId = undefined;
				this.initialized = false;
			}
		}
	}

	private clearAuthenticationPreference(): void {
		this.#authenticationSessionId = undefined;
		this.initialized = false;
		this.existingSessionId = undefined;
		this.connectionStateContext.set('disconnected');
	}

	private onDidChangeSessions(e: AuthenticationSessionsChangeEvent): void {
		if (this.#authenticationSessionId && e.removed.find(session => session.id === this.#authenticationSessionId)) {
			this.clearAuthenticationPreference();
		}
	}

	/**
	 * Returns all authentication sessions available from {@link getAuthenticationProviders}.
	 */
	private async getAllSessions(): Promise<ExistingSessionItem[]> {
		const authenticationProviders = await this.getAuthenticationProviders();
		const accounts = new Map<string, ExistingSessionItem>();
		let currentSession: ExistingSessionItem | undefined;

		for (const provider of authenticationProviders) {
			const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);

			for (const session of sessions) {
				const item = this.createExistingSessionItem(session, provider.id);
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
	private async getAuthenticationProviders(): Promise<IAuthenticationProvider[]> {
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

	private registerCommands() {
		const that = this;

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.turnOn,
					title: RemoteTunnelCommandLabels.turnOn,
					category: REMOTE_TUNNEL_CATEGORY,
					precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected'),
					menu: [{
						id: MenuId.CommandPalette,
					},
					{
						id: MenuId.AccountsContext,
						group: '2_remoteTunnel',
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected'),
					}]
				});
			}

			async run(accessor: ServicesAccessor) {
				const progressService = accessor.get(IProgressService);
				const notificationService = accessor.get(INotificationService);
				const clipboardService = accessor.get(IClipboardService);
				const commandService = accessor.get(ICommandService);

				await that.initialize(false);
				const connectionInfo = await progressService.withProgress(
					{
						location: ProgressLocation.Notification,
						title: localize('progress.title', "[Turning on remote tunnel](command:{0})", RemoteTunnelCommandIds.showLog),
					},
					async progress => {
						return that.trackServerStart(progress);
					}
				);
				if (connectionInfo) {
					await notificationService.notify({
						severity: Severity.Info,
						message: localize('progress.turnOn.final',
							"Remote tunnel access is enabled for {0}. To access from a different machine, open [{1}]({2}) or use the Remote - Tunnels extension. To [configure](command:{3}), use the Account menu.",
							connectionInfo.hostName, connectionInfo.domain, connectionInfo.link, RemoteTunnelCommandIds.manage),
						actions: {
							primary: [
								new Action('copyToClipboard', localize('action.copyToClipboard', "Copy Browser Link to Clipboard"), undefined, true, () => clipboardService.writeText(connectionInfo.link)),
								new Action('showExtension', localize('action.showExtension', "Show Extension"), undefined, true, () => {
									return commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', ['ms-vscode.remote-server']);
								})
							]
						}
					});
				}
			}

		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.manage,
					title: localize('remoteTunnel.actions.manage.on', 'Remote Tunnel Access in On'),
					category: REMOTE_TUNNEL_CATEGORY,
					menu: [{
						id: MenuId.AccountsContext,
						group: '2_remoteTunnel',
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'connected'),
					}]
				});
			}

			async run() {
				that.showManageOptions();
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.connecting,
					title: localize('remoteTunnel.actions.manage.connecting', 'Remote Tunnel Access in Connecting'),
					category: REMOTE_TUNNEL_CATEGORY,
					menu: [{
						id: MenuId.AccountsContext,
						group: '2_remoteTunnel',
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'connecting'),
					}]
				});
			}

			async run() {
				that.showManageOptions();
			}
		}));


		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.turnOff,
					title: RemoteTunnelCommandLabels.turnOff,
					category: REMOTE_TUNNEL_CATEGORY,
					precondition: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected'),
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, ''),
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

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.showLog,
					title: RemoteTunnelCommandLabels.showLog,
					category: REMOTE_TUNNEL_CATEGORY,
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, ''),
					}]
				});
			}

			async run(accessor: ServicesAccessor) {
				const outputService = accessor.get(IOutputService);
				outputService.showChannel(Constants.remoteServerLog);
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.configure,
					title: RemoteTunnelCommandLabels.configure,
					category: REMOTE_TUNNEL_CATEGORY,
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, ''),
					}]
				});
			}

			async run(accessor: ServicesAccessor) {
				const preferencesService = accessor.get(IPreferencesService);
				preferencesService.openSettings({ query: CONFIGURATION_KEY_PREFIX });
			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.openBrowser,
					title: RemoteTunnelCommandLabels.openBrowser,
					category: REMOTE_TUNNEL_CATEGORY,
					precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'connected'),
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'connected'),
					}]
				});
			}

			async run(accessor: ServicesAccessor) {
				const openerService = accessor.get(IOpenerService);
				if (that.connectionInfo) {
					openerService.open(that.connectionInfo.link);
				}

			}
		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.learnMore,
					title: RemoteTunnelCommandLabels.learnMore,
					category: REMOTE_TUNNEL_CATEGORY,
					menu: []
				});
			}

			async run(accessor: ServicesAccessor) {
				const openerService = accessor.get(IOpenerService);
				await openerService.open('https://aka.ms/vscode-server-doc');
			}
		}));
	}

	private async showManageOptions() {
		const account = await this.getExistingSession();

		return new Promise<void>((c, e) => {
			const disposables = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick();
			quickPick.placeholder = localize('manage.placeholder', 'Select a command to invoke');
			disposables.add(quickPick);
			const items: Array<QuickPickItem> = [];
			items.push({ id: RemoteTunnelCommandIds.learnMore, label: RemoteTunnelCommandLabels.learnMore });
			if (this.connectionInfo && account) {
				quickPick.title = localize('manage.title.on', 'Remote Machine Access enabled for {0}({1}) as {2}', account.label, account.description, this.connectionInfo.hostName);
				items.push({ id: RemoteTunnelCommandIds.openBrowser, label: RemoteTunnelCommandLabels.openBrowser, description: this.connectionInfo.domain });
			} else {
				quickPick.title = localize('manage.title.off', 'Remote Machine Access not enabled');
			}
			items.push({ id: RemoteTunnelCommandIds.showLog, label: RemoteTunnelCommandLabels.showLog });
			items.push({ type: 'separator' });
			items.push({ id: RemoteTunnelCommandIds.configure, label: localize('manage.machineName', 'Change Host Name'), description: this.connectionInfo?.hostName });
			items.push({ id: RemoteTunnelCommandIds.turnOff, label: RemoteTunnelCommandLabels.turnOff, description: account ? `${account.label} (${account.description})` : undefined });


			quickPick.items = items;
			disposables.add(quickPick.onDidAccept(() => {
				if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
					this.commandService.executeCommand(quickPick.selectedItems[0].id);
				}
				quickPick.hide();
			}));
			disposables.add(quickPick.onDidHide(() => {
				disposables.dispose();
				c();
			}));
			quickPick.show();
		});
	}
}


const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteTunnelWorkbenchContribution, LifecyclePhase.Restored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	type: 'object',
	properties: {
		[CONFIGURATION_KEY_HOST_NAME]: {
			description: localize('remoteTunnelAccess.machineName', "The name under which the remote tunnel access is registered. If not set, the host name is used."),
			type: 'string',
			scope: ConfigurationScope.APPLICATION,
			pattern: '^[\\w-]*$',
			patternErrorMessage: localize('remoteTunnelAccess.machineNameRegex', "The name can only consist of letters, numbers, underscore and minus."),
			maxLength: 20,
			default: ''
		}
	}
});
