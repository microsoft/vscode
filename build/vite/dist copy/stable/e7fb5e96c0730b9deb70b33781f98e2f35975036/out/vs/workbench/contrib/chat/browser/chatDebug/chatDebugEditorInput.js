/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
const chatDebugEditorIcon = registerIcon('chat-debug-editor-label-icon', Codicon.bug, localize('chatDebugEditorLabelIcon', 'Icon of the chat debug editor label.'));
export class ChatDebugEditorInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = ChatDebugEditorInput.RESOURCE;
    }
    static { this.ID = 'workbench.editor.chatDebug'; }
    static { this.RESOURCE = URI.from({
        scheme: 'chat-debug',
        path: 'default'
    }); }
    static get instance() {
        if (!ChatDebugEditorInput._instance || ChatDebugEditorInput._instance.isDisposed()) {
            ChatDebugEditorInput._instance = new ChatDebugEditorInput();
        }
        return ChatDebugEditorInput._instance;
    }
    get typeId() { return ChatDebugEditorInput.ID; }
    get editorId() { return ChatDebugEditorInput.ID; }
    get capabilities() { return 2 /* EditorInputCapabilities.Readonly */ | 8 /* EditorInputCapabilities.Singleton */; }
    getName() {
        return localize('chatDebugInputName', "Agent Debug Logs");
    }
    getIcon() {
        return chatDebugEditorIcon;
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return other instanceof ChatDebugEditorInput;
    }
}
export class ChatDebugEditorInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(editorInput) {
        return '';
    }
    deserialize(instantiationService) {
        return ChatDebugEditorInput.instance;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRWRpdG9ySW5wdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z0VkaXRvcklucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWpELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVwRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFdkUsTUFBTSxtQkFBbUIsR0FBRyxZQUFZLENBQUMsOEJBQThCLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsc0NBQXNDLENBQUMsQ0FBQyxDQUFDO0FBRXBLLE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxXQUFXO0lBQXJEOztRQXdCVSxhQUFRLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDO0lBaUJuRCxDQUFDO2FBdkNnQixPQUFFLEdBQUcsNEJBQTRCLEFBQS9CLENBQWdDO2FBRWxDLGFBQVEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ25DLE1BQU0sRUFBRSxZQUFZO1FBQ3BCLElBQUksRUFBRSxTQUFTO0tBQ2YsQ0FBQyxBQUhzQixDQUdyQjtJQUdILE1BQU0sS0FBSyxRQUFRO1FBQ2xCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLElBQUksb0JBQW9CLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFDcEYsb0JBQW9CLENBQUMsU0FBUyxHQUFHLElBQUksb0JBQW9CLEVBQUUsQ0FBQztRQUM3RCxDQUFDO1FBRUQsT0FBTyxvQkFBb0IsQ0FBQyxTQUFTLENBQUM7SUFDdkMsQ0FBQztJQUVELElBQWEsTUFBTSxLQUFhLE9BQU8sb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUVqRSxJQUFhLFFBQVEsS0FBeUIsT0FBTyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRS9FLElBQWEsWUFBWSxLQUE4QixPQUFPLG9GQUFvRSxDQUFDLENBQUMsQ0FBQztJQUk1SCxPQUFPO1FBQ2YsT0FBTyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sbUJBQW1CLENBQUM7SUFDNUIsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssWUFBWSxvQkFBb0IsQ0FBQztJQUM5QyxDQUFDOztBQUdGLE1BQU0sT0FBTyw4QkFBOEI7SUFFMUMsWUFBWSxDQUFDLFdBQXdCO1FBQ3BDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELFNBQVMsQ0FBQyxXQUF3QjtRQUNqQyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxXQUFXLENBQUMsb0JBQTJDO1FBQ3RELE9BQU8sb0JBQW9CLENBQUMsUUFBUSxDQUFDO0lBQ3RDLENBQUM7Q0FDRCJ9