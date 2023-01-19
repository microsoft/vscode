/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IProductService } from 'vs/platform/product/common/productService';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREFIX, ConnectionInfo, IRemoteTunnelAccount, IRemoteTunnelService, LOGGER_NAME, LOG_CHANNEL_ID, LOG_FILE_NAME } from 'vs/platform/remoteTunnel/common/remoteTunnel';
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
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
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
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { join } from 'vs/base/common/path';
import { ITunnelApplicationConfig } from 'vs/base/common/product';

export const REMOTE_TUNNEL_CATEGORY: ILocalizedString = {
	original: 'Remote Tunnels',
	value: localize('remoteTunnel.category', 'Remote Tunnels')
};

type CONTEXT_KEY_STATES = 'connected' | 'connecting' | 'disconnected';

export const REMOTE_TUNNEL_CONNECTION_STATE_KEY = 'remoteTunnelConnection';
export const REMOTE_TUNNEL_CONNECTION_STATE = new RawContextKey<CONTEXT_KEY_STATES>(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected');


const SESSION_ID_STORAGE_KEY = 'remoteTunnelAccountPreference';

const REMOTE_TUNNEL_USED_STORAGE_KEY = 'remoteTunnelServiceUsed';
const REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY = 'remoteTunnelServicePromptedPreview';
const REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY = 'remoteTunnelExtensionRecommended';

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
	copyToClipboard = 'workbench.remoteTunnel.actions.copyToClipboard',
	learnMore = 'workbench.remoteTunnel.actions.learnMore',
}

namespace RemoteTunnelCommandLabels {
	export const turnOn = localize('remoteTunnel.actions.turnOn', 'Turn on Remote Tunnel Access...');
	export const turnOff = localize('remoteTunnel.actions.turnOff', 'Turn off Remote Tunnel Access...');
	export const showLog = localize('remoteTunnel.actions.showLog', 'Show Log');
	export const configure = localize('remoteTunnel.actions.configure', 'Configure Machine Name...');
	export const copyToClipboard = localize('remoteTunnel.actions.copyToClipboard', 'Copy Browser URI to Clipboard');
	export const learnMore = localize('remoteTunnel.actions.learnMore', 'Get Started with VS Code Tunnels');
}


export class RemoteTunnelWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly connectionStateContext: IContextKey<CONTEXT_KEY_STATES>;

	private readonly serverConfiguration: ITunnelApplicationConfig;

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
		@INativeEnvironmentService private environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@IRemoteTunnelService private remoteTunnelService: IRemoteTunnelService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IProgressService private progressService: IProgressService,
		@INotificationService private notificationService: INotificationService
	) {
		super();

		const remoteTunnelServiceLogResource = URI.file(join(environmentService.logsPath, LOG_FILE_NAME));

		this.logger = this._register(loggerService.createLogger(remoteTunnelServiceLogResource, { name: LOGGER_NAME, id: LOG_CHANNEL_ID }));

		this.connectionStateContext = REMOTE_TUNNEL_CONNECTION_STATE.bindTo(this.contextKeyService);

		const serverConfiguration = productService.tunnelApplicationConfig;
		if (!serverConfiguration || !productService.tunnelApplicationName) {
			this.logger.error('Missing \'tunnelApplicationConfig\' or \'tunnelApplicationName\' in product.json. Remote tunneling is not available.');
			this.serverConfiguration = { authenticationProviders: {}, editorWebUrl: '', extension: { extensionId: '', friendlyName: '' } };
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

		// If the user signs out of the current session, reset our cached auth state in memory and on disk
		this._register(this.authenticationService.onDidChangeSessions((e) => this.onDidChangeSessions(e.event)));

		// If another window changes the preferred session storage, reset our cached auth state in memory
		this._register(this.storageService.onDidChangeValue(e => this.onDidChangeStorage(e)));

		this.registerCommands();

		this.initialize();

		this.recommendRemoteExtensionIfNeeded();
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

	private async recommendRemoteExtensionIfNeeded() {
		const remoteExtension = this.serverConfiguration.extension;
		const shouldRecommend = async () => {
			if (this.storageService.getBoolean(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, StorageScope.APPLICATION)) {
				return false;
			}
			if (await this.extensionService.getExtension(remoteExtension.extensionId)) {
				return false;
			}
			const usedOnHost = this.storageService.get(REMOTE_TUNNEL_USED_STORAGE_KEY, StorageScope.APPLICATION);
			if (!usedOnHost) {
				return false;
			}
			const currentHostName = await this.remoteTunnelService.getHostName();
			if (!currentHostName || currentHostName === usedOnHost) {
				return false;
			}
			return usedOnHost;
		};
		const recommed = async () => {
			const usedOnHost = await shouldRecommend();
			if (!usedOnHost) {
				return false;
			}
			this.notificationService.notify({
				severity: Severity.Info,
				message:
					localize(
						{
							key: 'recommend.remoteExtension',
							comment: ['{0} will be a host name, {1} will the link address to the web UI, {6} an extension name. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format']
						},
						"'{0}' has turned on remote access. The {1} extension can be used to connect to it.",
						usedOnHost, remoteExtension.friendlyName
					),
				actions: {
					primary: [
						new Action('showExtension', localize('action.showExtension', "Show Extension"), undefined, true, () => {
							return this.commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', [remoteExtension.extensionId]);
						}),
						new Action('doNotShowAgain', localize('action.doNotShowAgain', "Do not show again"), undefined, true, () => {
							this.storageService.store(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
						}),
					]
				}
			});
			return true;
		};
		if (await shouldRecommend()) {
			const storageListener = this.storageService.onDidChangeValue(async e => {
				if (e.key === REMOTE_TUNNEL_USED_STORAGE_KEY) {
					const success = await recommed();
					if (success) {
						storageListener.dispose();
					}

				}
			});
		}
	}


	private async initialize(): Promise<void> {
		const status = await this.remoteTunnelService.getTunnelStatus();
		if (status.type === 'connected') {
			this.connectionInfo = status.info;
			this.connectionStateContext.set('connected');
			return;
		}
		await this.extensionService.whenInstalledExtensionsRegistered();

		await this.startTunnel(true);
	}

	private async startTunnel(silent: boolean): Promise<ConnectionInfo | undefined> {
		if (this.#authenticationSessionId !== undefined && this.connectionInfo) {
			return this.connectionInfo;
		}

		const authenticationSession = await this.getAuthenticationSession(silent);
		if (authenticationSession === undefined) {
			return undefined;
		}

		return await this.progressService.withProgress(
			{
				location: silent ? ProgressLocation.Window : ProgressLocation.Notification,
				title: localize({ key: 'progress.title', comment: ['Only translate \'Starting remote tunnel\', do not change the format of the rest (markdown link format)'] }, "[Starting remote tunnel](command:{0})", RemoteTunnelCommandIds.showLog),
			},
			(progress: IProgress<IProgressStep>) => {
				return new Promise<ConnectionInfo | undefined>((s, e) => {
					let completed = false;
					const listener = this.remoteTunnelService.onDidChangeTunnelStatus(status => {
						switch (status.type) {
							case 'connecting':
								if (status.progress) {
									progress.report({ message: status.progress });
								}
								break;
							case 'connected':
								listener.dispose();
								completed = true;
								s(status.info);
								break;
							case 'disconnected':
								listener.dispose();
								completed = true;
								s(undefined);
								break;
						}
					});
					const token = authenticationSession.session.idToken ?? authenticationSession.session.accessToken;
					const account: IRemoteTunnelAccount = { token, providerId: authenticationSession.providerId, accountLabel: authenticationSession.session.account.label };
					this.remoteTunnelService.updateAccount(account).then(status => {
						if (!completed && (status.type === 'connected') || status.type === 'disconnected') {
							listener.dispose();
							s(status.type === 'connected' ? status.info : undefined);
						}
					});
				});
			}
		);
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
		const sessions = await this.getAllSessions();
		if (sessions.length === 1) {
			return sessions[0];
		}

		const quickpick = this.quickInputService.createQuickPick<ExistingSessionItem | AuthenticationProviderOption | IQuickPickItem>();
		quickpick.ok = false;
		quickpick.placeholder = localize('accountPreference.placeholder', "Sign in to an account to enable remote access");
		quickpick.ignoreFocusOut = true;
		quickpick.items = await this.createQuickpickItems(sessions);

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

	private async createQuickpickItems(sessions: ExistingSessionItem[]): Promise<(ExistingSessionItem | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[]> {
		const options: (ExistingSessionItem | AuthenticationProviderOption | IQuickPickSeparator | IQuickPickItem & { canceledAuthentication: boolean })[] = [];

		options.push({ type: 'separator', label: localize('signed in', "Signed In") });

		options.push(...sessions);

		options.push({ type: 'separator', label: localize('others', "Others") });

		for (const authenticationProvider of (await this.getAuthenticationProviders())) {
			const signedInForProvider = sessions.some(account => account.providerId === authenticationProvider.id);
			if (!signedInForProvider || this.authenticationService.supportsMultipleAccounts(authenticationProvider.id)) {
				const providerName = this.authenticationService.getLabel(authenticationProvider.id);
				options.push({ label: localize({ key: 'sign in using account', comment: ['{0} will be a auth provider (e.g. Github)'] }, "Sign in with {0}", providerName), provider: authenticationProvider });
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
			}
		}
	}

	private clearAuthenticationPreference(): void {
		this.#authenticationSessionId = undefined;
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
				const notificationService = accessor.get(INotificationService);
				const clipboardService = accessor.get(IClipboardService);
				const commandService = accessor.get(ICommandService);
				const storageService = accessor.get(IStorageService);
				const dialogService = accessor.get(IDialogService);

				const didNotifyPreview = storageService.getBoolean(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, StorageScope.APPLICATION, false);
				if (!didNotifyPreview) {
					const result = await dialogService.confirm({
						message: localize('tunnel.preview', 'Remote Tunnels is currently in preview. Please report any problems using the "Help: Report Issue" command.'),
						primaryButton: localize('enable', 'Enable'),
						secondaryButton: localize('cancel', 'Cancel'),
					});
					if (!result.confirmed) {
						return;
					}

					storageService.store(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
				}

				const connectionInfo = await that.startTunnel(false);
				if (connectionInfo) {
					const linkToOpen = that.getLinkToOpen(connectionInfo);
					const remoteExtension = that.serverConfiguration.extension;
					await notificationService.notify({
						severity: Severity.Info,
						message:
							localize(
								{
									key: 'progress.turnOn.final',
									comment: ['{0} will be a host name, {1} will the link address to the web UI, {6} an extesnion name. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format']
								},
								"Remote tunnel access is enabled for [{0}](command:{4}). To access from a different machine, open [{1}]({2}) or use the {6} extension. Use the Account menu to [configure](command:{3}) or [turn off](command:{5}).",
								connectionInfo.hostName, connectionInfo.domain, linkToOpen, RemoteTunnelCommandIds.manage, RemoteTunnelCommandIds.configure, RemoteTunnelCommandIds.turnOff, remoteExtension.friendlyName
							),
						actions: {
							primary: [
								new Action('copyToClipboard', localize('action.copyToClipboard', "Copy Browser Link to Clipboard"), undefined, true, () => clipboardService.writeText(linkToOpen)),
								new Action('showExtension', localize('action.showExtension', "Show Extension"), undefined, true, () => {
									return commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', [remoteExtension.extensionId]);
								})
							]
						}
					});
					storageService.store(REMOTE_TUNNEL_USED_STORAGE_KEY, connectionInfo.hostName, StorageScope.APPLICATION, StorageTarget.USER);
				} else {
					await notificationService.notify({
						severity: Severity.Info,
						message: localize('progress.turnOn.failed',
							"Unable to turn on the remote tunnel access. Check the Remote Tunnel Service log for details."),
					});
					await commandService.executeCommand(RemoteTunnelCommandIds.showLog);
				}
			}

		}));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteTunnelCommandIds.manage,
					title: localize('remoteTunnel.actions.manage.on.v2', 'Remote Tunnel Access is On'),
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
					title: localize('remoteTunnel.actions.manage.connecting', 'Remote Tunnel Access is Connecting'),
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
				outputService.showChannel(LOG_CHANNEL_ID);
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
					id: RemoteTunnelCommandIds.copyToClipboard,
					title: RemoteTunnelCommandLabels.copyToClipboard,
					category: REMOTE_TUNNEL_CATEGORY,
					precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'connected'),
					menu: [{
						id: MenuId.CommandPalette,
						when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'connected'),
					}]
				});
			}

			async run(accessor: ServicesAccessor) {
				const clipboardService = accessor.get(IClipboardService);
				if (that.connectionInfo) {
					const linkToOpen = that.getLinkToOpen(that.connectionInfo);
					clipboardService.writeText(linkToOpen);
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

	private getLinkToOpen(connectionInfo: ConnectionInfo): string {
		const workspace = this.workspaceContextService.getWorkspace();
		const folders = workspace.folders;
		let resource;
		if (folders.length === 1) {
			resource = folders[0].uri;
		} else if (workspace.configuration) {
			resource = workspace.configuration;
		}
		const link = URI.parse(connectionInfo.link);
		if (resource?.scheme === Schemas.file) {
			return joinPath(link, resource.path).toString(true);
		}
		return joinPath(link, this.environmentService.userHome.path).toString(true);
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
				quickPick.title = localize(
					{ key: 'manage.title.on', comment: ['{0} will be a user account name, {1} the provider name (e.g. Github), {2} is the host name'] },
					'Remote Machine Access enabled for {0}({1}) as {2}', account.label, account.description, this.connectionInfo.hostName);
				items.push({ id: RemoteTunnelCommandIds.copyToClipboard, label: RemoteTunnelCommandLabels.copyToClipboard, description: this.connectionInfo.domain });
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
			scope: ConfigurationScope.MACHINE,
			pattern: '^\\w[\\w-]*$',
			patternErrorMessage: localize('remoteTunnelAccess.machineNameRegex', "The name must only consist of letters, numbers, underscore and dash. It must not start with a dash."),
			maxLength: 20,
			default: ''
		}
	}
});
