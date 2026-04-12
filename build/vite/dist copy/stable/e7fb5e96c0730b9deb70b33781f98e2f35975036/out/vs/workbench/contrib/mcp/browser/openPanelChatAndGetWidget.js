/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { ChatViewId } from '../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
export async function openPanelChatAndGetWidget(viewsService, chatService) {
    await viewsService.openView(ChatViewId, true);
    const widgets = chatService.getWidgetsByLocations(ChatAgentLocation.Chat);
    if (widgets.length) {
        return widgets[0];
    }
    const eventPromise = Event.toPromise(Event.filter(chatService.onDidAddWidget, e => e.location === ChatAgentLocation.Chat));
    return await raceTimeout(eventPromise, 10000, // should be enough time for chat to initialize...
    () => eventPromise.cancel());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BlblBhbmVsQ2hhdEFuZEdldFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL29wZW5QYW5lbENoYXRBbmRHZXRXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsVUFBVSxFQUFtQyxNQUFNLDRCQUE0QixDQUFDO0FBQ3pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR25FLE1BQU0sQ0FBQyxLQUFLLFVBQVUseUJBQXlCLENBQUMsWUFBMkIsRUFBRSxXQUErQjtJQUMzRyxNQUFNLFlBQVksQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzlDLE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMxRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNwQixPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBRUQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFM0gsT0FBTyxNQUFNLFdBQVcsQ0FDdkIsWUFBWSxFQUNaLEtBQUssRUFBRSxrREFBa0Q7SUFDekQsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUMzQixDQUFDO0FBQ0gsQ0FBQyJ9