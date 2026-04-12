/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { toAction } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { isNumber, isObject, isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREFIX, CONFIGURATION_KEY_PREVENT_SLEEP, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, LOGGER_NAME, LOG_ID } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, isUntitledWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
export const REMOTE_TUNNEL_CATEGORY = localize2('remoteTunnel.category', 'Remote Tunnels');
export const REMOTE_TUNNEL_CONNECTION_STATE_KEY = 'remoteTunnelConnection';
export const REMOTE_TUNNEL_CONNECTION_STATE = new RawContextKey(REMOTE_TUNNEL_CONNECTION_STATE_KEY, 'disconnected');
const REMOTE_TUNNEL_USED_STORAGE_KEY = 'remoteTunnelServiceUsed';
const REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY = 'remoteTunnelServicePromptedPreview';
const REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY = 'remoteTunnelExtensionRecommended';
const REMOTE_TUNNEL_HAS_USED_BEFORE = 'remoteTunnelHasUsed';
const REMOTE_TUNNEL_EXTENSION_TIMEOUT = 4 * 60 * 1000; // show the recommendation that a machine started using tunnels if it joined less than 4 minutes ago
const INVALID_TOKEN_RETRIES = 2;
var RemoteTunnelCommandIds;
(function (RemoteTunnelCommandIds) {
    RemoteTunnelCommandIds["turnOn"] = "workbench.remoteTunnel.actions.turnOn";
    RemoteTunnelCommandIds["turnOff"] = "workbench.remoteTunnel.actions.turnOff";
    RemoteTunnelCommandIds["connecting"] = "workbench.remoteTunnel.actions.connecting";
    RemoteTunnelCommandIds["manage"] = "workbench.remoteTunnel.actions.manage";
    RemoteTunnelCommandIds["showLog"] = "workbench.remoteTunnel.actions.showLog";
    RemoteTunnelCommandIds["configure"] = "workbench.remoteTunnel.actions.configure";
    RemoteTunnelCommandIds["copyToClipboard"] = "workbench.remoteTunnel.actions.copyToClipboard";
    RemoteTunnelCommandIds["learnMore"] = "workbench.remoteTunnel.actions.learnMore";
})(RemoteTunnelCommandIds || (RemoteTunnelCommandIds = {}));
// name shown in nofications
var RemoteTunnelCommandLabels;
(function (RemoteTunnelCommandLabels) {
    RemoteTunnelCommandLabels.turnOn = localize('remoteTunnel.actions.turnOn', 'Turn on Remote Tunnel Access...');
    RemoteTunnelCommandLabels.turnOff = localize('remoteTunnel.actions.turnOff', 'Turn off Remote Tunnel Access...');
    RemoteTunnelCommandLabels.showLog = localize('remoteTunnel.actions.showLog', 'Show Remote Tunnel Service Log');
    RemoteTunnelCommandLabels.configure = localize('remoteTunnel.actions.configure', 'Configure Tunnel Name...');
    RemoteTunnelCommandLabels.copyToClipboard = localize('remoteTunnel.actions.copyToClipboard', 'Copy Browser URI to Clipboard');
    RemoteTunnelCommandLabels.learnMore = localize('remoteTunnel.actions.learnMore', 'Get Started with Tunnels');
})(RemoteTunnelCommandLabels || (RemoteTunnelCommandLabels = {}));
let RemoteTunnelWorkbenchContribution = class RemoteTunnelWorkbenchContribution extends Disposable {
    constructor(authenticationService, dialogService, extensionService, contextKeyService, productService, storageService, loggerService, quickInputService, environmentService, remoteTunnelService, commandService, workspaceContextService, progressService, notificationService) {
        super();
        this.authenticationService = authenticationService;
        this.dialogService = dialogService;
        this.extensionService = extensionService;
        this.contextKeyService = contextKeyService;
        this.storageService = storageService;
        this.quickInputService = quickInputService;
        this.environmentService = environmentService;
        this.remoteTunnelService = remoteTunnelService;
        this.commandService = commandService;
        this.workspaceContextService = workspaceContextService;
        this.progressService = progressService;
        this.notificationService = notificationService;
        this.expiredSessions = new Set();
        this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
        this.connectionStateContext = REMOTE_TUNNEL_CONNECTION_STATE.bindTo(this.contextKeyService);
        const serverConfiguration = productService.tunnelApplicationConfig;
        if (!serverConfiguration || !productService.tunnelApplicationName) {
            this.logger.error('Missing \'tunnelApplicationConfig\' or \'tunnelApplicationName\' in product.json. Remote tunneling is not available.');
            this.serverConfiguration = { authenticationProviders: {}, editorWebUrl: '', extension: { extensionId: '', friendlyName: '' } };
            return;
        }
        this.serverConfiguration = serverConfiguration;
        this._register(this.remoteTunnelService.onDidChangeTunnelStatus(s => this.handleTunnelStatusUpdate(s)));
        this.registerCommands();
        this.initialize();
        this.recommendRemoteExtensionIfNeeded();
    }
    handleTunnelStatusUpdate(status) {
        this.connectionInfo = undefined;
        if (status.type === 'disconnected') {
            if (status.onTokenFailed) {
                this.expiredSessions.add(status.onTokenFailed.sessionId);
            }
            this.connectionStateContext.set('disconnected');
        }
        else if (status.type === 'connecting') {
            this.connectionStateContext.set('connecting');
        }
        else if (status.type === 'connected') {
            this.connectionInfo = status.info;
            this.connectionStateContext.set('connected');
        }
    }
    async recommendRemoteExtensionIfNeeded() {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const remoteExtension = this.serverConfiguration.extension;
        const shouldRecommend = async () => {
            if (this.storageService.getBoolean(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, -1 /* StorageScope.APPLICATION */)) {
                return false;
            }
            if (await this.extensionService.getExtension(remoteExtension.extensionId)) {
                return false;
            }
            const usedOnHostMessage = this.storageService.get(REMOTE_TUNNEL_USED_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            if (!usedOnHostMessage) {
                return false;
            }
            let usedTunnelName;
            try {
                const message = JSON.parse(usedOnHostMessage);
                if (!isObject(message)) {
                    return false;
                }
                const { hostName, timeStamp } = message;
                if (!isString(hostName) || !isNumber(timeStamp) || new Date().getTime() > timeStamp + REMOTE_TUNNEL_EXTENSION_TIMEOUT) {
                    return false;
                }
                usedTunnelName = hostName;
            }
            catch (_) {
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
                priority: NotificationPriority.OPTIONAL,
                message: localize({
                    key: 'recommend.remoteExtension',
                    comment: ['{0} will be a tunnel name, {1} will the link address to the web UI, {6} an extension name. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format']
                }, "Tunnel '{0}' is avaiable for remote access. The {1} extension can be used to connect to it.", usedOnHost, remoteExtension.friendlyName),
                actions: {
                    primary: [
                        toAction({
                            id: 'showExtension', label: localize('action.showExtension', "Show Extension"), run: () => {
                                return this.commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', [remoteExtension.extensionId]);
                            }
                        }),
                        toAction({
                            id: 'doNotShowAgain', label: localize('action.doNotShowAgain', "Do not show again"), run: () => {
                                this.storageService.store(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                            }
                        }),
                    ]
                }
            });
            return true;
        };
        if (await shouldRecommend()) {
            const disposables = this._register(new DisposableStore());
            disposables.add(this.storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, REMOTE_TUNNEL_USED_STORAGE_KEY, disposables)(async () => {
                const success = await recommed();
                if (success) {
                    disposables.dispose();
                }
            }));
        }
    }
    async initialize() {
        const [mode, status] = await Promise.all([
            this.remoteTunnelService.getMode(),
            this.remoteTunnelService.getTunnelStatus(),
        ]);
        this.handleTunnelStatusUpdate(status);
        if (mode.active && mode.session.token) {
            return; // already initialized, token available
        }
        const doInitialStateDiscovery = async (progress) => {
            const listener = progress && this.remoteTunnelService.onDidChangeTunnelStatus(status => {
                switch (status.type) {
                    case 'connecting':
                        if (status.progress) {
                            progress.report({ message: status.progress });
                        }
                        break;
                }
            });
            let newSession;
            if (mode.active) {
                const token = await this.getSessionToken(mode.session);
                if (token) {
                    newSession = { ...mode.session, token };
                }
            }
            const status = await this.remoteTunnelService.initialize(mode.active && newSession ? { ...mode, session: newSession } : INACTIVE_TUNNEL_MODE);
            listener?.dispose();
            if (status.type === 'connected') {
                this.connectionInfo = status.info;
                this.connectionStateContext.set('connected');
                return;
            }
        };
        const hasUsed = this.storageService.getBoolean(REMOTE_TUNNEL_HAS_USED_BEFORE, -1 /* StorageScope.APPLICATION */, false);
        if (hasUsed) {
            await this.progressService.withProgress({
                location: 10 /* ProgressLocation.Window */,
                title: localize({ key: 'initialize.progress.title', comment: ['Only translate \'Looking for remote tunnel\', do not change the format of the rest (markdown link format)'] }, "[Looking for remote tunnel](command:{0})", RemoteTunnelCommandIds.showLog),
            }, doInitialStateDiscovery);
        }
        else {
            doInitialStateDiscovery(undefined);
        }
    }
    getPreferredTokenFromSession(session) {
        return session.session.accessToken || session.session.idToken;
    }
    async startTunnel(asService) {
        if (this.connectionInfo) {
            return this.connectionInfo;
        }
        this.storageService.store(REMOTE_TUNNEL_HAS_USED_BEFORE, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        let tokenProblems = false;
        for (let i = 0; i < INVALID_TOKEN_RETRIES; i++) {
            tokenProblems = false;
            const authenticationSession = await this.getAuthenticationSession();
            if (authenticationSession === undefined) {
                this.logger.info('No authentication session available, not starting tunnel');
                return undefined;
            }
            const result = await this.progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: localize({ key: 'startTunnel.progress.title', comment: ['Only translate \'Starting remote tunnel\', do not change the format of the rest (markdown link format)'] }, "[Starting remote tunnel](command:{0})", RemoteTunnelCommandIds.showLog),
            }, (progress) => {
                return new Promise((s, e) => {
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
                                if (status.serviceInstallFailed) {
                                    this.notificationService.notify({
                                        severity: Severity.Warning,
                                        message: localize({
                                            key: 'remoteTunnel.serviceInstallFailed',
                                            comment: ['{Locked="](command:{0})"}']
                                        }, "Installation as a service failed, and we fell back to running the tunnel for this session. See the [error log](command:{0}) for details.", RemoteTunnelCommandIds.showLog),
                                    });
                                }
                                break;
                            case 'disconnected':
                                listener.dispose();
                                completed = true;
                                tokenProblems = !!status.onTokenFailed;
                                s(undefined);
                                break;
                        }
                    });
                    const token = this.getPreferredTokenFromSession(authenticationSession);
                    const account = { sessionId: authenticationSession.session.id, token, providerId: authenticationSession.providerId, accountLabel: authenticationSession.session.account.label };
                    this.remoteTunnelService.startTunnel({ active: true, asService, session: account }).then(status => {
                        if (!completed && (status.type === 'connected' || status.type === 'disconnected')) {
                            listener.dispose();
                            if (status.type === 'connected') {
                                s(status.info);
                            }
                            else {
                                tokenProblems = !!status.onTokenFailed;
                                s(undefined);
                            }
                        }
                    });
                });
            });
            if (result || !tokenProblems) {
                return result;
            }
        }
        return undefined;
    }
    async getAuthenticationSession() {
        const sessions = await this.getAllSessions();
        const disposables = new DisposableStore();
        const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        quickpick.ok = false;
        quickpick.placeholder = localize('accountPreference.placeholder', "Sign in to an account to enable remote access");
        quickpick.ignoreFocusOut = true;
        quickpick.items = await this.createQuickpickItems(sessions);
        return new Promise((resolve, reject) => {
            disposables.add(quickpick.onDidHide((e) => {
                resolve(undefined);
                disposables.dispose();
            }));
            disposables.add(quickpick.onDidAccept(async (e) => {
                const selection = quickpick.selectedItems[0];
                if ('provider' in selection) {
                    const session = await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes);
                    resolve(this.createExistingSessionItem(session, selection.provider.id));
                }
                else if ('session' in selection) {
                    resolve(selection);
                }
                else {
                    resolve(undefined);
                }
                quickpick.hide();
            }));
            quickpick.show();
        });
    }
    createExistingSessionItem(session, providerId) {
        return {
            label: session.account.label,
            description: this.authenticationService.getProvider(providerId).label,
            session,
            providerId
        };
    }
    async createQuickpickItems(sessions) {
        const options = [];
        if (sessions.length) {
            options.push({ type: 'separator', label: localize('signed in', "Signed In") });
            options.push(...sessions);
            options.push({ type: 'separator', label: localize('others', "Others") });
        }
        for (const authenticationProvider of (await this.getAuthenticationProviders())) {
            const signedInForProvider = sessions.some(account => account.providerId === authenticationProvider.id);
            const provider = this.authenticationService.getProvider(authenticationProvider.id);
            if (!signedInForProvider || provider.supportsMultipleAccounts) {
                options.push({ label: localize({ key: 'sign in using account', comment: ['{0} will be a auth provider (e.g. Github)'] }, "Sign in with {0}", provider.label), provider: authenticationProvider });
            }
        }
        return options;
    }
    /**
     * Returns all authentication sessions available from {@link getAuthenticationProviders}.
     */
    async getAllSessions() {
        const authenticationProviders = await this.getAuthenticationProviders();
        const accounts = new Map();
        const currentAccount = await this.remoteTunnelService.getMode();
        let currentSession;
        for (const provider of authenticationProviders) {
            const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);
            for (const session of sessions) {
                if (!this.expiredSessions.has(session.id)) {
                    const item = this.createExistingSessionItem(session, provider.id);
                    accounts.set(item.session.account.id, item);
                    if (currentAccount.active && currentAccount.session.sessionId === session.id) {
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
    async getSessionToken(session) {
        if (session) {
            const sessionItem = (await this.getAllSessions()).find(s => s.session.id === session.sessionId);
            if (sessionItem) {
                return this.getPreferredTokenFromSession(sessionItem);
            }
        }
        return undefined;
    }
    /**
     * Returns all authentication providers which can be used to authenticate
     * to the remote storage service, based on product.json configuration
     * and registered authentication providers.
     */
    async getAuthenticationProviders() {
        // Get the list of authentication providers configured in product.json
        const authenticationProviders = this.serverConfiguration.authenticationProviders;
        const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce((result, id) => {
            result.push({ id, scopes: authenticationProviders[id].scopes });
            return result;
        }, []);
        // Filter out anything that isn't currently available through the authenticationService
        const availableAuthenticationProviders = this.authenticationService.declaredProviders;
        return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some(provider => provider.id === id));
    }
    registerCommands() {
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
            async run(accessor) {
                const notificationService = accessor.get(INotificationService);
                const clipboardService = accessor.get(IClipboardService);
                const commandService = accessor.get(ICommandService);
                const storageService = accessor.get(IStorageService);
                const dialogService = accessor.get(IDialogService);
                const quickInputService = accessor.get(IQuickInputService);
                const productService = accessor.get(IProductService);
                const didNotifyPreview = storageService.getBoolean(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, false);
                if (!didNotifyPreview) {
                    const { confirmed } = await dialogService.confirm({
                        message: localize('tunnel.preview', 'Remote Tunnels is currently in preview. Please report any problems using the "Help: Report Issue" command.'),
                        primaryButton: localize({ key: 'enable', comment: ['&& denotes a mnemonic'] }, '&&Enable')
                    });
                    if (!confirmed) {
                        return;
                    }
                    storageService.store(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                }
                const disposables = new DisposableStore();
                const quickPick = quickInputService.createQuickPick();
                quickPick.placeholder = localize('tunnel.enable.placeholder', 'Select how you want to enable access');
                quickPick.items = [
                    { service: false, label: localize('tunnel.enable.session', 'Turn on for this session'), description: localize('tunnel.enable.session.description', 'Run whenever {0} is open', productService.nameShort) },
                    { service: true, label: localize('tunnel.enable.service', 'Install as a service'), description: localize('tunnel.enable.service.description', 'Run whenever you\'re logged in') }
                ];
                const asService = await new Promise(resolve => {
                    disposables.add(quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]?.service)));
                    disposables.add(quickPick.onDidHide(() => resolve(undefined)));
                    quickPick.show();
                });
                quickPick.dispose();
                if (asService === undefined) {
                    return; // no-op
                }
                const connectionInfo = await that.startTunnel(/* installAsService= */ asService);
                if (connectionInfo) {
                    const linkToOpen = that.getLinkToOpen(connectionInfo);
                    const remoteExtension = that.serverConfiguration.extension;
                    const linkToOpenForMarkdown = linkToOpen.toString(false).replace(/\)/g, '%29');
                    notificationService.notify({
                        severity: Severity.Info,
                        message: localize({
                            key: 'progress.turnOn.final',
                            comment: ['{0} will be the tunnel name, {1} will the link address to the web UI, {6} an extension name, {7} a link to the extension documentation. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format']
                        }, "You can now access this machine anywhere via the secure tunnel [{0}](command:{4}). To connect via a different machine, use the generated [{1}]({2}) link or use the [{6}]({7}) extension in the desktop or web. You can [configure](command:{3}) or [turn off](command:{5}) this access via the VS Code Accounts menu.", connectionInfo.tunnelName, connectionInfo.domain, linkToOpenForMarkdown, RemoteTunnelCommandIds.manage, RemoteTunnelCommandIds.configure, RemoteTunnelCommandIds.turnOff, remoteExtension.friendlyName, 'https://code.visualstudio.com/docs/remote/tunnels'),
                        actions: {
                            primary: [
                                toAction({ id: 'copyToClipboard', label: localize('action.copyToClipboard', "Copy Browser Link to Clipboard"), run: () => clipboardService.writeText(linkToOpen.toString(true)) }),
                                toAction({
                                    id: 'showExtension', label: localize('action.showExtension', "Show Extension"), run: () => {
                                        return commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', [remoteExtension.extensionId]);
                                    }
                                })
                            ]
                        }
                    });
                    const usedOnHostMessage = { hostName: connectionInfo.tunnelName, timeStamp: new Date().getTime() };
                    storageService.store(REMOTE_TUNNEL_USED_STORAGE_KEY, JSON.stringify(usedOnHostMessage), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                }
                else {
                    notificationService.notify({
                        severity: Severity.Info,
                        message: localize('progress.turnOn.failed', "Unable to turn on the remote tunnel access. Check the Remote Tunnel Service log for details."),
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
                const message = that.connectionInfo?.isAttached ?
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
            async run(accessor) {
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
            async run(accessor) {
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
            async run(accessor) {
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
            async run(accessor) {
                const openerService = accessor.get(IOpenerService);
                await openerService.open('https://aka.ms/vscode-server-doc');
            }
        }));
    }
    getLinkToOpen(connectionInfo) {
        const workspace = this.workspaceContextService.getWorkspace();
        const folders = workspace.folders;
        let resource;
        if (folders.length === 1) {
            resource = folders[0].uri;
        }
        else if (workspace.configuration && !isUntitledWorkspace(workspace.configuration, this.environmentService)) {
            resource = workspace.configuration;
        }
        const link = URI.parse(connectionInfo.link);
        if (resource?.scheme === Schemas.file) {
            return joinPath(link, resource.path);
        }
        return joinPath(link, this.environmentService.userHome.path);
    }
    async showManageOptions() {
        const account = await this.remoteTunnelService.getMode();
        return new Promise((c, e) => {
            const disposables = new DisposableStore();
            const quickPick = this.quickInputService.createQuickPick({ useSeparators: true });
            quickPick.placeholder = localize('manage.placeholder', 'Select a command to invoke');
            disposables.add(quickPick);
            const items = [];
            items.push({ id: RemoteTunnelCommandIds.learnMore, label: RemoteTunnelCommandLabels.learnMore });
            if (this.connectionInfo) {
                quickPick.title =
                    this.connectionInfo.isAttached ?
                        localize({ key: 'manage.title.attached', comment: ['{0} is the tunnel name'] }, 'Remote Tunnel Access enabled for {0} (launched externally)', this.connectionInfo.tunnelName) :
                        localize({ key: 'manage.title.orunning', comment: ['{0} is the tunnel name'] }, 'Remote Tunnel Access enabled for {0}', this.connectionInfo.tunnelName);
                items.push({ id: RemoteTunnelCommandIds.copyToClipboard, label: RemoteTunnelCommandLabels.copyToClipboard, description: this.connectionInfo.domain });
            }
            else {
                quickPick.title = localize('manage.title.off', 'Remote Tunnel Access not enabled');
            }
            items.push({ id: RemoteTunnelCommandIds.showLog, label: localize('manage.showLog', 'Show Log') });
            items.push({ type: 'separator' });
            items.push({ id: RemoteTunnelCommandIds.configure, label: localize('manage.tunnelName', 'Change Tunnel Name'), description: this.connectionInfo?.tunnelName });
            items.push({ id: RemoteTunnelCommandIds.turnOff, label: RemoteTunnelCommandLabels.turnOff, description: account.active ? `${account.session.accountLabel} (${account.session.providerId})` : undefined });
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
};
RemoteTunnelWorkbenchContribution = __decorate([
    __param(0, IAuthenticationService),
    __param(1, IDialogService),
    __param(2, IExtensionService),
    __param(3, IContextKeyService),
    __param(4, IProductService),
    __param(5, IStorageService),
    __param(6, ILoggerService),
    __param(7, IQuickInputService),
    __param(8, INativeEnvironmentService),
    __param(9, IRemoteTunnelService),
    __param(10, ICommandService),
    __param(11, IWorkspaceContextService),
    __param(12, IProgressService),
    __param(13, INotificationService)
], RemoteTunnelWorkbenchContribution);
export { RemoteTunnelWorkbenchContribution };
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteTunnelWorkbenchContribution, 3 /* LifecyclePhase.Restored */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    type: 'object',
    properties: {
        [CONFIGURATION_KEY_HOST_NAME]: {
            description: localize('remoteTunnelAccess.machineName', "The name under which the remote tunnel access is registered. If not set, the host name is used."),
            type: 'string',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            ignoreSync: true,
            pattern: '^(\\w[\\w-]*)?$',
            patternErrorMessage: localize('remoteTunnelAccess.machineNameRegex', "The name must only consist of letters, numbers, underscore and dash. It must not start with a dash."),
            maxLength: 20,
            default: ''
        },
        [CONFIGURATION_KEY_PREVENT_SLEEP]: {
            description: localize('remoteTunnelAccess.preventSleep', "Prevent this computer from sleeping when remote tunnel access is turned on."),
            type: 'boolean',
            scope: 1 /* ConfigurationScope.APPLICATION */,
            default: false,
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlVHVubmVsLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZVR1bm5lbC9lbGVjdHJvbi1icm93c2VyL3JlbW90ZVR1bm5lbC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTdELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLFVBQVUsSUFBSSx1QkFBdUIsRUFBOEMsTUFBTSxvRUFBb0UsQ0FBQztBQUN2SyxPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FB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