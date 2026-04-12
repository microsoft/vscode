/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let _getInlineCompletionsController;
export function getInlineCompletionsController(editor) {
    return _getInlineCompletionsController?.(editor) ?? null;
}
export function setInlineCompletionsControllerGetter(getter) {
    _getInlineCompletionsController = getter;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2NvbW1vbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxJQUFJLCtCQUEwRyxDQUFDO0FBRS9HLE1BQU0sVUFBVSw4QkFBOEIsQ0FBQyxNQUFtQjtJQUNqRSxPQUFPLCtCQUErQixFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDO0FBQzFELENBQUM7QUFFRCxNQUFNLFVBQVUsb0NBQW9DLENBQUMsTUFBbUU7SUFDdkgsK0JBQStCLEdBQUcsTUFBTSxDQUFDO0FBQzFDLENBQUMifQ==