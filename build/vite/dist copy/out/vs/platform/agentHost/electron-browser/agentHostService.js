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
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDelayedChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as MessagePortClient } from '../../../base/parts/ipc/common/ipc.mp.js';
import { acquirePort } from '../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../common/agentService.js';
import { revive } from '../../../base/common/marshalling.js';
/**
 * Renderer-side implementation of {@link IAgentHostService} that connects
 * directly to the agent host utility process via MessagePort, bypassing
 * the main process relay. Uses the same `getDelayedChannel` pattern as
 * the pty host so the proxy is usable immediately while the port is acquired.
 */
let AgentHostServiceClient = class AgentHostServiceClient extends Disposable {
    constructor(_logService, configurationService) {
        super();
        this._logService = _logService;
        /** Unique identifier for this window, used in action envelope origin tracking. */
        this.clientId = generateUuid();
        this._clientEventually = new DeferredPromise();
        this._onAgentHostExit = this._register(new Emitter());
        this.onAgentHostExit = this._onAgentHostExit.event;
        this._onAgentHostStart = this._register(new Emitter());
        this.onAgentHostStart = this._onAgentHostStart.event;
        this._onDidAction = this._register(new Emitter());
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = this._register(new Emitter());
        this.onDidNotification = this._onDidNotification.event;
        this._nextSeq = 1;
        // Create a proxy backed by a delayed channel - usable immediately,
        // calls queue until the MessagePort connection is established.
        this._proxy = ProxyChannel.toService(getDelayedChannel(this._clientEventually.p.then(client => client.getChannel("agentHost" /* AgentHostIpcChannels.AgentHost */))));
        if (configurationService.getValue(AgentHostEnabledSettingId)) {
            this._connect();
        }
    }
    async _connect() {
        this._logService.info('[AgentHost:renderer] Acquiring MessagePort to agent host...');
        const port = await acquirePort('vscode:createAgentHostMessageChannel', 'vscode:createAgentHostMessageChannelResult');
        this._logService.info('[AgentHost:renderer] MessagePort acquired, creating client...');
        const store = this._register(new DisposableStore());
        const client = store.add(new MessagePortClient(port, `agentHost:window`));
        this._clientEventually.complete(client);
        store.add(this._proxy.onDidAction(e => {
            this._onDidAction.fire(revive(e));
        }));
        store.add(this._proxy.onDidNotification(e => {
            this._onDidNotification.fire(revive(e));
        }));
        this._logService.info('[AgentHost:renderer] Direct MessagePort connection established');
        this._onAgentHostStart.fire();
    }
    // ---- IAgentService forwarding (no await needed, delayed channel handles queuing) ----
    getResourceMetadata() {
        return this._proxy.getResourceMetadata();
    }
    authenticate(params) {
        return this._proxy.authenticate(params);
    }
    listAgents() {
        return this._proxy.listAgents();
    }
    refreshModels() {
        return this._proxy.refreshModels();
    }
    listSessions() {
        return this._proxy.listSessions();
    }
    createSession(config) {
        return this._proxy.createSession(config);
    }
    disposeSession(session) {
        return this._proxy.disposeSession(session);
    }
    shutdown() {
        return this._proxy.shutdown();
    }
    subscribe(resource) {
        return this._proxy.subscribe(resource);
    }
    unsubscribe(resource) {
        this._proxy.unsubscribe(resource);
    }
    dispatchAction(action, clientId, clientSeq) {
        this._proxy.dispatchAction(action, clientId, clientSeq);
    }
    nextClientSeq() {
        return this._nextSeq++;
    }
    resourceList(uri) {
        return this._proxy.resourceList(uri);
    }
    resourceRead(uri) {
        return this._proxy.resourceRead(uri);
    }
    resourceWrite(params) {
        return this._proxy.resourceWrite(params);
    }
    resourceCopy(params) {
        return this._proxy.resourceCopy(params);
    }
    resourceDelete(params) {
        return this._proxy.resourceDelete(params);
    }
    resourceMove(params) {
        return this._proxy.resourceMove(params);
    }
    async restartAgentHost() {
        // Restart is handled by the main process side
    }
};
AgentHostServiceClient = __decorate([
    __param(0, ILogService),
    __param(1, IConfigurationService)
], AgentHostServiceClient);
registerSingleton(IAgentHostService, AgentHostServiceClient, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9lbGVjdHJvbi1icm93c2VyL2FnZW50SG9zdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDeEYsT0FBTyxFQUFFLE1BQU0sSUFBSSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNqRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSx5QkFBeUIsRUFBcUUsaUJBQWlCLEVBQXFHLE1BQU0sMkJBQTJCLENBQUM7QUFHL1AsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzdEOzs7OztHQUtHO0FBQ0gsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxVQUFVO0lBb0I5QyxZQUNjLFdBQXlDLEVBQy9CLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztR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