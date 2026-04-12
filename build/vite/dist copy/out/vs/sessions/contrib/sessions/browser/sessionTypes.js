/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
/** Session type ID for local Copilot CLI sessions. */
export const COPILOT_CLI_SESSION_TYPE = 'copilotcli';
/** Session type ID for Copilot Cloud sessions. */
export const COPILOT_CLOUD_SESSION_TYPE = 'copilot-cloud-agent';
/** Copilot CLI session type — local background agent running in a Git worktree. */
export const CopilotCLISessionType = {
    id: COPILOT_CLI_SESSION_TYPE,
    label: localize('copilotCLI', "Copilot CLI"),
    icon: Codicon.copilot,
};
/** Copilot Cloud session type - cloud-hosted agent. */
export const CopilotCloudSessionType = {
    id: COPILOT_CLOUD_SESSION_TYPE,
    label: localize('copilotCloud', "Cloud"),
    icon: Codicon.cloud,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblR5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25UeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRzlDLHNEQUFzRDtBQUN0RCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBRyxZQUFZLENBQUM7QUFFckQsa0RBQWtEO0FBQ2xELE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLHFCQUFxQixDQUFDO0FBRWhFLG1GQUFtRjtBQUNuRixNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBaUI7SUFDbEQsRUFBRSxFQUFFLHdCQUF3QjtJQUM1QixLQUFLLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUM7SUFDNUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPO0NBQ3JCLENBQUM7QUFFRix1REFBdUQ7QUFDdkQsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQWlCO0lBQ3BELEVBQUUsRUFBRSwwQkFBMEI7SUFDOUIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsT0FBTyxDQUFDO0lBQ3hDLElBQUksRUFBRSxPQUFPLENBQUMsS0FBSztDQUNuQixDQUFDIn0=