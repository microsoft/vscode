/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
export class MockChatWidgetService {
    constructor() {
        this.onDidAddWidget = Event.None;
        this.onDidBackgroundSession = Event.None;
        this.onDidChangeFocusedWidget = Event.None;
        this.onDidChangeFocusedSession = Event.None;
    }
    getWidgetByInputUri(uri) {
        return undefined;
    }
    getWidgetBySessionResource(sessionResource) {
        return undefined;
    }
    getWidgetsByLocations(location) {
        return [];
    }
    revealWidget(preserveFocus) {
        return Promise.resolve(undefined);
    }
    reveal(widget, preserveFocus) {
        return Promise.resolve(true);
    }
    getAllWidgets() {
        throw new Error('Method not implemented.');
    }
    openSession(sessionResource) {
        throw new Error('Method not implemented.');
    }
    register(newWidget) {
        return Disposable.None;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0NoYXRXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci93aWRnZXQvbW9ja0NoYXRXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSw0Q0FBNEMsQ0FBQztBQUtyRixNQUFNLE9BQU8scUJBQXFCO0lBQWxDO1FBQ1UsbUJBQWMsR0FBdUIsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNoRCwyQkFBc0IsR0FBZSxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2hELDZCQUF3QixHQUFtQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3RFLDhCQUF5QixHQUFnQixLQUFLLENBQUMsSUFBSSxDQUFDO0lBd0M5RCxDQUFDO0lBL0JBLG1CQUFtQixDQUFDLEdBQVE7UUFDM0IsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELDBCQUEwQixDQUFDLGVBQW9CO1FBQzlDLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxRQUEyQjtRQUNoRCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxZQUFZLENBQUMsYUFBdUI7UUFDbkMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBbUIsRUFBRSxhQUF1QjtRQUNsRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUVELGFBQWE7UUFDWixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELFdBQVcsQ0FBQyxlQUFvQjtRQUMvQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELFFBQVEsQ0FBQyxTQUFzQjtRQUM5QixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFDeEIsQ0FBQztDQUNEIn0=