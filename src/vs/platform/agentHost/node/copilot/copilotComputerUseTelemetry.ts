/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { computerUsePermissions, type ComputerUsePermission } from '../../common/computerUse.js';
import type { IAgentHostEventClassification } from '../agentHostTelemetryReporter.js';
import type { ComputerUseActivationReport, ComputerUseLaunchState } from './copilotComputerUseActivationTool.js';
import type { ComputerUsePluginInstallFailure } from './copilotComputerUsePlugin.js';
import type { CopilotSessionFailureCorrelation } from './copilotFailureTelemetry.js';

type ComputerUseChatClassification = IAgentHostEventClassification & {
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host session identifier.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host chat identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host turn identifier, when a turn was running.' };
	sdkSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Copilot SDK session identifier.' };
};

type ComputerUseStateEvent = CopilotSessionFailureCorrelation & {
	state: ComputerUseLaunchState;
};

type ComputerUseStateClassification = ComputerUseChatClassification & {
	state: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether Computer Use was on, off, notInstalled (the runtime had no built-in plugin yet, for example while it downloads) or unknown (the runtime could not list its plugins).' };
	owner: 'Giuspepe';
	comment: 'Records the state of Computer Use each time a Copilot chat launches while VS Code offers it, to count the users who turned it on, including with /computer on, which runs in the Copilot runtime.';
};

/** Reports the state of Computer Use as a chat launches, while VS Code offers it. */
export function reportComputerUseState(telemetryService: ITelemetryService, state: ComputerUseLaunchState, correlation: CopilotSessionFailureCorrelation): void {
	telemetryService.publicLog2<ComputerUseStateEvent, ComputerUseStateClassification>('agentHost.computerUseState', { ...correlation, state });
}

type ComputerUseActivationEvent = CopilotSessionFailureCorrelation & {
	outcome: ComputerUseActivationReport;
};

type ComputerUseActivationClassification = ComputerUseChatClassification & {
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the request ended: turnedOn, alreadyOn, declined, declinedEarlier (declined before in this chat), blocked (turned off by the organization), unavailable (no built-in plugin), unattended (no one could answer, for example in autopilot), cancelled (the turn ended before an answer), failed (the runtime did not turn it on) or error (checking or turning it on threw).' };
	owner: 'Giuspepe';
	comment: 'Records how each request by the agent to turn on Computer Use ended, to measure how often users turn it on when asked.';
};

/** Reports how one request by the agent to turn on Computer Use ended. */
export function reportComputerUseActivation(telemetryService: ITelemetryService, outcome: ComputerUseActivationReport, correlation: CopilotSessionFailureCorrelation): void {
	telemetryService.publicLog2<ComputerUseActivationEvent, ComputerUseActivationClassification>('agentHost.computerUseActivation', { ...correlation, outcome });
}

/**
 * How downloading and installing the Computer Use plugin ended: `installed`, why it failed, `timeout` when it took too
 * long, `cancelled` when the setting was turned off or the Agent Host stopped, or `other` for anything unexpected.
 */
export type ComputerUsePluginInstallResult = 'installed' | ComputerUsePluginInstallFailure | 'timeout' | 'cancelled' | 'other';

export interface IComputerUsePluginInstallReport {
	readonly result: ComputerUsePluginInstallResult;
	/** The HTTP status of a download the server refused. */
	readonly statusCode?: number;
	readonly durationMs: number;
	readonly pluginVersion: string;
	/** The plugin build for this machine, such as `darwin-arm64`. */
	readonly target: string;
}

type ComputerUsePluginInstallEvent = {
	result: ComputerUsePluginInstallResult;
	statusCode: number | undefined;
	durationMs: number;
	pluginVersion: string;
	target: string;
};

