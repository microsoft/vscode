/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatPermissionLevel } from '../constants.js';
import { IAutomation, IAutomationRun, IAutomationSchedule, AutomationTarget } from './automation.js';

export const IAutomationService = createDecorator<IAutomationService>('automationService');
export const ConfigureAutomationToolReferenceName = 'configureAutomation';

/** Invoked immediately before an AHP mutation request; throwing aborts the request. */
export type AutomationMutationGuard = () => void;

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

/**
 * Result of an optimistic automation update.
 * `current` is absent when the automation was deleted before the update committed.
 */
export type IGuardedAutomationUpdateResult =
	| { readonly kind: 'updated'; readonly automation: IAutomation }
	| { readonly kind: 'conflict'; readonly current: IAutomation | undefined };

/**
 * Returns the canonical editable state used by optimistic automation updates.
 * Runtime-only timestamps are intentionally excluded. Workspace URIs use their
 * canonical serialized form so any mismatch fails closed as a conflict.
 */
export function serializeAutomationEditableState(automation: IAutomation): string {
	const target = automation.target.kind === 'quickChat'
		? {
			kind: automation.target.kind,
			providerId: automation.target.providerId,
			sessionTypeId: automation.target.sessionTypeId,
		}
		: {
			kind: automation.target.kind,
			folderUri: automation.target.folderUri.toString(),
			providerId: automation.target.providerId,
			sessionTypeId: automation.target.sessionTypeId,
			isolation: automation.target.isolation.kind === 'worktree'
				? { kind: automation.target.isolation.kind, branch: automation.target.isolation.branch }
				: { kind: automation.target.isolation.kind },
		};
	return JSON.stringify({
		name: automation.name,
		prompt: automation.prompt,
		schedule: {
			interval: automation.schedule.interval,
			scheduleHour: automation.schedule.scheduleHour,
			scheduleMinute: automation.schedule.scheduleMinute,
			scheduleDay: automation.schedule.scheduleDay,
		},
		target,
		modelId: automation.modelId,
		mode: automation.mode,
		permissionLevel: automation.permissionLevel ?? ChatPermissionLevel.Default,
		enabled: automation.enabled,
	});
}

export type IAutomationRunStartResult =
	| { readonly claimed: true; readonly run: IAutomationRun }
	| { readonly claimed: false; readonly run: IAutomationRun };

/** Client projection and mutation surface for Agent Host-owned automations. */
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

	/** Creates and persists an automation after validating the complete definition. */
	createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomation>;
	/** Applies a patch to the latest automation state; throws when `id` does not exist. */
	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation>;
	/**
	 * Applies `patch` only when the current editable fields still match `expected`.
	 * Runtime timestamps may change without conflicting, so reviewed edits preserve scheduler progress.
	 */
	updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomation, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult>;
	/** Deletes an automation and its retained run history; missing IDs are ignored. */
	deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void>;

	/** Atomically starts a host-owned manual run or returns the existing active run. */
	startRun(automationId: string, requestId: string): Promise<IAutomationRunStartResult>;
	/** Requests cancellation from the run's owning host. */
	cancelRun(runId: string): Promise<void>;
	/** Deletes retained run history when supported by the automation authority. */
	deleteRun?(runId: string): Promise<void>;

	/** Most recent `pending`/`running` run for an automation, or `undefined`. Backs the runner's per-automation claim. */
	getActiveRunFor(automationId: string): IAutomationRun | undefined;

}
