/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { hash } from '../../../../base/common/hash.js';
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
export function getWorkspaceIdentifier(workspaceUri) {
    return {
        id: getWorkspaceId(workspaceUri),
        configPath: workspaceUri
    };
}
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
export function getSingleFolderWorkspaceIdentifier(folderUri) {
    return {
        id: getWorkspaceId(folderUri),
        uri: folderUri
    };
}
function getWorkspaceId(uri) {
    return hash(uri.toString()).toString(16);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL2Jyb3dzZXIvd29ya3NwYWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFdkQseURBQXlEO0FBQ3pELHlEQUF5RDtBQUN6RCx5REFBeUQ7QUFFekQsTUFBTSxVQUFVLHNCQUFzQixDQUFDLFlBQWlCO0lBQ3ZELE9BQU87UUFDTixFQUFFLEVBQUUsY0FBYyxDQUFDLFlBQVksQ0FBQztRQUNoQyxVQUFVLEVBQUUsWUFBWTtLQUN4QixDQUFDO0FBQ0gsQ0FBQztBQUVELHlEQUF5RDtBQUN6RCx5REFBeUQ7QUFDekQseURBQXlEO0FBRXpELE1BQU0sVUFBVSxrQ0FBa0MsQ0FBQyxTQUFjO0lBQ2hFLE9BQU87UUFDTixFQUFFLEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQztRQUM3QixHQUFHLEVBQUUsU0FBUztLQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsR0FBUTtJQUMvQixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDMUMsQ0FBQyJ9