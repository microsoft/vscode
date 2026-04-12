/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../../base/common/network.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
export async function clearChatEditor(accessor, chatEditorInput) {
    const editorService = accessor.get(IEditorService);
    if (!chatEditorInput) {
        const editorInput = editorService.activeEditor;
        chatEditorInput = editorInput instanceof ChatEditorInput ? editorInput : undefined;
    }
    if (chatEditorInput instanceof ChatEditorInput) {
        // If we have a contributed session, make sure we create an untitled session for it.
        // Otherwise create a generic new chat editor.
        const resource = chatEditorInput.sessionResource && chatEditorInput.sessionResource.scheme !== Schemas.vscodeLocalChatSession
            ? chatEditorInput.sessionResource.with({ path: `/untitled-${generateUuid()}` })
            : ChatEditorInput.getNewEditorUri();
        // A chat editor can only be open in one group
        const identifier = editorService.findEditors(chatEditorInput.resource)[0];
        await editorService.replaceEditors([{
                editor: chatEditorInput,
                replacement: { resource, options: { pinned: true } }
            }], identifier.groupId);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENsZWFyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdENsZWFyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUUzRSxNQUFNLENBQUMsS0FBSyxVQUFVLGVBQWUsQ0FBQyxRQUEwQixFQUFFLGVBQWlDO0lBQ2xHLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFFbkQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUM7UUFDL0MsZUFBZSxHQUFHLFdBQVcsWUFBWSxlQUFlLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ3BGLENBQUM7SUFFRCxJQUFJLGVBQWUsWUFBWSxlQUFlLEVBQUUsQ0FBQztRQUNoRCxvRkFBb0Y7UUFDcEYsOENBQThDO1FBQzlDLE1BQU0sUUFBUSxHQUFHLGVBQWUsQ0FBQyxlQUFlLElBQUksZUFBZSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLHNCQUFzQjtZQUM1SCxDQUFDLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsYUFBYSxZQUFZLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDL0UsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUVyQyw4Q0FBOEM7UUFDOUMsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUUsTUFBTSxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ25DLE1BQU0sRUFBRSxlQUFlO2dCQUN2QixXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBK0IsRUFBRTthQUNqRixDQUFDLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3pCLENBQUM7QUFDRixDQUFDIn0=