/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../nls.js';
import { Event } from '../../../base/common/event.js';
import BaseSeverity from '../../../base/common/severity.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var Severity = BaseSeverity;
export const INotificationService = createDecorator('notificationService');
export var NotificationPriority;
(function (NotificationPriority) {
    /**
     * Default priority: notification will be visible unless do not disturb mode is enabled.
     */
    NotificationPriority[NotificationPriority["DEFAULT"] = 0] = "DEFAULT";
    /**
     * Optional priority: notification might only be visible from the notifications center.
     */
    NotificationPriority[NotificationPriority["OPTIONAL"] = 1] = "OPTIONAL";
    /**
     * Silent priority: notification will only be visible from the notifications center.
     */
    NotificationPriority[NotificationPriority["SILENT"] = 2] = "SILENT";
    /**
     * Urgent priority: notification will be visible even when do not disturb mode is enabled.
     */
    NotificationPriority[NotificationPriority["URGENT"] = 3] = "URGENT";
})(NotificationPriority || (NotificationPriority = {}));
export var NeverShowAgainScope;
(function (NeverShowAgainScope) {
    /**
     * Will never show this notification on the current workspace again.
     */
    NeverShowAgainScope[NeverShowAgainScope["WORKSPACE"] = 0] = "WORKSPACE";
    /**
     * Will never show this notification on any workspace of the same
     * profile again.
     */
    NeverShowAgainScope[NeverShowAgainScope["PROFILE"] = 1] = "PROFILE";
    /**
     * Will never show this notification on any workspace across all
     * profiles again.
     */
    NeverShowAgainScope[NeverShowAgainScope["APPLICATION"] = 2] = "APPLICATION";
})(NeverShowAgainScope || (NeverShowAgainScope = {}));
export function isNotificationSource(thing) {
    if (thing) {
        const candidate = thing;
        return typeof candidate.id === 'string' && typeof candidate.label === 'string';
    }
    return false;
}
export var NotificationsFilter;
(function (NotificationsFilter) {
    /**
     * No filter is enabled.
     */
    NotificationsFilter[NotificationsFilter["OFF"] = 0] = "OFF";
    /**
     * All notifications are silent except error notifications.
    */
    NotificationsFilter[NotificationsFilter["ERROR"] = 1] = "ERROR";
})(NotificationsFilter || (NotificationsFilter = {}));
export class NoOpNotification {
    constructor() {
        this.progress = new NoOpProgress();
        this.onDidClose = Event.None;
        this.onDidChangeVisibility = Event.None;
    }
    updateSeverity(severity) { }
    updateMessage(message) { }
    updateActions(actions) { }
    close() { }
}
export class NoOpProgress {
    infinite() { }
    done() { }
    total(value) { }
    worked(value) { }
}
export function withSeverityPrefix(label, severity) {
    // Add severity prefix to match WCAG 4.1.3 Status
    // Messages requirements.
    if (severity === Severity.Error) {
        return localize('severityPrefix.error', "Error: {0}", label);
    }
    if (severity === Severity.Warning) {
        return localize('severityPrefix.warning', "Warning: {0}", label);
    }
    return localize('severityPrefix.info', "Info: {0}", label);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLFlBQVksTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsTUFBTSxLQUFRLFFBQVEsR0FBRyxZQUFZLENBQUM7QUFFdEMsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsZUFBZSxDQUF1QixxQkFBcUIsQ0FBQyxDQUFDO0FBSWpHLE1BQU0sQ0FBTixJQUFZLG9CQXFCWDtBQXJCRCxXQUFZLG9CQUFvQjtJQUUvQjs7T0FFRztJQUNILHFFQUFPLENBQUE7SUFFUDs7T0FFRztJQUNILHVFQUFRLENBQUE7SUFFUjs7T0FFRztJQUNILG1FQUFNLENBQUE7SUFFTjs7T0FFRztJQUNILG1FQUFNLENBQUE7QUFDUCxDQUFDLEVBckJXLG9CQUFvQixLQUFwQixvQkFBb0IsUUFxQi9CO0FBeUJELE1BQU0sQ0FBTixJQUFZLG1CQWtCWDtBQWxCRCxXQUFZLG1CQUFtQjtJQUU5Qjs7T0FFRztJQUNILHVFQUFTLENBQUE7SUFFVDs7O09BR0c7SUFDSCxtRUFBTyxDQUFBO0lBRVA7OztPQUdHO0lBQ0gsMkVBQVcsQ0FBQTtBQUNaLENBQUMsRUFsQlcsbUJBQW1CLEtBQW5CLG1CQUFtQixRQWtCOUI7QUFvQ0QsTUFBTSxVQUFVLG9CQUFvQixDQUFDLEtBQWM7SUFDbEQsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNYLE1BQU0sU0FBUyxHQUFHLEtBQTRCLENBQUM7UUFFL0MsT0FBTyxPQUFPLFNBQVMsQ0FBQyxFQUFFLEtBQUssUUFBUSxJQUFJLE9BQU8sU0FBUyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUM7SUFDaEYsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQStORCxNQUFNLENBQU4sSUFBWSxtQkFXWDtBQVhELFdBQVksbUJBQW1CO0lBRTlCOztPQUVHO0lBQ0gsMkRBQUcsQ0FBQTtJQUVIOztNQUVFO0lBQ0YsK0RBQUssQ0FBQTtBQUNOLENBQUMsRUFYVyxtQkFBbUIsS0FBbkIsbUJBQW1CLFFBVzlCO0FBZ0dELE1BQU0sT0FBTyxnQkFBZ0I7SUFBN0I7UUFFVSxhQUFRLEdBQUcsSUFBSSxZQUFZLEVBQUUsQ0FBQztRQUU5QixlQUFVLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4QiwwQkFBcUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBTzdDLENBQUM7SUFMQSxjQUFjLENBQUMsUUFBa0IsSUFBVSxDQUFDO0lBQzVDLGFBQWEsQ0FBQyxPQUE0QixJQUFVLENBQUM7SUFDckQsYUFBYSxDQUFDLE9BQThCLElBQVUsQ0FBQztJQUV2RCxLQUFLLEtBQVcsQ0FBQztDQUNqQjtBQUVELE1BQU0sT0FBTyxZQUFZO0lBQ3hCLFFBQVEsS0FBVyxDQUFDO0lBQ3BCLElBQUksS0FBVyxDQUFDO0lBQ2hCLEtBQUssQ0FBQyxLQUFhLElBQVUsQ0FBQztJQUM5QixNQUFNLENBQUMsS0FBYSxJQUFVLENBQUM7Q0FDL0I7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsS0FBYSxFQUFFLFFBQWtCO0lBRW5FLGlEQUFpRDtJQUNqRCx5QkFBeUI7SUFFekIsSUFBSSxRQUFRLEtBQUssUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2pDLE9BQU8sUUFBUSxDQUFDLHNCQUFzQixFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsSUFBSSxRQUFRLEtBQUssUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLE9BQU8sUUFBUSxDQUFDLHdCQUF3QixFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUMscUJBQXFCLEVBQUUsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQzVELENBQUMifQ==