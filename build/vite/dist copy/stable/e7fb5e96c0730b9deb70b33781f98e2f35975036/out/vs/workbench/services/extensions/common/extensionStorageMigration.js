/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { FileSystemProviderErrorCode, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
/**
 * An extension storage has following
 * 	- State: Stored using storage service with extension id as key and state as value.
 *  - Resources: Stored under a location scoped to the extension.
 */
export async function migrateExtensionStorage(fromExtensionId, toExtensionId, global, instantionService) {
    return instantionService.invokeFunction(async (serviceAccessor) => {
        const environmentService = serviceAccessor.get(IEnvironmentService);
        const userDataProfilesService = serviceAccessor.get(IUserDataProfilesService);
        const extensionStorageService = serviceAccessor.get(IExtensionStorageService);
        const storageService = serviceAccessor.get(IStorageService);
        const uriIdentityService = serviceAccessor.get(IUriIdentityService);
        const fileService = serviceAccessor.get(IFileService);
        const workspaceContextService = serviceAccessor.get(IWorkspaceContextService);
        const logService = serviceAccessor.get(ILogService);
        const storageMigratedKey = `extensionStorage.migrate.${fromExtensionId}-${toExtensionId}`;
        const migrateLowerCaseStorageKey = fromExtensionId.toLowerCase() === toExtensionId.toLowerCase() ? `extension.storage.migrateFromLowerCaseKey.${fromExtensionId.toLowerCase()}` : undefined;
        if (fromExtensionId === toExtensionId) {
            return;
        }
        const getExtensionStorageLocation = (extensionId, global) => {
            if (global) {
                return uriIdentityService.extUri.joinPath(userDataProfilesService.defaultProfile.globalStorageHome, extensionId.toLowerCase() /* Extension id is lower cased for global storage */);
            }
            return uriIdentityService.extUri.joinPath(environmentService.workspaceStorageHome, workspaceContextService.getWorkspace().id, extensionId);
        };
        const storageScope = global ? 0 /* StorageScope.PROFILE */ : 1 /* StorageScope.WORKSPACE */;
        if (!storageService.getBoolean(storageMigratedKey, storageScope, false) && !(migrateLowerCaseStorageKey && storageService.getBoolean(migrateLowerCaseStorageKey, storageScope, false))) {
            logService.info(`Migrating ${global ? 'global' : 'workspace'} extension storage from ${fromExtensionId} to ${toExtensionId}...`);
            // Migrate state
            const value = extensionStorageService.getExtensionState(fromExtensionId, global);
            if (value) {
                extensionStorageService.setExtensionState(toExtensionId, value, global);
                extensionStorageService.setExtensionState(fromExtensionId, undefined, global);
            }
            // Migrate stored files
            const fromPath = getExtensionStorageLocation(fromExtensionId, global);
            const toPath = getExtensionStorageLocation(toExtensionId, global);
            if (!uriIdentityService.extUri.isEqual(fromPath, toPath)) {
                try {
                    await fileService.move(fromPath, toPath, true);
                }
                catch (error) {
                    if (error.code !== FileSystemProviderErrorCode.FileNotFound) {
                        logService.info(`Error while migrating ${global ? 'global' : 'workspace'} file storage from '${fromExtensionId}' to '${toExtensionId}'`, getErrorMessage(error));
                    }
                }
            }
            logService.info(`Migrated ${global ? 'global' : 'workspace'} extension storage from ${fromExtensionId} to ${toExtensionId}`);
            storageService.store(storageMigratedKey, true, storageScope, 1 /* StorageTarget.MACHINE */);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uU3RvcmFnZU1pZ3JhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25TdG9yYWdlTWlncmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUMvRyxPQUFPLEVBQTJCLDJCQUEyQixFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRWhJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRTlGOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHVCQUF1QixDQUFDLGVBQXVCLEVBQUUsYUFBcUIsRUFBRSxNQUFlLEVBQUUsaUJBQXdDO0lBQ3RKLE9BQU8saUJBQWlCLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBQyxlQUFlLEVBQUMsRUFBRTtRQUMvRCxNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNwRSxNQUFNLHVCQUF1QixHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMs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