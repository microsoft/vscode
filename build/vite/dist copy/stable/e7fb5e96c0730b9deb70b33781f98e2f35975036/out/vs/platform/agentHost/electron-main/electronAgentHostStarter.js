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
var ElectronAgentHostStarter_1;
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { deepClone } from '../../../base/common/objects.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/electron-main/ipc.mp.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { Schemas } from '../../../base/common/network.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
let ElectronAgentHostStarter = class ElectronAgentHostStarter extends Disposable {
    static { ElectronAgentHostStarter_1 = this; }
    constructor(_environmentMainService, _lifecycleMainService, _logService) {
        super();
        this._environmentMainService = _environmentMainService;
        this._lifecycleMainService = _lifecycleMainService;
        this._logService = _logService;
        this.utilityProcess = undefined;
        this._onRequestConnection = this._register(new Emitter());
        this.onRequestConnection = this._onRequestConnection.event;
        this._onWillShutdown = this._register(new Emitter());
        this.onWillShutdown = this._onWillShutdown.event;
        this._register(this._lifecycleMainService.onWillShutdown(() => this._onWillShutdown.fire()));
        // Listen for new windows to establish a direct MessagePort connection to the agent host
        const onWindowConnection = (e, nonce) => this._onWindowConnection(e, nonce);
        validatedIpcMain.on('vscode:createAgentHostMessageChannel', onWindowConnection);
        this._register(toDisposable(() => {
            validatedIpcMain.removeListener('vscode:createAgentHostMessageChannel', onWindowConnection);
        }));
    }
    start() {
        this.utilityProcess = new UtilityProcess(this._logService, NullTelemetryService, this._lifecycleMainService);
        const inspectParams = parseAgentHostDebugPort(this._environmentMainService.args, this._environmentMainService.isBuilt);
        const execArgv = inspectParams.port ? [
            '--nolazy',
            `--inspect${inspectParams.break ? '-brk' : ''}=${inspectParams.port}`
        ] : undefined;
        this.utilityProcess.start({
            type: 'agentHost',
            name: 'agent-host',
            entryPoint: 'vs/platform/agentHost/node/agentHostMain',
            execArgv,
            args: ['--logsPath', this._environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath],
            env: {
                ...deepClone(process.env),
                VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
                VSCODE_PIPE_LOGGING: 'true',
                VSCODE_VERBOSE_LOGGING: 'true',
            }
        });
        const port = this.utilityProcess.connect();
        const client = new MessagePortClient(port, 'agentHost');
        const store = new DisposableStore();
        store.add(client);
        store.add(this.utilityProcess.onStderr(data => {
            if (this._isExpectedStderr(data)) {
                return;
            }
            this._logService.error(`[AgentHost:stderr] ${data}`);
        }));
        store.add(toDisposable(() => {
            this.utilityProcess?.kill();
            this.utilityProcess?.dispose();
            this.utilityProcess = undefined;
        }));
        return {
            client,
            store,
            onDidProcessExit: this.utilityProcess.onExit,
        };
    }
    _onWindowConnection(e, nonce) {
        this._onRequestConnection.fire();
        if (!this.utilityProcess) {
            this._logService.error('AgentHostStarter: cannot create window connection, agent host process is not running');
            return;
        }
        const port = this.utilityProcess.connect();
        if (e.sender.isDestroyed()) {
            port.close();
            return;
        }
        e.sender.postMessage('vscode:createAgentHostMessageChannelResult', nonce, [port]);
    }
    static { this._expectedStderrPatterns = [
        'Most NODE_OPTIONs are not supported in packaged apps',
        'Debugger listening on ws://',
        'For help, see: https://nodejs.org/en/docs/inspector',
        'ExperimentalWarning: SQLite is an experimental feature',
    ]; }
    _isExpectedStderr(data) {
        return ElectronAgentHostStarter_1._expectedStderrPatterns.some(pattern => data.includes(pattern));
    }
};
ElectronAgentHostStarter = ElectronAgentHostStarter_1 = __decorate([
    __param(0, IEnvironmentMainService),
    __param(1, ILifecycleMainService),
    __param(2, ILogService)
], ElectronAgentHostStarter);
export { ElectronAgentHostStarter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb25BZ2VudEhvc3RTdGFydGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2VsZWN0cm9uLW1haW4vZWxlY3Ryb25BZ2VudEhvc3RTdGFydGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxNQUFNLElBQUksaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN2RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUcvRSxJQUFNLHdCQUF3QixHQUE5QixNQUFNLHdCQUF5QixTQUFRLFVBQVU7O0lBU3ZELFlBQzBCLHVCQUFpRSxFQUNuRSxxQkFBNkQsRUFDdkUsV0FBeUM7UUFFdEQsS0FBSyxFQUFFLENBQUM7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