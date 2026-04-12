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
import { Disposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { ProxyChannel } from '../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService, ILoggerService } from '../../platform/log/common/log.js';
import { RemoteLoggerChannelClient } from '../../platform/log/common/logIpc.js';
import { IServerLifetimeService } from './serverLifetimeService.js';
export const IServerAgentHostManager = createDecorator('serverAgentHostManager');
var Constants;
(function (Constants) {
    Constants[Constants["MaxRestarts"] = 5] = "MaxRestarts";
})(Constants || (Constants = {}));
let ServerAgentHostManager = class ServerAgentHostManager extends Disposable {
    constructor(_starter, _logService, _loggerService, _serverLifetimeService) {
        super();
        this._starter = _starter;
        this._logService = _logService;
        this._loggerService = _loggerService;
        this._serverLifetimeService = _serverLifetimeService;
        this._restartCount = 0;
        /** Lifetime token held while sessions are active or clients are connected. */
        this._lifetimeToken = this._register(new MutableDisposable());
        this._hasActiveSessions = false;
        this._connectionCount = 0;
        this._register(this._starter);
        this._start();
    }
    _start() {
        const connection = this._starter.start();
        this._logService.info('ServerAgentHostManager: agent host started');
        // Connect logger channel so agent host logs appear in the output channel
        connection.store.add(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel("agentHostLogger" /* AgentHostIpcChannels.Logger */)));
        this._trackActiveSessions(connection);
        this._trackClientConnections(connection);
        // Handle unexpected exit
        connection.store.add(connection.onDidProcessExit(e => {
            if (!this._store.isDisposed) {
                // Both signals are gone when the process exits
                this._hasActiveSessions = false;
                this._connectionCount = 0;
                this._lifetimeToken.clear();
                if (this._restartCount <= Constants.MaxRestarts) {
                    this._logService.error(`ServerAgentHostManager: agent host terminated unexpectedly with code ${e.code}`);
                    this._restartCount++;
                    connection.store.dispose();
                    this._start();
                }
                else {
                    this._logService.error(`ServerAgentHostManager: agent host terminated with code ${e.code}, giving up after ${Constants.MaxRestarts} restarts`);
                }
            }
        }));
        this._register(toDisposable(() => connection.store.dispose()));
    }
    _trackActiveSessions(connection) {
        const agentService = ProxyChannel.toService(connection.client.getChannel("agentHost" /* AgentHostIpcChannels.AgentHost */));
        connection.store.add(agentService.onDidAction(envelope => {
            if (envelope.action.type === 'root/activeSessionsChanged') {
                this._hasActiveSessions = envelope.action.activeSessions > 0;
                this._updateLifetimeToken();
            }
        }));
    }
    _trackClientConnections(connection) {
        const connectionTracker = ProxyChannel.toService(connection.client.getChannel("agentHostConnectionTracker" /* AgentHostIpcChannels.ConnectionTracker */));
        connection.store.add(connectionTracker.onDidChangeConnectionCount(count => {
            this._connectionCount = count;
            this._updateLifetimeToken();
        }));
    }
    _updateLifetimeToken() {
        if (this._hasActiveSessions || this._connectionCount > 0) {
            this._lifetimeToken.value ??= this._serverLifetimeService.active('AgentHost');
        }
        else {
            this._lifetimeToken.clear();
        }
    }
};
ServerAgentHostManager = __decorate([
    __param(1, ILogService),
    __param(2, ILoggerService),
    __param(3, IServerLifetimeService)
], ServerAgentHostManager);
export { ServerAgentHostManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyQWdlbnRIb3N0TWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3NlcnZlci9ub2RlL3NlcnZlckFnZW50SG9zdE1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFHbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0UsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFcEUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsZUFBZSxDQUEwQix3QkFBd0IsQ0FBQyxDQUFDO0FBd0IxRyxJQUFLLFNBRUo7QUFGRCxXQUFLLFNBQVM7SUFDYix1REFBZSxDQUFBO0FBQ2hCLENBQUMsRUFGSSxTQUFTLEtBQVQsU0FBUyxRQUViO0FBRU0sSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxVQUFVO0lBV3JELFlBQ2tCLFFBQTJCLEVBQy9CLFdBQXlDLEVBQ3RDLGNBQStDLEVBQ3ZDLHNCQUErRDtRQUV2RixLQUFLLEVBQUUsQ0FBQztRQUxTLGFBQVEsR0FBUixRQUFRLENBQW1CO1FBQ2QsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFDckIsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQ3RCLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBd0I7UUFaaEYsa0JBQWEsR0FBRyxDQUFDLENB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