/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { AutomationRunTrigger, IAutomation } from './automation.js';

export const IAutomationRunner = createDecorator<IAutomationRunner>('automationRunner');

export interface IAutomationRunOperation {
	/** Resolves after dispatch commits a session or ends without one. */
	readonly whenDispatched: Promise<void>;

	/** Resolves after lifecycle tracking reaches a terminal outcome. */
	readonly whenCompleted: Promise<void>;
}

/**
 * Runs a single automation: claim the per-automation slot, record the run,
 * drive the chat session, report success/failure to {@link IAutomationService}.
 * Implemented in the sessions layer via `ISessionsManagementService`.
 */
export interface IAutomationRunner {
	readonly _serviceBrand: undefined;

	/**
	 * Runs `automation` once (skips if another run for it is already in flight).
	 * Never throws. Failures are recorded on the run row in {@link IAutomationService}.
	 */
	runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token?: CancellationToken,
	): IAutomationRunOperation;
}
