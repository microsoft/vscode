/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../../base/common/observable.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatEditingService } from '../../common/editing/chatEditingService.js';
let ChatEditingEditorAccessibility = class ChatEditingEditorAccessibility {
    static { this.ID = 'chat.edits.accessibilty'; }
    constructor(chatEditingService, editorService, accessibilityService) {
        this._store = new DisposableStore();
        const activeUri = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditorPane?.input.resource);
        this._store.add(autorun(r => {
            const editor = activeUri.read(r);
            if (!editor) {
                return;
            }
            const entry = chatEditingService.editingSessionsObs.read(r).find(session => session.readEntry(editor, r));
            if (entry) {
                accessibilityService.playSignal(AccessibilitySignal.chatEditModifiedFile);
            }
        }));
    }
    dispose() {
        this._store.dispose();
    }
};
ChatEditingEditorAccessibility = __decorate([
    __param(0, IChatEditingService),
    __param(1, IEditorService),
    __param(2, IAccessibilitySignalService)
], ChatEditingEditorAccessibility);
export { ChatEditingEditorAccessibility };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdFZGl0b3JBY2Nlc3NpYmlsaXR5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRWRpdG9yQWNjZXNzaWJpbGl0eS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG1GQUFtRixDQUFDO0FBRXJKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUxRSxJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUE4QjthQUUxQixPQUFFLEdBQUcseUJBQXlCLEFBQTVCLENBQTZCO0lBSS9DLFlBQ3NCLGtCQUF1QyxFQUM1QyxhQUE2QixFQUNoQixvQkFBaUQ7UUFMOUQsV0FBTSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFRL0MsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXpJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUUzQixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDYixPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sS0FBSyxHQUFHLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFHLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsb0JBQW9CLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDM0UsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQzs7QUE5QlcsOEJBQThCO0lBT3hDLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLDJCQUEyQixDQUFBO0dBVGpCLDhCQUE4QixDQStCMUMifQ==