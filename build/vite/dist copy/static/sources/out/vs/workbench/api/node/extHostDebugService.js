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
import { createCancelablePromise, disposableTimeout, firstParallel, RunOnceScheduler, timeout } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import * as platform from '../../../base/common/platform.js';
import * as nls from '../../../nls.js';
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from '../../../platform/externalTerminal/node/externalTerminalService.js';
import { SignService } from '../../../platform/sign/node/signService.js';
import { ExecutableDebugAdapter, NamedPipeDebugAdapter, SocketDebugAdapter } from '../../contrib/debug/node/debugAdapter.js';
import { hasChildProcesses, prepareCommand } from '../../contrib/debug/node/terminals.js';
import { IExtHostCommands } from '../common/extHostCommands.js';
import { IExtHostConfiguration } from '../common/extHostConfiguration.js';
import { ExtHostDebugServiceBase } from '../common/extHostDebugService.js';
import { IExtHostEditorTabs } from '../common/extHostEditorTabs.js';
import { IExtHostExtensionService } from '../common/extHostExtensionService.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { IExtHostTerminalService } from '../common/extHostTerminalService.js';
import { IExtHostTesting } from '../common/extHostTesting.js';
import { DebugAdapterExecutable, DebugAdapterNamedPipeServer, DebugAdapterServer, ThemeIcon } from '../common/extHostTypes.js';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../common/extHostWorkspace.js';
import { IExtHostTerminalShellIntegration } from '../common/extHostTerminalShellIntegration.js';
let ExtHostDebugService = class ExtHostDebugService extends ExtHostDebugServiceBase {
    constructor(extHostRpcService, workspaceService, extensionService, configurationService, _terminalService, _terminalShellIntegrationService, editorTabs, variableResolver, commands, testing) {
        super(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing);
        this._terminalService = _terminalService;
        this._terminalShellIntegrationService = _terminalShellIntegrationService;
        this._integratedTerminalInstances = new DebugTerminalCollection();
    }
    createDebugAdapter(adapter, session) {
        if (adapter instanceof DebugAdapterExecutable) {
            return new ExecutableDebugAdapter(this.convertExecutableToDto(adapter), session.type);
        }
        else if (adapter instanceof DebugAdapterServer) {
            return new SocketDebugAdapter(this.convertServerToDto(adapter));
        }
        else if (adapter instanceof DebugAdapterNamedPipeServer) {
            return new NamedPipeDebugAdapter(this.convertPipeServerToDto(adapter));
        }
        else {
            return super.createDebugAdapter(adapter, session);
        }
    }
    daExecutableFromPackage(session, extensionRegistry) {
        const dae = ExecutableDebugAdapter.platformAdapterExecutable(extensionRegistry.getAllExtensionDescriptions(), session.type);
        if (dae) {
            return new DebugAdapterExecutable(dae.command, dae.args, dae.options);
        }
        return undefined;
    }
    createSignService() {
        return new SignService();
    }
    async $runInTerminal(args, sessionId) {
        if (args.kind === 'integrated') {
            if (!this._terminalDisposedListener) {
                // React on terminal disposed and check if that is the debug terminal #12956
                this._terminalDisposedListener = this._register(this._terminalService.onDidCloseTerminal(terminal => {
                    this._integratedTerminalInstances.onTerminalClosed(terminal);
                }));
            }
            const configProvider = await this._configurationService.getConfigProvider();
            const shell = this._terminalService.getDefaultShell(true);
            const shellArgs = this._terminalService.getDefaultShellArgs(true);
            const terminalName = args.title || nls.localize('debug.terminal.title', "Debug Process");
            const shellConfig = JSON.stringify({ shell, shellArgs, cwd: args.cwd });
            let terminal = await this._integratedTerminalInstances.checkout(shellConfig, terminalName);
            let cwdForPrepareCommand;
            let giveShellTimeToInitialize = false;
            if (!terminal) {
                const options = {
                    shellPath: shell,
                    shellArgs: shellArgs,
                    cwd: args.cwd,
                    name: terminalName,
                    iconPath: new ThemeIcon('debug'),
                };
                giveShellTimeToInitialize = true;
                terminal = this._terminalService.createTerminalFromOptions(options, {
                    isFeatureTerminal: true,
                    // Since debug termnials are REPLs, we want shell integration to be enabled.
                    // Ignore isFeatureTerminal when evaluating shell integration enablement.
                    forceShellIntegration: true,
                    useShellEnvironment: true
                });
                this._integratedTerminalInstances.insert(terminal, shellConfig);
            }
            else {
                cwdForPrepareCommand = args.cwd;
            }
            terminal.show(true);
            const shellProcessId = await terminal.processId;
            if (giveShellTimeToInitialize) {
                // give a new terminal some time to initialize the shell (most recently, #228191)
                // - If shell integration is available, use that as a deterministic signal
                // - Debounce content being written to known when the prompt is available
                // - Give a longer timeout otherwise
                let Timing;
                (function (Timing) {
                    Timing[Timing["DataDebounce"] = 500] = "DataDebounce";
                    Timing[Timing["MaxDelay"] = 5000] = "MaxDelay";
                })(Timing || (Timing = {}));
                const ds = new DisposableStore();
                await new Promise(resolve => {
                    const scheduler = ds.add(new RunOnceScheduler(resolve, 500 /* Timing.DataDebounce */));
                    ds.add(this._terminalService.onDidWriteTerminalData(e => {
                        if (e.terminal === terminal) {
                            scheduler.schedule();
                        }
                    }));
                    ds.add(this._terminalShellIntegrationService.onDidChangeTerminalShellIntegration(e => {
                        if (e.terminal === terminal) {
                            resolve();
                        }
                    }));
                    ds.add(disposableTimeout(resolve, 5000 /* Timing.MaxDelay */));
                });
                ds.dispose();
            }
            else {
                if (terminal.state.isInteractedWith && !terminal.shellIntegration) {
                    terminal.sendText('\u0003'); // Ctrl+C for #106743. Not part of the same command for #107969
                    await timeout(200); // mirroring https://github.com/microsoft/vscode/blob/c67ccc70ece5f472ec25464d3eeb874cfccee9f1/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts#L852-L857
                }
                if (configProvider.getConfiguration('debug.terminal').get('clearBeforeReusing')) {
                    // clear terminal before reusing it
                    let clearCommand;
                    if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0 || shell.indexOf('cmd.exe') >= 0) {
                        clearCommand = 'cls';
                    }
                    else if (shell.indexOf('bash') >= 0) {
                        clearCommand = 'clear';
                    }
                    else if (platform.isWindows) {
                        clearCommand = 'cls';
                    }
                    else {
                        clearCommand = 'clear';
                    }
                    if (terminal.shellIntegration) {
                        const ds = new DisposableStore();
                        const execution = terminal.shellIntegration.executeCommand(clearCommand);
                        await new Promise(resolve => {
                            ds.add(this._terminalShellIntegrationService.onDidEndTerminalShellExecution(e => {
                                if (e.execution === execution) {
                                    resolve();
                                }
                            }));
                            ds.add(disposableTimeout(resolve, 500)); // 500ms timeout to ensure we resolve
                        });
                        ds.dispose();
                    }
                    else {
                        terminal.sendText(clearCommand);
                        await timeout(200); // add a small delay to ensure the command is processed, see #240953
                    }
                }
            }
            const command = prepareCommand(shell, args.args, !!args.argsCanBeInterpretedByShell, cwdForPrepareCommand, args.env);
            if (terminal.shellIntegration) {
                terminal.shellIntegration.executeCommand(command);
            }
            else {
                terminal.sendText(command);
            }
            // Mark terminal as unused when its session ends, see #112055
            const sessionListener = this.onDidTerminateDebugSession(s => {
                if (s.id === sessionId) {
                    this._integratedTerminalInstances.free(terminal);
                    sessionListener.dispose();
                }
            });
            return shellProcessId;
        }
        else if (args.kind === 'external') {
            return runInExternalTerminal(args, await this._configurationService.getConfigProvider());
        }
        return super.$runInTerminal(args, sessionId);
    }
};
ExtHostDebugService = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostWorkspace),
    __param(2, IExtHostExtensionService),
    __param(3, IExtHostConfiguration),
    __param(4, IExtHostTerminalService),
    __param(5, IExtHostTerminalShellIntegration),
    __param(6, IExtHostEditorTabs),
    __param(7, IExtHostVariableResolverProvider),
    __param(8, IExtHostCommands),
    __param(9, IExtHostTesting)
], ExtHostDebugService);
export { ExtHostDebugService };
let externalTerminalService = undefined;
function runInExternalTerminal(args, configProvider) {
    if (!externalTerminalService) {
        if (platform.isWindows) {
            externalTerminalService = new WindowsExternalTerminalService();
        }
        else if (platform.isMacintosh) {
            externalTerminalService = new MacExternalTerminalService();
        }
        else if (platform.isLinux) {
            externalTerminalService = new LinuxExternalTerminalService();
        }
        else {
            throw new Error('external terminals not supported on this platform');
        }
    }
    const config = configProvider.getConfiguration('terminal');
    return externalTerminalService.runInTerminal(args.title, args.cwd, args.args, args.env || {}, config.external || {});
}
class DebugTerminalCollection {
    constructor() {
        this._terminalInstances = new Map();
    }
    /**
     * Delay before a new terminal is a candidate for reuse. See #71850
     */
    static { this.minUseDelay = 1000; }
    async checkout(config, name, cleanupOthersByName = false) {
        const entries = [...this._terminalInstances.entries()];
        const promises = entries.map(([terminal, termInfo]) => createCancelablePromise(async (ct) => {
            // Only allow terminals that match the title.  See #123189
            if (terminal.name !== name) {
                return null;
            }
            if (termInfo.lastUsedAt !== -1 && await hasChildProcesses(await terminal.processId)) {
                return null;
            }
            // important: date check and map operations must be synchronous
            const now = Date.now();
            if (termInfo.lastUsedAt + DebugTerminalCollection.minUseDelay > now || ct.isCancellationRequested) {
                return null;
            }
            if (termInfo.config !== config) {
                if (cleanupOthersByName) {
                    terminal.dispose();
                }
                return null;
            }
            termInfo.lastUsedAt = now;
            return terminal;
        }));
        return await firstParallel(promises, (t) => !!t);
    }
    insert(terminal, termConfig) {
        this._terminalInstances.set(terminal, { lastUsedAt: Date.now(), config: termConfig });
    }
    free(terminal) {
        const info = this._terminalInstances.get(terminal);
        if (info) {
            info.lastUsedAt = -1;
        }
    }
    onTerminalClosed(terminal) {
        this._terminalInstances.delete(terminal);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERlYnVnU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0RGVidWdTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckksT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sS0FBSyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUV2QyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsMEJBQTBCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUU5SyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFekUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDN0gsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2hFLE9BQU8sRUFBeUIscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsdUJBQXVCLEVBQXVCLE1BQU0sa0NBQWtDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGtCQUFrQixF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