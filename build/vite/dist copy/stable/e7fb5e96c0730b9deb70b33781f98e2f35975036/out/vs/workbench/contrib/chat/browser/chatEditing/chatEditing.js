/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isEqual } from '../../../../../base/common/resources.js';
import { findDiffEditorContainingCodeEditor } from '../../../../../editor/browser/widget/diffEditor/commands.js';
export function isTextDiffEditorForEntry(accessor, entry, editor) {
    const diffEditor = findDiffEditorContainingCodeEditor(accessor, editor);
    if (!diffEditor) {
        return false;
    }
    const originalModel = diffEditor.getOriginalEditor().getModel();
    const modifiedModel = diffEditor.getModifiedEditor().getModel();
    return isEqual(originalModel?.uri, entry.originalURI) && isEqual(modifiedModel?.uri, entry.modifiedURI);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBSWpILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxRQUEwQixFQUFFLEtBQXlCLEVBQUUsTUFBbUI7SUFDbEgsTUFBTSxVQUFVLEdBQUcsa0NBQWtDLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3hFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNoRSxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNoRSxPQUFPLE9BQU8sQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSSxPQUFPLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDekcsQ0FBQyJ9