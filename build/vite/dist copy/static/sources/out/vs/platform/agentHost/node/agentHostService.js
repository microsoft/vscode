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
import { Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { RemoteLoggerChannelClient } from '../../log/common/logIpc.js';
var Constants;
(function (Constants) {
    Constants[Constants["MaxRestarts"] = 5] = "MaxRestarts";
})(Constants || (Constants = {}));
/**
 * Main-process service that manages the agent host utility process lifecycle
 * (lazy start, crash recovery, logger forwarding). The renderer communicates
 * with the utility process directly via MessagePort - this class does not
 * relay any agent service calls.
 */
let AgentHostProcessManager = class AgentHostProcessManager extends Disposable {
    constructor(_starter, _logService, _loggerService) {
        super();
        this._starter = _starter;
        this._logService = _logService;
        this._loggerService = _loggerService;
        this._started = false;
        this._wasQuitRequested = false;
        this._restartCount = 0;
        this._register(this._starter);
        // Start lazily when the first window asks for a connection
        if (this._starter.onRequestConnection) {
            this._register(Event.once(this._starter.onRequestConnection)(() => this._ensureStarted()));
        }
        if (this._starter.onWillShutdown) {
            this._register(this._starter.onWillShutdown(() => this._wasQuitRequested = true));
        }
    }
    _ensureStarted() {
        if (!this._started) {
            this._start();
        }
    }
    _start() {
        const connection = this._starter.start();
        this._logService.info('AgentHostProcessManager: agent host started');
        // Connect logger channel so agent host logs appear in the output channel
        this._register(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel("agentHostLogger" /* AgentHostIpcChannels.Logger */)));
        // Handle unexpected exit
        this._register(connection.onDidProcessExit(e => {
            if (!this._wasQuitRequested && !this._store.isDisposed) {
                if (this._restartCount <= Constants.MaxRestarts) {
                    this._logService.error(`AgentHostProcessManager: agent host terminated unexpectedly with code ${e.code}`);
                    this._restartCount++;
                    this._started = false;
                    connection.store.dispose();
                    this._start();
                }
                else {
                    this._logService.error(`AgentHostProcessManager: agent host terminated with code ${e.code}, giving up after ${Constants.MaxRestarts} restarts`);
                }
            }
        }));
        this._register(toDisposable(() => connection.store.dispose()));
        this._started = true;
    }
};
AgentHostProcessManager = __decorate([
    __param(1, ILogService),
    __param(2, ILoggerService)
], AgentHostProcessManager);
export { AgentHostProcessManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl2RSxJQUFLLFNBRUo7QUFGRCxXQUFLLFNBQVM7SUFDYix1REFBZSxDQUFBO0FBQ2hCLENBQUMsRUFGSSxTQUFTLEtBQVQsU0FBUyxRQUViO0FBRUQ7Ozs7O0dBS0c7QUFDSSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLFVBQVU7SUFNdEQsWUFDa0IsUUFBMkIsRUFDL0IsV0FBeUMsRUFDdEMsY0FBK0M7UUFFL0QsS0FBSyxFQUFFLENBQUM7UUFKUyxhQUFRLEdBQVIsUUFBUSxDQUFtQjtRQUNkLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ3JCLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQVB4RCxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLHNCQUFpQixHQUFHLEtBQUssQ0FBQztRQUMxQixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQVN6QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU5QiwyREFBMkQ7UUFDM0QsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVGLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNuRixDQUFDO0lBQ0YsQ0FBQztJQUVPLGNBQWM7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZixDQUFDO0lBQ0YsQ0FBQztJQUVPLE1BQU07UUFDYixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRXpDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDZDQUE2QyxDQUFDLENBQUM7UUFFckUseUVBQXlFO1FBQ3pFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsVUFBVSxxREFBNkIsQ0FBQyxDQUFDLENBQUM7UUFFOUgseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzlDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN4RCxJQUFJLElBQUksQ0FBQyxhQUFhLElBQUksU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUNqRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyx5RUFBeUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQzFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDckIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7b0JBQ3RCLFVBQVUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQzNCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDZixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsNERBQTRELENBQUMsQ0FBQyxJQUFJLHFCQUFxQixTQUFTLENBQUMsV0FBVyxXQUFXLENBQUMsQ0FBQztnQkFDakosQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDdEIsQ0FBQztDQUNELENBQUE7QUF6RFksdUJBQXVCO0lBUWpDLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxjQUFjLENBQUE7R0FUSix1QkFBdUIsQ0F5RG5DIn0=