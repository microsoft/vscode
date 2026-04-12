/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { upcast } from '../../../base/common/types.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
/**
 * Updates are run as a state machine:
 *
 *      Uninitialized
 *           ↓
 *          Idle
 *          ↓  ↑
 *   Checking for Updates  →  Available for Download
 *         ↓                    ↓
 *                     ←   Overwriting
 *     Downloading              ↑
 *                     →      Ready
 *         ↓                    ↑
 *     Downloaded      →     Updating
 *
 * Available: There is an update available for download (linux, darwin on metered connection).
 * Ready: Code will be updated as soon as it restarts (win32, darwin).
 * Downloaded: There is an update ready to be installed in the background (win32).
 * Overwriting: A newer update is being downloaded to replace the pending update (darwin).
 */
export var StateType;
(function (StateType) {
    StateType["Uninitialized"] = "uninitialized";
    StateType["Idle"] = "idle";
    StateType["Disabled"] = "disabled";
    StateType["CheckingForUpdates"] = "checking for updates";
    StateType["AvailableForDownload"] = "available for download";
    StateType["Downloading"] = "downloading";
    StateType["Downloaded"] = "downloaded";
    StateType["Updating"] = "updating";
    StateType["Ready"] = "ready";
    StateType["Overwriting"] = "overwriting";
    StateType["Restarting"] = "restarting";
})(StateType || (StateType = {}));
export var UpdateType;
(function (UpdateType) {
    UpdateType[UpdateType["Setup"] = 0] = "Setup";
    UpdateType[UpdateType["Archive"] = 1] = "Archive";
    UpdateType[UpdateType["Snap"] = 2] = "Snap";
})(UpdateType || (UpdateType = {}));
export var DisablementReason;
(function (DisablementReason) {
    DisablementReason[DisablementReason["NotBuilt"] = 0] = "NotBuilt";
    DisablementReason[DisablementReason["DisabledByEnvironment"] = 1] = "DisabledByEnvironment";
    DisablementReason[DisablementReason["ManuallyDisabled"] = 2] = "ManuallyDisabled";
    DisablementReason[DisablementReason["Policy"] = 3] = "Policy";
    DisablementReason[DisablementReason["MissingConfiguration"] = 4] = "MissingConfiguration";
    DisablementReason[DisablementReason["InvalidConfiguration"] = 5] = "InvalidConfiguration";
    DisablementReason[DisablementReason["RunningAsAdmin"] = 6] = "RunningAsAdmin";
})(DisablementReason || (DisablementReason = {}));
export const State = {
    Uninitialized: upcast({ type: "uninitialized" /* StateType.Uninitialized */ }),
    Disabled: (reason) => ({ type: "disabled" /* StateType.Disabled */, reason }),
    Idle: (updateType, error, notAvailable) => ({ type: "idle" /* StateType.Idle */, updateType, error, notAvailable }),
    CheckingForUpdates: (explicit) => ({ type: "checking for updates" /* StateType.CheckingForUpdates */, explicit }),
    AvailableForDownload: (update, canInstall) => ({ type: "available for download" /* StateType.AvailableForDownload */, update, canInstall }),
    Downloading: (update, explicit, overwrite, downloadedBytes, totalBytes, startTime) => ({ type: "downloading" /* StateType.Downloading */, update, explicit, overwrite, downloadedBytes, totalBytes, startTime }),
    Downloaded: (update, explicit, overwrite) => ({ type: "downloaded" /* StateType.Downloaded */, update, explicit, overwrite }),
    Updating: (update, explicit, currentProgress, maxProgress) => ({ type: "updating" /* StateType.Updating */, update, explicit, currentProgress, maxProgress }),
    Ready: (update, explicit, overwrite) => ({ type: "ready" /* StateType.Ready */, update, explicit, overwrite }),
    Overwriting: (update, explicit) => ({ type: "overwriting" /* StateType.Overwriting */, update, explicit }),
    Restarting: (update) => ({ type: "restarting" /* StateType.Restarting */, update }),
};
export const IUpdateService = createDecorator('updateService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQVU5RTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRztBQUVILE1BQU0sQ0FBTixJQUFrQixTQVlqQjtBQVpELFdBQWtCLFNBQVM7SUFDMUIsNENBQStCLENBQUE7SUFDL0IsMEJBQWEsQ0FBQTtJQUNiLGtDQUFxQixDQUFBO0lBQ3JCLHdEQUEyQyxDQUFBO0lBQzNDLDREQUErQyxDQUFBO0lBQy9DLHdDQUEyQixDQUFBO0lBQzNCLHNDQUF5QixDQUFBO0lBQ3pCLGtDQUFxQixDQUFBO0lBQ3JCLDRCQUFlLENBQUE7SUFDZix3Q0FBMkIsQ0FBQTtJQUMzQixzQ0FBeUIsQ0FBQTtBQUMxQixDQUFDLEVBWmlCLFNBQVMsS0FBVCxTQUFTLFFBWTFCO0FBRUQsTUFBTSxDQUFOLElBQWtCLFVBSWpCO0FBSkQsV0FBa0IsVUFBVTtJQUMzQiw2Q0FBSyxDQUFBO0lBQ0wsaURBQU8sQ0FBQTtJQUNQLDJDQUFJLENBQUE7QUFDTCxDQUFDLEVBSmlCLFVBQVUsS0FBVixVQUFVLFFBSTNCO0FBRUQsTUFBTSxDQUFOLElBQWtCLGlCQVFqQjtBQVJELFdBQWtCLGlCQUFpQjtJQUNsQyxpRUFBUSxDQUFBO0lBQ1IsMkZBQXFCLENBQUE7SUFDckIsaUZBQWdCLENBQUE7SUFDaEIsNkRBQU0sQ0FBQTtJQUNOLHlGQUFvQixDQUFBO0lBQ3BCLHlGQUFvQixDQUFBO0lBQ3BCLDZFQUFjLENBQUE7QUFDZixDQUFDLEVBUmlCLGlCQUFpQixLQUFqQixpQkFBaUIsUUFRbEM7QUFnQkQsTUFBTSxDQUFDLE1BQU0sS0FBSyxHQUFHO0lBQ3BCLGFBQWEsRUFBRSxNQUFNLENBQWdCLEVBQUUsSUFBSSwrQ0FBeUIsRUFBRSxDQUFDO0lBQ3ZFLFFBQVEsRUFBRSxDQUFDLE1BQXlCLEVBQVksRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLHFDQUFvQixFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQ3pGLElBQUksRUFBRSxDQUFDLFVBQXNCLEVBQUUsS0FBYyxFQUFFLFlBQXNCLEVBQVEsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLDZCQUFnQixFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFLENBQUM7SUFDM0ksa0JBQWtCLEVBQUUsQ0FBQyxRQUFpQixFQUFzQixFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksMkRBQThCLEVBQUUsUUFBUSxFQUFFLENBQUM7SUFDakgsb0JBQW9CLEVBQUUsQ0FBQyxNQUFlLEVBQUUsVUFBb0IsRUFBd0IsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLCtEQUFnQyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQztJQUNySixXQUFXLEVBQUUsQ0FBQyxNQUEyQixFQUFFLFFBQWlCLEVBQUUsU0FBa0IsRUFBRSxlQUF3QixFQUFFLFVBQW1CLEVBQUUsU0FBa0IsRUFBZSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksMkNBQXVCLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUMzUSxVQUFVLEVBQUUsQ0FBQyxNQUFlLEVBQUUsUUFBaUIsRUFBRSxTQUFrQixFQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSx5Q0FBc0IsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ2pKLFFBQVEsRUFBRSxDQUFDLE1BQWUsRUFBRSxRQUFpQixFQUFFLGVBQXdCLEVBQUUsV0FBb0IsRUFBWSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUkscUNBQW9CLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLENBQUM7SUFDMUwsS0FBSyxFQUFFLENBQUMsTUFBZSxFQUFFLFFBQWlCLEVBQUUsU0FBa0IsRUFBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksK0JBQWlCLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNsSSxXQUFXLEVBQUUsQ0FBQyxNQUFlLEVBQUUsUUFBaUIsRUFBZSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksMkNBQXVCLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO0lBQ3JILFVBQVUsRUFBRSxDQUFDLE1BQWUsRUFBYyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUkseUNBQXNCLEVBQUUsTUFBTSxFQUFFLENBQUM7Q0FDckYsQ0FBQztBQVNGLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxlQUFlLENBQWlCLGVBQWUsQ0FBQyxDQUFDIn0=