/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var WorkspaceTrustScope;
(function (WorkspaceTrustScope) {
    WorkspaceTrustScope[WorkspaceTrustScope["Local"] = 0] = "Local";
    WorkspaceTrustScope[WorkspaceTrustScope["Remote"] = 1] = "Remote";
})(WorkspaceTrustScope || (WorkspaceTrustScope = {}));
export const IWorkspaceTrustEnablementService = createDecorator('workspaceTrustEnablementService');
export const IWorkspaceTrustManagementService = createDecorator('workspaceTrustManagementService');
export var WorkspaceTrustUriResponse;
(function (WorkspaceTrustUriResponse) {
    WorkspaceTrustUriResponse[WorkspaceTrustUriResponse["Open"] = 1] = "Open";
    WorkspaceTrustUriResponse[WorkspaceTrustUriResponse["OpenInNewWindow"] = 2] = "OpenInNewWindow";
    WorkspaceTrustUriResponse[WorkspaceTrustUriResponse["Cancel"] = 3] = "Cancel";
})(WorkspaceTrustUriResponse || (WorkspaceTrustUriResponse = {}));
export const IWorkspaceTrustRequestService = createDecorator('workspaceTrustRequestService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVHJ1c3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxNQUFNLENBQU4sSUFBWSxtQkFHWDtBQUhELFdBQVksbUJBQW1CO0lBQzlCLCtEQUFTLENBQUE7SUFDVCxpRUFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUhXLG1CQUFtQixLQUFuQixtQkFBbUIsUUFHOUI7QUFpQkQsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsZUFBZSxDQUFtQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBUXJJLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLGVBQWUsQ0FBbUMsaUNBQWlDLENBQUMsQ0FBQztBQThCckksTUFBTSxDQUFOLElBQWtCLHlCQUlqQjtBQUpELFdBQWtCLHlCQUF5QjtJQUMxQyx5RUFBUSxDQUFBO0lBQ1IsK0ZBQW1CLENBQUE7SUFDbkIsNkVBQVUsQ0FBQTtBQUNYLENBQUMsRUFKaUIseUJBQXlCLEtBQXpCLHlCQUF5QixRQUkxQztBQUVELE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLGVBQWUsQ0FBZ0MsOEJBQThCLENBQUMsQ0FBQyJ9