/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID } from './aiCustomizationManagement.js';
/**
 * Editor input for the AI Customizations Management Editor.
 * This is a singleton-style input with no file resource.
 */
export class AICustomizationManagementEditorInput extends EditorInput {
    static { this.ID = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_INPUT_ID; }
    get capabilities() {
        return super.capabilities | 8 /* EditorInputCapabilities.Singleton */ | 2048 /* EditorInputCapabilities.RequiresModal */;
    }
    /**
     * Gets or creates the singleton instance of this input.
     */
    static getOrCreate() {
        if (!AICustomizationManagementEditorInput._instance || AICustomizationManagementEditorInput._instance.isDisposed()) {
            AICustomizationManagementEditorInput._instance = new AICustomizationManagementEditorInput();
        }
        return AICustomizationManagementEditorInput._instance;
    }
    constructor() {
        super();
        this.resource = undefined;
        this._isDirty = false;
    }
    matches(otherInput) {
        return super.matches(otherInput) || otherInput instanceof AICustomizationManagementEditorInput;
    }
    get typeId() {
        return AICustomizationManagementEditorInput.ID;
    }
    getName() {
        return localize('aiCustomizationManagementEditorName', "Chat Customizations");
    }
    getIcon() {
        return Codicon.settingsGear;
    }
    async resolve() {
        return null;
    }
    isDirty() {
        return this._isDirty;
    }
    async save(group, options) {
        if (options?.reason !== undefined && options.reason !== 1 /* SaveReason.EXPLICIT */) {
            return undefined;
        }
        if (this._saveHandler) {
            const saved = await this._saveHandler();
            return saved ? this : undefined;
        }
        return undefined;
    }
    async revert() {
        this.setDirty(false);
    }
    setDirty(dirty) {
        if (this._isDirty !== dirty) {
            this._isDirty = dirty;
            this._onDidChangeDirty.fire();
        }
    }
    setSaveHandler(handler) {
        this._saveHandler = handler;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdkUsT0FBTyxFQUFFLDJDQUEyQyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFN0Y7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLG9DQUFxQyxTQUFRLFdBQVc7YUFFcEQsT0FBRSxHQUFXLDJDQUEyQyxBQUF0RCxDQUF1RDtJQU96RSxJQUFhLFlBQVk7UUFDeEIsT0FBTyxLQUFLLENBQUMsWUFBWSw0Q0FBb0MsbURBQXdDLENBQUM7SUFDdkcsQ0FBQztJQUlEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLFdBQVc7UUFDakIsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLFNBQVMsSUFBSSxvQ0FBb0MsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQztZQUNwSCxvQ0FBb0MsQ0FBQyxTQUFTLEdBQUcsSUFBSSxvQ0FBb0MsRUFBRSxDQUFDO1FBQzdGLENBQUM7UUFDRCxPQUFPLG9DQUFvQyxDQUFDLFNBQVMsQ0FBQztJQUN2RCxDQUFDO0lBRUQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQXRCQSxhQUFRLEdBQUcsU0FBUyxDQUFDO1FBRXRCLGFBQVEsR0FBRyxLQUFLLENBQUM7SUFxQnpCLENBQUM7SUFFUSxPQUFPLENBQUMsVUFBNkM7UUFDN0QsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsWUFBWSxvQ0FBb0MsQ0FBQztJQUNoRyxDQUFDO0lBRUQsSUFBYSxNQUFNO1FBQ2xCLE9BQU8sb0NBQW9DLENBQUMsRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFUSxPQUFPO1FBQ2YsT0FBTyxRQUFRLENBQUMscUNBQXFDLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUMvRSxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sT0FBTyxDQUFDLFlBQVksQ0FBQztJQUM3QixDQUFDO0lBRVEsS0FBSyxDQUFDLE9BQU87UUFDckIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRVEsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFzQixFQUFFLE9BQXNCO1FBQ2pFLElBQUksT0FBTyxFQUFFLE1BQU0sS0FBSyxTQUFTLElBQUksT0FBTyxDQUFDLE1BQU0sZ0NBQXdCLEVBQUUsQ0FBQztZQUM3RSxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdkIsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDeEMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ2pDLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRVEsS0FBSyxDQUFDLE1BQU07UUFDcEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBRUQsUUFBUSxDQUFDLEtBQWM7UUFDdEIsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMvQixDQUFDO0lBQ0YsQ0FBQztJQUVELGNBQWMsQ0FBQyxPQUE2QztRQUMzRCxJQUFJLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQztJQUM3QixDQUFDIn0=