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
var SharedProcessTunnelService_1;
import { ILogService } from '../../log/common/log.js';
import { ISharedTunnelsService } from '../common/tunnel.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { canceled } from '../../../base/common/errors.js';
import { DeferredPromise } from '../../../base/common/async.js';
class TunnelData extends Disposable {
    constructor() {
        super();
        this._address = null;
        this._addressPromise = null;
    }
    async getAddress() {
        if (this._address) {
            // address is resolved
            return this._address;
        }
        if (!this._addressPromise) {
            this._addressPromise = new DeferredPromise();
        }
        return this._addressPromise.p;
    }
    setAddress(address) {
        this._address = address;
        if (this._addressPromise) {
            this._addressPromise.complete(address);
            this._addressPromise = null;
        }
    }
    setTunnel(tunnel) {
        this._register(tunnel);
    }
}
let SharedProcessTunnelService = class SharedProcessTunnelService extends Disposable {
    static { SharedProcessTunnelService_1 = this; }
    static { this._lastId = 0; }
    constructor(_tunnelService, _logService) {
        super();
        this._tunnelService = _tunnelService;
        this._logService = _logService;
        this._tunnels = new Map();
        this._disposedTunnels = new Set();
    }
    dispose() {
        super.dispose();
        this._tunnels.forEach((tunnel) => tunnel.dispose());
    }
    async createTunnel() {
        const id = String(++SharedProcessTunnelService_1._lastId);
        return { id };
    }
    async startTunnel(authority, id, tunnelRemoteHost, tunnelRemotePort, tunnelLocalHost, tunnelLocalPort, elevateIfNeeded) {
        const tunnelData = new TunnelData();
        const tunnel = await Promise.resolve(this._tunnelService.openTunnel(authority, tunnelData, tunnelRemoteHost, tunnelRemotePort, tunnelLocalHost, tunnelLocalPort, elevateIfNeeded));
        if (!tunnel || (typeof tunnel === 'string')) {
            this._logService.info(`[SharedProcessTunnelService] Could not create a tunnel to ${tunnelRemoteHost}:${tunnelRemotePort} (remote).`);
            tunnelData.dispose();
            throw new Error(`Could not create tunnel`);
        }
        if (this._disposedTunnels.delete(id)) {
            // This tunnel was disposed in the meantime
            tunnelData.dispose();
            await tunnel.dispose();
            throw canceled();
        }
        tunnelData.setTunnel(tunnel);
        this._tunnels.set(id, tunnelData);
        this._logService.info(`[SharedProcessTunnelService] Created tunnel ${id}: ${tunnel.localAddress} (local) to ${tunnelRemoteHost}:${tunnelRemotePort} (remote).`);
        const result = {
            tunnelLocalPort: tunnel.tunnelLocalPort,
            localAddress: tunnel.localAddress
        };
        return result;
    }
    async setAddress(id, address) {
        const tunnel = this._tunnels.get(id);
        if (!tunnel) {
            return;
        }
        tunnel.setAddress(address);
    }
    async destroyTunnel(id) {
        const tunnel = this._tunnels.get(id);
        if (tunnel) {
            this._logService.info(`[SharedProcessTunnelService] Disposing tunnel ${id}.`);
            this._tunnels.delete(id);
            await tunnel.dispose();
            return;
        }
        // Looks like this tunnel is still starting, mark the id as disposed
        this._disposedTunnels.add(id);
    }
};
SharedProcessTunnelService = SharedProcessTunnelService_1 = __decorate([
    __param(0, ISharedTunnelsService),
    __param(1, ILogService)
], SharedProcessTunnelService);
export { SharedProcessTunnelService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVkUHJvY2Vzc1R1bm5lbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90dW5uZWwvbm9kZS9zaGFyZWRQcm9jZXNzVHVubmVsU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXRELE9BQU8sRUFBRSxxQkFBcUIsRUFBZ0IsTUFBTSxxQkFBcUIsQ0FBQztBQUUxRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVoRSxNQUFNLFVBQVcsU0FBUSxVQUFVO0lBS2xDO1FBQ0MsS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNyQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztJQUM3QixDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVU7UUFDZixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuQixzQkFBc0I7WUFDdEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO1FBQ3RCLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQVksQ0FBQztRQUN4RCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQsVUFBVSxDQUFDLE9BQWlCO1FBQzNCLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1FBQ3hCLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0lBRUQsU0FBUyxDQUFDLE1BQW9CO1FBQzdCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEIsQ0FBQztDQUNEO0FBRU0sSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSxVQUFVOzthQUcxQyxZQUFPLEdBQUcsQ0FBQyxBQUFKLENBQUs7SUFLM0IsWUFDd0IsY0FBc0QsRUFDaEUsV0FBeUM7UUFFdEQsS0FBSyxFQUFFLENBQUM7UUFIZ0MsbUJBQWMsR0FBZCxjQUFjLENBQXVCO1FBQy9DLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBTHRDLGFBQVEsR0FBNEIsSUFBSSxHQUFHLEVBQXNCLENBQUM7UUFDbEUscUJBQWdCLEdBQWdCLElBQUksR0FBRyxFQUFVLENBQUM7SUFPbkUsQ0FBQztJQUVlLE9BQU87UUFDdEIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVk7UUFDakIsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLEVBQUUsNEJBQTBCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDeEQsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQ2YsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsU0FBaUIsRUFBRSxFQUFVLEVBQUUsZ0JBQXdCLEVBQUUsZ0JBQXdCLEVBQUUsZUFBdUIsRUFBRSxlQUFtQyxFQUFFLGVBQW9DO1FBQ3RNLE1BQU0sVUFBVSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7UUFFcEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ25MLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxPQUFPLE1BQU0sS0FBSyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzdDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDZEQUE2RCxnQkFBZ0IsSUFBSSxnQkFBZ0IsWUFBWSxDQUFDLENBQUM7WUFDckksVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUM1QyxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDdEMsMkNBQTJDO1lBQzNDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNyQixNQUFNLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN2QixNQUFNLFFBQVEsRUFBRSxDQUFDO1FBQ2xCLENBQUM7UUFFRCxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdCLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUVsQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxLQUFLLE1BQU0sQ0FBQyxZQUFZLGVBQWUsZ0JBQWdCLElBQUksZ0JBQWdCLFlBQVksQ0FBQyxDQUFDO1FBQ2hLLE1BQU0sTUFBTSxHQUF5QjtZQUNwQyxlQUFlLEVBQUUsTUFBTSxDQUFDLGVBQWU7WUFDdkMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxZQUFZO1NBQ2pDLENBQUM7UUFDRixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQVUsRUFBRSxPQUFpQjtRQUM3QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELEtBQUssQ0FBQyxhQUFhLENBQUMsRUFBVTtRQUM3QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsaURBQWlELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekIsTUFBTSxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdkIsT0FBTztRQUNSLENBQUM7UUFFRCxvRUFBb0U7UUFDcEUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMvQixDQUFDOztBQXhFVywwQkFBMEI7SUFTcEMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLFdBQVcsQ0FBQTtHQVZELDBCQUEwQixDQXlFdEMifQ==