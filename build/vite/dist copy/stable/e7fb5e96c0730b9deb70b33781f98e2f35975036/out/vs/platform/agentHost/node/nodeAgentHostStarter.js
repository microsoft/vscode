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
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { Client } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { parseAgentHostDebugPort } from '../../environment/node/environmentService.js';
/**
 * Spawns the agent host as a Node child process (fallback when
 * Electron utility process is unavailable, e.g. dev/test).
 */
let NodeAgentHostStarter = class NodeAgentHostStarter extends Disposable {
    constructor(_environmentService) {
        super();
        this._environmentService = _environmentService;
        this._onRequestConnection = this._register(new Emitter());
        this.onRequestConnection = this._onRequestConnection.event;
    }
    /**
     * Configures the child process to also start a WebSocket server.
     * Must be called before {@link start}. Triggers eager process start
     * via {@link onRequestConnection}.
     */
    setWebSocketConfig(config) {
        this._wsConfig = config;
        // Signal the process manager to start immediately rather than
        // waiting for a renderer window to connect.
        this._onRequestConnection.fire();
    }
    start() {
        const env = {
            VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
            VSCODE_PIPE_LOGGING: 'true',
            VSCODE_VERBOSE_LOGGING: 'true',
        };
        // Forward WebSocket server configuration to the child process via env vars
        if (this._wsConfig) {
            if (this._wsConfig.port) {
                env['VSCODE_AGENT_HOST_PORT'] = this._wsConfig.port;
            }
            if (this._wsConfig.socketPath) {
                env['VSCODE_AGENT_HOST_SOCKET_PATH'] = this._wsConfig.socketPath;
            }
            if (this._wsConfig.host) {
                env['VSCODE_AGENT_HOST_HOST'] = this._wsConfig.host;
            }
            if (this._wsConfig.connectionToken) {
                env['VSCODE_AGENT_HOST_CONNECTION_TOKEN'] = this._wsConfig.connectionToken;
            }
        }
        const opts = {
            serverName: 'Agent Host',
            args: ['--type=agentHost', '--logsPath', this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath],
            env,
        };
        const agentHostDebug = parseAgentHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
        if (agentHostDebug) {
            if (agentHostDebug.break && agentHostDebug.port) {
                opts.debugBrk = agentHostDebug.port;
            }
            else if (!agentHostDebug.break && agentHostDebug.port) {
                opts.debug = agentHostDebug.port;
            }
        }
        const client = new Client(FileAccess.asFileUri('bootstrap-fork').fsPath, opts);
        const store = new DisposableStore();
        store.add(client);
        return {
            client,
            store,
            onDidProcessExit: client.onDidProcessExit
        };
    }
};
NodeAgentHostStarter = __decorate([
    __param(0, IEnvironmentService)
], NodeAgentHostStarter);
export { NodeAgentHostStarter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZUFnZW50SG9zdFN0YXJ0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3Qvbm9kZS9ub2RlQWdlbnRIb3N0U3RhcnRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxNQUFNLEVBQWUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsbUJBQW1CLEVBQTZCLE1BQU0seUNBQXlDLENBQUM7QUFDekcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFrQnZGOzs7R0FHRztBQUNJLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQU9uRCxZQUNzQixtQkFBK0Q7UUFFcEYsS0FBSyxFQUFFLENBQUM7UUFGOEIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUEyQjtRQUpwRSx5QkFBb0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNuRSx3QkFBbUIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDO0lBTS9ELENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsa0JBQWtCLENBQUMsTUFBaUM7UUFDbkQsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7UUFDeEIsOERBQThEO1FBQzlELDRDQUE0QztRQUM1QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbEMsQ0FB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