/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../../base/common/arrays.js';
export function isResolvedEditorModel(model) {
    const candidate = model;
    return typeof candidate?.resolve === 'function'
        && typeof candidate?.isResolved === 'function';
}
export var EditorActivation;
(function (EditorActivation) {
    /**
     * Activate the editor after it opened. This will automatically restore
     * the editor if it is minimized.
     */
    EditorActivation[EditorActivation["ACTIVATE"] = 1] = "ACTIVATE";
    /**
     * Only restore the editor if it is minimized but do not activate it.
     *
     * Note: will only work in combination with the `preserveFocus: true` option.
     * Otherwise, if focus moves into the editor, it will activate and restore
     * automatically.
     */
    EditorActivation[EditorActivation["RESTORE"] = 2] = "RESTORE";
    /**
     * Preserve the current active editor.
     *
     * Note: will only work in combination with the `preserveFocus: true` option.
     * Otherwise, if focus moves into the editor, it will activate and restore
     * automatically.
     */
    EditorActivation[EditorActivation["PRESERVE"] = 3] = "PRESERVE";
})(EditorActivation || (EditorActivation = {}));
export var EditorResolution;
(function (EditorResolution) {
    /**
     * Displays a picker and allows the user to decide which editor to use.
     */
    EditorResolution[EditorResolution["PICK"] = 0] = "PICK";
    /**
     * Only exclusive editors are considered.
     */
    EditorResolution[EditorResolution["EXCLUSIVE_ONLY"] = 1] = "EXCLUSIVE_ONLY";
})(EditorResolution || (EditorResolution = {}));
export var EditorOpenSource;
(function (EditorOpenSource) {
    /**
     * Default: the editor is opening via a programmatic call
     * to the editor service API.
     */
    EditorOpenSource[EditorOpenSource["API"] = 0] = "API";
    /**
     * Indicates that a user action triggered the opening, e.g.
     * via mouse or keyboard use.
     */
    EditorOpenSource[EditorOpenSource["USER"] = 1] = "USER";
})(EditorOpenSource || (EditorOpenSource = {}));
export var TextEditorSelectionRevealType;
(function (TextEditorSelectionRevealType) {
    /**
     * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically.
     */
    TextEditorSelectionRevealType[TextEditorSelectionRevealType["Center"] = 0] = "Center";
    /**
     * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
     */
    TextEditorSelectionRevealType[TextEditorSelectionRevealType["CenterIfOutsideViewport"] = 1] = "CenterIfOutsideViewport";
    /**
     * Option to scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport, but not quite at the top.
     */
    TextEditorSelectionRevealType[TextEditorSelectionRevealType["NearTop"] = 2] = "NearTop";
    /**
     * Option to scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport, but not quite at the top.
     * Only if it lies outside the viewport
     */
    TextEditorSelectionRevealType[TextEditorSelectionRevealType["NearTopIfOutsideViewport"] = 3] = "NearTopIfOutsideViewport";
})(TextEditorSelectionRevealType || (TextEditorSelectionRevealType = {}));
export var TextEditorSelectionSource;
(function (TextEditorSelectionSource) {
    /**
     * Programmatic source indicates a selection change that
     * was not triggered by the user via keyboard or mouse
     * but through text editor APIs.
     */
    TextEditorSelectionSource["PROGRAMMATIC"] = "api";
    /**
     * Navigation source indicates a selection change that
     * was caused via some command or UI component such as
     * an outline tree.
     */
    TextEditorSelectionSource["NAVIGATION"] = "code.navigation";
    /**
     * Jump source indicates a selection change that
     * was caused from within the text editor to another
     * location in the same or different text editor such
     * as "Go to definition".
     */
    TextEditorSelectionSource["JUMP"] = "code.jump";
})(TextEditorSelectionSource || (TextEditorSelectionSource = {}));
export function isTextEditorDiffInformationEqual(uriIdentityService, diff1, diff2) {
    return diff1?.documentVersion === diff2?.documentVersion &&
        uriIdentityService.extUri.isEqual(diff1?.original, diff2?.original) &&
        uriIdentityService.extUri.isEqual(diff1?.modified, diff2?.modified) &&
        equals(diff1?.changes, diff2?.changes, (a, b) => {
            return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
        });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBb0J4RCxNQUFNLFVBQVUscUJBQXFCLENBQUMsS0FBcUM7SUFDMUUsTUFBTSxTQUFTLEdBQUcsS0FBa0QsQ0FBQztJQUVyRSxPQUFPLE9BQU8sU0FBUyxFQUFFLE9BQU8sS0FBSyxVQUFVO1dBQzNDLE9BQU8sU0FBUyxFQUFFLFVBQVUsS0FBSyxVQUFVLENBQUM7QUFDakQsQ0FBQztBQW9HRCxNQUFNLENBQU4sSUFBWSxnQkF5Qlg7QUF6QkQsV0FBWSxnQkFBZ0I7SUFFM0I7OztPQUdHO0lBQ0gsK0RBQVksQ0FBQTtJQUVaOzs7Ozs7T0FNRztJQUNILDZEQUFPLENBQUE7SUFFUDs7Ozs7O09BTUc7SUFDSCwrREFBUSxDQUFBO0FBQ1QsQ0FBQyxFQXpCVyxnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBeUIzQjtBQUVELE1BQU0sQ0FBTixJQUFZLGdCQVdYO0FBWEQsV0FBWSxnQkFBZ0I7SUFFM0I7O09BRUc7SUFDSCx1REFBSSxDQUFBO0lBRUo7O09BRUc7SUFDSCwyRUFBYyxDQUFBO0FBQ2YsQ0FBQyxFQVhXLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFXM0I7QUFFRCxNQUFNLENBQU4sSUFBWSxnQkFhWDtBQWJELFdBQVksZ0JBQWdCO0lBRTNCOzs7T0FHRztJQUNILHFEQUFHLENBQUE7SUFFSDs7O09BR0c7SUFDSCx1REFBSSxDQUFBO0FBQ0wsQ0FBQyxFQWJXLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFhM0I7QUE2T0QsTUFBTSxDQUFOLElBQWtCLDZCQXFCakI7QUFyQkQsV0FBa0IsNkJBQTZCO0lBQzlDOztPQUVHO0lBQ0gscUZBQVUsQ0FBQTtJQUVWOztPQUVHO0lBQ0gsdUhBQTJCLENBQUE7SUFFM0I7O09BRUc7SUFDSCx1RkFBVyxDQUFBO0lBRVg7OztPQUdHO0lBQ0gseUhBQTRCLENBQUE7QUFDN0IsQ0FBQyxFQXJCaUIsNkJBQTZCLEtBQTdCLDZCQUE2QixRQXFCOUM7QUFFRCxNQUFNLENBQU4sSUFBa0IseUJBdUJqQjtBQXZCRCxXQUFrQix5QkFBeUI7SUFFMUM7Ozs7T0FJRztJQUNILGlEQUFvQixDQUFBO0lBRXBCOzs7O09BSUc7SUFDSCwyREFBOEIsQ0FBQTtJQUU5Qjs7Ozs7T0FLRztJQUNILCtDQUFrQixDQUFBO0FBQ25CLENBQUMsRUF2QmlCLHlCQUF5QixLQUF6Qix5QkFBeUIsUUF1QjFDO0FBbUNELE1BQU0sVUFBVSxnQ0FBZ0MsQ0FDL0Msa0JBQXVDLEVBQ3ZDLEtBQTZDLEVBQzdDLEtBQTZDO0lBQzdDLE9BQU8sS0FBSyxFQUFFLGVBQWUsS0FBSyxLQUFLLEVBQUUsZUFBZTtRQUN2RCxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQztRQUNuRSxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQztRQUNuRSxNQUFNLENBQW9CLEtBQUssRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNsRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekUsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIn0=