/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Log a titlebar button interaction in the Agents window.
 */
export function logSessionsInteraction(telemetryService, button) {
    telemetryService.publicLog2('vscodeAgents.interaction', { button });
}
export function logChangesViewToggle(telemetryService, visible) {
    telemetryService.publicLog2('vscodeAgents.changesView/togglePanel', { visible });
}
export function logChangesViewVersionModeChange(telemetryService, mode) {
    telemetryService.publicLog2('vscodeAgents.changesView/versionModeChange', { mode });
}
export function logChangesViewFileSelect(telemetryService, changeType) {
    telemetryService.publicLog2('vscodeAgents.changesView/fileSelect', { changeType });
}
export function logChangesViewViewModeChange(telemetryService, mode) {
    telemetryService.publicLog2('vscodeAgents.changesView/viewModeChange', { mode });
}
export function logChangesViewReviewCommentAdded(telemetryService, data) {
    telemetryService.publicLog2('vscodeAgents.changesView/reviewCommentAdded', data);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNUZWxlbWV0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNUZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUF3QmhHOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHNCQUFzQixDQUFDLGdCQUFtQyxFQUFFLE1BQWlDO0lBQzVHLGdCQUFnQixDQUFDLFVBQVUsQ0FBOEQsMEJBQTBCLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQ2xJLENBQUM7QUFjRCxNQUFNLFVBQVUsb0JBQW9CLENBQUMsZ0JBQW1DLEVBQUUsT0FBZ0I7SUFDekYsZ0JBQWdCLENBQUMsVUFBVSxDQUFvRSxzQ0FBc0MsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDckosQ0FBQztBQVlELE1BQU0sVUFBVSwrQkFBK0IsQ0FBQyxnQkFBbUMsRUFBRSxJQUFZO0lBQ2hHLGdCQUFnQixDQUFDLFVBQVUsQ0FBZ0YsNENBQTRDLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3BLLENBQUM7QUFZRCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsZ0JBQW1DLEVBQUUsVUFBa0I7SUFDL0YsZ0JBQWdCLENBQUMsVUFBVSxDQUFrRSxxQ0FBcUMsRUFBRSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDckosQ0FBQztBQVlELE1BQU0sVUFBVSw0QkFBNEIsQ0FBQyxnQkFBbUMsRUFBRSxJQUFZO0lBQzdGLGdCQUFnQixDQUFDLFVBQVUsQ0FBMEUseUNBQXlDLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzNKLENBQUM7QUFnQkQsTUFBTSxVQUFVLGdDQUFnQyxDQUFDLGdCQUFtQyxFQUFFLElBQXVGO0lBQzVLLGdCQUFnQixDQUFDLFVBQVUsQ0FBa0YsNkNBQTZDLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkssQ0FBQyJ9