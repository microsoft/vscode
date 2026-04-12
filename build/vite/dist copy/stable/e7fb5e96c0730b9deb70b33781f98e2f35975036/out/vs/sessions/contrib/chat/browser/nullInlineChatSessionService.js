/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInlineChatSessionService } from '../../../../workbench/contrib/inlineChat/browser/inlineChatSessionService.js';
class NullInlineChatSessionService {
    constructor() {
        this.onWillStartSession = Event.None;
        this.onDidChangeSessions = Event.None;
    }
    dispose() { }
    createSession(_editor) {
        throw new Error('Inline chat sessions are not supported in the sessions window');
    }
    getSessionByTextModel(_uri) {
        return undefined;
    }
    getSessionBySessionUri(_uri) {
        return undefined;
    }
}
registerSingleton(IInlineChatSessionService, NullInlineChatSessionService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnVsbElubGluZUNoYXRTZXNzaW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL251bGxJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBR3pELE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQXVCLHlCQUF5QixFQUFFLE1BQU0sOEVBQThFLENBQUM7QUFFOUksTUFBTSw0QkFBNEI7SUFBbEM7UUFHVSx1QkFBa0IsR0FBNkIsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMxRCx3QkFBbUIsR0FBZ0IsS0FBSyxDQUFDLElBQUksQ0FBQztJQWV4RCxDQUFDO0lBYkEsT0FBTyxLQUFXLENBQUM7SUFFbkIsYUFBYSxDQUFDLE9BQW9CO1FBQ2pDLE1BQU0sSUFBSSxLQUFLLENBQUMsK0RBQStELENBQUMsQ0FBQztJQUNsRixDQUFDO0lBRUQscUJBQXFCLENBQUMsSUFBUztRQUM5QixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsc0JBQXNCLENBQUMsSUFBUztRQUMvQixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0NBQ0Q7QUFFRCxpQkFBaUIsQ0FBQyx5QkFBeUIsRUFBRSw0QkFBNEIsb0NBQTRCLENBQUMifQ==