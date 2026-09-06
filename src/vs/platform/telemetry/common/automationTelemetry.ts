/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../base/common/hash.js';
import type { ITelemetryService } from './telemetry.js';
import type { toTelemetryModel } from './languageModelTelemetry.js';

export type AutomationExecutionAuthority = 'browser' | 'agentHost';
export type AutomationRunOutcome = 'success' | 'error' | 'cancelled' | 'timeout' | 'interrupted';

/** The content-free, saved session configuration; omitted selections retain the provider default. */
export interface IAutomationConfigurationTelemetry {
	readonly provider: 'default' | 'other' | 'copilot' | 'copilotcli' | 'claude' | 'codex' | 'copilot-cloud';
	readonly model: ReturnType<typeof toTelemetryModel>;
	readonly modelSelectionKind: 'default' | 'auto' | 'explicit';
	readonly mode: 'providerDefault' | 'other' | 'agent' | 'ask' | 'edit' | 'interactive' | 'plan' | 'autopilot';
	readonly permissionLevel: 'providerDefault' | 'other' | 'default' | 'assisted' | 'autoApprove' | 'autopilot';
	readonly isolationMode: 'providerDefault' | 'other' | 'folder' | 'worktree' | 'none';
	readonly targetKind: 'workspace' | 'quickChat';
	readonly folderCount: number;
	readonly hasCustomAgent: boolean;
}

/** Opaque definition/run identities and the native identifiers of a created session, when one exists. */
export interface IAutomationRunTelemetry {
	readonly automationId: string;
	readonly runId: string;
	readonly executionAuthority: AutomationExecutionAuthority;
	readonly trigger: 'manual' | 'schedule' | 'catch_up' | 'event';
	readonly runCreatedAt: string;
	readonly sessionProvider?: IAutomationConfigurationTelemetry['provider'];
	readonly agentSessionId?: string;
	readonly agentsWindowSessionId?: string;
	readonly sessionCreated: boolean;
}

type AutomationConfigurationClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded agent provider category, or default/other.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Trusted catalog model identifier, byokModel or unknown; omitted for the provider default.' };
	modelSelectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the saved model selection is default, auto or explicit.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded saved session mode, or providerDefault/other.' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded saved approval level, or providerDefault/other.' };
	isolationMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Saved folder/worktree isolation, none for quick chats, or providerDefault/other.' };
	targetKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the automation targets a workspace or a workspace-less quick chat.' };
	folderCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of saved working directories; no paths are reported.' };
	hasCustomAgent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a custom agent is selected, without its name or URI.' };
};

type AutomationRunClassification = {
	automationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 of the opaque automation identifier, stable across ownership migration.' };
	runId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 of the opaque execution identifier.' };
	executionAuthority: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The browser or Agent Host that owns the run lifecycle.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the run was manual, scheduled, catch-up or event-triggered.' };
	runCreatedAt: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'UTC timestamp of the durable run claim.' };
	sessionProvider?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded provider of the linked session, distinct from the configured provider default.' };
	agentSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Native Agent Host session identifier, matching agentHost session telemetry; absent without an Agent Host session.' };
	agentsWindowSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 of the provider-neutral session identifier, matching agents/requestSent and agents/sessionSummary; absent for host-owned runs.' };
	sessionCreated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the run has a linked session, including failed or cancelled executions.' };
};

type AutomationCreatedEvent = IAutomationConfigurationTelemetry & {
	automationId: string;
	executionAuthority: AutomationExecutionAuthority;
	enabled: boolean;
	scheduleKind: 'manual' | 'scheduled';
};

type AutomationCreatedClassification = AutomationConfigurationClassification & {
	owner: 'ulugbekna';
	comment: 'Records newly persisted automation definitions, excluding migration and replay.';
	automationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 of the opaque automation identifier, stable across ownership migration.' };
	executionAuthority: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The browser or Agent Host that persisted the new definition.' };
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether automatic execution is enabled at creation.' };
	scheduleKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the definition is manual-only or has automatic triggers.' };
};

type AutomationRunStartedEvent = IAutomationRunTelemetry & IAutomationConfigurationTelemetry;
type AutomationRunStartedClassification = AutomationRunClassification & AutomationConfigurationClassification & {
	owner: 'ulugbekna';
	comment: 'Records the first durable session linkage of a non-terminal automation run, with its saved configuration.';
};

type AutomationRunCompletedEvent = IAutomationRunTelemetry & {
	outcome: AutomationRunOutcome;
	durationMs: number;
};
type AutomationRunCompletedClassification = AutomationRunClassification & {
	owner: 'ulugbekna';
	comment: 'Records automation termination, including pre-session failures and runs whose history was removed during execution.';
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Run outcome: success, error, cancelled, timeout or interrupted.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock milliseconds from durable run claim to terminal state.' };
};

export function hashAutomationTelemetryId(id: string): string {
	const sha1 = new StringSHA1();
	sha1.update(id);
	return sha1.digest();
}

export function logAutomationCreated(telemetryService: ITelemetryService, event: AutomationCreatedEvent): void {
	telemetryService.publicLog2<AutomationCreatedEvent, AutomationCreatedClassification>('automation.created', {
		...event,
		automationId: hashAutomationTelemetryId(event.automationId),
	});
}

export function logAutomationRunStarted(telemetryService: ITelemetryService, event: AutomationRunStartedEvent): void {
	telemetryService.publicLog2<AutomationRunStartedEvent, AutomationRunStartedClassification>('automation.runStarted', {
		...event,
		automationId: hashAutomationTelemetryId(event.automationId),
		runId: hashAutomationTelemetryId(event.runId),
	});
}

export function logAutomationRunCompleted(telemetryService: ITelemetryService, event: AutomationRunCompletedEvent): void {
	telemetryService.publicLog2<AutomationRunCompletedEvent, AutomationRunCompletedClassification>('automation.runCompleted', {
		...event,
		automationId: hashAutomationTelemetryId(event.automationId),
		runId: hashAutomationTelemetryId(event.runId),
		durationMs: Math.max(0, Math.round(event.durationMs)),
	});
}

export function getAutomationTelemetryProvider(provider: string | undefined): IAutomationConfigurationTelemetry['provider'] {
	switch (provider) {
		case undefined:
			return 'default';
		case 'copilot-cli':
		case 'copilotcli':
			return 'copilotcli';
		case 'copilot':
		case 'claude':
		case 'codex':
		case 'copilot-cloud':
			return provider;
		case 'copilot-cloud-agent':
			return 'copilot-cloud';
		case 'openai-codex':
			return 'codex';
		default:
			return 'other';
	}
}

export function getAutomationTelemetryMode(mode: unknown): IAutomationConfigurationTelemetry['mode'] {
	switch (mode) {
		case undefined:
			return 'providerDefault';
		case 'agent':
		case 'ask':
		case 'edit':
		case 'interactive':
		case 'plan':
		case 'autopilot':
			return mode;
		default:
			return 'other';
	}
}

export function getAutomationTelemetryPermissionLevel(permissionLevel: unknown): IAutomationConfigurationTelemetry['permissionLevel'] {
	switch (permissionLevel) {
		case undefined:
			return 'providerDefault';
		case 'default':
		case 'assisted':
		case 'autoApprove':
		case 'autopilot':
			return permissionLevel;
		default:
			return 'other';
	}
}

export function getAutomationTelemetryIsolation(isolation: unknown): IAutomationConfigurationTelemetry['isolationMode'] {
	switch (isolation) {
		case undefined:
		case 'default':
			return 'providerDefault';
		case 'folder':
		case 'worktree':
			return isolation;
		default:
			return 'other';
	}
}
