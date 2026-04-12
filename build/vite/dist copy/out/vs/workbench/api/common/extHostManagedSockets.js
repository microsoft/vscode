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
import { MainContext } from './extHost.protocol.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { VSBuffer } from '../../../base/common/buffer.js';
export const IExtHostManagedSockets = createDecorator('IExtHostManagedSockets');
let ExtHostManagedSockets = class ExtHostManagedSockets {
    constructor(extHostRpc) {
        this._remoteSocketIdCounter = 0;
        this._factory = null;
        this._managedRemoteSockets = new Map();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadManagedSockets);
    }
    setFactory(socketFactoryId, makeConnection) {
        // Terminate all previous sockets
        for (const socket of this._managedRemoteSockets.values()) {
            // calling dispose() will lead to it removing itself from the map
            socket.dispose();
        }
        // Unregister previous factory
        if (this._factory) {
            this._proxy.$unregisterSocketFactory(this._factory.socketFactoryId);
        }
        this._factory = new ManagedSocketFactory(socketFactoryId, makeConnection);
        this._proxy.$registerSocketFactory(this._factory.socketFactoryId);
    }
    async $openRemoteSocket(socketFactoryId) {
        if (!this._factory || this._factory.socketFactoryId !== socketFactoryId) {
            throw new Error(`No socket factory with id ${socketFactoryId}`);
        }
        const id = (++this._remoteSocketIdCounter);
        const socket = await this._factory.makeConnection();
        const disposable = new DisposableStore();
        this._managedRemoteSockets.set(id, new ManagedSocket(id, socket, disposable));
        disposable.add(toDisposable(() => this._managedRemoteSockets.delete(id)));
        disposable.add(socket.onDidEnd(() => {
            this._proxy.$onDidManagedSocketEnd(id);
            disposable.dispose();
        }));
        disposable.add(socket.onDidClose(e => {
            this._proxy.$onDidManagedSocketClose(id, e?.stack ?? e?.message);
            disposable.dispose();
        }));
        disposable.add(socket.onDidReceiveMessage(e => this._proxy.$onDidManagedSocketHaveData(id, VSBuffer.wrap(e))));
        return id;
    }
    $remoteSocketWrite(socketId, buffer) {
        this._managedRemoteSockets.get(socketId)?.actual.send(buffer.buffer);
    }
    $remoteSocketEnd(socketId) {
        const socket = this._managedRemoteSockets.get(socketId);
        if (socket) {
            socket.actual.end();
            socket.dispose();
        }
    }
    async $remoteSocketDrain(socketId) {
        await this._managedRemoteSockets.get(socketId)?.actual.drain?.();
    }
};
ExtHostManagedSockets = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostManagedSockets);
export { ExtHostManagedSockets };
class ManagedSocketFactory {
    constructor(socketFactoryId, makeConnection) {
        this.socketFactoryId = socketFactoryId;
        this.makeConnection = makeConnection;
    }
}
class ManagedSocket extends Disposable {
    constructor(socketId, actual, disposer) {
        super();
        this.socketId = socketId;
        this.actual = actual;
        this._register(disposer);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE1hbmFnZWRTb2NrZXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdE1hbmFnZWRTb2NrZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBOEIsV0FBVyxFQUFpQyxNQUFNLHVCQUF1QixDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUxRixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFPMUQsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsZUFBZSxDQUF5Qix3QkFBd0IsQ0FBQyxDQUFDO0FBRWpHLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCO0lBUWpDLFlBQ3FCLFVBQThCO1FBTDNDLDJCQUFzQixHQUFHLENBQUMsQ0FBQztRQUMzQixhQUFRLEdBQWdDLElBQUksQ0FBQztRQUNwQywwQkFBcUIsR0FBK0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUs5RSxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELFVBQVUsQ0FBQyxlQUF1QixFQUFFLGNBQTREO1FBQy9GLGlDQUFpQztRQUNqQyxLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQzFELGlFQUFpRTtZQUNqRSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbEIsQ0FBQztRQUNELDhCQUE4QjtRQUM5QixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuQixJQUFJLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDckUsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxLQUFLLENBQUMsaUJBQWlCLENBQUMsZUFBdUI7UUFDOUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEtBQUssZUFBZSxFQUFFLENBQUM7WUFDekUsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBRUQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNwRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLElBQUksYUFBYSxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUU5RSxVQUFVLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRSxVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFO1lBQ25DLElBQUksQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdkMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDcEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDakUsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixVQUFVLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsMkJBQTJCLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0csT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsa0JBQWtCLENBQUMsUUFBZ0IsRUFBRSxNQUFnQjtRQUNwRCxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFFRCxnQkFBZ0IsQ0FBQyxRQUFnQjtRQUNoQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hELElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsQixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFnQjtRQUN4QyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7SUFDbEUsQ0FBQztDQUNELENBQUE7QUFwRVkscUJBQXFCO0lBUy9CLFdBQUEsa0JBQWtCLENBQUE7R0FUUixxQkFBcUIsQ0FvRWpDOztBQUVELE1BQU0sb0JBQW9CO0lBQ3pCLFlBQ2lCLGVBQXVCLEVBQ3ZCLGNBQTREO1FBRDVELG9CQUFlLEdBQWYsZUFBZSxDQUFRO1FBQ3ZCLG1CQUFjLEdBQWQsY0FBYyxDQUE4QztJQUN6RSxDQUFDO0NBQ0w7QUFFRCxNQUFNLGFBQWMsU0FBUSxVQUFVO0lBQ3JDLFlBQ2lCLFFBQWdCLEVBQ2hCLE1BQW9DLEVBQ3BELFFBQXlCO1FBRXpCLEtBQUssRUFBRSxDQUFDO1FBSlEsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUNoQixXQUFNLEdBQU4sTUFBTSxDQUE4QjtRQUlwRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFCLENBQUM7Q0FDRCJ9