/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { sequence } from '../../../../base/common/async.js';
import { Schemas } from '../../../../base/common/network.js';
import { getRemoteName, getRemoteServerRootPath } from '../../../../platform/remote/common/remoteHosts.js';
// Commands
export function revealResourcesInOS(resources, nativeHostService, workspaceContextService) {
    if (resources.length) {
        sequence(resources.map(r => async () => {
            const localUri = toLocalFileUri(r);
            if (localUri) {
                nativeHostService.showItemInFolder(localUri.fsPath);
            }
        }));
    }
    else if (workspaceContextService.getWorkspace().folders.length) {
        const localUri = toLocalFileUri(workspaceContextService.getWorkspace().folders[0].uri);
        if (localUri) {
            nativeHostService.showItemInFolder(localUri.fsPath);
        }
    }
}
/**
 * Converts a resource URI to a local file URI.
 * For WSL remote resources, constructs a UNC path (e.g. \\wsl$\Ubuntu\...).
 */
function toLocalFileUri(resource) {
    switch (resource.scheme) {
        case Schemas.file:
        case Schemas.vscodeUserData:
            return resource.with({ scheme: Schemas.file });
        case Schemas.vscodeRemote: {
            const remoteName = getRemoteName(resource.authority);
            if (remoteName === 'wsl') {
                const distro = getRemoteServerRootPath(resource.authority);
                if (distro) {
                    return URI.from({ scheme: Schemas.file, authority: 'wsl$', path: `/${distro}${resource.path}` });
                }
            }
            return undefined;
        }
        default:
            return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvZWxlY3Ryb24tYnJvd3Nlci9maWxlQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0QsT0FBTyxFQUFFLGFBQWEsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRTNHLFdBQVc7QUFFWCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsU0FBZ0IsRUFBRSxpQkFBcUMsRUFBRSx1QkFBaUQ7SUFDN0ksSUFBSSxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdEIsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUN0QyxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDckQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO1NBQU0sSUFBSSx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbEUsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLHVCQUF1QixDQUFDLFlBQVksRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2RixJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JELENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQVMsY0FBYyxDQUFDLFFBQWE7SUFDcEMsUUFBUSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDekIsS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQ2xCLEtBQUssT0FBTyxDQUFDLGNBQWM7WUFDMUIsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEtBQUssT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDM0IsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNyRCxJQUFJLFVBQVUsS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxNQUFNLEdBQUcsdUJBQXVCLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUMzRCxJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNaLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ2xHLENBQUM7WUFDRixDQUFDO1lBQ0QsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNEO1lBQ0MsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztBQUNGLENBQUMifQ==