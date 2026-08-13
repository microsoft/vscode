/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

/**
 * How often an automation runs. `hourly` fires every hour from creation/update;
 * `daily`/`weekly` fire at the configured local-time hour/minute (and day-of-week).
 */
export type AutomationInterval = 'manual' | 'hourly' | 'daily' | 'weekly';

/**
 * Describes the cadence at which an automation should fire.
 *
 * Times are stored in local-time wall-clock values. The scheduler converts
 * them to UTC when computing concrete run instants so DST transitions are
 * handled correctly.
 */
export interface IAutomationSchedule {
	readonly interval: AutomationInterval;

	/** Hour-of-day, 0-23. Ignored for `manual` and `hourly`. */
	readonly scheduleHour: number;

	/** Minute-of-hour, 0-59. Ignored for `manual` and `hourly`. */
	readonly scheduleMinute: number;

	/** Day-of-week, 0 (Sunday) through 6 (Saturday). Only used for `weekly`. */
	readonly scheduleDay: number;
}

/** Repository isolation for a workspace-backed Automation target. */
export type AutomationWorkspaceIsolation =
	| { readonly kind: 'default' }
	| { readonly kind: 'folder' }
	| { readonly kind: 'worktree'; readonly branch: string };

/** The mutually exclusive execution targets an Automation can use. */
export type AutomationTarget =
	| {
		readonly kind: 'workspace';
		readonly folderUri: URI;
		readonly providerId?: string;
		readonly sessionTypeId?: string;
		readonly isolation: AutomationWorkspaceIsolation;
	}
	| {
		readonly kind: 'quickChat';
		readonly providerId: string;
		readonly sessionTypeId: string;
	};

export interface IAutomationHost {
	readonly authority: string;
	readonly resource: string;
	readonly revision: number;
	readonly connected: boolean;
	readonly hasUnsupportedTriggers: boolean;

	/** Whether the owning authority currently permits editing the definition. */
	readonly canEdit: boolean;

	/** Whether the owning authority currently permits starting a run on demand. */
	readonly canRun: boolean;

	/** Whether the owning authority currently permits deleting the definition. */
	readonly canDelete: boolean;

	readonly migrationPending?: boolean;
	readonly migrationConflict?: boolean;
}

/**
 * A single scheduled automation. Identity is the immutable `id`; everything
 * else may be edited by the user.
 */
export interface IAutomationDescriptor {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;

	/** Explicit workspace-backed or workspace-less execution target. */
	readonly target: AutomationTarget;

	/** Optional language model identifier to seed the new session with. */
	readonly modelId?: string;

	/** Optional chat mode (`agent`/`ask`/`edit`). Defaults to provider's default; custom modes unsupported. */
	readonly mode?: string;

	/** Optional permission level (`default`/`autoApprove`/`autopilot`). Overrides only for scheduled runs; defaults to provider's default. */
	readonly permissionLevel?: string;

	readonly enabled: boolean;

	/** ISO-8601 UTC timestamp. */
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly lastRunAt?: string;

	/** ISO-8601 UTC timestamp; `undefined` when interval is `manual`. */
	readonly nextRunAt?: string;

	/** Present when the definition is owned by an Agent Host Protocol authority. */
	readonly host?: IAutomationHost;
}

/**
 * Lifecycle projected from the owning Agent Host's automation-run channel.
 */
export type AutomationRunStatus = 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';

/**
 * What kicked off a run. `catch_up` identifies a host-recovered missed occurrence.
 */
export type AutomationRunTrigger = 'schedule' | 'catch_up' | 'event' | 'manual';

export interface IAutomationRun {
	readonly id: string;
	readonly automationId: string;
	readonly status: AutomationRunStatus;
	readonly trigger: AutomationRunTrigger;

	/** Session resource URI, recorded as soon as the committed session is available. */
	readonly sessionResource?: URI;
	readonly sessionResources?: readonly URI[];
	readonly artifactCount?: number;
	readonly blocker?: string;
	readonly canCancel?: boolean;

	readonly startedAt: string;
	readonly completedAt?: string;
	readonly errorMessage?: string;

}
