/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserViewWorkbenchService, IBrowserViewCDPService } from '../common/browserView.js';
import { Event } from '../../../../base/common/event.js';
class WebBrowserViewWorkbenchService {
    async getOrCreateBrowserViewModel(_id) {
        throw new Error('Integrated Browser is not available in web.');
    }
    async getBrowserViewModel(_id) {
        throw new Error('Integrated Browser is not available in web.');
    }
    async clearGlobalStorage() { }
    async clearWorkspaceStorage() { }
}
class WebBrowserViewCDPService {
    async createSessionGroup(_browserId) {
        throw new Error('Integrated Browser is not available in web.');
    }
    async destroySessionGroup(_groupId) { }
    async sendCDPMessage(_groupId, _message) { }
    onCDPMessage(_groupId) {
        return Event.None;
    }
    onDidDestroy(_groupId) {
        return Event.None;
    }
}
registerSingleton(IBrowserViewWorkbenchService, WebBrowserViewWorkbenchService, 1 /* InstantiationType.Delayed */);
registerSingleton(IBrowserViewCDPService, WebBrowserViewCDPService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXcuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvYnJvd3Nlci9icm93c2VyVmlldy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFxQixNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxzQkFBc0IsRUFBcUIsTUFBTSwwQkFBMEIsQ0FBQztBQUNuSCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHekQsTUFBTSw4QkFBOEI7SUFHbkMsS0FBSyxDQUFDLDJCQUEyQixDQUFDLEdBQVc7UUFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsR0FBVztRQUNwQyxNQUFNLElBQUksS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsS0FBb0IsQ0FBQztJQUM3QyxLQUFLLENBQUMscUJBQXFCLEtBQW9CLENBQUM7Q0FDaEQ7QUFFRCxNQUFNLHdCQUF3QjtJQUc3QixLQUFLLENBQUMsa0JBQWtCLENBQUMsVUFBa0I7UUFDMUMsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsUUFBZ0IsSUFBbUIsQ0FBQztJQUU5RCxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQWdCLEVBQUUsUUFBb0IsSUFBbUIsQ0FBQztJQUUvRSxZQUFZLENBQUMsUUFBZ0I7UUFDNUIsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBQ25CLENBQUM7SUFFRCxZQUFZLENBQUMsUUFBZ0I7UUFDNUIsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBQ25CLENBQUM7Q0FDRDtBQUVELGlCQUFpQixDQUFDLDRCQUE0QixFQUFFLDhCQUE4QixvQ0FBNEIsQ0FBQztBQUMzRyxpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSx3QkFBd0Isb0NBQTRCLENBQUMifQ==