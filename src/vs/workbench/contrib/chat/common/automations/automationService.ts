/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAutomation, IAutomationRun, AutomationRunTrigger, IAutomationSchedule, AutomationTarget } from './automation.js';

export const IAutomationService = createDecorator<IAutomationService>('automationService');

/**
 * Input for `createAutomation`. The service fills in `id`, timestamps, and
 * `nextRunAt`.
 */
export interface ICreateAutomationOptions {
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;
	readonly target: AutomationTarget;
	readonly modelId?: string;
	readonly mode?: string;
	readonly permissionLevel?: string;
	readonly enabled?: boolean;
}

/**
 * Patch for `updateAutomation`. Absent fields are unchanged; a target change
 * replaces the complete discriminated target atomically.
 */
export interface IUpdateAutomationOptions {
	readonly name?: string;
	readonly prompt?: string;
	readonly schedule?: IAutomationSchedule;
	readonly target?: AutomationTarget;
	readonly modelId?: string | null;
	readonly mode?: string | null;
	readonly permissionLevel?: string | null;
	readonly enabled?: boolean;
}

/** Patch for `updateRun`. Absent fields are unchanged. */
export interface IUpdateAutomationRunOptions {
	readonly status?: IAutomationRun['status'];
	readonly sessionResource?: string;
	readonly completedAt?: string;
	readonly errorMessage?: string;
}

/**
 * Persistent store for automations and their run history, and the single
 * mutation point. Scheduler, runner, and UI all flow through it to keep
 * cross-window propagation, persistence, and observables consistent.
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

	/** Records a new run as `pending` and advances the schedule for scheduled/catch-up runs. Throws if the automation does not exist. */
	recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRun>;

	/** Applies a patch to a run; returns the updated run or `undefined` if not found. */
	updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined>;

	/** Most recent `pending`/`running` run for an automation, or `undefined`. Backs the runner's per-automation claim. */
	getActiveRunFor(automationId: string): IAutomationRun | undefined;

	/** Marks all stuck (`pending`/`running`) runs failed. Called on startup to recover from crashes. */
	markStaleRunsFailed(reason: string): Promise<void>;
}
