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
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { log, LogLevel } from '../../../../platform/log/common/log.js';
import { McpServerRequestHandler } from './mcpServerRequestHandler.js';
import { McpConnectionState } from './mcpTypes.js';
let McpServerConnection = class McpServerConnection extends Disposable {
    constructor(_collection, definition, _delegate, launchDefinition, _logger, _errorOnUserInteraction, _taskManager, _instantiationService) {
        super();
        this._collection = _collection;
        this.definition = definition;
        this._delegate = _delegate;
        this.launchDefinition = launchDefinition;
        this._logger = _logger;
        this._errorOnUserInteraction = _errorOnUserInteraction;
        this._taskManager = _taskManager;
        this._instantiationService = _instantiationService;
        this._launch = this._register(new MutableDisposable());
        this._state = observableValue('mcpServerState', { state: 0 /* McpConnectionState.Kind.Stopped */ });
        this._requestHandler = observableValue('mcpServerRequestHandler', undefined);
        this._onPotentialSandboxBlock = this._register(new Emitter());
        this.state = this._state;
        this.handler = this._requestHandler;
        this.onPotentialSandboxBlock = this._onPotentialSandboxBlock.event;
    }
    /** @inheritdoc */
    async start(methods) {
        const currentState = this._state.get();
        if (!McpConnectionState.canBeStarted(currentState.state)) {
            return this._waitForState(2 /* McpConnectionState.Kind.Running */, 3 /* McpConnectionState.Kind.Error */);
        }
        this._launch.value = undefined;
        this._state.set({ state: 1 /* McpConnectionState.Kind.Starting */ }, undefined);
        this._logger.info(localize('mcpServer.starting', 'Starting server {0}', this.definition.label));
        try {
            const launch = this._delegate.start(this._collection, this.definition, this.launchDefinition, { errorOnUserInteraction: this._errorOnUserInteraction });
            this._launch.value = this.adoptLaunch(launch, methods);
            return this._waitForState(2 /* McpConnectionState.Kind.Running */, 3 /* McpConnectionState.Kind.Error */);
        }
        catch (e) {
            const errorState = {
                state: 3 /* McpConnectionState.Kind.Error */,
                message: e instanceof Error ? e.message : String(e)
            };
            this._state.set(errorState, undefined);
            return errorState;
        }
    }
    adoptLaunch(launch, methods) {
        const store = new DisposableStore();
        const cts = new CancellationTokenSource();
        store.add(toDisposable(() => cts.dispose(true)));
        store.add(launch);
        store.add(launch.onDidLog(({ level, message }) => {
            log(this._logger, level, message);
            const potentialBlock = this._toPotentialSandboxBlock(message);
            if (potentialBlock) {
                this._onPotentialSandboxBlock.fire(potentialBlock);
            }
        }));
        let didStart = false;
        store.add(autorun(reader => {
            const state = launch.state.read(reader);
            this._state.set(state, undefined);
            this._logger.info(localize('mcpServer.state', 'Connection state: {0}', McpConnectionState.toString(state)));
            if (state.state === 2 /* McpConnectionState.Kind.Running */ && !didStart) {
                didStart = true;
                McpServerRequestHandler.create(this._instantiationService, {
                    ...methods,
                    launch,
                    logger: this._logger,
                    requestLogLevel: this.definition.devMode ? LogLevel.Info : LogLevel.Debug,
                    taskManager: this._taskManager,
                }, cts.token).then(handler => {
                    if (!store.isDisposed) {
                        this._requestHandler.set(handler, undefined);
                    }
                    else {
                        handler.dispose();
                    }
                }, err => {
                    if (!store.isDisposed && McpConnectionState.isRunning(this._state.read(undefined))) {
                        let message = err.message;
                        if (err instanceof CancellationError) {
                            message = 'Server exited before responding to `initialize` request.';
                            this._logger.error(message);
                        }
                        else {
                            this._logger.error(err);
                        }
                        this._state.set({ state: 3 /* McpConnectionState.Kind.Error */, message }, undefined);
                    }
                    store.dispose();
                });
            }
        }));
        return { dispose: () => store.dispose(), object: launch };
    }
    async stop() {
        this._logger.info(localize('mcpServer.stopping', 'Stopping server {0}', this.definition.label));
        this._launch.value?.object.stop();
        await this._waitForState(0 /* McpConnectionState.Kind.Stopped */, 3 /* McpConnectionState.Kind.Error */);
    }
    dispose() {
        this._requestHandler.get()?.dispose();
        super.dispose();
        this._state.set({ state: 0 /* McpConnectionState.Kind.Stopped */ }, undefined);
    }
    _waitForState(...kinds) {
        const current = this._state.get();
        if (kinds.includes(current.state)) {
            return Promise.resolve(current);
        }
        return new Promise(resolve => {
            const disposable = autorun(reader => {
                const state = this._state.read(reader);
                if (kinds.includes(state.state)) {
                    disposable.dispose();
                    resolve(state);
                }
            });
        });
    }
    _toPotentialSandboxBlock(message) {
        if (!this.definition.sandboxEnabled) {
            return undefined;
        }
        if (/No matching config rule, denying:/i.test(message)) {
            return {
                kind: 'network',
                message,
                host: this._extractSandboxHost(message),
            };
        }
        if (/(?:\b(?:EACCES|EPERM|ENOENT|EROFS|fail(?:ed|ure)?)\b|not accessible|read[- ]only)/i.test(message)) {
            return {
                kind: 'filesystem',
                message,
                path: this._extractSandboxPath(message),
            };
        }
        return undefined;
    }
    _extractSandboxPath(line) {
        const bracketedPath = line.match(/\[(\/[^\]\r\n]+)\]/);
        if (bracketedPath?.[1]) {
            return bracketedPath[1].trim();
        }
        const quotedPath = line.match(/["'`](\/[^"'`]+)["'`]/);
        if (quotedPath?.[1]) {
            return quotedPath[1];
        }
        const trailingPath = line.match(/(\/[\w.\-~/ ]+)$/);
        return trailingPath?.[1]?.trim();
    }
    _extractSandboxHost(value) {
        const match = value.match(/No matching config rule, denying:\s+(?<host>[^:\s]+):\d+\.?$/i);
        return match?.groups?.host;
    }
};
McpServerConnection = __decorate([
    __param(7, IInstantiationService)
], McpServerConnection);
export { McpServerConnection };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyQ29ubmVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2VydmVyQ29ubmVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWMsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEksT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFXLEdBQUcsRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVoRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RSxPQUFPLEVBQStGLGtCQUFrQixFQUF3QyxNQUFNLGVBQWUsQ0FBQztBQUUvSyxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFVBQVU7SUFVbEQsWUFDa0IsV0FBb0MsRUFDckMsVUFBK0IsRUFDOUIsU0FBMkIsRUFDNUIsZ0JBQWlDLEVBQ2hDLE9BQWdCLEVBQ2hCLHVCQUE0QyxFQUM1QyxZQUE0QixFQUN0QixxQkFBNkQ7UUFFcEYsS0FBSyxFQUFFLENBQUM7UUFUUyxnQkFBVyxHQUFYLFdBQVcsQ0FBeUI7UUFDckMsZUFBVSxHQUFWLFVBQVUsQ0FBcUI7UUFDOUIsY0FBUyxHQUFULFNBQVMsQ0FBa0I7UUFDNUIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFpQjtRQUNoQyxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBcUI7UUFDNUMsaUJBQVksR0FBWixZQUFZLENBQWdCO1FBQ0wsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQWpCcEUsWUFBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBb0MsQ0FBQyxDQUFDO1FBQ3BGLFdBQU0sR0FBRyxlQUFlLENBQXFCLGdCQUFnQixFQUFFLEVBQUUsS0FBSyx5Q0FBaUMsRUFBRSxDQUFDLENBQUM7UUFDM0csb0JBQWUsR0FBRyxlQUFlLENBQXNDLHlCQUF5QixFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzdHLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTZCLENBQUMsQ0FBQztRQUVyRixVQUFLLEdBQW9DLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDckQsWUFBTyxHQUFxRCxJQUFJLENBQUMsZUFBZSxDQUFDO1FBQ2pGLDRCQUF1QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUM7SUFhOUUsQ0FBQztJQUVELGtCQUFrQjtJQUNYLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBMEI7UUFDNUMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN2QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzFELE9BQU8sSUFBSSxDQUFDLGFBQWEsZ0ZBQWdFLENBQUM7UUFDM0YsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztRQUMvQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssMENBQWtDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN4RSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRWhHLElBQUksQ0FBQztZQUNKLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1lBQ3hKLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZELE9BQU8sSUFBSSxDQUFDLGFBQWEsZ0ZBQWdFLENBQUM7UUFDM0YsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixNQUFNLFVBQVUsR0FBdUI7Z0JBQ3RDLEtBQUssdUNBQStCO2dCQUNwQyxPQUFPLEVBQUUsQ0FBQyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzthQUNuRCxDQUFDO1lBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZDLE9BQU8sVUFBVSxDQUFDO1FBQ25CLENBQUM7SUFDRixDQUFDO0lBRU8sV0FBVyxDQUFDLE1BQTRCLEVBQUUsT0FBMEI7UUFDM0UsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxNQUFNLEdBQUcsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFFMUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQixLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO1lBQ2hELEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsQyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDOUQsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNwRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNyQixLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMxQixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDbEMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFNUcsSUFBSSxLQUFLLENBQUMsS0FBSyw0Q0FBb0MsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNsRSxRQUFRLEdBQUcsSUFBSSxDQUFDO2dCQUNoQix1QkFBdUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFO29CQUMxRCxHQUFHLE9BQU87b0JBQ1YsTUFBTTtvQkFDTixNQUFNLEVBQUUsSUFBSSxDQUFDLE9BQU87b0JBQ3BCLGVBQWUsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUs7b0JBQ3pFLFdBQVcsRUFBRSxJQUFJLENBQUMsWUFBWTtpQkFDOUIsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUNqQixPQUFPLENBQUMsRUFBRTtvQkFDVCxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO3dCQUN2QixJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQzlDLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ25CLENBQUM7Z0JBQ0YsQ0FBQyxFQUNELEdBQUcsQ0FBQyxFQUFFO29CQUNMLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxJQUFJLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ3BGLElBQUksT0FBTyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUM7d0JBQzFCLElBQUksR0FBRyxZQUFZLGlCQUFpQixFQUFFLENBQUM7NEJBQ3RDLE9BQU8sR0FBRywwREFBMEQsQ0FBQzs0QkFDckUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQzdCLENBQUM7NkJBQU0sQ0FBQzs0QkFDUCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDekIsQ0FBQzt3QkFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssdUNBQStCLEVBQUUsT0FBTyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQy9FLENBQUM7b0JBQ0QsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNqQixDQUFDLENBQ0QsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQzNELENBQUM7SUFFTSxLQUFLLENBQUMsSUFBSTtRQUNoQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2hHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxNQUFNLElBQUksQ0FBQyxhQUFhLGdGQUFnRSxDQUFDO0lBQzFGLENBQUM7SUFFZSxPQUFPO1FBQ3RCLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDdEMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyx5Q0FBaUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFTyxhQUFhLENBQUMsR0FBRyxLQUFnQztRQUN4RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ2xDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUVELE9BQU8sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDNUIsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDdkMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNqQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3JCLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDaEIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sd0JBQXdCLENBQUMsT0FBZTtRQUMvQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxvQ0FBb0MsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN4RCxPQUFPO2dCQUNOLElBQUksRUFBRSxTQUFTO2dCQUNmLE9BQU87Z0JBQ1AsSUFBSSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUM7YUFDdkMsQ0FBQztRQUNILENBQUM7UUFFRCxJQUFJLG9GQUFvRixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3hHLE9BQU87Z0JBQ04sSUFBSSxFQUFFLFlBQVk7Z0JBQ2xCLE9BQU87Z0JBQ1AsSUFBSSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUM7YUFDdkMsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8sbUJBQW1CLENBQUMsSUFBWTtRQUN2QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDdkQsSUFBSSxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDdkQsSUFBSSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3JCLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDcEQsT0FBTyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRU8sbUJBQW1CLENBQUMsS0FBYTtRQUN4QyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLCtEQUErRCxDQUFDLENBQUM7UUFDM0YsT0FBTyxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQztJQUM1QixDQUFDO0NBQ0QsQ0FBQTtBQWhMWSxtQkFBbUI7SUFrQjdCLFdBQUEscUJBQXFCLENBQUE7R0FsQlgsbUJBQW1CLENBZ0wvQiJ9