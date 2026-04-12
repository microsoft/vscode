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
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { ManagedSocket, connectManagedSocket } from '../../../platform/remote/common/managedSocket.js';
import { IRemoteSocketFactoryService } from '../../../platform/remote/common/remoteSocketFactoryService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadManagedSockets = class MainThreadManagedSockets extends Disposable {
    constructor(extHostContext, _remoteSocketFactoryService) {
        super();
        this._remoteSocketFactoryService = _remoteSocketFactoryService;
        this._registrations = this._register(new DisposableMap());
        this._remoteSockets = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostManagedSockets);
    }
    async $registerSocketFactory(socketFactoryId) {
        const that = this;
        const store = new DisposableStore();
        const socketFactory = new class {
            supports(connectTo) {
                return (connectTo.id === socketFactoryId);
            }
            connect(connectTo, path, query, debugLabel) {
                return new Promise((resolve, reject) => {
                    if (connectTo.id !== socketFactoryId) {
                        return reject(new Error('Invalid connectTo'));
                    }
                    const factoryId = connectTo.id;
                    that._proxy.$openRemoteSocket(factoryId).then(socketId => {
                        const half = {
                            onClose: new Emitter(),
                            onData: new Emitter(),
                            onEnd: new Emitter(),
                        };
                        that._remoteSockets.set(socketId, half);
                        MainThreadManagedSocket.connect(socketId, that._proxy, path, query, debugLabel, half)
                            .then(socket => {
                            store.add(Event.once(socket.onDidDispose)(() => that._remoteSockets.delete(socketId)));
                            resolve(socket);
                        }, err => {
                            that._remoteSockets.delete(socketId);
                            reject(err);
                        });
                    }).catch(reject);
                });
            }
        };
        store.add(this._remoteSocketFactoryService.register(1 /* RemoteConnectionType.Managed */, socketFactory));
        this._registrations.set(socketFactoryId, store);
    }
    async $unregisterSocketFactory(socketFactoryId) {
        this._registrations.deleteAndDispose(socketFactoryId);
    }
    $onDidManagedSocketHaveData(socketId, data) {
        this._remoteSockets.get(socketId)?.onData.fire(data);
    }
    $onDidManagedSocketClose(socketId, error) {
        this._remoteSockets.get(socketId)?.onClose.fire({
            type: 0 /* SocketCloseEventType.NodeSocketCloseEvent */,
            error: error ? new Error(error) : undefined,
            hadError: !!error
        });
        this._remoteSockets.delete(socketId);
    }
    $onDidManagedSocketEnd(socketId) {
        this._remoteSockets.get(socketId)?.onEnd.fire();
    }
};
MainThreadManagedSockets = __decorate([
    extHostNamedCustomer(MainContext.MainThreadManagedSockets),
    __param(1, IRemoteSocketFactoryService)
], MainThreadManagedSockets);
export { MainThreadManagedSockets };
export class MainThreadManagedSocket extends ManagedSocket {
    static connect(socketId, proxy, path, query, debugLabel, half) {
        const socket = new MainThreadManagedSocket(socketId, proxy, debugLabel, half);
        return connectManagedSocket(socket, path, query, debugLabel, half);
    }
    constructor(socketId, proxy, debugLabel, half) {
        super(debugLabel, half);
        this.socketId = socketId;
        this.proxy = proxy;
    }
    write(buffer) {
        this.proxy.$remoteSocketWrite(this.socketId, buffer);
    }
    closeRemote() {
        this.proxy.$remoteSocketEnd(this.socketId);
    }
    drain() {
        return this.proxy.$remoteSocketDrain(this.socketId);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE1hbmFnZWRTb2NrZXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRNYW5hZ2VkU29ja2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9GLE9BQU8sRUFBRSxhQUFhLEVBQW9CLG9CQUFvQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFekgsT0FBTyxFQUFFLDJCQUEyQixFQUFrQixNQUFNLCtEQUErRCxDQUFDO0FBQzVILE9BQU8sRUFBbUIsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsY0FBYyxFQUE4QixXQUFXLEVBQWlDLE1BQU0sK0JBQStCLENBQUM7QUFHaEksSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBTXZELFlBQ0MsY0FBK0IsRUFDRiwyQkFBeUU7UUFFdEcsS0FBSyxFQUFFLENBQUM7UUFGc0MsZ0NBQTJCLEdBQTNCLDJCQUEyQixDQUE2QjtRQUx0RixtQkFBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQVUsQ0FBQyxDQUFDO1FBQzdELG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQTRCLENBQUM7UUFPckUsSUFBSSxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFRCxLQUFLLENBQUMsc0JBQXNCLENBQUMsZUFBdUI7UUFDbkQsTUFBTSxJQUFJLEdB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