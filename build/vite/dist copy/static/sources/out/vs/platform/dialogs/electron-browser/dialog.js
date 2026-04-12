/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { fromNow } from '../../../base/common/date.js';
import { isLinuxSnap } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { process } from '../../../base/parts/sandbox/electron-browser/globals.js';
export function createNativeAboutDialogDetails(productService, osProps) {
    let version = productService.version;
    if (productService.target) {
        version = `${version} (${productService.target} setup)`;
    }
    else if (productService.darwinUniversalAssetId) {
        version = `${version} (Universal)`;
    }
    const getDetails = (useAgo) => {
        return localize({ key: 'aboutDetail', comment: ['Electron, Chromium, Node.js and V8 are product names that need no translation'] }, "Version: {0}\nCommit: {1}\nDate: {2}\nElectron: {3}\nElectronBuildId: {4}\nChromium: {5}\nNode.js: {6}\nV8: {7}\nOS: {8}", version, productService.commit || 'Unknown', productService.date ? `${productService.date}${useAgo ? ' (' + fromNow(new Date(productService.date), true) + ')' : ''}` : 'Unknown', process.versions['electron'], process.versions['microsoft-build'], process.versions['chrome'], process.versions['node'], process.versions['v8'], `${osProps.type} ${osProps.arch} ${osProps.release}${isLinuxSnap ? ' snap' : ''}`);
    };
    const details = getDetails(true);
    const detailsToCopy = getDetails(false);
    return {
        title: productService.nameLong,
        details: details,
        detailsToCopy: detailsToCopy
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZGlhbG9ncy9lbGVjdHJvbi1icm93c2VyL2RpYWxvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUczQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFbEYsTUFBTSxVQUFVLDhCQUE4QixDQUFDLGNBQStCLEVBQUUsT0FBc0I7SUFDckcsSUFBSSxPQUFPLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQztJQUNyQyxJQUFJLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUMzQixPQUFPLEdBQUcsR0FBRyxPQUFPLEtBQUssY0FBYyxDQUFDLE1BQU0sU0FBUyxDQUFDO0lBQ3pELENBQUM7U0FBTSxJQUFJLGNBQWMsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQ2xELE9BQU8sR0FBRyxHQUFHLE9BQU8sY0FBYyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxNQUFNLFVBQVUsR0FBRyxDQUFDLE1BQWUsRUFBVSxFQUFFO1FBQzlDLE9BQU8sUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBQywrRUFBK0UsQ0FBQyxFQUFFLEVBQ2pJLDBIQUEwSCxFQUMxSCxPQUFPLEVBQ1AsY0FBYyxDQUFDLE1BQU0sSUFBSSxTQUFTLEVBQ2xDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsY0FBYyxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFDcEksT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFDNUIsT0FBTyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUNuQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUMxQixPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUN4QixPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUN0QixHQUFHLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsT0FBTyxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FDakYsQ0FBQztJQUNILENBQUMsQ0FBQztJQUVGLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNqQyxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFeEMsT0FBTztRQUNOLEtBQUssRUFBRSxjQUFjLENBQUMsUUFBUTtRQUM5QixPQUFPLEVBQUUsT0FBTztRQUNoQixhQUFhLEVBQUUsYUFBYTtLQUM1QixDQUFDO0FBQ0gsQ0FBQyJ9