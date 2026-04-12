/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../nls.js';
import { RawContextKey } from '../../platform/contextkey/common/contextkey.js';
//#region < --- Active Session --- >
export const IsNewChatSessionContext = new RawContextKey('isNewChatSession', true);
export const ActiveSessionProviderIdContext = new RawContextKey('activeSessionProviderId', '', localize('activeSessionProviderId', "The provider ID of the active session"));
export const ActiveSessionTypeContext = new RawContextKey('activeSessionType', '', localize('activeSessionType', "The session type of the active session"));
export const IsActiveSessionBackgroundProviderContext = new RawContextKey('isActiveSessionBackgroundProvider', false, localize('isActiveSessionBackgroundProvider', "Whether the active session uses the background agent provider"));
export const ActiveSessionHasGitRepositoryContext = new RawContextKey('activeSessionHasGitRepository', false, localize('activeSessionHasGitRepository', "Whether the active session has an associated git repository"));
export const ChatSessionProviderIdContext = new RawContextKey('chatSessionProviderId', '', localize('chatSessionProviderId', "The provider ID of a session in context menu overlays"));
//#endregion
//#region < --- Chat Bar --- >
export const ActiveChatBarContext = new RawContextKey('activeChatBar', '', localize('activeChatBar', "The identifier of the active chat bar panel"));
export const ChatBarFocusContext = new RawContextKey('chatBarFocus', false, localize('chatBarFocus', "Whether the chat bar has keyboard focus"));
export const ChatBarVisibleContext = new RawContextKey('chatBarVisible', false, localize('chatBarVisible', "Whether the chat bar is visible"));
//#endregion
//#region < --- Welcome --- >
export const SessionsWelcomeVisibleContext = new RawContextKey('sessionsWelcomeVisible', false, localize('sessionsWelcomeVisible', "Whether the sessions welcome overlay is visible"));
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dGtleXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb21tb24vY29udGV4dGtleXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFL0Usb0NBQW9DO0FBRXBDLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLElBQUksYUFBYSxDQUFVLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO0FBQzVGLE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHLElBQUksYUFBYSxDQUFTLHlCQUF5QixFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMseUJBQXlCLEVBQUUsdUNBQXVDLENBQUMsQ0FBQyxDQUFDO0FBQ3JMLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLElBQUksYUFBYSxDQUFTLG1CQUFtQixFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsbUJBQW1CLEVBQUUsd0NBQXdDLENBQUMsQ0FBQyxDQUFDO0FBQ3BLLE1BQU0sQ0FBQyxNQUFNLHdDQUF3QyxHQUFHLElBQUksYUFBYSxDQUFVLG1DQUFtQyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsbUNBQW1DLEVBQUUsK0RBQStELENBQUMsQ0FBQyxDQUFDO0FBQy9PLE1BQU0sQ0FBQyxNQUFNLG9DQUFvQyxHQUFHLElBQUksYUFBYSxDQUFVLCtCQUErQixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsNkRBQTZELENBQUMsQ0FBQyxDQUFDO0FBQ2pPLE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLElBQUksYUFBYSxDQUFTLHVCQUF1QixFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsdURBQXVELENBQUMsQ0FBQyxDQUFDO0FBRS9MLFlBQVk7QUFFWiw4QkFBOEI7QUFFOUIsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxhQUFhLENBQVMsZUFBZSxFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLDZDQUE2QyxDQUFDLENBQUMsQ0FBQztBQUM3SixNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxjQUFjLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUseUNBQXlDLENBQUMsQ0FBQyxDQUFDO0FBQzFKLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLElBQUksYUFBYSxDQUFVLGdCQUFnQixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsaUNBQWlDLENBQUMsQ0FBQyxDQUFDO0FBRXhKLFlBQVk7QUFFWiw2QkFBNkI7QUFFN0IsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxhQUFhLENBQVUsd0JBQXdCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxpREFBaUQsQ0FBQyxDQUFDLENBQUM7QUFFaE0sWUFBWSJ9