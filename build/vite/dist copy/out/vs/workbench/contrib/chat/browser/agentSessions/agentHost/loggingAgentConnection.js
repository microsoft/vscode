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
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { AgentHostIpcLoggingSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import { Extensions, IOutputService } from '../../../../../services/output/common/output.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
/**
 * JSON replacer that serializes revived URI objects to their string form,
 * keeping the rest of the payload intact.
 */
function uriReplacer(_key, value) {
    if (value && typeof value === 'object' && value.$mid !== undefined && value.scheme !== undefined) {
        return URI.revive(value).toString();
    }
    return value;
}
function formatPayload(data) {
    if (data === undefined) {
        return '';
    }
    try {
        return JSON.stringify(data, uriReplacer, 2);
    }
    catch {
        return String(data);
    }
}
/**
 * A logging wrapper around an {@link IAgentConnection} that writes all IPC
 * traffic to a dedicated output channel. Used by both local and remote agent
 * host contributions to provide per-host IPC tracing.
 *
 * The output channel is registered on construction and removed on dispose,
 * so its lifetime matches the connection.
 *
 * All method calls, results, errors, and events are logged with arrows:
 * - `>>` for outgoing calls
 * - `<<` for results
 * - `!!` for errors
 * - `**` for events (onDidAction, onDidNotification)
 */
let LoggingAgentConnection = class LoggingAgentConnection extends Disposable {
    constructor(_inner, _channelId, _channelLabel, _outputService, configurationService) {
        super();
        this._inner = _inner;
        this._channelId = _channelId;
        this._channelLabel = _channelLabel;
        this._outputService = _outputService;
        this.clientId = _inner.clientId;
        this._enabled = !!configurationService.getValue(AgentHostIpcLoggingSettingId);
        if (this._enabled) {
            // Register the output channel
            const registry = Registry.as(Extensions.OutputChannels);
            registry.registerChannel({
                id: this._channelId,
                label: this._channelLabel,
                log: false,
                languageId: 'log',
            });
            this._register({ dispose: () => registry.removeChannel(this._channelId) });
        }
        // Wrap events with logging
        const onDidActionEmitter = this._register(new Emitter());
        this._register(_inner.onDidAction(e => {
            this._log('**', 'onDidAction', e);
            onDidActionEmitter.fire(e);
        }));
        this.onDidAction = onDidActionEmitter.event;
        const onDidNotificationEmitter = this._register(new Emitter());
        this._register(_inner.onDidNotification(e => {
            this._log('**', 'onDidNotification', e);
            onDidNotificationEmitter.fire(e);
        }));
        this.onDidNotification = onDidNotificationEmitter.event;
    }
    // ---- IAgentConnection method proxies with logging -----------------------
    async listAgents() {
        return this._logCall('listAgents', undefined, () => this._inner.listAgents());
    }
    async getResourceMetadata() {
        return this._logCall('getResourceMetadata', undefined, () => this._inner.getResourceMetadata());
    }
    async authenticate(params) {
        return this._logCall('authenticate', params, () => this._inner.authenticate(params));
    }
    async refreshModels() {
        return this._logCall('refreshModels', undefined, () => this._inner.refreshModels());
    }
    async listSessions() {
        return this._logCall('listSessions', undefined, () => this._inner.listSessions());
    }
    async createSession(config) {
        return this._logCall('createSession', config, () => this._inner.createSession(config));
    }
    async disposeSession(session) {
        return this._logCall('disposeSession', session, () => this._inner.disposeSession(session));
    }
    async shutdown() {
        return this._logCall('shutdown', undefined, () => this._inner.shutdown());
    }
    async subscribe(resource) {
        return this._logCall('subscribe', resource, () => this._inner.subscribe(resource));
    }
    unsubscribe(resource) {
        this._log('>>', 'unsubscribe', resource);
        this._inner.unsubscribe(resource);
    }
    dispatchAction(action, clientId, clientSeq) {
        this._log('>>', 'dispatchAction', { action, clientId, clientSeq });
        this._inner.dispatchAction(action, clientId, clientSeq);
    }
    nextClientSeq() {
        return this._inner.nextClientSeq();
    }
    async resourceList(uri) {
        return this._logCall('resourceList', uri, () => this._inner.resourceList(uri));
    }
    async resourceRead(uri) {
        return this._logCall('resourceRead', uri, () => this._inner.resourceRead(uri));
    }
    async resourceWrite(params) {
        return this._logCall('resourceWrite', params, () => this._inner.resourceWrite(params));
    }
    async resourceCopy(params) {
        return this._logCall('resourceCopy', params, () => this._inner.resourceCopy(params));
    }
    async resourceDelete(params) {
        return this._logCall('resourceDelete', params, () => this._inner.resourceDelete(params));
    }
    async resourceMove(params) {
        return this._logCall('resourceMove', params, () => this._inner.resourceMove(params));
    }
    // ---- Public logging API for callers' catch blocks -----------------------
    /**
     * Log an error to the output channel. Use this from caller catch blocks
     * so connection errors appear in the per-host channel.
     */
    logError(context, error) {
        this._log('!!', context, error instanceof Error ? error.message : String(error));
    }
    // ---- Internal helpers ---------------------------------------------------
    async _logCall(method, params, fn) {
        this._log('>>', method, params);
        try {
            const result = await fn();
            this._log('<<', method, result);
            return result;
        }
        catch (err) {
            this._log('!!', method, err instanceof Error ? err.message : String(err));
            throw err;
        }
    }
    _log(arrow, method, data) {
        if (!this._enabled) {
            return;
        }
        if (!this._outputChannel) {
            this._outputChannel = this._outputService.getChannel(this._channelId);
            if (!this._outputChannel) {
                return;
            }
        }
        const timestamp = new Date().toISOString();
        const payload = formatPayload(data);
        this._outputChannel.append(`[${timestamp}] ${arrow} ${method}${payload ? `\n${payload}` : ''}\n`);
    }
};
LoggingAgentConnection = __decorate([
    __param(3, IOutputService),
    __param(4, IConfigurationService)
], LoggingAgentConnection);
export { LoggingAgentConnection };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2luZ0FnZW50Q29ubmVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9sb2dnaW5nQWdlbnRDb25uZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbEYsT0FBTyxFQUFxSiw0QkFBNEIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRzlQLE9BQU8sRUFBRSxVQUFVLEVBQTBDLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXpHOzs7R0FHRztBQUNILFNBQVMsV0FBVyxDQUFDLElBQVksRUFBRSxLQUFjO0lBQ2hELElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSyxLQUE0QixDQUFDLElBQUksS0FBSyxTQUFTLElBQUssS0FBOEIsQ0FBQyxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDcEosT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQXNCLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN0RCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsSUFBYTtJQUNuQyxJQUFJLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUN4QixPQUFP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