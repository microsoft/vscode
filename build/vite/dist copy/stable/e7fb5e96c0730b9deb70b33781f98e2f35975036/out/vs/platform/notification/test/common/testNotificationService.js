/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { NoOpNotification, NotificationsFilter, Severity } from '../../common/notification.js';
export class TestNotificationService {
    constructor() {
        this.onDidChangeFilter = Event.None;
    }
    static { this.NO_OP = new NoOpNotification(); }
    info(message) {
        return this.notify({ severity: Severity.Info, message });
    }
    warn(message) {
        return this.notify({ severity: Severity.Warning, message });
    }
    error(error) {
        return this.notify({ severity: Severity.Error, message: error });
    }
    notify(notification) {
        return TestNotificationService.NO_OP;
    }
    prompt(severity, message, choices, options) {
        return TestNotificationService.NO_OP;
    }
    status(message, options) {
        return {
            close: () => { }
        };
    }
    setFilter() { }
    getFilter(source) {
        return NotificationsFilter.OFF;
    }
    getFilters() {
        return [];
    }
    removeFilter(sourceId) { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBaUwsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFOVEsTUFBTSxPQUFPLHVCQUF1QjtJQUFwQztRQUVVLHNCQUFpQixHQUFnQixLQUFLLENBQUMsSUFBSSxDQUFDO0lBMkN0RCxDQUFDO2FBdkN3QixVQUFLLEdBQXdCLElBQUksZ0JBQWdCLEVBQUUsQUFBOUMsQ0FBK0M7SUFFNUUsSUFBSSxDQUFDLE9BQWU7UUFDbkIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQsSUFBSSxDQUFDLE9BQWU7UUFDbkIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQXFCO1FBQzFCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFFRCxNQUFNLENBQUMsWUFBMkI7UUFDakMsT0FBTyx1QkFBdUIsQ0FBQyxLQUFLLENBQUM7SUFDdEMsQ0FBQztJQUVELE1BQU0sQ0FBQyxRQUFrQixFQUFFLE9BQWUsRUFBRSxPQUF3QixFQUFFLE9BQXdCO1FBQzdGLE9BQU8sdUJBQXVCLENBQUMsS0FBSyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxNQUFNLENBQUMsT0FBdUIsRUFBRSxPQUErQjtRQUM5RCxPQUFPO1lBQ04sS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7U0FDaEIsQ0FBQztJQUNILENBQUM7SUFFRCxTQUFTLEtBQVcsQ0FBQztJQUVyQixTQUFTLENBQUMsTUFBd0M7UUFDakQsT0FBTyxtQkFBbUIsQ0FBQyxHQUFHLENBQUM7SUFDaEMsQ0FBQztJQUVELFVBQVU7UUFDVCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxZQUFZLENBQUMsUUFBZ0IsSUFBVSxDQUFDIn0=