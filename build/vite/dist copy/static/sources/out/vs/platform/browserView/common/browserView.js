/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../nls.js';
const commandPrefix = 'workbench.action.browser';
export var BrowserViewCommandId;
(function (BrowserViewCommandId) {
    // Tab management
    BrowserViewCommandId["Open"] = "workbench.action.browser.open";
    BrowserViewCommandId["NewTab"] = "workbench.action.browser.newTab";
    BrowserViewCommandId["QuickOpen"] = "workbench.action.browser.quickOpen";
    BrowserViewCommandId["CloseAll"] = "workbench.action.browser.closeAll";
    BrowserViewCommandId["CloseAllInGroup"] = "workbench.action.browser.closeAllInGroup";
    // Navigation
    BrowserViewCommandId["GoBack"] = "workbench.action.browser.goBack";
    BrowserViewCommandId["GoForward"] = "workbench.action.browser.goForward";
    BrowserViewCommandId["Reload"] = "workbench.action.browser.reload";
    BrowserViewCommandId["HardReload"] = "workbench.action.browser.hardReload";
    // Editor actions
    BrowserViewCommandId["FocusUrlInput"] = "workbench.action.browser.focusUrlInput";
    BrowserViewCommandId["OpenExternal"] = "workbench.action.browser.openExternal";
    BrowserViewCommandId["OpenSettings"] = "workbench.action.browser.openSettings";
    // Chat actions
    BrowserViewCommandId["AddElementToChat"] = "workbench.action.browser.addElementToChat";
    BrowserViewCommandId["AddConsoleLogsToChat"] = "workbench.action.browser.addConsoleLogsToChat";
    // Dev Tools
    BrowserViewCommandId["ToggleDevTools"] = "workbench.action.browser.toggleDevTools";
    // Storage
    BrowserViewCommandId["ClearGlobalStorage"] = "workbench.action.browser.clearGlobalStorage";
    BrowserViewCommandId["ClearWorkspaceStorage"] = "workbench.action.browser.clearWorkspaceStorage";
    BrowserViewCommandId["ClearEphemeralStorage"] = "workbench.action.browser.clearEphemeralStorage";
    // Find in page
    BrowserViewCommandId["ShowFind"] = "workbench.action.browser.showFind";
    BrowserViewCommandId["HideFind"] = "workbench.action.browser.hideFind";
    BrowserViewCommandId["FindNext"] = "workbench.action.browser.findNext";
    BrowserViewCommandId["FindPrevious"] = "workbench.action.browser.findPrevious";
})(BrowserViewCommandId || (BrowserViewCommandId = {}));
export var BrowserNewPageLocation;
(function (BrowserNewPageLocation) {
    BrowserNewPageLocation["Foreground"] = "foreground";
    BrowserNewPageLocation["Background"] = "background";
    BrowserNewPageLocation["NewWindow"] = "newWindow";
})(BrowserNewPageLocation || (BrowserNewPageLocation = {}));
export var BrowserViewStorageScope;
(function (BrowserViewStorageScope) {
    BrowserViewStorageScope["Global"] = "global";
    BrowserViewStorageScope["Workspace"] = "workspace";
    BrowserViewStorageScope["Ephemeral"] = "ephemeral";
})(BrowserViewStorageScope || (BrowserViewStorageScope = {}));
export const ipcBrowserViewChannelName = 'browserView';
/**
 * Discrete zoom levels matching Edge/Chrome.
 * Note: When those browsers say "33%" and "67%" zoom, they really mean 33.33...% and 66.66...%
 */
export const browserZoomFactors = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
export const browserZoomDefaultIndex = browserZoomFactors.indexOf(1);
export function browserZoomLabel(zoomFactor) {
    return localize('browserZoomPercent', "{0}%", Math.round(zoomFactor * 100));
}
export function browserZoomAccessibilityLabel(zoomFactor) {
    return localize('browserZoomAccessibilityLabel', "Page Zoom: {0}%", Math.round(zoomFactor * 100));
}
/**
 * This should match the isolated world ID defined in `preload-browserView.ts`.
 */
export const browserViewIsolatedWorldId = 999;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE1BQU0sYUFBYSxHQUFHLDBCQUEwQixDQUFDO0FBQ2pELE1BQU0sQ0FBTixJQUFZLG9CQW9DWDtBQXBDRCxXQUFZLG9CQUFvQjtJQUMvQixpQkFBaUI7SUFDakIsOERBQThCLENBQUE7SUFDOUIsa0VBQWtDLENBQUE7SUFDbEMsd0VBQXdDLENBQUE7SUFDeEMsc0VBQXNDLENBQUE7SUFDdEMsb0ZBQW9ELENBQUE7SUFFcEQsYUFBYTtJQUNiLGtFQUFrQyxDQUFBO0lBQ2xDLHdFQUF3QyxDQUFBO0lBQ3hDLGtFQUFrQyxDQUFBO0lBQ2xDLDBFQUEwQyxDQUFBO0lBRTFDLGlCQUFpQjtJQUNqQixnRkFBZ0QsQ0FBQTtJQUNoRCw4RUFBOEMsQ0FBQTtJQUM5Qyw4RUFBOEMsQ0FBQTtJQUU5QyxlQUFlO0lBQ2Ysc0ZBQXNELENBQUE7SUFDdEQsOEZBQThELENBQUE7SUFFOUQsWUFBWTtJQUNaLGtGQUFrRCxDQUFBO0lBRWxELFVBQVU7SUFDViwwRkFBMEQsQ0FBQTtJQUMxRCxnR0FBZ0UsQ0FBQTtJQUNoRSxnR0FBZ0UsQ0FBQTtJQUVoRSxlQUFlO0lBQ2Ysc0VBQXNDLENBQUE7SUFDdEMsc0VBQXNDLENBQUE7SUFDdEMsc0VBQXNDLENBQUE7SUFDdEMsOEVBQThDLENBQUE7QUFDL0MsQ0FBQyxFQXBDVyxvQkFBb0IsS0FBcEIsb0JBQW9CLFFBb0MvQjtBQWtHRCxNQUFNLENBQU4sSUFBWSxzQkFJWDtBQUpELFdBQVksc0JBQXNCO0lBQ2pDLG1EQUF5QixDQUFBO0lBQ3pCLG1EQUF5QixDQUFBO0lBQ3pCLGlEQUF1QixDQUFBO0FBQ3hCLENBQUMsRUFKVyxzQkFBc0IsS0FBdEIsc0JBQXNCLFFBSWpDO0FBc0JELE1BQU0sQ0FBTixJQUFZLHVCQUlYO0FBSkQsV0FBWSx1QkFBdUI7SUFDbEMsNENBQWlCLENBQUE7SUFDakIsa0RBQXVCLENBQUE7SUFDdkIsa0RBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUpXLHVCQUF1QixLQUF2Qix1QkFBdUIsUUFJbEM7QUFFRCxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxhQUFhLENBQUM7QUFFdkQ7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQVUsQ0FBQztBQUMvSCxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckUsTUFBTSxVQUFVLGdCQUFnQixDQUFDLFVBQWtCO0lBQ2xELE9BQU8sUUFBUSxDQUFDLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzdFLENBQUM7QUFDRCxNQUFNLFVBQVUsNkJBQTZCLENBQUMsVUFBa0I7SUFDL0QsT0FBTyxRQUFRLENBQUMsK0JBQStCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNuRyxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxHQUFHLENBQUMifQ==