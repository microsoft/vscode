/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//#endregion
//#region Pull Request
export var GitHubPullRequestState;
(function (GitHubPullRequestState) {
    GitHubPullRequestState["Open"] = "open";
    GitHubPullRequestState["Closed"] = "closed";
    GitHubPullRequestState["Merged"] = "merged";
})(GitHubPullRequestState || (GitHubPullRequestState = {}));
export var MergeBlockerKind;
(function (MergeBlockerKind) {
    MergeBlockerKind["ChangesRequested"] = "changesRequested";
    MergeBlockerKind["CIFailed"] = "ciFailed";
    MergeBlockerKind["ApprovalNeeded"] = "approvalNeeded";
    MergeBlockerKind["Conflicts"] = "conflicts";
    MergeBlockerKind["Draft"] = "draft";
    MergeBlockerKind["Unknown"] = "unknown";
})(MergeBlockerKind || (MergeBlockerKind = {}));
//#endregion
//#region CI Checks
export var GitHubCheckStatus;
(function (GitHubCheckStatus) {
    GitHubCheckStatus["Queued"] = "queued";
    GitHubCheckStatus["InProgress"] = "in_progress";
    GitHubCheckStatus["Completed"] = "completed";
})(GitHubCheckStatus || (GitHubCheckStatus = {}));
export var GitHubCheckConclusion;
(function (GitHubCheckConclusion) {
    GitHubCheckConclusion["Success"] = "success";
    GitHubCheckConclusion["Failure"] = "failure";
    GitHubCheckConclusion["Neutral"] = "neutral";
    GitHubCheckConclusion["Cancelled"] = "cancelled";
    GitHubCheckConclusion["Skipped"] = "skipped";
    GitHubCheckConclusion["TimedOut"] = "timed_out";
    GitHubCheckConclusion["ActionRequired"] = "action_required";
    GitHubCheckConclusion["Stale"] = "stale";
})(GitHubCheckConclusion || (GitHubCheckConclusion = {}));
export var GitHubCIOverallStatus;
(function (GitHubCIOverallStatus) {
    GitHubCIOverallStatus["Pending"] = "pending";
    GitHubCIOverallStatus["Success"] = "success";
    GitHubCIOverallStatus["Failure"] = "failure";
    GitHubCIOverallStatus["Neutral"] = "neutral";
})(GitHubCIOverallStatus || (GitHubCIOverallStatus = {}));
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9jb21tb24vdHlwZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUEyQmhHLFlBQVk7QUFFWixzQkFBc0I7QUFFdEIsTUFBTSxDQUFOLElBQWtCLHNCQUlqQjtBQUpELFdBQWtCLHNCQUFzQjtJQUN2Qyx1Q0FBYSxDQUFBO0lBQ2IsMkNBQWlCLENBQUE7SUFDakIsMkNBQWlCLENBQUE7QUFDbEIsQ0FBQyxFQUppQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBSXZDO0FBd0JELE1BQU0sQ0FBTixJQUFrQixnQkFPakI7QUFQRCxXQUFrQixnQkFBZ0I7SUFDakMseURBQXFDLENBQUE7SUFDckMseUNBQXFCLENBQUE7SUFDckIscURBQWlDLENBQUE7SUFDakMsMkNBQXVCLENBQUE7SUFDdkIsbUNBQWUsQ0FBQTtJQUNmLHVDQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFQaUIsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQU9qQztBQXdDRCxZQUFZO0FBRVosbUJBQW1CO0FBRW5CLE1BQU0sQ0FBTixJQUFrQixpQkFJakI7QUFKRCxXQUFrQixpQkFBaUI7SUFDbEMsc0NBQWlCLENBQUE7SUFDakIsK0NBQTBCLENBQUE7SUFDMUIsNENBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUppQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBSWxDO0FBRUQsTUFBTSxDQUFOLElBQWtCLHFCQVNqQjtBQVRELFdBQWtCLHFCQUFxQjtJQUN0Qyw0Q0FBbUIsQ0FBQTtJQUNuQiw0Q0FBbUIsQ0FBQTtJQUNuQiw0Q0FBbUIsQ0FBQTtJQUNuQixnREFBdUIsQ0FBQTtJQUN2Qiw0Q0FBbUIsQ0FBQTtJQUNuQiwrQ0FBc0IsQ0FBQTtJQUN0QiwyREFBa0MsQ0FBQTtJQUNsQyx3Q0FBZSxDQUFBO0FBQ2hCLENBQUMsRUFUaUIscUJBQXFCLEtBQXJCLHFCQUFxQixRQVN0QztBQVlELE1BQU0sQ0FBTixJQUFrQixxQkFLakI7QUFMRCxXQUFrQixxQkFBcUI7SUFDdEMsNENBQW1CLENBQUE7SUFDbkIsNENBQW1CLENBQUE7SUFDbkIsNENBQW1CLENBQUE7SUFDbkIsNENBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQUxpQixxQkFBcUIsS0FBckIscUJBQXFCLFFBS3RDO0FBRUQsWUFBWSJ9