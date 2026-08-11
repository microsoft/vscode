/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AutomationInterval, AutomationRunTrigger, IAutomation } from './automation.js';

/**
 * GDPR-classified telemetry events for the Automations feature.
 *
 * Events capture cadence (`intervalKind`, `trigger`) and low-cardinality
 * enum values (`permissionLevel`, `isolationMode`) only.
 * Prompt text, automation names, folder URIs, and model identifiers are
 * never sent. They are user content / workspace-specific information.
 */

type AutomationCreateEvent = {
	intervalKind: AutomationInterval;
	permissionLevel: string;
	isolationMode: string;
	enabled: boolean;
};

type AutomationCreateClassification = {
	intervalKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Cadence the user picked (manual/hourly/daily/weekly).' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Permission level chosen (default/autoApprove/autopilot).' };
	isolationMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode chosen (workspace/worktree).' };
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the automation was created in the enabled state.' };
	owner: 'benvillalobos';
	comment: 'Tracks Automations feature adoption and which options users configure.';
};

export function publishAutomationCreated(telemetryService: ITelemetryService, automation: IAutomation): void {
	telemetryService.publicLog2<AutomationCreateEvent, AutomationCreateClassification>('automation.create', {
		intervalKind: automation.schedule.interval,
		permissionLevel: automation.permissionLevel ?? '',
		isolationMode: getAutomationIsolationMode(automation),
		enabled: automation.enabled,
	});
}

type AutomationUpdateEvent = {
	intervalKind: AutomationInterval;
	scheduleChanged: boolean;
	enabledChanged: boolean;
	enabled: boolean;
};

type AutomationUpdateClassification = {
	intervalKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Cadence after the update.' };
	scheduleChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the schedule itself changed (interval/time/day).' };
	enabledChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the enabled flag flipped.' };
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Enabled state after the update.' };
	owner: 'benvillalobos';
	comment: 'Tracks how often users edit Automations and which fields they touch.';
};

export function publishAutomationUpdated(telemetryService: ITelemetryService, before: IAutomation, after: IAutomation): void {
	telemetryService.publicLog2<AutomationUpdateEvent, AutomationUpdateClassification>('automation.update', {
		intervalKind: after.schedule.interval,
		scheduleChanged: before.schedule.interval !== after.schedule.interval
			|| before.schedule.scheduleHour !== after.schedule.scheduleHour
			|| before.schedule.scheduleMinute !== after.schedule.scheduleMinute
			|| before.schedule.scheduleDay !== after.schedule.scheduleDay,
		enabledChanged: before.enabled !== after.enabled,
		enabled: after.enabled,
	});
}

type AutomationDeleteEvent = {
	intervalKind: AutomationInterval;
};

type AutomationDeleteClassification = {
	intervalKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Cadence of the deleted automation.' };
	owner: 'benvillalobos';
	comment: 'Tracks Automations deletion.';
};

export function publishAutomationDeleted(telemetryService: ITelemetryService, automation: IAutomation): void {
	telemetryService.publicLog2<AutomationDeleteEvent, AutomationDeleteClassification>('automation.delete', {
		intervalKind: automation.schedule.interval,
	});
}

type AutomationRunEvent = {
	trigger: AutomationRunTrigger;
	intervalKind: AutomationInterval;
	success: boolean;
	durationMs: number;
	permissionLevel: string;
	isolationMode: string;
};

type AutomationRunClassification = {
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What kicked off the run (schedule/catch_up/manual).' };
	intervalKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Cadence of the automation that ran.' };
	success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the run completed without error.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock duration of the run kickoff (recordRunStart through completed/failed).' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Permission level applied to the run (default/autoApprove/autopilot).' };
	isolationMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode applied to the run (workspace/worktree).' };
	owner: 'benvillalobos';
	comment: 'Tracks Automations run outcomes and timing.';
};

export function publishAutomationRun(telemetryService: ITelemetryService, args: {
	trigger: AutomationRunTrigger;
	automation: IAutomation;
	success: boolean;
	durationMs: number;
}): void {
	telemetryService.publicLog2<AutomationRunEvent, AutomationRunClassification>('automation.run', {
		trigger: args.trigger,
		intervalKind: args.automation.schedule.interval,
		success: args.success,
		durationMs: Math.max(0, Math.round(args.durationMs)),
		permissionLevel: args.automation.permissionLevel ?? '',
		isolationMode: getAutomationIsolationMode(args.automation),
	});
}

function getAutomationIsolationMode(automation: IAutomation): string {
	if (automation.target.kind !== 'workspace') {
		return '';
	}
	return automation.target.isolation.kind === 'folder'
		? 'workspace'
		: automation.target.isolation.kind === 'worktree' ? 'worktree' : '';
}

type AutomationRunErrorEvent = {
	trigger: AutomationRunTrigger;
	intervalKind: AutomationInterval;
	// TODO: classify error types (e.g. 'network', 'auth', 'timeout') instead of raw messages
};

type AutomationRunErrorClassification = {
	trigger: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'What kicked off the failed run (schedule/catch_up/manual).' };
	intervalKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Cadence of the automation that failed.' };
	owner: 'benvillalobos';
	comment: 'Tracks Automations run failures for reliability.';
};

export function publishAutomationRunError(telemetryService: ITelemetryService, args: {
	trigger: AutomationRunTrigger;
	automation: IAutomation;
}): void {
	telemetryService.publicLogError2<AutomationRunErrorEvent, AutomationRunErrorClassification>('automation.runError', {
		trigger: args.trigger,
		intervalKind: args.automation.schedule.interval,
	});
}
