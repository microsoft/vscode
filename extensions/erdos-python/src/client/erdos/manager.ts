/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as portfinder from 'portfinder';
import * as erdos from 'erdos';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

import { Event, EventEmitter, Disposable } from 'vscode';
import { inject, injectable } from 'inversify';
import * as fs from '../common/platform/fs-paths';
import { IServiceContainer } from '../ioc/types';
import { pythonRuntimeDiscoverer } from './discoverer';
import { IInterpreterService } from '../interpreter/contracts';
import { traceError, traceInfo, traceLog } from '../logging';
import {
    IConfigurationService,
    IDisposable,
    IDisposableRegistry,
    IInstaller,
    InstallerResponse,
    Product,
} from '../common/types';
import { PythonRuntimeSession } from './session';
import { createPythonRuntimeMetadata, PythonRuntimeExtraData } from './runtime';
import { Commands, EXTENSION_ROOT_DIR } from '../common/constants';
import { JupyterKernelSpec } from '../erdos-supervisor.d';
import { IEnvironmentVariablesProvider } from '../common/variables/types';
import { shouldIncludeInterpreter, getUserDefaultInterpreter } from './interpreterSettings';
import { hasFiles } from './util';
import { isProblematicCondaEnvironment } from '../interpreter/configuration/environmentTypeComparer';
import { EnvironmentType } from '../pythonEnvironments/info';
import { IApplicationShell } from '../common/application/types';
import { Interpreters } from '../common/utils/localize';
import { untildify } from '../common/helpers';

export const IPythonRuntimeManager = Symbol('IPythonRuntimeManager');

export interface IPythonRuntimeManager extends erdos.LanguageRuntimeManager {
    onDidCreateSession: Event<PythonRuntimeSession>;

    registerLanguageRuntimeFromPath(
        pythonPath: string,
        recreateRuntime?: boolean,
    ): Promise<erdos.LanguageRuntimeMetadata | undefined>;
    selectLanguageRuntimeFromPath(pythonPath: string, recreateRuntime?: boolean): Promise<void>;
}

@injectable()
export class PythonRuntimeManager implements IPythonRuntimeManager, Disposable {
    readonly registeredPythonRuntimes: Map<string, erdos.LanguageRuntimeMetadata> = new Map();

    private disposables: IDisposable[] = [];

    private readonly _onDidDiscoverRuntime = new EventEmitter<erdos.LanguageRuntimeMetadata>();

    private readonly _onDidCreateSession = new EventEmitter<PythonRuntimeSession>();

    public readonly onDidDiscoverRuntime = this._onDidDiscoverRuntime.event;

    public readonly onDidCreateSession = this._onDidCreateSession.event;

