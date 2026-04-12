/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Re-export reducers from the protocol layer
export { rootReducer, sessionReducer, softAssertNever, isClientDispatchable } from './protocol/reducers.js';
// ---- Tool call metadata helpers (VS Code extensions via _meta) --------------
/**
 * Extracts the VS Code-specific `toolKind` rendering hint from a tool call's `_meta`.
 */
export function getToolKind(tc) {
    return tc._meta?.toolKind;
}
/**
 * Extracts the VS Code-specific `language` hint from a tool call's `_meta`.
 */
export function getToolLanguage(tc) {
    return tc._meta?.language;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblJlZHVjZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUmVkdWNlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFPaEcsNkNBQTZDO0FBQzdDLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTVHLGdGQUFnRjtBQUVoRjs7R0FFRztBQUNILE1BQU0sVUFBVSxXQUFXLENBQUMsRUFBdUM7SUFDbEUsT0FBTyxFQUFFLENBQUMsS0FBSyxFQUFFLFFBQWtDLENBQUM7QUFDckQsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGVBQWUsQ0FBQyxFQUF1QztJQUN0RSxPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBOEIsQ0FBQztBQUNqRCxDQUFDIn0=