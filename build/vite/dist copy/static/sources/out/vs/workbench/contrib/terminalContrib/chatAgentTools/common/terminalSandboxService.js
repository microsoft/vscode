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
var TerminalSandboxService_1;
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname, posix, win32 } from '../../../../../base/common/path.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ILifecycleService, WillShutdownJoinerOrder } from '../../../../services/lifecycle/common/lifecycle.js';
import { ISandboxHelperService } from '../../../../../platform/sandbox/common/sandboxHelperService.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ChatElicitationRequestPart } from '../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatModel } from '../../../chat/common/model/chatModel.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { SANDBOX_HELPER_CHANNEL_NAME, SandboxHelperChannelClient } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';
export const ITerminalSandboxService = createDecorator('terminalSandboxService');
export var TerminalSandboxPrerequisiteCheck;
(function (TerminalSandboxPrerequisiteCheck) {
    TerminalSandboxPrerequisiteCheck["Config"] = "config";
    TerminalSandboxPrerequisiteCheck["Dependencies"] = "dependencies";
})(TerminalSandboxPrerequisiteCheck || (TerminalSandboxPrerequisiteCheck = {}));
let TerminalSandboxService = class TerminalSandboxService extends Disposable {
    static { TerminalSandboxService_1 = this; }
    static { this._sandboxTempDirName = 'tmp'; }
    static { this._urlRegex = /(?:https?|wss?):\/\/[^\s'"`|&;<>]+/gi; }
    static { this._sshRemoteRegex = /(?:^|[\s'"`])(?:[^\s@:'"`]+@)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::[^\s'"`|&;<>]+)(?=$|[\s'"`|&;<>])/gi; }
    static { this._hostRegex = /(?:^|[\s'"`(=])([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?(?=(?:\/[^\s'"`|&;<>]*)?(?:$|[\s'"`)\]|,;|&<>]))/gi; }
    constructor(_configurationService, _fileService, _environmentService, _logService, _remoteAgentService, _workspaceContextService, _productService, _lifecycleService, _sandboxHelperService, _chatService) {
        super();
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._environmentService = _environmentService;
        this._logService = _logService;
        this._remoteAgentService = _remoteAgentService;
        this._workspaceContextService = _workspaceContextService;
        this._productService = _productService;
        this._lifecycleService = _lifecycleService;
        this._sandboxHelperService = _sandboxHelperService;
        this._chatService = _chatService;
        this._srtPathResolved = false;
        this._needsForceUpdateConfigFile = true;
        this._remoteEnvDetails = null;
        this._os = OS;
        this._defaultWritePaths = ['~/.npm'];
        // Joins path segments according to the current OS.
        this._pathJoin = (...segments) => {
            const path = this._os === 1 /* OperatingSystem.Windows */ ? win32 : posix;
            return path.join(...segments);
        };
        this._appRoot = dirname(FileAccess.asFileUri('').path);
        // Get the node executable path from native environment service if available (Electron's execPath with ELECTRON_RUN_AS_NODE)
        const nativeEnv = this._environmentService;
        this._execPath = nativeEnv.execPath;
        this._sandboxSettingsId = generateUuid();
        this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
            // If terminal sandbox settings changed, update sandbox config.
            if (e?.affectsConfiguration("chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */) ||
                e?.affectsConfiguration("chat.agent.sandbox" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxEnabled */) ||
                e?.affectsConfiguration("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */) ||
                e?.affectsConfiguration("chat.agent.sandboxNetwork.allowedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */) ||
                e?.affectsConfiguration("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */) ||
                e?.affectsConfiguration("chat.agent.sandboxNetwork.deniedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */) ||
                e?.affectsConfiguration("chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */) ||
                e?.affectsConfiguration("chat.agent.sandboxFileSystem.linux" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem */) ||
                e?.affectsConfiguration("chat.agent.sandbox.fileSystem.mac" /* TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem */) ||
                e?.affectsConfiguration("chat.agent.sandboxFileSystem.mac" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem */)) {
                this.setNeedsForceUpdateConfigFile();
            }
        }));
        this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
            this.setNeedsForceUpdateConfigFile();
        }));
        this._register(this._lifecycleService.onWillShutdown(e => {
            if (!this._tempDir) {
                return;
            }
            e.join(this._cleanupSandboxTempDir(), {
                id: 'join.deleteFilesInSandboxTempDir',
                label: localize('deleteFilesInSandboxTempDir', "Delete Files in Sandbox Temp Dir"),
                order: WillShutdownJoinerOrder.Default
            });
        }));
    }
    async isEnabled() {
        return await this._isSandboxConfiguredEnabled();
    }
    async getOS() {
        this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
        this._os = this._remoteEnvDetails ? this._remoteEnvDetails.os : OS;
        return this._os;
    }
    wrapCommand(command, requestUnsandboxedExecution, shell) {
        if (!this._sandboxConfigPath || !this._tempDir) {
            throw new Error('Sandbox config path or temp dir not initialized');
        }
        const blockedDomainResult = requestUnsandboxedExecution ? { blockedDomains: [], deniedDomains: [] } : this._getBlockedDomains(command);
        if (!requestUnsandboxedExecution && blockedDomainResult.blockedDomains.length > 0) {
            return {
                command: this._wrapUnsandboxedCommand(command, shell),
                isSandboxWrapped: false,
                blockedDomains: blockedDomainResult.blockedDomains,
                deniedDomains: blockedDomainResult.deniedDomains,
                requiresUnsandboxConfirmation: true,
            };
        }
        // If requestUnsandboxedExecution is true, need to ensure env variables set during sandbox still apply.
        if (requestUnsandboxedExecution) {
            return {
                command: this._wrapUnsandboxedCommand(command, shell),
                isSandboxWrapped: false,
            };
        }
        if (!this._execPath) {
            throw new Error('Executable path not set to run sandbox commands');
        }
        if (!this._srtPath) {
            throw new Error('Sandbox runtime path not resolved');
        }
        if (!this._rgPath) {
            throw new Error('Ripgrep path not resolved');
        }
        // Use ELECTRON_RUN_AS_NODE=1 to make Electron executable behave as Node.js
        // TMPDIR must be set as environment variable before the command
        // Quote shell arguments so the wrapped command cannot break out of the outer shell.
        const wrappedCommand = `PATH="$PATH:${dirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" CLAUDE_TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(command)}`;
        if (this._remoteEnvDetails) {
            return {
                command: wrappedCommand,
                isSandboxWrapped: true,
            };
        }
        return {
            command: `ELECTRON_RUN_AS_NODE=1 ${wrappedCommand}`,
            isSandboxWrapped: true,
        };
    }
    getTempDir() {
        return this._tempDir;
    }
    setNeedsForceUpdateConfigFile() {
        this._needsForceUpdateConfigFile = true;
    }
    async checkForSandboxingPrereqs(forceRefresh = false) {
        if (!(await this._isSandboxConfiguredEnabled())) {
            return {
                enabled: false,
                sandboxConfigPath: undefined,
                failedCheck: undefined,
            };
        }
        const sandboxConfigPath = await this.getSandboxConfigPath(forceRefresh);
        if (!sandboxConfigPath) {
            return {
                enabled: true,
                sandboxConfigPath,
                failedCheck: "config" /* TerminalSandboxPrerequisiteCheck.Config */,
            };
        }
        if (!(await this._checkSandboxDependencies(forceRefresh))) {
            return {
                enabled: true,
                sandboxConfigPath,
                failedCheck: "dependencies" /* TerminalSandboxPrerequisiteCheck.Dependencies */,
                missingDependencies: await this.getMissingSandboxDependencies(),
            };
        }
        return {
            enabled: true,
            sandboxConfigPath,
            failedCheck: undefined,
        };
    }
    async getSandboxConfigPath(forceRefresh = false) {
        if (!(await this._isSandboxConfiguredEnabled())) {
            return undefined;
        }
        await this._resolveSrtPath();
        if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
            this._sandboxConfigPath = await this._createSandboxConfig();
            this._needsForceUpdateConfigFile = false;
        }
        return this._sandboxConfigPath;
    }
    async _checkSandboxDependencies(forceRefresh = false) {
        const os = await this.getOS();
        if (os === 1 /* OperatingSystem.Windows */) {
            return false;
        }
        const sandboxDependencyStatus = await this._resolveSandboxDependencyStatus(forceRefresh);
        this._sandboxDependencyStatus = sandboxDependencyStatus;
        if (sandboxDependencyStatus && !sandboxDependencyStatus.bubblewrapInstalled) {
            this._logService.warn('TerminalSandboxService: bubblewrap (bwrap) is not installed');
        }
        if (sandboxDependencyStatus && !sandboxDependencyStatus.socatInstalled) {
            this._logService.warn('TerminalSandboxService: socat is not installed');
        }
        return sandboxDependencyStatus ? sandboxDependencyStatus.bubblewrapInstalled && sandboxDependencyStatus.socatInstalled : true;
    }
    async getMissingSandboxDependencies() {
        const os = await this.getOS();
        if (os === 1 /* OperatingSystem.Windows */) {
            return [];
        }
        if (!this._sandboxDependencyStatus || !this._sandboxDependencyStatus.bubblewrapInstalled || !this._sandboxDependencyStatus.socatInstalled) {
            this._sandboxDependencyStatus = await this._resolveSandboxDependencyStatus(true);
        }
        const missing = [];
        if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.bubblewrapInstalled) {
            missing.push('bubblewrap');
        }
        if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.socatInstalled) {
            missing.push('socat');
        }
        return missing;
    }
    async installMissingSandboxDependencies(missingDependencies, sessionResource, token, options) {
        const depsList = missingDependencies.join(' ');
        const installCommand = `sudo apt install -y ${depsList}`;
        const instance = await options.createTerminal();
        // Wait for the install command to finish so the chat can proceed automatically.
        let installCommandSent = false;
        const completionPromise = new Promise(resolve => {
            const store = new DisposableStore();
            let resolved = false;
            const resolveOnce = (code) => {
                if (resolved) {
                    return;
                }
                resolved = true;
                store.dispose();
                resolve(code);
            };
            const attachListener = () => {
                const detection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
                if (detection) {
                    store.add(detection.onCommandFinished(cmd => resolveOnce(cmd.exitCode)));
                }
            };
            attachListener();
            store.add(instance.capabilities.onDidAddCapability(e => {
                if (e.id === 2 /* TerminalCapability.CommandDetection */) {
                    attachListener();
                }
            }));
            // Handle terminal disposal
            store.add(instance.onDisposed(() => resolveOnce(undefined)));
            // Handle cancellation
            store.add(token.onCancellationRequested(() => resolveOnce(undefined)));
            // Safety timeout — 5 minutes should be more than enough for apt install
            const safetyTimeout = timeout(5 * 60 * 1000);
            store.add({ dispose: () => safetyTimeout.cancel() });
            safetyTimeout.then(() => resolveOnce(undefined));
            const passwordPrompt = this._createMissingDependencyPasswordPrompt(sessionResource, {
                focusTerminal: () => options.focusTerminal(instance),
                onDidInputData: instance.onDidInputData,
                onDisposed: instance.onDisposed,
                didSendInstallCommand: () => installCommandSent,
            }, token);
            store.add(passwordPrompt);
        });
        // Send the command after listeners are attached so we never miss the event.
        // Set installCommandSent only after sendText completes because sendText
        // fires onDidInputData internally, and the password-prompt listener would
        // dismiss the elicitation prematurely if the flag were already true.
        await instance.sendText(installCommand, true);
        installCommandSent = true;
        return { exitCode: await completionPromise };
    }
    /**
     * Shows a chat elicitation that keeps the "Install" flow grounded in chat while
     * the user focuses the terminal and types a sudo password.
     */
    _createMissingDependencyPasswordPrompt(sessionResource, promptContext, token) {
        const chatModel = sessionResource && this._chatService.getSession(sessionResource);
        if (!(chatModel instanceof ChatModel)) {
            return new DisposableStore();
        }
        const request = chatModel.getRequests().at(-1);
        if (!request) {
            return new DisposableStore();
        }
        const part = new ChatElicitationRequestPart(localize('runInTerminal.missingDeps.passwordPromptTitle', "The terminal is awaiting input."), new MarkdownString(localize('runInTerminal.missingDeps.passwordPromptMessage', "Installing missing sandbox dependencies may prompt for your sudo password. Select Focus Terminal to type it in the terminal.")), '', localize('runInTerminal.missingDeps.focusTerminal', 'Focus Terminal'), undefined, async () => {
            await promptContext.focusTerminal();
            return "pending" /* ElicitationState.Pending */;
        });
        chatModel.acceptResponseProgress(request, part);
        const store = new DisposableStore();
        const disposePrompt = () => store.dispose();
        store.add({ dispose: () => part.hide() });
        store.add(token.onCancellationRequested(disposePrompt));
        store.add(promptContext.onDisposed(disposePrompt));
        store.add(promptContext.onDidInputData(data => {
            if (promptContext.didSendInstallCommand() && data.length > 0) {
                disposePrompt();
            }
        }));
        return store;
    }
    _quoteShellArgument(value) {
        return `'${value.replace(/'/g, `'\\''`)}'`;
    }
    _wrapUnsandboxedCommand(command, shell) {
        if (!this._tempDir?.path) {
            return command;
        }
        if (!shell) {
            return `(TMPDIR="${this._tempDir.path}"; export TMPDIR; ${command})`;
        }
        return `env TMPDIR="${this._tempDir.path}" ${this._quoteShellArgument(shell)} -c ${this._quoteShellArgument(command)}`;
    }
    _getBlockedDomains(command) {
        const domains = this._extractDomains(command);
        if (domains.length === 0) {
            return { blockedDomains: [], deniedDomains: [] };
        }
        const { allowedDomains, deniedDomains } = this.getResolvedNetworkDomains();
        const blockedDomains = new Set();
        const explicitlyDeniedDomains = new Set();
        for (const domain of domains) {
            if (deniedDomains.some(pattern => this._matchesDomainPattern(domain, pattern))) {
                blockedDomains.add(domain);
                explicitlyDeniedDomains.add(domain);
                continue;
            }
            if (!allowedDomains.some(pattern => this._matchesDomainPattern(domain, pattern))) {
                blockedDomains.add(domain);
            }
        }
        return {
            blockedDomains: [...blockedDomains],
            deniedDomains: [...explicitlyDeniedDomains],
        };
    }
    _extractDomains(command) {
        const domains = new Set();
        let match;
        TerminalSandboxService_1._urlRegex.lastIndex = 0;
        while ((match = TerminalSandboxService_1._urlRegex.exec(command)) !== null) {
            const domain = this._extractDomainFromUrl(match[0]);
            if (domain) {
                domains.add(domain);
            }
        }
        TerminalSandboxService_1._sshRemoteRegex.lastIndex = 0;
        while ((match = TerminalSandboxService_1._sshRemoteRegex.exec(command)) !== null) {
            const domain = this._normalizeDomain(match[1]);
            if (domain) {
                domains.add(domain);
            }
        }
        TerminalSandboxService_1._hostRegex.lastIndex = 0;
        while ((match = TerminalSandboxService_1._hostRegex.exec(command)) !== null) {
            const domain = this._normalizeDomain(match[1]);
            if (domain) {
                domains.add(domain);
            }
        }
        return [...domains];
    }
    _extractDomainFromUrl(value) {
        try {
            const authority = URI.parse(value).authority;
            return this._normalizeDomain(authority);
        }
        catch {
            return undefined;
        }
    }
    _normalizeDomain(value) {
        if (!value) {
            return undefined;
        }
        const normalized = value.trim().toLowerCase().replace(/^[^@]+@/, '').replace(/:\d+$/, '').replace(/\.+$/, '');
        if (!normalized || normalized.includes('/') || normalized === '.' || normalized === '..') {
            return undefined;
        }
        if (normalized !== '*' && !/^\*?\.?[a-z0-9.-]+$/.test(normalized)) {
            return undefined;
        }
        const domainToValidate = normalized.startsWith('*.') ? normalized.slice(2) : normalized;
        if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?))*$/.test(domainToValidate)) {
            return undefined;
        }
        // Strip common trailing punctuation that may follow a domain in text, e.g. "example.com,".
        const stripped = normalized.replace(/[),;:!?]+$/, '');
        if (!stripped) {
            return undefined;
        }
        // Allow a bare wildcard pattern.
        if (stripped === '*') {
            return stripped;
        }
        // Support wildcard domain patterns like "*.example.com".
        const hasWildcardPrefix = stripped.startsWith('*.');
        const host = hasWildcardPrefix ? stripped.slice(2) : stripped;
        if (!host) {
            return undefined;
        }
        // Validate that the host part only contains valid hostname characters.
        if (!/^[a-z0-9.-]+$/.test(host)) {
            return undefined;
        }
        return hasWildcardPrefix ? `*.${host}` : host;
    }
    _matchesDomainPattern(domain, pattern) {
        const normalizedPattern = this._normalizeDomain(this._extractDomainPattern(pattern));
        if (!normalizedPattern) {
            return false;
        }
        if (normalizedPattern === '*') {
            return true;
        }
        if (normalizedPattern.startsWith('*.')) {
            const suffix = normalizedPattern.slice(2);
            return domain === suffix || domain.endsWith(`.${suffix}`);
        }
        return domain === normalizedPattern;
    }
    _extractDomainPattern(pattern) {
        const trimmed = pattern.trim();
        if (trimmed === '*') {
            return trimmed;
        }
        if (!trimmed.includes('://')) {
            return trimmed;
        }
        try {
            return URI.parse(trimmed).authority;
        }
        catch {
            return trimmed;
        }
    }
    async _isSandboxConfiguredEnabled() {
        const os = await this.getOS();
        if (os === 1 /* OperatingSystem.Windows */) {
            return false;
        }
        return this._isSandboxEnabled(this._getSettingValue("chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */, "chat.agent.sandbox" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxEnabled */) ?? "off" /* TerminalChatAgentToolsSandboxEnabledValue.Off */);
    }
    async _resolveSrtPath() {
        if (this._srtPathResolved) {
            return;
        }
        this._srtPathResolved = true;
        const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
        if (remoteEnv) {
            this._appRoot = remoteEnv.appRoot.path;
            this._execPath = remoteEnv.execPath;
        }
        this._srtPath = this._pathJoin(this._appRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'dist', 'cli.js');
        this._rgPath = this._pathJoin(this._appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
    }
    async _createSandboxConfig() {
        if (await this.isEnabled() && !this._tempDir) {
            await this._initTempDir();
        }
        if (this._tempDir) {
            const allowedDomainsSetting = this._getSettingValue("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, "chat.agent.sandboxNetwork.allowedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */) ?? [];
            const deniedDomainsSetting = this._getSettingValue("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */, "chat.agent.sandboxNetwork.deniedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */) ?? [];
            const linuxFileSystemSetting = this._os === 3 /* OperatingSystem.Linux */
                ? this._getSettingValue("chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */, "chat.agent.sandboxFileSystem.linux" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem */) ?? {}
                : {};
            const macFileSystemSetting = this._os === 2 /* OperatingSystem.Macintosh */
                ? this._getSettingValue("chat.agent.sandbox.fileSystem.mac" /* TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem */, "chat.agent.sandboxFileSystem.mac" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem */) ?? {}
                : {};
            const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
            const linuxAllowWrite = this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite);
            const macAllowWrite = this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite);
            const sandboxSettings = {
                network: {
                    allowedDomains: allowedDomainsSetting,
                    deniedDomains: deniedDomainsSetting
                },
                filesystem: {
                    denyRead: this._os === 2 /* OperatingSystem.Macintosh */ ? macFileSystemSetting.denyRead : linuxFileSystemSetting.denyRead,
                    allowWrite: this._os === 2 /* OperatingSystem.Macintosh */ ? macAllowWrite : linuxAllowWrite,
                    denyWrite: this._os === 2 /* OperatingSystem.Macintosh */ ? macFileSystemSetting.denyWrite : linuxFileSystemSetting.denyWrite,
                }
            };
            this._sandboxConfigPath = configFileUri.path;
            await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, '\t')), { overwrite: true });
            return this._sandboxConfigPath;
        }
        return undefined;
    }
    async _initTempDir() {
        if (await this.isEnabled()) {
            this._needsForceUpdateConfigFile = true;
            const remoteEnv = this._remoteEnvDetails || await this._remoteEnvDetailsPromise;
            this._tempDir = this._getSandboxTempDirPath(remoteEnv);
            if (this._tempDir) {
                await this._fileService.createFolder(this._tempDir);
                this._defaultWritePaths.push(this._tempDir.path);
            }
            if (!this._tempDir) {
                this._logService.warn('TerminalSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment');
            }
        }
    }
    async _cleanupSandboxTempDir() {
        if (!this._tempDir) {
            return;
        }
        try {
            await this._fileService.del(this._tempDir, { recursive: true, useTrash: false });
        }
        catch (error) {
            this._logService.warn('TerminalSandboxService: Failed to delete sandbox temp dir', error);
        }
    }
    _getSandboxTempDirPath(remoteEnv) {
        const sandboxTempDirName = this._getSandboxWindowTempDirName();
        if (remoteEnv?.userHome) {
            const sandboxRoot = URI.joinPath(remoteEnv.userHome, this._productService.serverDataFolderName ?? this._productService.dataFolderName, TerminalSandboxService_1._sandboxTempDirName);
            return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
        }
        const nativeEnv = this._environmentService;
        if (nativeEnv.userHome) {
            const sandboxRoot = URI.joinPath(nativeEnv.userHome, this._productService.dataFolderName, TerminalSandboxService_1._sandboxTempDirName);
            return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
        }
        return undefined;
    }
    _getSandboxWindowTempDirName() {
        const workbenchEnv = this._environmentService;
        const windowId = workbenchEnv.window?.id;
        return typeof windowId === 'number' ? `tmp_vscode_${windowId}` : undefined;
    }
    getResolvedNetworkDomains() {
        const allowedDomains = this._getSettingValue("chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */, "chat.agent.sandboxNetwork.allowedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */) ?? [];
        const deniedDomains = this._getSettingValue("chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */, "chat.agent.sandboxNetwork.deniedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */) ?? [];
        return {
            allowedDomains,
            deniedDomains
        };
    }
    _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite) {
        const workspaceFolderPaths = this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri.path);
        return [...new Set([...workspaceFolderPaths, ...this._defaultWritePaths, ...(configuredAllowWrite ?? [])])];
    }
    async _resolveSandboxDependencyStatus(forceRefresh = false) {
        if (!forceRefresh && this._sandboxDependencyStatus) {
            return this._sandboxDependencyStatus;
        }
        const connection = this._remoteAgentService.getConnection();
        if (connection) {
            return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
                const sandboxHelper = new SandboxHelperChannelClient(channel);
                return sandboxHelper.checkSandboxDependencies();
            });
        }
        return this._sandboxHelperService.checkSandboxDependencies();
    }
    _isSandboxEnabled(value) {
        return value === true || value === "on" /* TerminalChatAgentToolsSandboxEnabledValue.On */;
    }
    _getSettingValue(settingId, deprecatedSettingId) {
        const setting = this._configurationService.inspect(settingId);
        const deprecatedSetting = deprecatedSettingId ? this._configurationService.inspect(deprecatedSettingId) : undefined;
        if (setting.userValue === undefined && deprecatedSetting?.userValue !== undefined) {
            this._logService.warn(`TerminalSandboxService: Using deprecated setting ${deprecatedSettingId} because ${settingId} is not set. Please update your settings to use ${settingId} instead.`);
            return deprecatedSetting.value;
        }
        return setting.value;
    }
};
TerminalSandboxService = TerminalSandboxService_1 = __decorate([
    __param(0, IConfigurationService),
    __param(1, IFileService),
    __param(2, IEnvironmentService),
    __param(3, ILogService),
    __param(4, IRemoteAgentService),
    __param(5, IWorkspaceContextService),
    __param(6, IProductService),
    __param(7, ILifecycleService),
    __param(8, ISandboxHelperService),
    __param(9, IChatService)
], TerminalSandboxService);
export { TerminalSandboxService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTYW5kYm94U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9jb21tb24vdGVybWluYWxTYW5kYm94U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFtQixFQUFFLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQTZCLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDakksT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNoRyxPQUFPLEVB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