/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct } from '../../../../base/common/arrays.js';
import * as nls from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { globMatchesResource, priorityToRank, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
export const ICustomEditorService = createDecorator('customEditorService');
export const CONTEXT_ACTIVE_CUSTOM_EDITOR_ID = new RawContextKey('activeCustomEditorId', '', {
    type: 'string',
    description: nls.localize('context.customEditor', "The viewType of the currently active custom editor."),
});
export const CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE = new RawContextKey('focusedCustomEditorIsEditable', false);
export var CustomEditorPriority;
(function (CustomEditorPriority) {
    CustomEditorPriority["default"] = "default";
    CustomEditorPriority["builtin"] = "builtin";
    CustomEditorPriority["option"] = "option";
})(CustomEditorPriority || (CustomEditorPriority = {}));
export class CustomEditorInfo {
    constructor(descriptor) {
        this.id = descriptor.id;
        this.displayName = descriptor.displayName;
        this.providerDisplayName = descriptor.providerDisplayName;
        this.priority = descriptor.priority;
        this.selector = descriptor.selector;
    }
    matches(resource) {
        return this.selector.some(selector => selector.filenamePattern && globMatchesResource(selector.filenamePattern, resource));
    }
}
export class CustomEditorInfoCollection {
    constructor(editors) {
        this.allEditors = distinct(editors, editor => editor.id);
    }
    get length() { return this.allEditors.length; }
    /**
     * Find the single default editor to use (if any) by looking at the editor's priority and the
     * other contributed editors.
     */
    get defaultEditor() {
        return this.allEditors.find(editor => {
            switch (editor.priority) {
                case RegisteredEditorPriority.default:
                case RegisteredEditorPriority.builtin:
                    // A default editor must have higher priority than all other contributed editors.
                    return this.allEditors.every(otherEditor => otherEditor === editor || isLowerPriority(otherEditor, editor));
                default:
                    return false;
            }
        });
    }
    /**
     * Find the best available editor to use.
     *
     * Unlike the `defaultEditor`, a bestAvailableEditor can exist even if there are other editors with
     * the same priority.
     */
    get bestAvailableEditor() {
        const editors = Array.from(this.allEditors).sort((a, b) => {
            return priorityToRank(a.priority) - priorityToRank(b.priority);
        });
        return editors[0];
    }
}
function isLowerPriority(otherEditor, editor) {
    return priorityToRank(otherEditor.priority) < priorityToRank(editor.priority);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSzdELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFekksTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsZUFBZSxDQUF1QixxQkFBcUIsQ0FBQyxDQUFDO0FBRWpHLE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLElBQUksYUFBYSxDQUFTLHNCQUFzQixFQUFFLEVBQUUsRUFBRTtJQUNwRyxJQUFJLEVBQUUsUUFBUTtJQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLHFEQUFxRCxDQUFDO0NBQ3hHLENBQUMsQ0FBQztBQUVILE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLElBQUksYUFBYSxDQUFVLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBcUQ1SCxNQUFNLENBQU4sSUFBa0Isb0JBSWpCO0FBSkQsV0FBa0Isb0JBQW9CO0lBQ3JDLDJDQUFtQixDQUFBO0lBQ25CLDJDQUFtQixDQUFBO0lBQ25CLHlDQUFpQixDQUFBO0FBQ2xCLENBQUMsRUFKaUIsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUlyQztBQWNELE1BQU0sT0FBTyxnQkFBZ0I7SUFRNUIsWUFBWSxVQUFrQztRQUM3QyxJQUFJLENBQUMsRUFBRSxHQUFHLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDO1FBQzFDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxVQUFVLENBQUMsbUJBQW1CLENBQUM7UUFDMUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxRQUFRLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQztJQUNyQyxDQUFDO0lBRUQsT0FBTyxDQUFDLFFBQWE7UUFDcEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxlQUFlLElBQUksbUJBQW1CLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQzVILENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTywwQkFBMEI7SUFJdEMsWUFDQyxPQUFvQztRQUVwQyxJQUFJLENBQUMsVUFBVSxHQUFHLFFBQVEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVELElBQVcsTUFBTSxLQUFhLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBRTlEOzs7T0FHRztJQUNILElBQVcsYUFBYTtRQUN2QixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3BDLFFBQVEsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUN6QixLQUFLLHdCQUF3QixDQUFDLE9BQU8sQ0FBQztnQkFDdEMsS0FBSyx3QkFBd0IsQ0FBQyxPQUFPO29CQUNwQyxpRkFBaUY7b0JBQ2pGLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FDMUMsV0FBVyxLQUFLLE1BQU0sSUFBSSxlQUFlLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBRWxFO29CQUNDLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7OztPQUtHO0lBQ0gsSUFBVyxtQkFBbUI7UUFDN0IsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3pELE9BQU8sY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkIsQ0FBQztDQUNEO0FBRUQsU0FBUyxlQUFlLENBQUMsV0FBNkIsRUFBRSxNQUF3QjtJQUMvRSxPQUFPLGNBQWMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUMvRSxDQUFDIn0=