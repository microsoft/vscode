/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IEditSessionIdentityService = createDecorator('editSessionIdentityService');
export var EditSessionIdentityMatch;
(function (EditSessionIdentityMatch) {
    EditSessionIdentityMatch[EditSessionIdentityMatch["Complete"] = 100] = "Complete";
    EditSessionIdentityMatch[EditSessionIdentityMatch["Partial"] = 50] = "Partial";
    EditSessionIdentityMatch[EditSessionIdentityMatch["None"] = 0] = "None";
})(EditSessionIdentityMatch || (EditSessionIdentityMatch = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi9lZGl0U2Vzc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBUzlFLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGVBQWUsQ0FBOEIsNEJBQTRCLENBQUMsQ0FBQztBQWdCdEgsTUFBTSxDQUFOLElBQVksd0JBSVg7QUFKRCxXQUFZLHdCQUF3QjtJQUNuQyxpRkFBYyxDQUFBO0lBQ2QsOEVBQVksQ0FBQTtJQUNaLHVFQUFRLENBQUE7QUFDVCxDQUFDLEVBSlcsd0JBQXdCLEtBQXhCLHdCQUF3QixRQUluQyJ9