/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

/**
 * How often an automation runs.
 *
 * - `manual`: never runs on a schedule; the user must trigger it explicitly.
 * - `hourly`: runs every hour from the moment it is created or updated.
 * - `daily`: runs once per day at the configured local-time hour and minute.
 * - `weekly`: runs once per week at the configured local-time hour, minute,
 *   and day-of-week.
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

/**
 * A single scheduled automation. Identity is the immutable `id`; everything
 * else may be edited by the user.
 */
export interface IAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;

	/**
	 * Workspace folder the spawned session should open in. Required —
	 * automations always run in a specific folder so the launched
	 * session has the right project context.
	 */
	readonly folderUri: URI;

	/**
	 * Identifier of the sessions provider that should serve the scheduled
	 * run (e.g. `local-agent-host`, `copilot-chat`). Omitted on automations
	 * created before the picker existed; the runner then falls back to the
	 * workspace's default provider.
	 */
	readonly providerId?: string;

	/**
	 * Identifier of the session type to create within {@link providerId}.
	 * Captured alongside {@link providerId} when the user picks a session
	 * type in the create/edit dialog so scheduled runs spin up the same
	 * kind of session every time.
	 */
	readonly sessionTypeId?: string;

	/** Optional language model identifier to seed the new session with. */
	readonly modelId?: string;

	/**
	 * Optional builtin chat mode for the scheduled session — one of
	 * `agent`, `ask`, `edit` (see `ChatModeKind`). When omitted the
	 * provider's default applies. Custom modes are not yet supported here.
	 */
	readonly mode?: string;

	/**
	 * Optional permission level applied to the scheduled session — one of
	 * `default`, `autoApprove`, `autopilot` (see `ChatPermissionLevel`).
	 * Lets users opt scheduled runs into auto-approval without changing
	 * the workspace-wide default. When omitted the provider's default
	 * applies.
	 */
	readonly permissionLevel?: string;

	readonly enabled: boolean;

	/** ISO-8601 UTC timestamp. */
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly lastRunAt?: string;

	/** ISO-8601 UTC timestamp; `undefined` when interval is `manual`. */
	readonly nextRunAt?: string;
}

/**
 * Status of an individual automation run.
 */
export type AutomationRunStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * What kicked off a run.
 *
 * - `schedule`: due-time was reached during a normal scheduler tick.
 * - `catch_up`: due-time was reached while VS Code was closed and the run
 *   fires once at the next startup.
 * - `manual`: user clicked "Run now".
 */
export type AutomationRunTrigger = 'schedule' | 'catch_up' | 'manual';

/**
 * A single recorded execution of an automation.
 */
export interface IAutomationRun {
	readonly id: string;
	readonly automationId: string;
	readonly status: AutomationRunStatus;
	readonly trigger: AutomationRunTrigger;

	/** Session identifier assigned by ISessionsManagementService, if any. */
	readonly sessionId?: string;

	readonly startedAt: string;
	readonly completedAt?: string;
	readonly errorMessage?: string;

	/**
	 * Identifier of the workbench window that claimed this run. Used by the
	 * leader-election guard to avoid duplicate execution across windows.
	 */
	readonly leaderWindowId: number;
}
