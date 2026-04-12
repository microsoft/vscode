/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
export const EDIT_SESSION_SYNC_CATEGORY = localize2('cloud changes', 'Cloud Changes');
export const IEditSessionsStorageService = createDecorator('IEditSessionsStorageService');
export const IEditSessionsLogService = createDecorator('IEditSessionsLogService');
export var ChangeType;
(function (ChangeType) {
    ChangeType[ChangeType["Addition"] = 1] = "Addition";
    ChangeType[ChangeType["Deletion"] = 2] = "Deletion";
})(ChangeType || (ChangeType = {}));
export var FileType;
(function (FileType) {
    FileType[FileType["File"] = 1] = "File";
})(FileType || (FileType = {}));
export const EditSessionSchemaVersion = 3;
export const EDIT_SESSIONS_SIGNED_IN_KEY = 'editSessionsSignedIn';
export const EDIT_SESSIONS_SIGNED_IN = new RawContextKey(EDIT_SESSIONS_SIGNED_IN_KEY, false);
export const EDIT_SESSIONS_PENDING_KEY = 'editSessionsPending';
export const EDIT_SESSIONS_PENDING = new RawContextKey(EDIT_SESSIONS_PENDING_KEY, false);
export const EDIT_SESSIONS_CONTAINER_ID = 'workbench.view.editSessions';
export const EDIT_SESSIONS_DATA_VIEW_ID = 'workbench.views.editSessions.data';
export const EDIT_SESSIONS_TITLE = localize2('cloud changes', 'Cloud Changes');
export const EDIT_SESSIONS_VIEW_ICON = registerIcon('edit-sessions-view-icon', Codicon.cloudDownload, localize('editSessionViewIcon', 'View icon of the cloud changes view.'));
export const EDIT_SESSIONS_SHOW_VIEW = new RawContextKey('editSessionsShowView', false);
export const EDIT_SESSIONS_SCHEME = 'vscode-edit-sessions';
export function decodeEditSessionFileContent(version, content) {
    switch (version) {
        case 1:
            return VSBuffer.fromString(content);
        case 2:
            return decodeBase64(content);
        default:
            throw new Error('Upgrade to a newer version to decode this content.');
    }
}
export function hashedEditSessionId(editSessionId) {
    const sha1 = new StringSHA1();
    sha1.update(editSessionId);
    return sha1.digest();
}
export const editSessionsLogId = 'editSessions';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFNlc3Npb25zL2NvbW1vbi9lZGl0U2Vzc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUV6RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTdGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUdqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFHN0QsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsU0FBUyxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUMsQ0FBQztBQUl0RixNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxlQUFlLENBQThCLDZCQUE2QixDQUFDLENBQUM7QUF1QnZILE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLGVBQWUsQ0FBMEIseUJBQXlCLENBQUMsQ0FBQztBQUczRyxNQUFNLENBQU4sSUFBWSxVQUdYO0FBSEQsV0FBWSxVQUFVO0lBQ3JCLG1EQUFZLENBQUE7SUFDWixtREFBWSxDQUFBO0FBQ2IsQ0FBQyxFQUhXLFVBQVUsS0FBVixVQUFVLFFBR3JCO0FBRUQsTUFBTSxDQUFOLElBQVksUUFFWDtBQUZELFdBQVksUUFBUTtJQUNuQix1Q0FBUSxDQUFBO0FBQ1QsQ0FBQyxFQUZXLFFBQVEsS0FBUixRQUFRLFFBRW5CO0FBeUJELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLENBQUMsQ0FBQztBQVMxQyxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxzQkFBc0IsQ0FBQztBQUNsRSxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSwyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUV0RyxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxxQkFBcUIsQ0FBQztBQUMvRCxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSx5QkFBeUIsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUVsRyxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyw2QkFBNkIsQ0FBQztBQUN4RSxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxtQ0FBbUMsQ0FBQztBQUM5RSxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBcUIsU0FBUyxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUMsQ0FBQztBQUVqRyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxZQUFZLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsc0NBQXNDLENBQUMsQ0FBQyxDQUFDO0FBRS9LLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLElBQUksYUFBYSxDQUFVLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBRWpHLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLHNCQUFzQixDQUFDO0FBRTNELE1BQU0sVUFBVSw0QkFBNEIsQ0FBQyxPQUFlLEVBQUUsT0FBZTtJQUM1RSxRQUFRLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLEtBQUssQ0FBQztZQUNMLE9BQU8sUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyQyxLQUFLLENBQUM7WUFDTCxPQUFPLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5QjtZQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0RBQW9ELENBQUMsQ0FBQztJQUN4RSxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxhQUFxQjtJQUN4RCxNQUFNLElBQUksR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO0lBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDM0IsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDdEIsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGNBQWMsQ0FBQyJ9