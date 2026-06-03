/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAutomation, IAutomationRun, AutomationRunTrigger, IAutomationSchedule } from './automation.js';

export const IAutomationService = createDecorator<IAutomationService>('automationService');

/**
 * Input for `createAutomation`. The service fills in `id`, timestamps, and
 * `nextRunAt`.
 *
 * `folderUri` is required — every automation must target a specific
 * workspace folder so the spawned session has project context.
 */
export interface ICreateAutomationOptions {
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;
	readonly folderUri: URI;
	readonly modelId?: string;
	readonly mode?: string;
	readonly enabled?: boolean;
}

/**
 * Patch for `updateAutomation`. Fields not present are left unchanged.
 * Pass `null` for `modelId` or `mode` to clear them. `folderUri` cannot
 * be cleared — pass a new URI to change which folder the automation runs
 * in.
 */
export interface IUpdateAutomationOptions {
	readonly name?: string;
	readonly prompt?: string;
	readonly schedule?: IAutomationSchedule;
	readonly folderUri?: URI;
	readonly modelId?: string | null;
	readonly mode?: string | null;
	readonly enabled?: boolean;
}

/**
 * Patch for `updateRun`. Fields not present are left unchanged.
 */
export interface IUpdateAutomationRunOptions {
	readonly status?: IAutomationRun['status'];
	readonly sessionId?: string;
	readonly completedAt?: string;
	readonly errorMessage?: string;
}

/**
 * Manages the persistent list of scheduled automations and their run history.
 *
 * The service is the single mutation point for both definitions and runs;
 * the scheduler, runner, and UI all flow through it so cross-window
 * propagation, persistence, and observable updates stay consistent.
 */
export interface IAutomationService {
	readonly _serviceBrand: undefined;

	/** All defined automations, newest first. */
	readonly automations: IObservable<readonly IAutomation[]>;

	/** All recorded runs across all automations, newest first. */
	readonly runs: IObservable<readonly IAutomationRun[]>;

	/** Snapshot accessor (no observable dependency). */
	getAutomation(id: string): IAutomation | undefined;

	/** Runs for a single automation, newest first. */
	runsFor(automationId: string): IObservable<readonly IAutomationRun[]>;

	createAutomation(options: ICreateAutomationOptions): Promise<IAutomation>;
	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation>;
	deleteAutomation(id: string): Promise<void>;

	/**
	 * Records a new run as `pending`. Called by the scheduler/runner.
	 * Throws if the automation does not exist.
	 */
	recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRun>;

	/**
	 * Applies a patch to an existing run. Returns the updated run, or
	 * `undefined` if no run with that id exists.
	 */
	updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined>;

	/**
	 * Returns the most recent `pending` or `running` run for an automation,
	 * or `undefined` if none. Used by the runner's per-automation claim.
	 */
	getActiveRunFor(automationId: string): IAutomationRun | undefined;

	/**
	 * Marks all stuck runs (pending or running) as failed with the given
	 * message. Called on startup to recover from crashes.
	 */
	markStaleRunsFailed(reason: string): Promise<void>;

	/**
	 * Sets `lastRunAt = now` and recomputes `nextRunAt` from the current
	 * schedule. Called by the scheduler right after dispatching a run, so
	 * the same automation is not picked up twice on a subsequent tick.
	 */
	advanceNextRunAt(id: string, now?: Date): Promise<IAutomation | undefined>;
}
