/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MenuId } from '../../platform/actions/common/actions.js';
/**
 * Menu IDs for the Agent Sessions workbench layout.
 */
export const Menus = {
    ChatBarTitle: new MenuId('ChatBarTitle'),
    CommandCenter: new MenuId('SessionsCommandCenter'),
    CommandCenterCenter: new MenuId('SessionsCommandCenterCenter'),
    TitleBarContext: new MenuId('SessionsTitleBarContext'),
    TitleBarLeftLayout: new MenuId('SessionsTitleBarLeftLayout'),
    TitleBarSessionTitle: new MenuId('SessionsTitleBarSessionTitle'),
    TitleBarSessionMenu: new MenuId('SessionsTitleBarSessionMenu'),
    TitleBarRightLayout: new MenuId('SessionsTitleBarRightLayout'),
    PanelTitle: new MenuId('SessionsPanelTitle'),
    SidebarTitle: new MenuId('SessionsSidebarTitle'),
    AuxiliaryBarTitle: new MenuId('SessionsAuxiliaryBarTitle'),
    AuxiliaryBarTitleLeft: new MenuId('SessionsAuxiliaryBarTitleLeft'),
    SidebarFooter: new MenuId('SessionsSidebarFooter'),
    SidebarCustomizations: new MenuId('SessionsSidebarCustomizations'),
    AgentFeedbackEditorContent: new MenuId('AgentFeedbackEditorContent'),
    // New session picker menus — providers contribute actions into these
    // scoped by context keys (sessionsProviderId, sessionType, etc.)
    NewSessionRepositoryConfig: new MenuId('NewSessions.RepositoryConfigMenu'),
    NewSessionConfig: new MenuId('NewSessions.SessionConfigMenu'),
    NewSessionControl: new MenuId('NewSessions.SessionControlMenu'),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9icm93c2VyL21lbnVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVsRTs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLEtBQUssR0FBRztJQUNwQixZQUFZLEVBQUUsSUFBSSxNQUFNLENBQUMsY0FBYyxDQUFDO0lBQ3hDLGFBQWEsRUFBRSxJQUFJLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQztJQUNsRCxtQkFBbUIsRUFBRSxJQUFJLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQztJQUM5RCxlQUFlLEVBQUUsSUFBSSxNQUFNLENBQUMseUJBQXlCLENBQUM7SUFDdEQsa0JBQWtCLEVBQUUsSUFBSSxNQUFNLENBQUMsNEJBQTRCLENBQUM7SUFDNUQsb0JBQW9CLEVBQUUsSUFBSSxNQUFNLENBQUMsOEJBQThCLENBQUM7SUFDaEUsbUJBQW1CLEVBQUUsSUFBSSxNQUFNLENBQUMsNkJBQTZCLENBQUM7SUFDOUQsbUJBQW1CLEVBQUUsSUFBSSxNQUFNLENBQUMsNkJBQTZCLENBQUM7SUFDOUQsVUFBVSxFQUFFLElBQUksTUFBTSxDQUFDLG9CQUFvQixDQUFDO0lBQzVDLFlBQVksRUFBRSxJQUFJLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQztJQUNoRCxpQkFBaUIsRUFBRSxJQUFJLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQztJQUMxRCxxQkFBcUIsRUFBRSxJQUFJLE1BQU0sQ0FBQywrQkFBK0IsQ0FBQztJQUNsRSxhQUFhLEVBQUUsSUFBSSxNQUFNLENBQUMsdUJBQXVCLENBQUM7SUFDbEQscUJBQXFCLEVBQUUsSUFBSSxNQUFNLENBQUMsK0JBQStCLENBQUM7SUFDbEUsMEJBQTBCLEVBQUUsSUFBSSxNQUFNLENBQUMsNEJBQTRCLENBQUM7SUFFcEUscUVBQXFFO0lBQ3JFLGlFQUFpRTtJQUNqRSwwQkFBMEIsRUFBRSxJQUFJLE1BQU0sQ0FBQyxrQ0FBa0MsQ0FBQztJQUMxRSxnQkFBZ0IsRUFBRSxJQUFJLE1BQU0sQ0FBQywrQkFBK0IsQ0FBQztJQUM3RCxpQkFBaUIsRUFBRSxJQUFJLE1BQU0sQ0FBQyxnQ0FBZ0MsQ0FBQztDQUN0RCxDQUFDIn0=