/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IProductService } from 'vs/platform/product/common/productService';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREFIX, CONFIGURATION_KEY_PREVENT_SLEEP, ConnectionInfo, IRemoteTunnelSession, IRemoteTunnelService, LOGGER_NAME, LOG_ID } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { AuthenticationSession, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
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
import { IWorkspaceContextService, isUntitledWorkspace } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { ITunnelApplicationConfig } from 'vs/base/common/product';
import { isNumber, isObject, isString } from 'vs/base/common/types';

export const REMOTE_TUNNEL_CATEGORY: ILocalizedString = {
	original: 'Remote-Tunnels',
	value: localize('remoteTunnel.category', 'Remote Tunnels')
};

type CONTEXT_KEY_STATES = 'connected' | 'connecting' | 'disconnected';

export const REMOTE_TUNNEL_CONNECTION_STATE_KEY = 'remoteTunnelConnection';
export const REMOTE_TUNNEL_CONNECTION_STATE = new RawContextKey<CONTEXT_KEY_STATES>(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected');

const REMOTE_TUNNEL_USED_STORAGE_KEY = 'remoteTunnelServiceUsed';
const REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY = 'remoteTunnelServicePromptedPreview';
const REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY = 'remoteTunnelExtensionRecommended';
const REMOTE_TUNNEL_EXTENSION_TIMEOUT = 4 * 60 * 1000; // show the recommendation that a machine started using tunnels if it joined less than 4 minutes ago

const INVALID_TOKEN_RETRIES = 2;

interface UsedOnHostMessage { hostName: string; timeStamp: number }

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

// name shown in nofications
namespace RemoteTunnelCommandLabels {
	export const turnOn = localize('remoteTunnel.actions.turnOn', 'Turn on Remote Tunnel Access...');
	export const turnOff = localize('remoteTunnel.actions.turnOff', 'Turn off Remote Tunnel Access...');
	export const showLog = localize('remoteTunnel.actions.showLog', 'Show Remote Tunnel Service Log');
	export const configure = localize('remoteTunnel.actions.configure', 'Configure Tunnel Name...');
	export const copyToClipboard = localize('remoteTunnel.actions.copyToClipboard', 'Copy Browser URI to Clipboard');
	export const learnMore = localize('remoteTunnel.actions.learnMore', 'Get Started with Tunnels');
}


export class RemoteTunnelWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly connectionStateContext: IContextKey<CONTEXT_KEY_STATES>;

	private readonly serverConfiguration: ITunnelApplicationConfig;

	private connectionInfo: ConnectionInfo | undefined;

	private readonly logger: ILogger;

	private expiredSessions: Set<string> = new Set();

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

		this.logger = this._register(loggerService.createLogger(LOG_ID, { name: LOGGER_NAME }));

		this.connectionStateContext = REMOTE_TUNNEL_CONNECTION_STATE.bindTo(this.contextKeyService);

		const serverConfiguration = productService.tunnelApplicationConfig;
		if (!serverConfiguration || !productService.tunnelApplicationName) {
			this.logger.error('Missing \'tunnelApplicationConfig\' or \'tunnelApplicationName\' in product.json. Remote tunneling is not available.');
			this.serverConfiguration = { authenticationProviders: {}, editorWebUrl: '', extension: { extensionId: '', friendlyName: '' } };
			return;
		}
		this.serverConfiguration = serverConfiguration;

		this._register(this.remoteTunnelService.onDidChangeTunnelStatus(status => {
			this.connectionInfo = undefined;
			if (status.type === 'disconnected') {
				if (status.onTokenFailed) {
					this.expiredSessions.add(status.onTokenFailed.sessionId);
				}
				this.connectionStateContext.set('disconnected');
			} else if (status.type === 'connecting') {
				this.connectionStateContext.set('connecting');
			} else if (status.type === 'connected') {
				this.connectionInfo = status.info;
				this.connectionStateContext.set('connected');
			}
		}));

		this.registerCommands();

		this.initialize();

		this.recommendRemoteExtensionIfNeeded();
	}

	private async recommendRemoteExtensionIfNeeded() {
		await this.extensionService.whenInstalledExtensionsRegistered();

		const remoteExtension = this.serverConfiguration.extension;
		const shouldRecommend = async () => {
			if (this.storageService.getBoolean(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, StorageScope.APPLICATION)) {
				return false;
			}
			if (await this.extensionService.getExtension(remoteExtension.extensionId)) {
				return false;
			}
			const usedOnHostMessage = this.storageService.get(REMOTE_TUNNEL_USED_STORAGE_KEY, StorageScope.APPLICATION);
			if (!usedOnHostMessage) {
				return false;
			}
			let usedTunnelName: string | undefined;
			try {
				const message = JSON.parse(usedOnHostMessage);
				if (!isObject(message)) {
					return false;
				}
				const { hostName, timeStamp } = message as UsedOnHostMessage;
				if (!isString(hostName)! || !isNumber(timeStamp) || new Date().getTime() > timeStamp + REMOTE_TUNNEL_EXTENSION_TIMEOUT) {
					return false;
				}
				usedTunnelName = hostName;
			} catch (_) {
				// problems parsing the message, likly the old message format
				return false;
			}
			const currentTunnelName = await this.remoteTunnelService.getTunnelName();
			if (!currentTunnelName || currentTunnelName === usedTunnelName) {
				return false;
			}
			return usedTunnelName;
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
							comment: ['{0} will be a tunnel name, {1} will the link address to the web UI, {6} an extension name. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format']
						},
						"Tunnel '{0}' is avaiable for remote access. The {1} extension can be used to connect to it.",
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
		const session = await this.remoteTunnelService.getSession();
		if (session && session.token) {
			return; // already initialized, token available
		}
		return await this.progressService.withProgress(
			{
				location: ProgressLocation.Window,
				title: localize({ key: 'initialize.progress.title', comment: ['Only translate \'Looking for remote tunnel\', do not change the format of the rest (markdown link format)'] }, "[Looking for remote tunnel](command:{0})", RemoteTunnelCommandIds.showLog),
			},
			async (progress: IProgress<IProgressStep>) => {
				const listener = this.remoteTunnelService.onDidChangeTunnelStatus(status => {
					switch (status.type) {
						case 'connecting':
							if (status.progress) {
								progress.report({ message: status.progress });
							}
							break;
					}
				});
				let newSession: IRemoteTunnelSession | undefined;
				if (session) {
					const token = await this.getSessionToken(session);
					if (token) {
						newSession = { ...session, token };
					}
				}
				const status = await this.remoteTunnelService.initialize(newSession);
				listener.dispose();

				if (status.type === 'connected') {
					this.connectionInfo = status.info;
					this.connectionStateContext.set('connected');
					return;
				}
			}
		);
	}


	private async startTunnel(): Promise<ConnectionInfo | undefined> {
		if (this.connectionInfo) {
			return this.connectionInfo;
		}

		let tokenProblems = false;
		for (let i = 0; i < INVALID_TOKEN_RETRIES; i++) {
			tokenProblems = false;

			const authenticationSession = await this.getAuthenticationSession();
			if (authenticationSession === undefined) {
				this.logger.info('No authentication session available, not starting tunnel');
				return undefined;
			}

			const result = await this.progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: localize({ key: 'startTunnel.progress.title', comment: ['Only translate \'Starting remote tunnel\', do not change the format of the rest (markdown link format)'] }, "[Starting remote tunnel](command:{0})", RemoteTunnelCommandIds.showLog),
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
									tokenProblems = !!status.onTokenFailed;
									s(undefined);
									break;
							}
						});
						const token = authenticationSession.session.idToken ?? authenticationSession.session.accessToken;
						const account: IRemoteTunnelSession = { sessionId: authenticationSession.session.id, token, providerId: authenticationSession.providerId, accountLabel: authenticationSession.session.account.label };
						this.remoteTunnelService.startTunnel(account).then(status => {
							if (!completed && (status.type === 'connected' || status.type === 'disconnected')) {
								listener.dispose();
								if (status.type === 'connected') {
									s(status.info);
								} else {
									tokenProblems = !!status.onTokenFailed;
									s(undefined);
								}
							}
						});
					});
				}
			);
			if (result || !tokenProblems) {
				return result;
			}
		}
		return undefined;
	}

	private async getAuthenticationSession(): Promise<ExistingSessionItem | undefined> {
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

	/**
	 * Returns all authentication sessions available from {@link getAuthenticationProviders}.
	 */
	private async getAllSessions(): Promise<ExistingSessionItem[]> {
		const authenticationProviders = await this.getAuthenticationProviders();
		const accounts = new Map<string, ExistingSessionItem>();
		const currentAccount = await this.remoteTunnelService.getSession();
		let currentSession: ExistingSessionItem | undefined;

		for (const provider of authenticationProviders) {
			const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);

			for (const session of sessions) {
				if (!this.expiredSessions.has(session.id)) {
					const item = this.createExistingSessionItem(session, provider.id);
					accounts.set(item.session.account.id, item);
					if (currentAccount && currentAccount.sessionId === session.id) {
						currentSession = item;
					}
				}
			}
		}

		if (currentSession !== undefined) {
			accounts.set(currentSession.session.account.id, currentSession);
		}

		return [...accounts.values()];
	}

	private async getSessionToken(session: IRemoteTunnelSession | undefined): Promise<string | undefined> {
		if (session) {
			const sessionItem = (await this.getAllSessions()).find(s => s.session.id === session.sessionId);
			if (sessionItem) {
				return sessionItem.session.idToken ?? sessionItem.session.accessToken;
			}
		}
		return undefined;
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
					const { confirmed } = await dialogService.confirm({
						message: localize('tunnel.preview', 'Remote Tunnels is currently in preview. Please report any problems using the "Help: Report Issue" command.'),
						primaryButton: localize({ key: 'enable', comment: ['&& denotes a mnemonic'] }, '&&Enable')
					});
					if (!confirmed) {
						return;
					}

					storageService.store(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
				}

				const connectionInfo = await that.startTunnel();
				if (connectionInfo) {
					const linkToOpen = that.getLinkToOpen(connectionInfo);
					const remoteExtension = that.serverConfiguration.extension;
					const linkToOpenForMarkdown = linkToOpen.toString(false).replace(/\)/g, '%29');
					await notificationService.notify({
						severity: Severity.Info,
						message:
							localize(
								{
									key: 'progress.turnOn.final',
									comment: ['{0} will be the tunnel name, {1} will the link address to the web UI, {6} an extension name, {7} a link to the extension documentation. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format']
								},
								"You can now access this machine anywhere via the secure tunnel [{0}](command:{4}). To connect via a different machine, use the generated [{1}]({2}) link or use the [{6}]({7}) extension in the desktop or web. You can [configure](command:{3}) or [turn off](command:{5}) this access via the VS Code Accounts menu.",
								connectionInfo.tunnelName, connectionInfo.domain, linkToOpenForMarkdown, RemoteTunnelCommandIds.manage, RemoteTunnelCommandIds.configure, RemoteTunnelCommandIds.turnOff, remoteExtension.friendlyName, 'https://code.visualstudio.com/docs/remote/tunnels'
							),
						actions: {
							primary: [
								new Action('copyToClipboard', localize('action.copyToClipboard', "Copy Browser Link to Clipboard"), undefined, true, () => clipboardService.writeText(linkToOpen.toString(true))),
								new Action('showExtension', localize('action.showExtension', "Show Extension"), undefined, true, () => {
									return commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', [remoteExtension.extensionId]);
								})
							]
						}
					});
					const usedOnHostMessage: UsedOnHostMessage = { hostName: connectionInfo.tunnelName, timeStamp: new Date().getTime() };
					storageService.store(REMOTE_TUNNEL_USED_STORAGE_KEY, JSON.stringify(usedOnHostMessage), StorageScope.APPLICATION, StorageTarget.USER);
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
				const message =
					that.connectionInfo?.isAttached ?
						localize('remoteTunnel.turnOffAttached.confirm', 'Do you want to turn off Remote Tunnel Access? This will also stop the service that was started externally.') :
						localize('remoteTunnel.turnOff.confirm', 'Do you want to turn off Remote Tunnel Access?');

				const { confirmed } = await that.dialogService.confirm({ message });
				if (confirmed) {
					that.remoteTunnelService.stopTunnel();
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
				outputService.showChannel(LOG_ID);
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
					clipboardService.writeText(linkToOpen.toString(true));
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

	private getLinkToOpen(connectionInfo: ConnectionInfo): URI {
		const workspace = this.workspaceContextService.getWorkspace();
		const folders = workspace.folders;
		let resource;
		if (folders.length === 1) {
			resource = folders[0].uri;
		} else if (workspace.configuration && !isUntitledWorkspace(workspace.configuration, this.environmentService)) {
			resource = workspace.configuration;
		}
		const link = URI.parse(connectionInfo.link);
		if (resource?.scheme === Schemas.file) {
			return joinPath(link, resource.path);
		}
		return joinPath(link, this.environmentService.userHome.path);
	}


	private async showManageOptions() {
		const account = await this.remoteTunnelService.getSession();

		return new Promise<void>((c, e) => {
			const disposables = new DisposableStore();
			const quickPick = this.quickInputService.createQuickPick();
			quickPick.placeholder = localize('manage.placeholder', 'Select a command to invoke');
			disposables.add(quickPick);
			const items: Array<QuickPickItem> = [];
			items.push({ id: RemoteTunnelCommandIds.learnMore, label: RemoteTunnelCommandLabels.learnMore });
			if (this.connectionInfo) {
				quickPick.title =
					this.connectionInfo.isAttached ?
						localize({ key: 'manage.title.attached', comment: ['{0} is the tunnel name'] }, 'Remote Tunnel Access enabled for {0} (launched externally)', this.connectionInfo.tunnelName) :
						localize({ key: 'manage.title.orunning', comment: ['{0} is the tunnel name'] }, 'Remote Tunnel Access enabled for {0}', this.connectionInfo.tunnelName);

				items.push({ id: RemoteTunnelCommandIds.copyToClipboard, label: RemoteTunnelCommandLabels.copyToClipboard, description: this.connectionInfo.domain });
			} else {
				quickPick.title = localize('manage.title.off', 'Remote Tunnel Access not enabled');
			}
			items.push({ id: RemoteTunnelCommandIds.showLog, label: localize('manage.showLog', 'Show Log') });
			items.push({ type: 'separator' });
			items.push({ id: RemoteTunnelCommandIds.configure, label: localize('manage.tunnelName', 'Change Tunnel Name'), description: this.connectionInfo?.tunnelName });
			items.push({ id: RemoteTunnelCommandIds.turnOff, label: RemoteTunnelCommandLabels.turnOff, description: account ? `${account.accountLabel} (${account.providerId})` : undefined });

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
			pattern: '^(\\w[\\w-]*)?$',
			patternErrorMessage: localize('remoteTunnelAccess.machineNameRegex', "The name must only consist of letters, numbers, underscore and dash. It must not start with a dash."),
			maxLength: 20,
			default: ''
		},
		[CONFIGURATION_KEY_PREVENT_SLEEP]: {
			description: localize('remoteTunnelAccess.preventSleep', "Prevent the computer from sleeping when remote tunnel access is turned on."),
			type: 'boolean',
			scope: ConfigurationScope.MACHINE,
			default: false,
		}
	}
});
