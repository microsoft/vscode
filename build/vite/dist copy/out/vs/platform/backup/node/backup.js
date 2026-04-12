/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
export function isEmptyWindowBackupInfo(obj) {
    const candidate = obj;
    return typeof candidate?.backupFolder === 'string';
}
export function deserializeWorkspaceInfos(serializedBackupWorkspaces) {
    let workspaceBackupInfos = [];
    try {
        if (Array.isArray(serializedBackupWorkspaces.workspaces)) {
            workspaceBackupInfos = serializedBackupWorkspaces.workspaces.map(workspace => ({
                workspace: {
                    id: workspace.id,
                    configPath: URI.parse(workspace.configURIPath)
                },
                remoteAuthority: workspace.remoteAuthority
            }));
        }
    }
    catch {
        // ignore URI parsing exceptions
    }
    return workspaceBackupInfos;
}
export function deserializeFolderInfos(serializedBackupWorkspaces) {
    let folderBackupInfos = [];
    try {
        if (Array.isArray(serializedBackupWorkspaces.folders)) {
            folderBackupInfos = serializedBackupWorkspaces.folders.map(folder => ({
                folderUri: URI.parse(folder.folderUri),
                remoteAuthority: folder.remoteAuthority
            }));
        }
    }
    catch {
        // ignore URI parsing exceptions
    }
    return folderBackupInfos;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja3VwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYmFja3VwL25vZGUvYmFja3VwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQU9sRCxNQUFNLFVBQVUsdUJBQXVCLENBQUMsR0FBWTtJQUNuRCxNQUFNLFNBQVMsR0FBRyxHQUF5QyxDQUFDO0lBRTVELE9BQU8sT0FBTyxTQUFTLEVBQUUsWUFBWSxLQUFLLFFBQVEsQ0FBQztBQUNwRCxDQUFDO0FBUUQsTUFBTSxVQUFVLHlCQUF5QixDQUFDLDBCQUF1RDtJQUNoRyxJQUFJLG9CQUFvQixHQUEyQixFQUFFLENBQUM7SUFDdEQsSUFBSSxDQUFDO1FBQ0osSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDMUQsb0JBQW9CLEdBQUcsMEJBQTBCLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQzdFO2dCQUNDLFNBQVMsRUFBRTtvQkFDVixFQUFFLEVBQUUsU0FBUyxDQUFDLEVBQUU7b0JBQ2hCLFVBQVUsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUM7aUJBQzlDO2dCQUNELGVBQWUsRUFBRSxTQUFTLENBQUMsZUFBZTthQUMxQyxDQUNELENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1IsZ0NBQWdDO0lBQ2pDLENBQUM7SUFFRCxPQUFPLG9CQUFvQixDQUFDO0FBQzdCLENBQUM7QUFPRCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsMEJBQXVEO0lBQzdGLElBQUksaUJBQWlCLEdBQXdCLEVBQUUsQ0FBQztJQUNoRCxJQUFJLENBQUM7UUFDSixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2RCxpQkFBaUIsR0FBRywwQkFBMEIsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FDcEU7Z0JBQ0MsU0FBUyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztnQkFDdEMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2FBQ3ZDLENBQ0QsQ0FBQyxDQUFDO1FBQ0osQ0FBQztJQUNGLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUixnQ0FBZ0M7SUFDakMsQ0FBQztJQUVELE9BQU8saUJBQWlCLENBQUM7QUFDMUIsQ0FBQyJ9