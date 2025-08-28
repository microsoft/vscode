/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import PQueue from 'p-queue';
import * as fs from '../common/platform/fs-paths';
import { ProductNames } from '../common/installer/productNames';
import { InstallOptions, ModuleInstallFlags } from '../common/installer/types';

import {
    IConfigurationService,
    IInstaller,
    IInterpreterPathService,
    InstallerResponse,
    Product,
    ProductInstallStatus,
} from '../common/types';
import { IServiceContainer } from '../ioc/types';
import { ErdosSupervisorApi, JupyterKernelSpec, JupyterLanguageRuntimeSession } from '../erdos-supervisor.d';
import { traceInfo, traceWarn } from '../logging';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { PythonLsp, LspState } from './lsp';
import { IPYKERNEL_VERSION } from '../common/constants';
import { IEnvironmentVariablesProvider, IEnvironmentVariablesService } from '../common/variables/types';
import { PythonRuntimeExtraData } from './runtime';
import { JediLanguageServerAnalysisOptions } from '../activation/jedi/analysisOptions';
import { ILanguageServerOutputChannel } from '../activation/types';
import { IWorkspaceService } from '../common/application/types';
import { IInterpreterService } from '../interpreter/contracts';
import { showErrorMessage } from '../common/vscodeApis/windowApis';
import { Console } from '../common/utils/localize';
import { IpykernelBundle } from './ipykernel';
import { whenTimeout } from './util';

const _uninstallCommandRegex = /(pip|pipenv|conda).*uninstall|poetry.*remove/;

export class PythonRuntimeSession implements erdos.LanguageRuntimeSession, vscode.Disposable {
    private _lsp: PythonLsp | undefined;

    private _lspQueue: PQueue;

    private _lspStartingPromise: Promise<number> = Promise.resolve(0);

    private _lspClientId?: string;

    private _kernel?: JupyterLanguageRuntimeSession;

    private _messageEmitter = new vscode.EventEmitter<erdos.LanguageRuntimeMessage>();

    private _stateEmitter = new vscode.EventEmitter<erdos.RuntimeState>();

    private _exitEmitter = new vscode.EventEmitter<erdos.LanguageRuntimeExit>();

    private adapterApi?: ErdosSupervisorApi;

    private _consoleWidthDisposable?: vscode.Disposable;

    private _state: erdos.RuntimeState = erdos.RuntimeState.Uninitialized;

    private _installer: IInstaller;

    private _interpreterService: IInterpreterService;

    private _interpreterPathService: IInterpreterPathService;

    private _envVarsService: IEnvironmentVariablesService;

    private _parentIdsByOutputCommId = new Map<string, string>();

    private _pythonPath: string;

    private _ipykernelBundle: IpykernelBundle;

    private _isExternallyManaged: boolean;

    dynState: erdos.LanguageRuntimeDynState;

    onDidReceiveRuntimeMessage = this._messageEmitter.event;

    onDidChangeRuntimeState = this._stateEmitter.event;

    onDidEndSession = this._exitEmitter.event;

    constructor(
        readonly runtimeMetadata: erdos.LanguageRuntimeMetadata,
        readonly metadata: erdos.RuntimeSessionMetadata,
        readonly serviceContainer: IServiceContainer,
        readonly kernelSpec?: JupyterKernelSpec | undefined,
        sessionName?: string,
    ) {
        const extraData: PythonRuntimeExtraData = runtimeMetadata.extraRuntimeData as PythonRuntimeExtraData;
        if (!extraData || !extraData.pythonPath) {
            throw new Error(`Runtime metadata missing Python path: ${JSON.stringify(runtimeMetadata)}`);
        }
        if (!extraData.ipykernelBundle) {
            throw new Error(`Runtime metadata missing ipykernel bundle data: ${JSON.stringify(runtimeMetadata)}`);
        }
        this._pythonPath = extraData.pythonPath;
        this._ipykernelBundle = extraData.ipykernelBundle;
        this._isExternallyManaged = extraData.externallyManaged ?? false;

        this._lspQueue = new PQueue({ concurrency: 1 });

        this.dynState = {
            sessionName: sessionName || runtimeMetadata.runtimeName,
            inputPrompt: '>>>',
            continuationPrompt: '...',
        };

        this.onDidChangeRuntimeState(async (state) => {
            await this.onStateChange(state);
        });

        this._installer = this.serviceContainer.get<IInstaller>(IInstaller);
        this._interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
        this._interpreterPathService = serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        this._envVarsService = serviceContainer.get<IEnvironmentVariablesService>(IEnvironmentVariablesService);
    }

    execute(
        code: string,
        id: string,
        mode: erdos.RuntimeCodeExecutionMode,
        errorBehavior: erdos.RuntimeErrorBehavior,
    ): void {
        if (this._kernel) {
            if (this._isUninstallBundledPackageCommand(code, id)) {
                return;
            }

            this._kernel.execute(code, id, mode, errorBehavior);
        } else {
            throw new Error(`Cannot execute '${code}'; kernel not started`);
        }
    }

    private _isUninstallBundledPackageCommand(code: string, id: string): boolean {
        if (!_uninstallCommandRegex.test(code)) {
            return false;
        }

        const protectedPackages = (this._ipykernelBundle.paths ?? [])
            .flatMap((path) => fs.readdirSync(path).map((name) => ({ parent: path, name })))
            .filter(({ name }) => code.includes(name));
        if (protectedPackages.length === 0) {
            return false;
        }

        const protectedPackagesStr = protectedPackages
            .map(({ parent, name }) => vscode.l10n.t('- {0} (from {1})', name, parent))
            .join('\n');
        this._messageEmitter.fire({
            id: `${id}-0`,
            parent_id: id,
            when: new Date().toISOString(),
            type: erdos.LanguageRuntimeMessageType.Stream,
            name: erdos.LanguageRuntimeStreamName.Stdout,
            text: vscode.l10n.t(
                'Cannot uninstall the following packages:\n\n{0}\n\n' +
                    'These packages are bundled with Erdos, ' +
                    "and removing them would break Erdos's Python functionality.\n\n" +
                    'If you would like to uninstall these packages from the active environment, ' +
                    'please rerun `{1}` in a terminal.',
                protectedPackagesStr,
                code,
            ),
        } as erdos.LanguageRuntimeStream);
        this._messageEmitter.fire({
            id: `${id}-1`,
            parent_id: id,
            when: new Date().toISOString(),
            type: erdos.LanguageRuntimeMessageType.State,
            state: erdos.RuntimeOnlineState.Idle,
        } as erdos.LanguageRuntimeState);
        return true;
    }

    callMethod(method: string, ...args: any[]): Thenable<any> {
        if (this._kernel) {
            return this._kernel.callMethod(method, ...args);
        } else {
            throw new Error(`Cannot call method '${method}'; kernel not started`);
        }
    }

    isCodeFragmentComplete(code: string): Thenable<erdos.RuntimeCodeFragmentStatus> {
        if (this._kernel) {
            return this._kernel.isCodeFragmentComplete(code);
        } else {
            throw new Error(`Cannot check code fragment '${code}'; kernel not started`);
        }
    }

    createClient(id: string, type: erdos.RuntimeClientType, params: any, metadata?: any): Thenable<void> {
        if (this._kernel) {
            return this._kernel.createClient(id, type, params, metadata);
        } else {
            throw new Error(`Cannot create client of type '${type}'; kernel not started`);
        }
    }

    listClients(type?: erdos.RuntimeClientType | undefined): Thenable<Record<string, string>> {
        if (this._kernel) {
            return this._kernel.listClients(type);
        } else {
            throw new Error(`Cannot list clients; kernel not started`);
        }
    }

    removeClient(id: string): void {
        if (this._kernel) {
            this._kernel.removeClient(id);
        } else {
            throw new Error(`Cannot remove client ${id}; kernel not started`);
        }
    }

    sendClientMessage(clientId: string, messageId: string, message: any): void {
        if (this._kernel) {
            this._kernel.sendClientMessage(clientId, messageId, message);
        } else {
            throw new Error(`Cannot send message to client ${clientId}; kernel not started`);
        }
    }

    replyToPrompt(id: string, reply: string): void {
        if (this._kernel) {
            this._kernel.replyToPrompt(id, reply);
        } else {
            throw new Error(`Cannot reply to prompt ${id}; kernel not started`);
        }
    }

