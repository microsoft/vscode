/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const VIEWLET_ID = 'workbench.view.scm';
export const VIEW_PANE_ID = 'workbench.scm';
export const REPOSITORIES_VIEW_PANE_ID = 'workbench.scm.repositories';
export const HISTORY_VIEW_PANE_ID = 'workbench.scm.history';
export var ViewMode;
(function (ViewMode) {
    ViewMode["List"] = "list";
    ViewMode["Tree"] = "tree";
})(ViewMode || (ViewMode = {}));
export const ISCMService = createDecorator('scm');
export var InputValidationType;
(function (InputValidationType) {
    InputValidationType[InputValidationType["Error"] = 0] = "Error";
    InputValidationType[InputValidationType["Warning"] = 1] = "Warning";
    InputValidationType[InputValidationType["Information"] = 2] = "Information";
})(InputValidationType || (InputValidationType = {}));
export var SCMInputChangeReason;
(function (SCMInputChangeReason) {
    SCMInputChangeReason[SCMInputChangeReason["HistoryPrevious"] = 0] = "HistoryPrevious";
    SCMInputChangeReason[SCMInputChangeReason["HistoryNext"] = 1] = "HistoryNext";
})(SCMInputChangeReason || (SCMInputChangeReason = {}));
export var ISCMRepositorySortKey;
(function (ISCMRepositorySortKey) {
    ISCMRepositorySortKey["DiscoveryTime"] = "discoveryTime";
    ISCMRepositorySortKey["Name"] = "name";
    ISCMRepositorySortKey["Path"] = "path";
})(ISCMRepositorySortKey || (ISCMRepositorySortKey = {}));
export var ISCMRepositorySelectionMode;
(function (ISCMRepositorySelectionMode) {
    ISCMRepositorySelectionMode["Single"] = "single";
    ISCMRepositorySelectionMode["Multiple"] = "multiple";
})(ISCMRepositorySelectionMode || (ISCMRepositorySelectionMode = {}));
export const ISCMViewService = createDecorator('scmView');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2NtL2NvbW1vbi9zY20udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBYzdGLE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQztBQUMvQyxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDO0FBQzVDLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLDRCQUE0QixDQUFDO0FBQ3RFLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLHVCQUF1QixDQUFDO0FBRTVELE1BQU0sQ0FBTixJQUFrQixRQUdqQjtBQUhELFdBQWtCLFFBQVE7SUFDekIseUJBQWEsQ0FBQTtJQUNiLHlCQUFhLENBQUE7QUFDZCxDQUFDLEVBSGlCLFFBQVEsS0FBUixRQUFRLFFBR3pCO0FBTUQsTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBYyxLQUFLLENBQUMsQ0FBQztBQXFFL0QsTUFBTSxDQUFOLElBQWtCLG1CQUlqQjtBQUpELFdBQWtCLG1CQUFtQjtJQUNwQywrREFBUyxDQUFBO0lBQ1QsbUVBQVcsQ0FBQTtJQUNYLDJFQUFlLENBQUE7QUFDaEIsQ0FBQyxFQUppQixtQkFBbUIsS0FBbkIsbUJBQW1CLFFBSXBDO0FBV0QsTUFBTSxDQUFOLElBQVksb0JBR1g7QUFIRCxXQUFZLG9CQUFvQjtJQUMvQixxRkFBZSxDQUFBO0lBQ2YsNkVBQVcsQ0FBQTtBQUNaLENBQUMsRUFIVyxvQkFBb0IsS0FBcEIsb0JBQW9CLFFBRy9CO0FBNkZELE1BQU0sQ0FBTixJQUFrQixxQkFJakI7QUFKRCxXQUFrQixxQkFBcUI7SUFDdEMsd0RBQStCLENBQUE7SUFDL0Isc0NBQWEsQ0FBQTtJQUNiLHNDQUFhLENBQUE7QUFDZCxDQUFDLEVBSmlCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFJdEM7QUFFRCxNQUFNLENBQU4sSUFBa0IsMkJBR2pCO0FBSEQsV0FBa0IsMkJBQTJCO0lBQzVDLGdEQUFpQixDQUFBO0lBQ2pCLG9EQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFIaUIsMkJBQTJCLEtBQTNCLDJCQUEyQixRQUc1QztBQUVELE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxlQUFlLENBQWtCLFNBQVMsQ0FBQyxDQUFDIn0=