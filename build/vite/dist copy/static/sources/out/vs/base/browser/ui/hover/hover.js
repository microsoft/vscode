/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var HoverStyle;
(function (HoverStyle) {
    /**
     * The hover is anchored below the element with a pointer above it pointing at the target.
     */
    HoverStyle[HoverStyle["Pointer"] = 1] = "Pointer";
    /**
     * The hover is anchored to the bottom right of the cursor's location.
     */
    HoverStyle[HoverStyle["Mouse"] = 2] = "Mouse";
})(HoverStyle || (HoverStyle = {}));
export function isManagedHoverTooltipMarkdownString(obj) {
    const candidate = obj;
    return typeof candidate === 'object' && 'markdown' in candidate && 'markdownNotSupportedFallback' in candidate;
}
export function isManagedHoverTooltipHTMLElement(obj) {
    const candidate = obj;
    return typeof candidate === 'object' && 'element' in candidate;
}
// #endregion Managed hover
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFtSmhHLE1BQU0sQ0FBTixJQUFrQixVQVNqQjtBQVRELFdBQWtCLFVBQVU7SUFDM0I7O09BRUc7SUFDSCxpREFBVyxDQUFBO0lBQ1g7O09BRUc7SUFDSCw2Q0FBUyxDQUFBO0FBQ1YsQ0FBQyxFQVRpQixVQUFVLEtBQVYsVUFBVSxRQVMzQjtBQW9RRCxNQUFNLFVBQVUsbUNBQW1DLENBQUMsR0FBWTtJQUMvRCxNQUFNLFNBQVMsR0FBRyxHQUF5QyxDQUFDO0lBQzVELE9BQU8sT0FBTyxTQUFTLEtBQUssUUFBUSxJQUFJLFVBQVUsSUFBSSxTQUFTLElBQUksOEJBQThCLElBQUksU0FBUyxDQUFDO0FBQ2hILENBQUM7QUFNRCxNQUFNLFVBQVUsZ0NBQWdDLENBQUMsR0FBWTtJQUM1RCxNQUFNLFNBQVMsR0FBRyxHQUFzQyxDQUFDO0lBQ3pELE9BQU8sT0FBTyxTQUFTLEtBQUssUUFBUSxJQUFJLFNBQVMsSUFBSSxTQUFTLENBQUM7QUFDaEUsQ0FBQztBQTBCRCwyQkFBMkIifQ==