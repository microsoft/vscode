/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function isMenubarMenuItemSubmenu(menuItem) {
    return menuItem.submenu !== undefined;
}
export function isMenubarMenuItemSeparator(menuItem) {
    return menuItem.id === 'vscode.menubar.separator';
}
export function isMenubarMenuItemRecentAction(menuItem) {
    return menuItem.uri !== undefined;
}
export function isMenubarMenuItemAction(menuItem) {
    return !isMenubarMenuItemSubmenu(menuItem) && !isMenubarMenuItemSeparator(menuItem) && !isMenubarMenuItemRecentAction(menuItem);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudWJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21lbnViYXIvY29tbW9uL21lbnViYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFrRGhHLE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxRQUF5QjtJQUNqRSxPQUFpQyxRQUFTLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQztBQUNsRSxDQUFDO0FBRUQsTUFBTSxVQUFVLDBCQUEwQixDQUFDLFFBQXlCO0lBQ25FLE9BQW1DLFFBQVMsQ0FBQyxFQUFFLEtBQUssMEJBQTBCLENBQUM7QUFDaEYsQ0FBQztBQUVELE1BQU0sVUFBVSw2QkFBNkIsQ0FBQyxRQUF5QjtJQUN0RSxPQUFzQyxRQUFTLENBQUMsR0FBRyxLQUFLLFNBQVMsQ0FBQztBQUNuRSxDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLFFBQXlCO0lBQ2hFLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDakksQ0FBQyJ9