/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAutomationDescriptor, IAutomationRun } from './automation.js';

export const IAutomationRunner = createDecorator<IAutomationRunner>('automationRunner');

/** Why dispatch ended without starting a session. */
export type AutomationDispatchFailure =
	/** The automation was deleted between invocation and dispatch. */
	| 'deleted'
	/** The owning Agent Host cannot currently run this automation. */
	| 'targetUnavailable'
	/** The caller's token was cancelled before a session was created. */
	| 'cancelled'
	/** The host request or session creation failed; see `run.errorMessage` when available. */
	| 'error';

/** Outcome of the dispatch phase of {@link IAutomationRunner.runOnce}. */
export type IAutomationRunDispatch =
	/** The host accepted the request and created a session for it. */
	| { readonly kind: 'started'; readonly run: IAutomationRun; readonly sessionResource: URI }
	/** Another run already held the automation's run slot, so nothing was dispatched. */
	| { readonly kind: 'alreadyRunning'; readonly activeRun: IAutomationRun }
	/** Dispatch ended without a session. `run` is set when a run row was recorded first. */
	| { readonly kind: 'notStarted'; readonly reason: AutomationDispatchFailure; readonly run?: IAutomationRun };

/** Separate completion handles for manual dispatch feedback and subsequent host-lifecycle observation. */
export interface IAutomationRunOperation {
	/** Resolves once the host's dispatch settles. */
	readonly whenDispatched: Promise<IAutomationRunDispatch>;

	/** Resolves when lifecycle observation ends, including when observing the host fails. */
	readonly whenCompleted: Promise<void>;
}

/**
 * Client-facing manual-run coordinator exposing dispatch feedback separately from lifecycle observation.
 * The owning Agent Host, not this coordinator, admits and executes the run.
 */
export interface IAutomationRunner {
	readonly _serviceBrand: undefined;

	/**
	 * Requests `automation` once without creating a session or managing its lifecycle locally.
	 * Never throws; dispatch failures are reported in the result and to the user.
	 */
	runOnce(
		automation: IAutomationDescriptor,
		token?: CancellationToken,
	): IAutomationRunOperation;
}
