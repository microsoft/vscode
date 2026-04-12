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
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { Client } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { parsePtyHostDebugPort } from '../../environment/node/environmentService.js';
let NodePtyHostStarter = class NodePtyHostStarter extends Disposable {
    constructor(_reconnectConstants, _environmentService) {
        super();
        this._reconnectConstants = _reconnectConstants;
        this._environmentService = _environmentService;
    }
    start() {
        const opts = {
            serverName: 'Pty Host',
            args: ['--type=ptyHost', '--logsPath', this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath],
            env: {
                VSCODE_ESM_ENTRYPOINT: 'vs/platform/terminal/node/ptyHostMain',
                VSCODE_PIPE_LOGGING: 'true',
                VSCODE_VERBOSE_LOGGING: 'true', // transmit console logs from server to client,
                VSCODE_RECONNECT_GRACE_TIME: this._reconnectConstants.graceTime,
                VSCODE_RECONNECT_SHORT_GRACE_TIME: this._reconnectConstants.shortGraceTime,
                VSCODE_RECONNECT_SCROLLBACK: this._reconnectConstants.scrollback
            }
        };
        const ptyHostDebug = parsePtyHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
        if (ptyHostDebug) {
            if (ptyHostDebug.break && ptyHostDebug.port) {
                opts.debugBrk = ptyHostDebug.port;
            }
            else if (!ptyHostDebug.break && ptyHostDebug.port) {
                opts.debug = ptyHostDebug.port;
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
NodePtyHostStarter = __decorate([
    __param(1, IEnvironmentService)
], NodePtyHostStarter);
export { NodePtyHostStarter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZVB0eUhvc3RTdGFydGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvbm9kZS9ub2RlUHR5SG9zdFN0YXJ0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxNQUFNLEVBQWUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsbUJBQW1CLEVBQTZCLE1BQU0seUNBQXlDLENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFJOUUsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFVO0lBQ2pELFlBQ2tCLG1CQUF3QyxFQUNuQixtQkFBOEM7UUFFcEYsS0FBSyxFQUFFLENBQUM7UUFIUyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBQ25CLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBMkI7SUFHckYsQ0FBQztJQUVELEtBQUs7UUFDSixNQUFNLElBQUksR0FBZ0I7WUFDekIsVUFBVSxFQUFFLFVBQVU7WUFDdEIsSUFBSSxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUMvRyxHQUFHLEVBQUU7Z0JBQ0oscUJBQXFCLEVBQUUsdUNBQXVDO2dCQUM5RCxtQkFBbUIsRUFBRSxNQUFNO2dCQUMzQixzQkFBc0IsRUFBRSxNQUFNLEVBQUUsK0NBQStDO2dCQUMvRSwyQkFBMkIsRUFBRSxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUztnQkFDL0QsaUNBQWlDLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGNBQWM7Z0JBQzFFLDJCQUEyQixFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVO2FBQ2hFO1NBQ0QsQ0FBQztRQUVGLE1BQU0sWUFBWSxHQUFHLHFCQUFxQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVHLElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsSUFBSSxZQUFZLENBQUMsS0FBSyxJQUFJLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLFFBQVEsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDO1lBQ25DLENBQUM7aUJBQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLElBQUksWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNyRCxJQUFJLENBQUMsS0FBSyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRS9FLE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVsQixPQUFPO1lBQ04sTUFBTTtZQUNOLEtBQUs7WUFDTCxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsZ0JBQWdCO1NBQ3pDLENBQUM7SUFDSCxDQUFDO0NBQ0QsQ0FBQTtBQTFDWSxrQkFBa0I7SUFHNUIsV0FBQSxtQkFBbUIsQ0FBQTtHQUhULGtCQUFrQixDQTBDOUIifQ==