    async setWorkingDirectory(dir: string): Promise<void> {
        if (this._kernel) {
            const loaded = await this._kernel.callMethod('isModuleLoaded', 'os');
            let code = '';
            if (!loaded) {
                code = 'import os; ';
            }
            dir = dir.replace(/\\/g, '\\\\');

            dir = dir.replace(/'/g, "\\'");

            code += `os.chdir('${dir}')`;

            this._kernel.execute(
                code,
                createUniqueId(),
                erdos.RuntimeCodeExecutionMode.Interactive,
                erdos.RuntimeErrorBehavior.Continue,
            );
        } else {
            throw new Error(`Cannot set working directory to ${dir}; kernel not started`);
        }
    }

    private async _setupIpykernel(interpreter: PythonEnvironment, kernelSpec: JupyterKernelSpec): Promise<void> {
        const didUseBundledIpykernel = await this._addBundledIpykernelToPythonPath(interpreter, kernelSpec);

        if (!didUseBundledIpykernel) {
            await this._installIpykernel(interpreter);
        }
    }

    private async _addBundledIpykernelToPythonPath(
        interpreter: PythonEnvironment,
        kernelSpec: JupyterKernelSpec,
    ): Promise<boolean> {
        if (this._ipykernelBundle.disabledReason || !this._ipykernelBundle.paths) {
            traceInfo(`Not using bundled ipykernel. Reason: ${this._ipykernelBundle.disabledReason}`);
            return false;
        }

        traceInfo(`Using bundled ipykernel for interpreter: ${interpreter.path}`);
        if (!kernelSpec?.env) {
            kernelSpec.env = {};
        }
        for (const path of this._ipykernelBundle.paths) {
            this._envVarsService.appendPythonPath(kernelSpec.env, path);
        }

        return true;
    }

    private async _installIpykernel(interpreter: PythonEnvironment): Promise<void> {
        const hasCompatibleKernel = await this._installer.isProductVersionCompatible(
            Product.ipykernel,
            IPYKERNEL_VERSION,
            interpreter,
        );

        if (hasCompatibleKernel !== ProductInstallStatus.Installed) {
            const hasSqlite3 = await this._installer.isInstalled(Product.sqlite3, interpreter);
            if (!hasSqlite3) {
                throw new Error(
                    `The Python sqlite3 extension is required but not installed for interpreter: ${interpreter?.displayName}. Missing the system library for SQLite?`,
                );
            }

            const hasPip = await this._installer.isInstalled(Product.pip, interpreter);

            const tokenSource = new vscode.CancellationTokenSource();
            const installerToken = tokenSource.token;

            const installOptions: InstallOptions = { installAsProcess: true };
            const installOrUpgrade = hasCompatibleKernel === ProductInstallStatus.NeedsUpgrade ? 'upgrade' : 'install';

            const product = Product.ipykernel;

            let message;
            if (!hasPip) {
                message = vscode.l10n.t(
                    'To enable Python support, Erdos needs to {0} the packages <code>{1}</code> and <code>{2}</code> for the active interpreter {3} at: <code>{4}</code>.',
                    installOrUpgrade,
                    ProductNames.get(Product.pip)!,
                    ProductNames.get(product)!,
                    `Python ${this.runtimeMetadata.languageVersion}`,
                    this.runtimeMetadata.runtimePath,
                );
            } else {
                message = vscode.l10n.t(
                    'To enable Python support, Erdos needs to {0} the package <code>{1}</code> for the active interpreter {2} at: <code>{3}</code>.',
                    installOrUpgrade,
                    ProductNames.get(product)!,
                    `Python ${this.runtimeMetadata.languageVersion}`,
                    this.runtimeMetadata.runtimePath,
                );
            }

            const response = await this._installer.promptToInstall(
                product,
                interpreter,
                installerToken,
                ModuleInstallFlags.installPipIfRequired,
                installOptions,
                message,
            );

            switch (response) {
                case InstallerResponse.Installed:
                    traceInfo(`Successfully installed ipykernel for ${interpreter?.displayName}`);
                    break;
                case InstallerResponse.Ignore:
                case InstallerResponse.Disabled:
                    throw new Error(
                        `Could not start runtime: failed to install ipykernel for ${interpreter?.displayName}.`,
                    );
                default:
                    throw new Error(`Unknown installer response type: ${response}`);
            }
        }
    }

    async start(): Promise<erdos.LanguageRuntimeInfo> {
        const interpreter = await this._interpreterService.getInterpreterDetails(this._pythonPath);
        if (!interpreter) {
            throw new Error(`Could not start runtime: failed to resolve interpreter ${this._pythonPath}`);
        }

        if (this.kernelSpec) {
            await this._setupIpykernel(interpreter, this.kernelSpec);
        }

        if (!this._lsp) {
            await this.createLsp(interpreter);
        }

        if (!this._kernel) {
            this._kernel = await this.createKernel();
        }

        if (this.metadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console && !this._isExternallyManaged) {
            this._interpreterPathService.update(
                undefined,
                vscode.ConfigurationTarget.WorkspaceFolder,
                interpreter.path,
            );
        }

        if (!this._consoleWidthDisposable) {
            this._consoleWidthDisposable = erdos.window.onDidChangeConsoleWidth((newWidth) => {
                this.onConsoleWidthChange(newWidth);
            });
        }

        return this._kernel!.start().then((info) => {
            if (this.kernelSpec) {
                this.enableAutoReloadIfEnabled(info);
            }
            return info;
        });
    }

    private async onConsoleWidthChange(newWidth: number): Promise<void> {
        if (!this._kernel) {
            return;
        }

        if (this._state === erdos.RuntimeState.Exited) {
            return;
        }

        try {
            await this.callMethod('setConsoleWidth', newWidth);
        } catch (err) {
            const runtimeError = err as erdos.RuntimeMethodError;
            this._kernel.emitJupyterLog(
                `Error setting console width: ${runtimeError.message} (${runtimeError.code})`,
                vscode.LogLevel.Error,
            );
        }
    }

    async interrupt(): Promise<void> {
        if (this._kernel) {
            return this._kernel.interrupt();
        } else {
            throw new Error('Cannot interrupt; kernel not started');
        }
    }

    private async createLsp(interpreter: PythonEnvironment): Promise<void> {
        const environmentService = this.serviceContainer.get<IEnvironmentVariablesProvider>(
            IEnvironmentVariablesProvider,
        );
        const outputChannel = this.serviceContainer.get<ILanguageServerOutputChannel>(ILanguageServerOutputChannel);
        const configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);

        const analysisOptions = new JediLanguageServerAnalysisOptions(
            environmentService,
            outputChannel,
            configService,
            workspaceService,
        );

        const resource = workspaceService.workspaceFolders?.[0].uri;
        await analysisOptions.initialize(resource, interpreter);
        const languageClientOptions = await analysisOptions.getAnalysisOptions();

        this._lsp = new PythonLsp(
            this.serviceContainer,
            this.runtimeMetadata.languageVersion,
            languageClientOptions,
            this.metadata,
            this.dynState,
        );
    }

