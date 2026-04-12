/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { Event } from '../../../../base/common/event.js';
export class NotificationsAlerts extends Disposable {
    constructor(model) {
        super();
        this.model = model;
        // Alert initial notifications if any
        for (const notification of model.notifications) {
            this.triggerAriaAlert(notification);
        }
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
    }
    onDidChangeNotification(e) {
        if (e.kind === 0 /* NotificationChangeType.ADD */) {
            // ARIA alert for screen readers
            this.triggerAriaAlert(e.item);
            // Always log errors to console with full details
            if (e.item.severity === Severity.Error) {
                if (e.item.message.original instanceof Error) {
                    console.error(e.item.message.original);
                }
                else {
                    console.error(toErrorMessage(e.item.message.linkedText.toString(), true));
                }
            }
        }
    }
    triggerAriaAlert(notification) {
        if (notification.priority === NotificationPriority.SILENT) {
            return;
        }
        // Trigger the alert again whenever the message changes
        const listener = notification.onDidChangeContent(e => {
            if (e.kind === 1 /* NotificationViewItemContentChangeKind.MESSAGE */) {
                this.doTriggerAriaAlert(notification);
            }
        });
        Event.once(notification.onDidClose)(() => listener.dispose());
        this.doTriggerAriaAlert(notification);
    }
    doTriggerAriaAlert(notification) {
        let alertText;
        if (notification.severity === Severity.Error) {
            alertText = localize('alertErrorMessage', "Error: {0}", notification.message.linkedText.toString());
        }
        else if (notification.severity === Severity.Warning) {
            alertText = localize('alertWarningMessage', "Warning: {0}", notification.message.linkedText.toString());
        }
        else {
            alertText = localize('alertInfoMessage', "Info: {0}", notification.message.linkedText.toString());
        }
        alert(alertText);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc0FsZXJ0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc0FsZXJ0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxNQUFNLE9BQU8sbUJBQW9CLFNBQVEsVUFBVTtJQUVsRCxZQUE2QixLQUEwQjtRQUN0RCxLQUFLLEVBQUUsQ0FBQztRQURvQixVQUFLLEdBQUwsS0FBSyxDQUFxQjtRQUd0RCxxQ0FBcUM7UUFDckMsS0FBSyxNQUFNLFlBQVksSUFBSSxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDaEQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRU8saUJBQWlCO1FBQ3hCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUYsQ0FBQztJQUVPLHVCQUF1QixDQUFDLENBQTJCO1FBQzFELElBQUksQ0FBQyxDQUFDLElBQUksdUNBQStCLEVBQUUsQ0FBQztZQUUzQyxnQ0FBZ0M7WUFDaEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUU5QixpREFBaUQ7WUFDakQsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3hDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxZQUFZLEtBQUssRUFBRSxDQUFDO29CQUM5QyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzNFLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxZQUFtQztRQUMzRCxJQUFJLFlBQVksQ0FBQyxRQUFRLEtBQUssb0JBQW9CLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDM0QsT0FBTztRQUNSLENBQUM7UUFFRCx1REFBdUQ7UUFDdkQsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3BELElBQUksQ0FBQyxDQUFDLElBQUksMERBQWtELEVBQUUsQ0FBQztnQkFDOUQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRTlELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRU8sa0JBQWtCLENBQUMsWUFBbUM7UUFDN0QsSUFBSSxTQUFpQixDQUFDO1FBQ3RCLElBQUksWUFBWSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDOUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxZQUFZLEVBQUUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNyRyxDQUFDO2FBQU0sSUFBSSxZQUFZLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN2RCxTQUFTLEdBQUcsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGNBQWMsRUFBRSxZQUFZLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7YUFBTSxDQUFDO1lBQ1AsU0FBUyxHQUFHLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNuRyxDQUFDO1FBRUQsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7Q0FDRCJ9