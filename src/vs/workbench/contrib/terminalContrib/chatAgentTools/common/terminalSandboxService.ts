/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname } from '../../../../../base/common/path.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { SANDBOX_HELPER_CHANNEL_NAME, SandboxHelperChannelClient } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { ISandboxDependencyStatus, ISandboxHelperService, type IWindowsMxcConfig, IWindowsMxcFilesystemPolicy, type IWindowsMxcPolicyContainment, type IWindowsMxcSandboxPolicy } from '../../../../../platform/sandbox/common/sandboxHelperService.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../../../../platform/sandbox/common/terminalSandboxEngine.js';
import { readSandboxSetting, SANDBOX_SETTING_KEYS } from './sandboxSettingsReader.js';
import { ITerminalSandboxService, TerminalSandboxPreCheckRemediation, type ISandboxDependencyInstallOptions, type ISandboxDependencyInstallResult, type ITerminalSandboxCommand, type ITerminalSandboxFileAccessCheckResult, type ITerminalSandboxPrecheckInputs, type ITerminalSandboxPrerequisiteCheckResult, type ITerminalSandboxResolvedNetworkDomains, type ITerminalSandboxWrapResult, type TerminalSandboxFileAccessPermission } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ChatModel } from '../../../chat/common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ElicitationState, IChatService } from '../../../chat/common/chatService/chatService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { ILifecycleService, WillShutdownJoinerOrder } from '../../../../services/lifecycle/common/lifecycle.js';

export { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
export type { ISandboxDependencyInstallOptions, ISandboxDependencyInstallResult, ISandboxDependencyInstallTerminal, ITerminalSandboxCommand, ITerminalSandboxFileAccessCheckResult, ITerminalSandboxPrecheckInputs, ITerminalSandboxPrerequisiteCheckResult, ITerminalSandboxResolvedNetworkDomains, ITerminalSandboxWrapResult, TerminalSandboxFileAccessPermission } from '../../../../../platform/sandbox/common/terminalSandboxService.js';

/**
 * Context passed to the password prompt during dependency installation.
 */
interface ISandboxDependencyInstallTerminalContext {
	focusTerminal(): Promise<void>;
	onDidInputData: Event<string>;
	onDisposed: Event<unknown>;
	didSendInstallCommand(): boolean;
}

/** Subdirectory under the user home + product data folder where the engine creates its temp dir. */
const SANDBOX_TEMP_DIR_NAME = 'tmp';

function affectsSandboxSettings(e: IConfigurationChangeEvent): boolean {
	return SANDBOX_SETTING_KEYS.some(key => e.affectsConfiguration(key));
}

export class TerminalSandboxService extends Disposable implements ITerminalSandboxService {
	readonly _serviceBrand: undefined;

	private readonly _engine: TerminalSandboxEngine;
	private readonly _remoteEnvDetailsPromise: Promise<IRemoteAgentEnvironment | null>;
	private _remoteEnvDetails: IRemoteAgentEnvironment | null | undefined;
	private readonly _onDidChangeRoots = this._register(new Emitter<void>());

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IProductService private readonly _productService: IProductService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ISandboxHelperService private readonly _sandboxHelperService: ISandboxHelperService,
		@IChatService private readonly _chatService: IChatService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();

		const onDidChangeSandboxSettings = Event.filter(this._configurationService.onDidChangeConfiguration, affectsSandboxSettings);

		const host: ITerminalSandboxEngineHost = {
			getOS: () => this._resolveOS(),
			getRuntimeInfo: () => this._resolveRuntimeInfo(),
			getUserHome: () => this._resolveUserHome(),
			getSandboxTempDir: () => this._resolveSandboxTempDir(),
			getWorkspaceStorageReadRoot: () => this._resolveWorkspaceStorageReadRoot(),
			getWriteRoots: () => this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri),
			onDidChangeRoots: this._onDidChangeRoots.event,
			checkSandboxDependencies: () => this._resolveSandboxDependencyStatus(),
			getWindowsMxcFilesystemPolicy: () => this._resolveWindowsMxcFilesystemPolicy(),
			getWindowsMxcEnvironment: () => this._resolveWindowsMxcEnvironment(),
			buildWindowsMxcSandboxPayload: (commandLine, policy, workingDirectory, containerName, containment) => this._resolveWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment),
			getSandboxSetting: <T>(settingId: string): T | undefined => this._readSandboxSetting<T>(settingId),
			onDidChangeSandboxSettings: Event.map(onDidChangeSandboxSettings, () => undefined),
		};
		this._engine = this._register(instantiationService.createInstance(TerminalSandboxEngine, host));

		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._onDidChangeRoots.fire()));

		this._register(lifecycleService.onWillShutdown(e => {
			if (!this._engine.getTempDir()) {
				return;
			}
			e.join(this._engine.cleanupTempDir(), {
				id: 'join.deleteFilesInSandboxTempDir',
				label: localize('deleteFilesInSandboxTempDir', "Delete Files in Sandbox Temp Dir"),
				order: WillShutdownJoinerOrder.Default
			});
		}));
	}

	// ---- ITerminalSandboxService forwarders ---------------------------------

	isEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		return this._engine.isEnabled(precheckInputs);
	}

	isSandboxAllowNetworkEnabled(precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<boolean> {
		return this._engine.isSandboxAllowNetworkEnabled(precheckInputs);
	}

	getOS(): Promise<OperatingSystem> {
		return this._engine.getOS();
	}

	wrapCommand(command: string, requestUnsandboxedExecution?: boolean, shell?: string, cwd?: URI, commandDetails?: readonly ITerminalSandboxCommand[], requestAllowNetwork?: boolean): Promise<ITerminalSandboxWrapResult> {
		return this._engine.wrapCommand(command, requestUnsandboxedExecution, shell, cwd, commandDetails, requestAllowNetwork);
	}

	checkFileAccess(permission: TerminalSandboxFileAccessPermission, paths: readonly string[], precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<ITerminalSandboxFileAccessCheckResult> {
		return this._engine.checkFileAccess(permission, paths, precheckInputs);
	}

	checkForSandboxingPrereqs(forceRefresh: boolean = false, precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<ITerminalSandboxPrerequisiteCheckResult> {
		return this._engine.checkForSandboxingPrereqs(forceRefresh, precheckInputs);
	}

	getSandboxConfigPath(forceRefresh: boolean = false, precheckInputs?: ITerminalSandboxPrecheckInputs): Promise<string | undefined> {
		return this._engine.getSandboxConfigPath(forceRefresh, precheckInputs);
	}

	getTempDir(): URI | undefined {
		return this._engine.getTempDir();
	}

	setNeedsForceUpdateConfigFile(): void {
		this._engine.setNeedsForceUpdateConfigFile();
	}

	getResolvedNetworkDomains(): ITerminalSandboxResolvedNetworkDomains {
		return this._engine.getResolvedNetworkDomains();
	}

	getMissingSandboxDependencies(): Promise<string[]> {
		return this._engine.getMissingSandboxDependencies();
	}

	// ---- host adapter helpers -----------------------------------------------

	private async _resolveRemoteEnv(): Promise<IRemoteAgentEnvironment | null> {
		if (this._remoteEnvDetails === undefined) {
			this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
		}
		return this._remoteEnvDetails;
	}

	private async _resolveOS(): Promise<OperatingSystem> {
		const remoteEnv = await this._resolveRemoteEnv();
		return remoteEnv ? remoteEnv.os : OS;
	}

	private _readSandboxSetting<T>(settingId: string): T | undefined {
		return readSandboxSetting<T>(this._configurationService, this._logService, settingId);
	}

	private async _resolveRuntimeInfo(): Promise<ITerminalSandboxRuntimeInfo> {
		const remoteEnv = await this._resolveRemoteEnv();
		if (remoteEnv) {
			// Remote workbench: server resolves a real `node` binary, no env prefix needed.
			return { appRoot: remoteEnv.os === OperatingSystem.Windows ? this._toWindowsPath(remoteEnv.appRoot) : remoteEnv.appRoot.path, execPath: remoteEnv.execPath, runAsNode: false, arch: remoteEnv.arch, nativeModulesDir: 'node_modules' };
		}
		// Local workbench: app root is local and exec path points at the Electron binary,
		// so the engine must prefix `ELECTRON_RUN_AS_NODE=1` when invoking it.
		const localAppRootUri = FileAccess.asFileUri('');
		const localAppRoot = OS === OperatingSystem.Windows ? dirname(localAppRootUri.fsPath) : dirname(localAppRootUri.path);
		const nativeEnv = this._environmentService as IEnvironmentService & { execPath?: string };
		const nativeModulesDir = this._environmentService.isBuilt ? 'node_modules.asar.unpacked' : 'node_modules';
		return { appRoot: localAppRoot, execPath: nativeEnv.execPath, runAsNode: true, arch, nativeModulesDir };
	}

	private _toWindowsPath(uri: URI): string {
		let value: string;
		if (uri.authority && uri.path.length > 1 && uri.scheme === 'file') {
			value = `\\\\${uri.authority}${uri.path}`;
		} else if (/^\/[a-zA-Z]:/.test(uri.path)) {
			value = uri.path.slice(1);
		} else {
			value = uri.fsPath;
		}
		return value.replace(/\//g, '\\');
	}

	private async _resolveUserHome(): Promise<URI | undefined> {
		const remoteEnv = await this._resolveRemoteEnv();
		if (remoteEnv?.userHome) {
			return remoteEnv.userHome;
		}
		const nativeEnv = this._environmentService as IEnvironmentService & { userHome?: URI };
		return nativeEnv.userHome;
	}

	private async _resolveSandboxTempDir(): Promise<URI | undefined> {
		const remoteEnv = await this._resolveRemoteEnv();
		const sandboxTempDirName = this._getSandboxWindowTempDirName();
		if (remoteEnv?.userHome) {
			const sandboxRoot = URI.joinPath(remoteEnv.userHome, this._productService.serverDataFolderName ?? this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
			return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
		}

		const nativeEnv = this._environmentService as IEnvironmentService & { userHome?: URI };
		if (nativeEnv.userHome) {
			const sandboxRoot = URI.joinPath(nativeEnv.userHome, this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
			return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
		}
		return undefined;
	}

	private async _resolveWorkspaceStorageReadRoot(): Promise<URI | undefined> {
		const remoteEnv = await this._resolveRemoteEnv();
		const workspaceStorageHome = remoteEnv?.workspaceStorageHome ?? this._environmentService.workspaceStorageHome;
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return URI.joinPath(workspaceStorageHome, workspaceId);
	}

	private _getSandboxWindowTempDirName(): string | undefined {
		const workbenchEnv = this._environmentService as IEnvironmentService & { window?: { id?: number } };
		const windowId = workbenchEnv.window?.id;
		return typeof windowId === 'number' ? `tmp_vscode_${windowId}` : undefined;
	}

	private async _resolveSandboxDependencyStatus(): Promise<ISandboxDependencyStatus | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.checkSandboxDependencies();
			});
		}
		return this._sandboxHelperService.checkSandboxDependencies();
	}

	private async _resolveWindowsMxcFilesystemPolicy(): Promise<IWindowsMxcFilesystemPolicy | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.getWindowsMxcFilesystemPolicy();
			});
		}
		return this._sandboxHelperService.getWindowsMxcFilesystemPolicy();
	}

	private async _resolveWindowsMxcEnvironment(): Promise<string[] | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.getWindowsMxcEnvironment();
			});
		}
		return this._sandboxHelperService.getWindowsMxcEnvironment();
	}

	private async _resolveWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment): Promise<IWindowsMxcConfig | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, channel => {
				const sandboxHelper = new SandboxHelperChannelClient(channel);
				return sandboxHelper.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
			});
		}
		return this._sandboxHelperService.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
	}

	// ---- workbench-only flows -----------------------------------------------

	async installMissingSandboxDependencies(missingDependencies: string[], sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult> {
		const depsList = missingDependencies.join(' ');
		return this._runSandboxPrerequisiteCommand(`sudo apt install -y ${depsList}`, sessionResource, token, options);
	}

	async runSandboxRemediation(remediation: TerminalSandboxPreCheckRemediation, sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult> {
		let command: string;
		switch (remediation) {
			case TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction:
				command = 'sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0';
				break;
			default:
				throw new Error('Unsupported sandbox remediation');
		}
		return this._runSandboxPrerequisiteCommand(command, sessionResource, token, options);
	}

	private async _runSandboxPrerequisiteCommand(command: string, sessionResource: URI | undefined, token: CancellationToken, options: ISandboxDependencyInstallOptions): Promise<ISandboxDependencyInstallResult> {
		const instance = await options.createTerminal();

		// Wait for the install command to finish so the chat can proceed automatically.
		let installCommandSent = false;
		const completionPromise = new Promise<number | undefined>(resolve => {
			const store = new DisposableStore();
			let resolved = false;
			const resolveOnce = (code: number | undefined) => {
				if (resolved) {
					return;
				}
				resolved = true;
				store.dispose();
				resolve(code);
			};

			const attachListener = () => {
				const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (detection) {
					store.add(detection.onCommandFinished(cmd => resolveOnce(cmd.exitCode)));
				}
			};

			attachListener();
			store.add(instance.capabilities.onDidAddCapability(e => {
				if (e.id === TerminalCapability.CommandDetection) {
					attachListener();
				}
			}));

			// Handle terminal disposal
			store.add(instance.onDisposed(() => resolveOnce(undefined)));

			// Handle cancellation
			store.add(token.onCancellationRequested(() => resolveOnce(undefined)));

			// Safety timeout — 5 minutes should be enough for package or system-policy remediation.
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
		await instance.sendText(command, true);
		installCommandSent = true;

		return { exitCode: await completionPromise };
	}

	/**
	 * Shows a chat elicitation that keeps the "Install" flow grounded in chat while
	 * the user focuses the terminal and types a sudo password.
	 */
	private _createMissingDependencyPasswordPrompt(sessionResource: URI | undefined, promptContext: ISandboxDependencyInstallTerminalContext, token: CancellationToken): DisposableStore {
		const chatModel = sessionResource && this._chatService.getSession(sessionResource);
		if (!(chatModel instanceof ChatModel)) {
			return new DisposableStore();
		}

		const request = chatModel.getRequests().at(-1);
		if (!request) {
			return new DisposableStore();
		}

		const part = new ChatElicitationRequestPart(
			localize('runInTerminal.missingDeps.passwordPromptTitle', "The terminal is awaiting input."),
			new MarkdownString(localize(
				'runInTerminal.missingDeps.passwordPromptMessage',
				"Applying sandbox prerequisites may prompt for your sudo password. Select Focus Terminal to type it in the terminal."
			)),
			'',
			localize('runInTerminal.missingDeps.focusTerminal', 'Focus Terminal'),
			undefined,
			async () => {
				await promptContext.focusTerminal();
				return ElicitationState.Pending;
			}
		);
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

}

