/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { ISessionType } from './sessionsProvider.js';

/** Session type ID for local Copilot CLI sessions. */
export const COPILOT_CLI_SESSION_TYPE = 'copilotcli';

/** Session type ID for Copilot Cloud sessions. */
export const COPILOT_CLOUD_SESSION_TYPE = 'copilot-cloud-agent';

/** Copilot CLI session type — local background agent running in a Git worktree. */
export const CopilotCLISessionType: ISessionType = {
	id: COPILOT_CLI_SESSION_TYPE,
	label: localize('copilotCLI', "Copilot CLI"),
	icon: Codicon.copilot,
};

/** Copilot Cloud session type - cloud-hosted agent. */
export const CopilotCloudSessionType: ISessionType = {
	id: COPILOT_CLOUD_SESSION_TYPE,
	label: localize('copilotCloud', "Cloud"),
	icon: Codicon.cloud,
};