    constructor(
        @inject(IServiceContainer) private readonly serviceContainer: IServiceContainer,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
    ) {
        const disposables = this.serviceContainer.get<Disposable[]>(IDisposableRegistry);
        disposables.push(this);

        const registration = erdos.runtime.registerLanguageRuntimeManager('python', this);
        this.disposables.push(registration);

        this.disposables.push(
            interpreterService.onDidChangeInterpreters(async (event) => {
                if (!event.old && event.new) {
                    const interpreterPath = event.new.path;
                    await checkAndInstallPython(interpreterPath, serviceContainer);
                    await this.registerLanguageRuntimeFromPath(interpreterPath);
                }
            }),

            interpreterService.onDidChangeInterpreter(async (workspaceUri) => {
                const interpreter = await interpreterService.getActiveInterpreter(workspaceUri);
                if (!interpreter) {
                    traceError(
                        `Interpreter not found; could not select language runtime. Workspace: ${workspaceUri?.fsPath}`,
                    );
                    return;
                }
                await this.selectLanguageRuntimeFromPath(interpreter.path);
            }),
        );
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    discoverAllRuntimes(): AsyncGenerator<erdos.LanguageRuntimeMetadata> {
        return this.discoverPythonRuntimes();
    }

    private async recommendedWorkspaceInterpreterPath(
        workspaceUri: vscode.Uri | undefined,
    ): Promise<{ path: string | undefined; isImmediate: boolean }> {
        const userInterpreterSettings = getUserDefaultInterpreter(workspaceUri);
        let interpreterPath: string | undefined;
        let isImmediate = false;

        if (!workspaceUri) {
            if (userInterpreterSettings.globalValue) {
                interpreterPath = userInterpreterSettings.globalValue;
                isImmediate = true;
            } else {
                return { path: undefined, isImmediate };
            }
        } else if (await hasFiles(['.venv/**/*'])) {
            interpreterPath = path.join(workspaceUri.fsPath, '.venv', 'bin', 'python');
            isImmediate = true;
        } else if (await hasFiles(['.conda/**/*'])) {
            interpreterPath = path.join(workspaceUri.fsPath, '.conda', 'bin', 'python');
            isImmediate = true;
        } else if (await hasFiles(['*/bin/python'])) {
            const files = await vscode.workspace.findFiles('*/bin/python', '**/node_modules/**');
            if (files.length > 0) {
                interpreterPath = files[0].fsPath;
                isImmediate = true;
            }
        } else {
            interpreterPath =
                userInterpreterSettings.workspaceValue ||
                userInterpreterSettings.workspaceFolderValue ||
                userInterpreterSettings.globalValue;
        }

        return { path: interpreterPath, isImmediate };
    }

    async recommendedWorkspaceRuntime(): Promise<erdos.LanguageRuntimeMetadata | undefined> {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        let { path: interpreterPath, isImmediate } = await this.recommendedWorkspaceInterpreterPath(workspaceUri);

        if (interpreterPath) {
            interpreterPath = untildify(interpreterPath);
            const interpreter = await this.interpreterService.getInterpreterDetails(interpreterPath, workspaceUri);
            if (interpreter) {
                const metadata = await createPythonRuntimeMetadata(interpreter, this.serviceContainer, isImmediate);
                traceInfo(`Recommended runtime for workspace: ${interpreter.path}`);
                return metadata;
            }
        }
        traceInfo('No recommended workspace runtime found.');
        return undefined;
    }

    public registerLanguageRuntime(runtime: erdos.LanguageRuntimeMetadata): void {
        const extraData = runtime.extraRuntimeData as PythonRuntimeExtraData;

        if (shouldIncludeInterpreter(extraData.pythonPath)) {
            this.registeredPythonRuntimes.set(extraData.pythonPath, runtime);
            this._onDidDiscoverRuntime.fire(runtime);
        } else {
            traceInfo(`Not registering runtime ${extraData.pythonPath} as it is excluded via user settings.`);
        }
    }

    async createSession(
        runtimeMetadata: erdos.LanguageRuntimeMetadata,
        sessionMetadata: erdos.RuntimeSessionMetadata,
    ): Promise<erdos.LanguageRuntimeSession> {
        traceInfo('createPythonSession: getting service instances');

        const configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const environmentVariablesProvider = this.serviceContainer.get<IEnvironmentVariablesProvider>(
            IEnvironmentVariablesProvider,
        );

        const extraData: PythonRuntimeExtraData = runtimeMetadata.extraRuntimeData as PythonRuntimeExtraData;
        
        if (!extraData || !extraData.pythonPath) {
            throw new Error(`Runtime metadata missing Python path: ${JSON.stringify(extraData)}`);
        }
        
        traceInfo('createPythonSession: getting extension runtime settings');

        const settings = configService.getSettings();
        const debug = settings.languageServerDebug;
        const logLevel = settings.languageServerLogLevel;
        const { quietMode } = settings;

        traceInfo('createPythonSession: locating available debug port');
        let debugPort;
        if (debug) {
            if (debugPort === undefined) {
                debugPort = 5678;
            }
            debugPort = await portfinder.getPortPromise({ port: debugPort });
        }

        const command = extraData.pythonPath;
        const lsScriptPath = path.join(EXTENSION_ROOT_DIR, 'python_files', 'lotas', 'erdos_language_server.py');
        const args = [
            command,
            lsScriptPath,
            '-f',
            '{connection_file}',
            '--logfile',
            '{log_file}',
            `--loglevel=${logLevel}`,
            `--session-mode=${sessionMetadata.sessionMode}`,
        ];
        if (debugPort) {
            args.push(`--debugport=${debugPort}`);
        }
        if (quietMode) {
            args.push('--quiet');
        }

        const env = await environmentVariablesProvider.getEnvironmentVariables();
        if (sessionMetadata.sessionMode === erdos.LanguageRuntimeSessionMode.Console) {
            env.PLOTLY_RENDERER = 'browser';
        }
        const kernelSpec: JupyterKernelSpec = {
            argv: args,
            display_name: `${runtimeMetadata.runtimeName}`,
            language: 'Python',
            interrupt_mode: os.platform() === 'win32' ? 'signal' : 'message',
            kernel_protocol_version: '5.3',
            env,
        };

        traceInfo(`createPythonSession: kernelSpec argv: ${args}`);

        traceInfo(`createPythonSession: creating PythonRuntime`);
        return this.createPythonSession(runtimeMetadata, sessionMetadata, kernelSpec);
    }

    async restoreSession(
        runtimeMetadata: erdos.LanguageRuntimeMetadata,
        sessionMetadata: erdos.RuntimeSessionMetadata,
        sessionName: string,
    ): Promise<erdos.LanguageRuntimeSession> {
        return this.createPythonSession(runtimeMetadata, sessionMetadata, undefined, sessionName);
    }

    private createPythonSession(
        runtimeMetadata: erdos.LanguageRuntimeMetadata,
        sessionMetadata: erdos.RuntimeSessionMetadata,
        kernelSpec?: JupyterKernelSpec,
        sessionName?: string,
    ): erdos.LanguageRuntimeSession {
        const session = new PythonRuntimeSession(
            runtimeMetadata,
            sessionMetadata,
            this.serviceContainer,
            kernelSpec,
            sessionName,
        );
        this._onDidCreateSession.fire(session);
        return session;
    }

    async validateMetadata(metadata: erdos.LanguageRuntimeMetadata): Promise<erdos.LanguageRuntimeMetadata> {
        const extraData: PythonRuntimeExtraData = metadata.extraRuntimeData as PythonRuntimeExtraData;
        if (!extraData || !extraData.pythonPath) {
            throw new Error(`Runtime metadata missing Python path: ${JSON.stringify(extraData)}`);
        }

        const exists = await fs.pathExists(extraData.pythonPath);
        if (!exists) {
            throw new Error(`Python interpreter path is missing: ${extraData.pythonPath}`);
        }

        let registeredMetadata = this.registeredPythonRuntimes.get(extraData.pythonPath);

        if (!registeredMetadata) {
            const binPythonPath = path.join(extraData.pythonPath, 'bin', 'python');
            const binPythonExists = await fs.pathExists(binPythonPath);
            if (binPythonExists) {
                registeredMetadata = this.registeredPythonRuntimes.get(binPythonPath);
            }
        }

        return registeredMetadata ?? metadata;
    }

    async validateSession(sessionId: string): Promise<boolean> {
        const ext = vscode.extensions.getExtension('erdos.erdos-supervisor');
        if (!ext) {
            throw new Error('Erdos Supervisor extension not found');
        }
        if (!ext.isActive) {
            await ext.activate();
        }
        return ext.exports.validateSession(sessionId);
    }

    private async *discoverPythonRuntimes(): AsyncGenerator<erdos.LanguageRuntimeMetadata> {
        const discoverer = pythonRuntimeDiscoverer(this.serviceContainer);

        for await (const runtime of discoverer) {
            const extraData = runtime.extraRuntimeData as PythonRuntimeExtraData;
            this.registeredPythonRuntimes.set(extraData.pythonPath, runtime);
            yield runtime;
        }
    }

    async registerLanguageRuntimeFromPath(
        pythonPath: string,
        recreateRuntime?: boolean,
    ): Promise<erdos.LanguageRuntimeMetadata | undefined> {
        const alreadyRegisteredRuntime = this.registeredPythonRuntimes.get(pythonPath);
        if (alreadyRegisteredRuntime) {
            if (!recreateRuntime) {
                return alreadyRegisteredRuntime;
            }

            const sessions = await erdos.runtime.getActiveSessions();
            const sessionsToShutdown = sessions.filter((session) => {
                const sessionRuntime = session.runtimeMetadata.extraRuntimeData;
                return sessionRuntime.pythonPath === pythonPath;
            });

            if (sessionsToShutdown.length > 0) {
                traceInfo(`Shutting down ${sessionsToShutdown.length} sessions using Python runtime at ${pythonPath}`);
                await Promise.all(
                    sessionsToShutdown.map((session) => session.shutdown(erdos.RuntimeExitReason.Shutdown)),
                );
                this.registeredPythonRuntimes.delete(pythonPath);
            }
        }

        const interpreter = await this.interpreterService.getInterpreterDetails(pythonPath);
        if (interpreter) {
            const newRuntime = await createPythonRuntimeMetadata(interpreter, this.serviceContainer, false);
            this.registerLanguageRuntime(newRuntime);
            return newRuntime;
        }

        traceError(`Could not register runtime due to an invalid interpreter path: ${pythonPath}`);
        return undefined;
    }

    async selectLanguageRuntimeFromPath(pythonPath: string, recreateRuntime?: boolean): Promise<void> {
        await this.registerLanguageRuntimeFromPath(pythonPath, recreateRuntime);
        const runtimeMetadata = this.registeredPythonRuntimes.get(pythonPath);
        if (runtimeMetadata) {
            await erdos.runtime.selectLanguageRuntime(runtimeMetadata.runtimeId);
        } else {
            traceError(`Tried to switch to a language runtime that has not been registered: ${pythonPath}`);
        }
    }
}

export async function checkAndInstallPython(
    pythonPath: string,
    serviceContainer: IServiceContainer,
): Promise<InstallerResponse> {
    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
    const interpreter = await interpreterService.getInterpreterDetails(pythonPath);
    if (!interpreter) {
        return InstallerResponse.Ignore;
    }
    if (
        isProblematicCondaEnvironment(interpreter) ||
        (interpreter.id && !fs.existsSync(interpreter.id) && interpreter.envType === EnvironmentType.Conda)
    ) {
        if (interpreter) {
            const installer = serviceContainer.get<IInstaller>(IInstaller);
            const shell = serviceContainer.get<IApplicationShell>(IApplicationShell);
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Window,
                title: `[${Interpreters.installingPython}](command:${Commands.ViewOutput})`,
            };
            traceLog('Conda envs without Python are known to not work well; fixing conda environment...');
            const promise = installer.install(
                Product.python,
                await interpreterService.getInterpreterDetails(pythonPath),
            );
            shell.withProgress(progressOptions, () => promise);

            if (!(await installer.isInstalled(Product.python))) {
                traceInfo(`Python not able to be installed.`);
                return InstallerResponse.Ignore;
            }
        }
    }
    return InstallerResponse.Installed;
}
