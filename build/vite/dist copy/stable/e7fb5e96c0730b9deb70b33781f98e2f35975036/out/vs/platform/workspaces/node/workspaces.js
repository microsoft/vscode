/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createHash } from 'crypto';
import { Schemas } from '../../../base/common/network.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { originalFSPath } from '../../../base/common/resources.js';
/**
 * Length of workspace identifiers that are not empty. Those are
 * MD5 hashes (128bits / 4 due to hex presentation).
 */
export const NON_EMPTY_WORKSPACE_ID_LENGTH = 128 / 4;
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
export function getWorkspaceIdentifier(configPath) {
    function getWorkspaceId() {
        let configPathStr = configPath.scheme === Schemas.file ? originalFSPath(configPath) : configPath.toString();
        if (!isLinux) {
            configPathStr = configPathStr.toLowerCase(); // sanitize for platform file system
        }
        return createHash('md5').update(configPathStr).digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
    }
    return {
        id: getWorkspaceId(),
        configPath
    };
}
export function getSingleFolderWorkspaceIdentifier(folderUri, folderStat) {
    function getFolderId() {
        // Remote: produce a hash from the entire URI
        if (folderUri.scheme !== Schemas.file) {
            return createHash('md5').update(folderUri.toString()).digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
        }
        // Local: we use the ctime as extra salt to the
        // identifier so that folders getting recreated
        // result in a different identifier. However, if
        // the stat is not provided we return `undefined`
        // to ensure identifiers are stable for the given
        // URI.
        if (!folderStat) {
            return undefined;
        }
        let ctime;
        if (isLinux) {
            ctime = folderStat.ino; // Linux: birthtime is ctime, so we cannot use it! We use the ino instead!
        }
        else if (isMacintosh) {
            ctime = folderStat.birthtime.getTime(); // macOS: birthtime is fine to use as is
        }
        else if (isWindows) {
            if (typeof folderStat.birthtimeMs === 'number') {
                ctime = Math.floor(folderStat.birthtimeMs); // Windows: fix precision issue in node.js 8.x to get 7.x results (see https://github.com/nodejs/node/issues/19897)
            }
            else {
                ctime = folderStat.birthtime.getTime();
            }
        }
        return createHash('md5').update(folderUri.fsPath).update(ctime ? String(ctime) : '').digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
    }
    const folderId = getFolderId();
    if (typeof folderId === 'string') {
        return {
            id: folderId,
            uri: folderUri
        };
    }
    return undefined; // invalid folder
}
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
export function createEmptyWorkspaceIdentifier() {
    return {
        id: (Date.now() + Math.round(Math.random() * 1000)).toString()
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dvcmtzcGFjZXMvbm9kZS93b3Jrc3BhY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFFcEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUluRTs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRXJELHlEQUF5RDtBQUN6RCx5REFBeUQ7QUFDekQseURBQXlEO0FBRXpELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxVQUFlO0lBRXJELFNBQVMsY0FBYztRQUN0QixJQUFJLGFBQWEsR0FBRyxVQUFVLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzVHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLGFBQWEsR0FBRyxhQUFhLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxvQ0FBb0M7UUFDbEYsQ0FBQztRQUVELE9BQU8sVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxzRUFBc0U7SUFDckksQ0FBQztJQUVELE9BQU87UUFDTixFQUFFLEVBQUUsY0FBYyxFQUFFO1FBQ3BCLFVBQVU7S0FDVixDQUFDO0FBQ0gsQ0FBQztBQVFELE1BQU0sVUFBVSxrQ0FBa0MsQ0FBQyxTQUFjLEVBQUUsVUFBa0I7SUFFcEYsU0FBUyxXQUFXO1FBRW5CLDZDQUE2QztRQUM3QyxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3ZDLE9BQU8sVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxzRUFBc0U7UUFDNUksQ0FBQztRQUVELCtDQUErQztRQUMvQywrQ0FBK0M7UUFDL0MsZ0RBQWdEO1FBQ2hELGlEQUFpRDtRQUNqRCxpREFBaUQ7UUFDakQsT0FBTztRQUVQLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxLQUF5QixDQUFDO1FBQzlCLElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLDBFQUEwRTtRQUNuRyxDQUFDO2FBQU0sSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUN4QixLQUFLLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLHdDQUF3QztRQUNqRixDQUFDO2FBQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUN0QixJQUFJLE9BQU8sVUFBVSxDQUFDLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDaEQsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsbUhBQW1IO1lBQ2hLLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxLQUFLLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN4QyxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxzRUFBc0U7SUFDM0ssQ0FBQztJQUVELE1BQU0sUUFBUSxHQUFHLFdBQVcsRUFBRSxDQUFDO0lBQy9CLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDbEMsT0FBTztZQUNOLEVBQUUsRUFBRSxRQUFRO1lBQ1osR0FBRyxFQUFFLFNBQVM7U0FDZCxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sU0FBUyxDQUFDLENBQUMsaUJBQWlCO0FBQ3BDLENBQUM7QUFFRCx5REFBeUQ7QUFDekQseURBQXlEO0FBQ3pELHlEQUF5RDtBQUV6RCxNQUFNLFVBQVUsOEJBQThCO0lBQzdDLE9BQU87UUFDTixFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUU7S0FDOUQsQ0FBQztBQUNILENBQUMifQ==