    async activateLsp(reason: string): Promise<void> {
        this._kernel?.emitJupyterLog(
            `Queuing LSP activation. Reason: ${reason}. ` +
                `Queue size: ${this._lspQueue.size}, ` +
                `pending: ${this._lspQueue.pending}`,
            vscode.LogLevel.Debug,
        );
        return this._lspQueue.add(async () => {
            if (!this._kernel) {
                traceWarn('Cannot activate LSP; kernel not started');
                return;
            }

            this._kernel.emitJupyterLog(
                `LSP activation started. Reason: ${reason}. ` +
                    `Queue size: ${this._lspQueue.size}, ` +
                    `pending: ${this._lspQueue.pending}`,
                vscode.LogLevel.Debug,
            );

            if (!this._lsp) {
                this._kernel.emitJupyterLog(
                    'Tried to activate LSP but no LSP instance is available',
                    vscode.LogLevel.Warning,
                );
                return;
            }

            if (this._lsp.state !== LspState.stopped && this._lsp.state !== LspState.uninitialized) {
                this._kernel.emitJupyterLog('LSP already active', vscode.LogLevel.Debug);
                return;
            }

            this._kernel.emitJupyterLog('Starting Erdos LSP server');

            this._lspClientId = this._kernel.createErdosLspClientId();
            this._lspStartingPromise = this._kernel.startErdosLsp(this._lspClientId, '127.0.0.1');
            let port: number;
            try {
                port = await this._lspStartingPromise;
            } catch (err) {
                this._kernel.emitJupyterLog(`Error starting Erdos LSP: ${err}`, vscode.LogLevel.Error);
                return;
            }

            this._kernel.emitJupyterLog(`Starting Erdos LSP client on port ${port}`);

            await this._lsp.activate(port);
        });
    }

    async deactivateLsp(reason: string): Promise<void> {
        this._kernel?.emitJupyterLog(
            `Queuing LSP deactivation. Reason: ${reason}. ` +
                `Queue size: ${this._lspQueue.size}, ` +
                `pending: ${this._lspQueue.pending}`,
            vscode.LogLevel.Debug,
        );
        return this._lspQueue.add(async () => {
            this._kernel?.emitJupyterLog(
                `LSP deactivation started. Reason: ${reason}. ` +
                    `Queue size: ${this._lspQueue.size}, ` +
                    `pending: ${this._lspQueue.pending}`,
                vscode.LogLevel.Debug,
            );
            if (!this._lsp || this._lsp.state !== LspState.running) {
                this._kernel?.emitJupyterLog('LSP already deactivated', vscode.LogLevel.Debug);
                return;
            }

            this._kernel?.emitJupyterLog(`Stopping Erdos LSP server, reason: ${reason}`);
            await this._lsp.deactivate();
            if (this._lspClientId) {
                this._kernel?.removeClient(this._lspClientId);
                this._lspClientId = undefined;
            }
            this._kernel?.emitJupyterLog(`Erdos LSP server stopped`, vscode.LogLevel.Debug);
        });
    }

    async restart(workingDirectory?: string): Promise<void> {
        if (this._kernel) {
            this._kernel.emitJupyterLog('Restarting');
            const timedOut = await Promise.race([
                this._lspStartingPromise.ignoreErrors(),
                whenTimeout(400, () => true),
            ]);
            if (timedOut) {
                this._kernel.emitJupyterLog(
                    'LSP startup timed out during interpreter restart',
                    vscode.LogLevel.Warning,
                );
            }
            await this.deactivateLsp('restarting session');
            return this._kernel.restart(workingDirectory);
        } else {
            throw new Error('Cannot restart; kernel not started');
        }
    }

    async shutdown(exitReason = erdos.RuntimeExitReason.Shutdown): Promise<void> {
        if (this._kernel) {
            this._kernel.emitJupyterLog('Shutting down');
            await this.deactivateLsp('shutting down session');
            return this._kernel.shutdown(exitReason);
        } else {
            throw new Error('Cannot shutdown; kernel not started');
        }
    }

    showOutput(channel?: erdos.LanguageRuntimeSessionChannel): void {
        if (channel === erdos.LanguageRuntimeSessionChannel.LSP) {
            this._lsp?.showOutput();
        } else {
            this._kernel?.showOutput(channel);
        }
    }

    listOutputChannels(): erdos.LanguageRuntimeSessionChannel[] {
        const channels = this._kernel?.listOutputChannels?.() ?? [];
        return [...channels, erdos.LanguageRuntimeSessionChannel.LSP];
    }

    async forceQuit(): Promise<void> {
        if (this._kernel) {
            this._kernel.emitJupyterLog('Force quitting');
            await Promise.race([
                this.deactivateLsp('force quitting session'),
                new Promise((resolve) => setTimeout(resolve, 250)),
            ]);
            return this._kernel.forceQuit();
        } else {
            throw new Error('Cannot force quit; kernel not started');
        }
    }

    async dispose() {
        this._consoleWidthDisposable?.dispose();
        this._consoleWidthDisposable = undefined;

        if (this._lsp) {
            await this._lsp.dispose();
        }
        if (this._kernel) {
            await this._kernel.dispose();
        }
    }

    updateSessionName(sessionName: string): void {
        this.dynState.sessionName = sessionName;
        this._kernel?.updateSessionName(sessionName);
    }