type ComputerUsePluginInstallClassification = {
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'How the install ended: installed, network (the download failed), http (the server answered with an error status), checksum (the archive did not match its pinned SHA-256), install (unpacking or publishing it failed), timeout, cancelled (the setting was turned off or the Agent Host stopped) or other.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The HTTP status of a download the server refused.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long downloading and installing took, in milliseconds.' };
	pluginVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The pinned plugin version, such as 0.1.95.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The plugin build for this machine as platform and architecture, such as darwin-arm64.' };
	owner: 'Giuspepe';
	comment: 'Records each download and install of the Computer Use plugin, to measure how often it succeeds, why it fails and how long it takes.';
};

/** Reports how one download and install of the Computer Use plugin ended. */
export function reportComputerUsePluginInstall(telemetryService: ITelemetryService, report: IComputerUsePluginInstallReport): void {
	telemetryService.publicLog2<ComputerUsePluginInstallEvent, ComputerUsePluginInstallClassification>('agentHost.computerUsePluginInstall', {
		result: report.result,
		statusCode: report.statusCode,
		durationMs: Math.round(report.durationMs),
		pluginVersion: report.pluginVersion,
		target: report.target,
	});
}

/**
 * How a macOS permission setup ended: `ready` once the plugin verified both permissions, or why it ended without them:
 * - `decline`: the user turned setup down.
 * - `cancel`: a client closed it without declining, or answered with a choice the plugin doesn't know.
 * - `notWaiting`: the chat stopped waiting, because its turn ended, Computer Use was turned off, or the plugin's tool
 *   call completed, for example after Copilot's timeout.
 * - `unconfirmed`: the tool call failed after an action, so nothing proves the permissions.
 * - `unsupportedPrompt`: the plugin asked in a form this version doesn't know.
 */
export type ComputerUseSetupResult = 'ready' | 'decline' | 'cancel' | 'notWaiting' | 'unconfirmed' | 'unsupportedPrompt';

export interface IComputerUseSetupReport {
	readonly result: ComputerUseSetupResult;
	readonly missingAtStart: ReadonlySet<ComputerUsePermission>;
	/** The permissions still missing when the setup ended, as last verified. */
	readonly missingAtEnd: ReadonlySet<ComputerUsePermission>;
	/** How many times the plugin asked for permissions. */
	readonly rounds: number;
	readonly durationMs: number;
}

type ComputerUseSetupEvent = {
	result: ComputerUseSetupResult;
	missingAtStart: string;
	missingAtEnd: string;
	rounds: number;
	durationMs: number;
};

type ComputerUseSetupClassification = {
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the setup ended: ready (both permissions verified), decline (the user turned setup down), cancel (closed without declining), notWaiting (the turn ended, Computer Use was turned off, or the waiting tool call completed, for example after a timeout), unconfirmed (the tool call failed after an action) or unsupportedPrompt (the plugin asked in an unknown form).' };
	missingAtStart: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The macOS permissions missing when the setup started: accessibility, screenRecording, or both separated by a comma.' };
	missingAtEnd: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The macOS permissions still missing when the setup ended, as last verified: none, accessibility, screenRecording, or both separated by a comma.' };
	rounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many times the plugin asked for permissions during the setup.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the setup took, in milliseconds.' };
	owner: 'Giuspepe';
	comment: 'Records how each macOS permission setup for Computer Use ended, to measure how many users finish it and which permission they stop at.';
};

/** Reports how one macOS permission setup ended. */
export function reportComputerUseSetup(telemetryService: ITelemetryService, report: IComputerUseSetupReport): void {
	telemetryService.publicLog2<ComputerUseSetupEvent, ComputerUseSetupClassification>('agentHost.computerUseSetup', {
		result: report.result,
		missingAtStart: describePermissions(report.missingAtStart),
		missingAtEnd: describePermissions(report.missingAtEnd),
		rounds: report.rounds,
		durationMs: Math.round(report.durationMs),
	});
}

/** `none`, or the permissions in their usual order, separated by commas. */
function describePermissions(permissions: ReadonlySet<ComputerUsePermission>): string {
	return computerUsePermissions.filter(permission => permissions.has(permission)).join(',') || 'none';
}
