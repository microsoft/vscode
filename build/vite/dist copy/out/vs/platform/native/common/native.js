/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var FocusMode;
(function (FocusMode) {
    /**
     * (Default) Transfer focus to the target window
     * when the editor is focused.
     */
    FocusMode[FocusMode["Transfer"] = 0] = "Transfer";
    /**
     * Transfer focus to the target window when the
     * editor is focused, otherwise notify the user that
     * the app has activity (macOS/Windows only).
     */
    FocusMode[FocusMode["Notify"] = 1] = "Notify";
    /**
     * Force the window to be focused, even if the editor
     * is not currently focused.
     */
    FocusMode[FocusMode["Force"] = 2] = "Force";
})(FocusMode || (FocusMode = {}));
export const INativeHostService = createDecorator('nativeHostService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBK0M5RSxNQUFNLENBQU4sSUFBa0IsU0FvQmpCO0FBcEJELFdBQWtCLFNBQVM7SUFFMUI7OztPQUdHO0lBQ0gsaURBQVEsQ0FBQTtJQUVSOzs7O09BSUc7SUFDSCw2Q0FBTSxDQUFBO0lBRU47OztPQUdHO0lBQ0gsMkNBQUssQ0FBQTtBQUNOLENBQUMsRUFwQmlCLFNBQVMsS0FBVCxTQUFTLFFBb0IxQjtBQTBORCxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxlQUFlLENBQXFCLG1CQUFtQixDQUFDLENBQUMifQ==