    private async createKernel(): Promise<JupyterLanguageRuntimeSession> {
        const ext = vscode.extensions.getExtension('erdos.erdos-supervisor');
        if (!ext) {
            throw new Error('Erdos Supervisor extension not found');
        }
        if (!ext.isActive) {
            await ext.activate();
        }
        this.adapterApi = ext?.exports as ErdosSupervisorApi;
        const kernel = this.kernelSpec
            ? await this.adapterApi.createSession(
                  this.runtimeMetadata,
                  this.metadata,
                  this.kernelSpec,
                  this.dynState,
                  createJupyterKernelExtra(),
              )
            : await this.adapterApi.restoreSession(this.runtimeMetadata, this.metadata, this.dynState);

        kernel.onDidChangeRuntimeState((state) => {
            this._stateEmitter.fire(state);
        });
        kernel.onDidReceiveRuntimeMessage((message) => {
            if (message.type === erdos.LanguageRuntimeMessageType.CommData) {
                const commMessage = message as erdos.LanguageRuntimeCommMessage;
                const data = commMessage.data as any;
                if (
                    'method' in data &&
                    data.method === 'update' &&
                    'state' in data &&
                    typeof data.state === 'object' &&
                    data.state !== null &&
                    'msg_id' in data.state &&
                    typeof data.state.msg_id === 'string'
                ) {
                    if (data.state.msg_id.length > 0) {
                        this._parentIdsByOutputCommId.set(commMessage.comm_id, data.state.msg_id);
                    } else {
                        this._parentIdsByOutputCommId.delete(commMessage.comm_id);
                    }
                }
            } else if (
                message.type !== erdos.LanguageRuntimeMessageType.CommClosed &&
                message.type !== erdos.LanguageRuntimeMessageType.CommOpen &&
                message.type !== erdos.LanguageRuntimeMessageType.State &&
                Array.from(this._parentIdsByOutputCommId.values()).some((parentId) => parentId === message.parent_id)
            ) {
                message = {
                    ...message,
                    type: erdos.LanguageRuntimeMessageType.IPyWidget,
                    original_message: message,
                } as erdos.LanguageRuntimeMessageIPyWidget;
            }

            this._messageEmitter.fire(message);
        });
        kernel.onDidEndSession(async (exit) => {
            this._exitEmitter.fire(exit);
            if (exit.exit_code !== 0) {
                await this.showExitMessageWithLogs(kernel);
            }
        });
        return kernel;
    }

    private async onStateChange(state: erdos.RuntimeState): Promise<void> {
        this._state = state;
        if (state === erdos.RuntimeState.Ready) {
            await this.setConsoleWidth();
        } else if (state === erdos.RuntimeState.Exited) {
            await this.deactivateLsp('session exited');
        }
    }

    private async setConsoleWidth(): Promise<void> {
        try {
            const width = await erdos.window.getConsoleWidth();
            this.callMethod('setConsoleWidth', width);
            this._kernel?.emitJupyterLog(`Set initial console width to ${width}`);
        } catch (err) {
            const runtimeError = err as erdos.RuntimeMethodError;
            this._kernel?.emitJupyterLog(
                `Error setting initial console width: ${runtimeError.message} (${runtimeError.code})`,
                vscode.LogLevel.Error,
            );
        }
    }

    private enableAutoReloadIfEnabled(info: erdos.LanguageRuntimeInfo): void {
        const configurationService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const settings = configurationService.getSettings();
        if (settings.enableAutoReload) {
            this._kernel?.execute(
                '%load_ext autoreload\n%autoreload 2',
                createUniqueId(),
                erdos.RuntimeCodeExecutionMode.Silent,
                erdos.RuntimeErrorBehavior.Continue,
            );

            const settingUri = `erdos://settings/python.enableAutoReload`;
            const banner = vscode.l10n.t(
                'Automatic import reloading for Python is enabled. It can be disabled with the \x1b]8;;{0}\x1b\\python.enableAutoReload setting\x1b]8;;\x1b\\.',
                settingUri,
            );
            info.banner += banner;
        }
    }

    private async showExitMessageWithLogs(kernel: JupyterLanguageRuntimeSession): Promise<void> {
        const logFilePath = kernel.getKernelLogFile();

        if (fs.existsSync(logFilePath)) {
            const lines = fs.readFileSync(logFilePath, 'utf8').split('\n');
            const lastLine = lines.length - 3;
            const logFileContent = lines.slice(lastLine - 1, lastLine).join('\n');

            const regex = /^(\w*Error|Exception)\b/m;
            const errortext = regex.test(logFileContent)
                ? vscode.l10n.t(
                      '{0} exited unexpectedly with error: {1}',
                      kernel.runtimeMetadata.runtimeName,
                      logFileContent,
                  )
                : Console.consoleExitGeneric;

            const res = await showErrorMessage(errortext, vscode.l10n.t('Open Logs'));
            if (res) {
                kernel.showOutput();
            }
        }
    }
}

export function createUniqueId(): string {
    return Math.floor(Math.random() * 0x100000000).toString(16);
}

export function createJupyterKernelExtra(): undefined {
    return undefined;
}

export async function getActivePythonSessions(): Promise<PythonRuntimeSession[]> {
    const sessions = await erdos.runtime.getActiveSessions();
    return sessions.filter((session) => session instanceof PythonRuntimeSession) as PythonRuntimeSession[];
}
