/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { AutomationRunTrigger, IAutomation } from './automation.js';

export const IAutomationRunner = createDecorator<IAutomationRunner>('automationRunner');

/**
 * Owns the act of running a single automation: claim the per-automation
 * slot, record the run, drive the chat session, and report success or
 * failure back to {@link IAutomationService}.
 *
 * Two implementations exist:
 * - `PlaceholderAutomationRunner` (workbench layer): records a run but
 *   does not create a real session. Used as a fallback for builds that
 *   do not load the sessions layer.
 * - `SessionsAutomationRunner` (sessions layer): the real runner that
 *   delegates to `ISessionsManagementService` to spawn a fresh session
 *   and seed it with the automation's prompt. Registered later in the
 *   singleton chain so it overrides the placeholder in the Agents
 *   window build.
 */
export interface IAutomationRunner {
	readonly _serviceBrand: undefined;

	/**
	 * Runs `automation` once. Resolves when the run kickoff is finished
	 * (or skipped because another run for the same automation was
	 * already in flight). Never throws; failures are recorded on the
	 * run row attached to {@link IAutomationService}.
	 */
	runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token?: CancellationToken,
	): Promise<void>;
}
