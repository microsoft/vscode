/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { AutomationRunTrigger, IAutomationDescriptor, IAutomationRun } from './automation.js';

export const IAutomationRunner = createDecorator<IAutomationRunner>('automationRunner');

/** Why dispatch ended without starting a session. */
export type AutomationDispatchFailure =
	/** The automation was deleted between scheduling and dispatch. */
	| 'deleted'
	/** The automation's configured agent is not advertised yet. */
	| 'targetUnavailable'
	/** The caller's token was cancelled before a session was created. */
	| 'cancelled'
	/** Session creation failed; see `run.errorMessage` when a run row exists. */
	| 'error';

/** Outcome of the dispatch phase of {@link IAutomationRunner.runOnce}. */
export type IAutomationRunDispatch =
	/** This call claimed the automation's run slot and a session was created for it. */
	| { readonly kind: 'started'; readonly run: IAutomationRun; readonly sessionResource: URI }
	/** Another run already held the automation's run slot, so nothing was dispatched. */
	| { readonly kind: 'alreadyRunning'; readonly activeRun: IAutomationRun }
	/** Dispatch ended without a session. `run` is set when a run row was recorded first. */
	| { readonly kind: 'notStarted'; readonly reason: AutomationDispatchFailure; readonly run?: IAutomationRun };

export interface IAutomationRunOperation {
	/** Resolves once dispatch settles, reporting whether this call claimed the run slot. */
	readonly whenDispatched: Promise<IAutomationRunDispatch>;

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
		automation: IAutomationDescriptor,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token?: CancellationToken,
	): IAutomationRunOperation;
}
