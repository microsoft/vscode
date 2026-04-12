/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const GITHUB_REMOTE_FILE_SCHEME = 'github-remote-file';
/**
 * Status of an agent session as reported by the sessions provider.
 */
export var SessionStatus;
(function (SessionStatus) {
    /** Session has not been sent yet (new/untitled). */
    SessionStatus[SessionStatus["Untitled"] = 0] = "Untitled";
    /** Agent is actively working. */
    SessionStatus[SessionStatus["InProgress"] = 1] = "InProgress";
    /** Agent is waiting for user input. */
    SessionStatus[SessionStatus["NeedsInput"] = 2] = "NeedsInput";
    /** Session has completed successfully. */
    SessionStatus[SessionStatus["Completed"] = 3] = "Completed";
    /** Session encountered an error. */
    SessionStatus[SessionStatus["Error"] = 4] = "Error";
})(SessionStatus || (SessionStatus = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkRhdGEuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uRGF0YS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVFoRyxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxvQkFBb0IsQ0FBQztBQUU5RDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFrQixhQVdqQjtBQVhELFdBQWtCLGFBQWE7SUFDOUIsb0RBQW9EO0lBQ3BELHlEQUFZLENBQUE7SUFDWixpQ0FBaUM7SUFDakMsNkRBQWMsQ0FBQTtJQUNkLHVDQUF1QztJQUN2Qyw2REFBYyxDQUFBO0lBQ2QsMENBQTBDO0lBQzFDLDJEQUFhLENBQUE7SUFDYixvQ0FBb0M7SUFDcEMsbURBQVMsQ0FBQTtBQUNWLENBQUMsRUFYaUIsYUFBYSxLQUFiLGFBQWEsUUFXOUIifQ==