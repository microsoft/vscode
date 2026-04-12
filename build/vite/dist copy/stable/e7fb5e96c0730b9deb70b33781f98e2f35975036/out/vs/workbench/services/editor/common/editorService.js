/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isEditorGroup } from './editorGroupsService.js';
export const IEditorService = createDecorator('editorService');
/**
 * Open an editor in the currently active group.
 */
export const ACTIVE_GROUP = -1;
/**
 * Open an editor to the side of the active group.
 */
export const SIDE_GROUP = -2;
/**
 * Open an editor in a new auxiliary window.
 */
export const AUX_WINDOW_GROUP = -3;
/**
 * Open an editor in a modal overlay on top of the workbench.
 */
export const MODAL_GROUP = -4;
export function isPreferredGroup(obj) {
    const candidate = obj;
    return typeof obj === 'number' || isEditorGroup(candidate);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBTTdGLE9BQU8sRUFBNkQsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFLcEgsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBaUIsZUFBZSxDQUFDLENBQUM7QUFFL0U7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFHL0I7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFHN0I7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUduQzs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUs5QixNQUFNLFVBQVUsZ0JBQWdCLENBQUMsR0FBWTtJQUM1QyxNQUFNLFNBQVMsR0FBRyxHQUFpQyxDQUFDO0lBRXBELE9BQU8sT0FBTyxHQUFHLEtBQUssUUFBUSxJQUFJLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUM1RCxDQUFDIn0=