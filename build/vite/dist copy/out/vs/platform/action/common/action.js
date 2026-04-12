/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function isLocalizedString(thing) {
    return !!thing
        && typeof thing === 'object'
        && typeof thing.original === 'string'
        && typeof thing.value === 'string';
}
export function isICommandActionToggleInfo(thing) {
    return thing ? thing.condition !== undefined : false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFxQmhHLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxLQUFjO0lBQy9DLE9BQU8sQ0FBQyxDQUFDLEtBQUs7V0FDVixPQUFPLEtBQUssS0FBSyxRQUFRO1dBQ3pCLE9BQVEsS0FBMEIsQ0FBQyxRQUFRLEtBQUssUUFBUTtXQUN4RCxPQUFRLEtBQTBCLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQztBQUMzRCxDQUFDO0FBa0NELE1BQU0sVUFBVSwwQkFBMEIsQ0FBQyxLQUFrRTtJQUM1RyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQTRCLEtBQU0sQ0FBQyxTQUFTLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDbEYsQ0FBQyJ9