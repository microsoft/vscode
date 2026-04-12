/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { localize } from '../../../../nls.js';
import * as semver from '../../../../base/common/semver/semver.js';
// TODO: @sandy081 merge this with deduping in extensionsScannerService.ts
export function dedupExtensions(system, user, workspace, development, logService) {
    const result = new ExtensionIdentifierMap();
    system.forEach((systemExtension) => {
        const extension = result.get(systemExtension.identifier);
        if (extension) {
            logService.warn(localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, systemExtension.extensionLocation.fsPath));
        }
        result.set(systemExtension.identifier, systemExtension);
    });
    user.forEach((userExtension) => {
        const extension = result.get(userExtension.identifier);
        if (extension) {
            if (extension.isBuiltin) {
                if (semver.gte(extension.version, userExtension.version)) {
                    logService.warn(`Skipping extension ${userExtension.extensionLocation.path} in favour of the builtin extension ${extension.extensionLocation.path}.`);
                    return;
                }
                // Overwriting a builtin extension inherits the `isBuiltin` property and it doesn't show a warning
                userExtension.isBuiltin = true;
            }
            else {
                logService.warn(localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, userExtension.extensionLocation.fsPath));
            }
        }
        else if (userExtension.isBuiltin) {
            logService.warn(`Skipping obsolete builtin extension ${userExtension.extensionLocation.path}`);
            return;
        }
        result.set(userExtension.identifier, userExtension);
    });
    workspace.forEach(workspaceExtension => {
        const extension = result.get(workspaceExtension.identifier);
        if (extension) {
            logService.warn(localize('overwritingWithWorkspaceExtension', "Overwriting {0} with Workspace Extension {1}.", extension.extensionLocation.fsPath, workspaceExtension.extensionLocation.fsPath));
        }
        result.set(workspaceExtension.identifier, workspaceExtension);
    });
    development.forEach(developedExtension => {
        logService.info(localize('extensionUnderDevelopment', "Loading development extension at {0}", developedExtension.extensionLocation.fsPath));
        const extension = result.get(developedExtension.identifier);
        if (extension) {
            if (extension.isBuiltin) {
                // Overwriting a builtin extension inherits the `isBuiltin` property
                developedExtension.isBuiltin = true;
            }
        }
        result.set(developedExtension.identifier, developedExtension);
    });
    return Array.from(result.values());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1V0aWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1V0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHNCQUFzQixFQUF5QixNQUFNLHNEQUFzRCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEtBQUssTUFBTSxNQUFNLDBDQUEwQyxDQUFDO0FBR25FLDBFQUEwRTtBQUMxRSxNQUFNLFVBQVUsZUFBZSxDQUFDLE1BQStCLEVBQUUsSUFBNkIsRUFBRSxTQUFrQyxFQUFFLFdBQW9DLEVBQUUsVUFBdUI7SUFDaE0sTUFBTSxNQUFNLEdBQUcsSUFBSSxzQkFBc0IsRUFBeUIsQ0FBQztJQUNuRSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsZUFBZSxFQUFFLEVBQUU7UUFDbEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDekQsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLFVBQVUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLHFDQUFxQyxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDeEssQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUN6RCxDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRTtRQUM5QixNQUFNLFNBQVMsR0FBRyxNQUFNLENB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