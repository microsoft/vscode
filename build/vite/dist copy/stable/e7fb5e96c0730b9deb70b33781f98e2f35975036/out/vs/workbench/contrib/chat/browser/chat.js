/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CHAT_PROVIDER_ID } from '../common/participants/chatParticipantContribTypes.js';
export const IChatWidgetService = createDecorator('chatWidgetService');
export const ChatViewPaneTarget = Symbol('ChatViewPaneTarget');
export const IQuickChatService = createDecorator('quickChatService');
export const IChatAccessibilityService = createDecorator('chatAccessibilityService');
export function isIChatViewViewContext(context) {
    return typeof context.viewId === 'string';
}
export function isIChatResourceViewContext(context) {
    return !isIChatViewViewContext(context);
}
export const IChatCodeBlockContextProviderService = createDecorator('chatCodeBlockContextProviderService');
export const ChatViewId = `workbench.panel.chat.view.${CHAT_PROVIDER_ID}`;
export const ChatViewContainerId = 'workbench.panel.chat';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBV2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQU83RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQXNGekYsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFxQixtQkFBbUIsQ0FBQyxDQUFDO0FBMkQzRixNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUUvRCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQW9CLGtCQUFrQixDQUFDLENBQUM7QUE4QnhGLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMEJBQTBCLENBQUMsQ0FBQztBQStHaEgsTUFBTSxVQUFVLHNCQUFzQixDQUFDLE9BQStCO0lBQ3JFLE9BQU8sT0FBUSxPQUFnQyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUM7QUFDckUsQ0FBQztBQU9ELE1BQU0sVUFBVSwwQkFBMEIsQ0FBQyxPQUErQjtJQUN6RSxPQUFPLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDekMsQ0FBQztBQWtJRCxNQUFNLENBQUMsTUFBTSxvQ0FBb0MsR0FBRyxlQUFlLENBQXVDLHFDQUFxQyxDQUFDLENBQUM7QUFPakosTUFBTSxDQUFDLE1BQU0sVUFBVSxHQUFHLDZCQUE2QixnQkFBZ0IsRUFBRSxDQUFDO0FBQzFFLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLHNCQUFzQixDQUFDIn0=