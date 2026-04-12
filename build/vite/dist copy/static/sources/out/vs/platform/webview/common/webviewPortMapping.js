/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { extractLocalHostUriMetaDataForPortMapping } from '../../tunnel/common/tunnel.js';
/**
 * Manages port mappings for a single webview.
 */
export class WebviewPortMappingManager {
    constructor(_getExtensionLocation, _getMappings, tunnelService) {
        this._getExtensionLocation = _getExtensionLocation;
        this._getMappings = _getMappings;
        this.tunnelService = tunnelService;
        this._tunnels = new Map();
    }
    async getRedirect(resolveAuthority, url) {
        const uri = URI.parse(url);
        const requestLocalHostInfo = extractLocalHostUriMetaDataForPortMapping(uri);
        if (!requestLocalHostInfo) {
            return undefined;
        }
        for (const mapping of this._getMappings()) {
            if (mapping.webviewPort === requestLocalHostInfo.port) {
                const extensionLocation = this._getExtensionLocation();
                if (extensionLocation && extensionLocation.scheme === Schemas.vscodeRemote) {
                    const tunnel = resolveAuthority && await this.getOrCreateTunnel(resolveAuthority, mapping.extensionHostPort);
                    if (tunnel) {
                        if (tunnel.tunnelLocalPort === mapping.webviewPort) {
                            return undefined;
                        }
                        return encodeURI(uri.with({
                            authority: `127.0.0.1:${tunnel.tunnelLocalPort}`,
                        }).toString(true));
                    }
                }
                if (mapping.webviewPort !== mapping.extensionHostPort) {
                    return encodeURI(uri.with({
                        authority: `${requestLocalHostInfo.address}:${mapping.extensionHostPort}`
                    }).toString(true));
                }
            }
        }
        return undefined;
    }
    async dispose() {
        for (const tunnel of this._tunnels.values()) {
            await tunnel.dispose();
        }
        this._tunnels.clear();
    }
    async getOrCreateTunnel(remoteAuthority, remotePort) {
        const existing = this._tunnels.get(remotePort);
        if (existing) {
            return existing;
        }
        const tunnelOrError = await this.tunnelService.openTunnel({ getAddress: async () => remoteAuthority }, undefined, remotePort);
        let tunnel;
        if (typeof tunnelOrError === 'string') {
            tunnel = undefined;
        }
        if (tunnel) {
            this._tunnels.set(remotePort, tunnel);
        }
        return tunnel;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld1BvcnRNYXBwaW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2Vidmlldy9jb21tb24vd2Vidmlld1BvcnRNYXBwaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUFFLHlDQUF5QyxFQUFnQyxNQUFNLCtCQUErQixDQUFDO0FBT3hIOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHlCQUF5QjtJQUlyQyxZQUNrQixxQkFBNEMsRUFDNUMsWUFBa0QsRUFDbEQsYUFBNkI7UUFGN0IsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM1QyxpQkFBWSxHQUFaLFlBQVksQ0FBc0M7UUFDbEQsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBTDlCLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBd0IsQ0FBQztJQU14RCxDQUFDO0lBRUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxnQkFBNkMsRUFBRSxHQUFXO1FBQ2xGLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDM0IsTUFBTSxvQkFBb0IsR0FBRyx5Q0FBeUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUMzQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztZQUMzQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLEtBQUssb0JBQW9CLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3ZELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQ3ZELElBQUksaUJBQWlCLElBQUksaUJBQWlCLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDNUUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLElBQUksTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7b0JBQzdHLElBQUksTUFBTSxFQUFFLENBQUM7d0JBQ1osSUFBSSxNQUFNLENBQUMsZUFBZSxLQUFLLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQzs0QkFDcEQsT0FBTyxTQUFTLENBQUM7d0JBQ2xCLENBQUM7d0JBQ0QsT0FBTyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQzs0QkFDekIsU0FBUyxFQUFFLGFBQWEsTUFBTSxDQUFDLGVBQWUsRUFBRTt5QkFDaEQsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNwQixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsSUFBSSxPQUFPLENBQUMsV0FBVyxLQUFLLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO29CQUN2RCxPQUFPLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO3dCQUN6QixTQUFTLEVBQUUsR0FBRyxvQkFBb0IsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLGlCQUFpQixFQUFFO3FCQUN6RSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTztRQUNaLEtBQUssTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQzdDLE1BQU0sTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLENBQUM7UUFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFTyxLQUFLLENBQUMsaUJBQWlCLENBQUMsZUFBeUIsRUFBRSxVQUFrQjtRQUM1RSxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTyxRQUFRLENBQUM7UUFDakIsQ0FBQztRQUNELE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxlQUFlLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDOUgsSUFBSSxNQUFnQyxDQUFDO1FBQ3JDLElBQUksT0FBTyxhQUFhLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdkMsTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUNwQixDQUFDO1FBQ0QsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0QifQ==