/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../base/common/network.js';
import { ExtUri } from '../../../base/common/resources.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export class ExtHostFileSystemInfo {
    constructor() {
        this._systemSchemes = new Set(Object.keys(Schemas));
        this._providerInfo = new Map();
        this.extUri = new ExtUri(uri => {
            const capabilities = this._providerInfo.get(uri.scheme);
            if (capabilities === undefined) {
                // default: not ignore
                return false;
            }
            if (capabilities & 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */) {
                // configured as case sensitive
                return false;
            }
            return true;
        });
    }
    $acceptProviderInfos(uri, capabilities) {
        if (capabilities === null) {
            this._providerInfo.delete(uri.scheme);
        }
        else {
            this._providerInfo.set(uri.scheme, capabilities);
        }
    }
    isFreeScheme(scheme) {
        return !this._providerInfo.has(scheme) && !this._systemSchemes.has(scheme);
    }
    getCapabilities(scheme) {
        return this._providerInfo.get(scheme);
    }
}
export const IExtHostFileSystemInfo = createDecorator('IExtHostFileSystemInfo');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFXLE1BQU0sbUNBQW1DLENBQUM7QUFHcEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRzFGLE1BQU0sT0FBTyxxQkFBcUI7SUFTakM7UUFMaUIsbUJBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDL0Msa0JBQWEsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUsxRCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQzlCLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4RCxJQUFJLFlBQVksS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDaEMsc0JBQXNCO2dCQUN0QixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxJQUFJLFlBQVksOERBQW1ELEVBQUUsQ0FBQztnQkFDckUsK0JBQStCO2dCQUMvQixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELG9CQUFvQixDQUFDLEdBQWtCLEVBQUUsWUFBMkI7UUFDbkUsSUFBSSxZQUFZLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNsRCxDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVksQ0FBQyxNQUFjO1FBQzFCLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFRCxlQUFlLENBQUMsTUFBYztRQUM3QixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7Q0FDRDtBQUtELE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGVBQWUsQ0FBeUIsd0JBQXdCLENBQUMsQ0FBQyJ9