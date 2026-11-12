/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../telemetry/common/telemetryUtils.js';
import { toRestrictedTelemetryEndpoint, type IAgentHostGitHubTelemetryContext, type IAgentHostRestrictedTelemetry } from '../agentHostRestrictedTelemetry.js';

/**
 * The feature that made a utility model call. Values match the Copilot Chat
 * extension's `messageSource` for the same features, so calls from both hosts
 * can be combined by `source`.
 */
export type AgentHostUtilityModelCallSource =
	| 'title'
	| 'githubPullRequestTitleAndDescriptionGenerator'
	| 'gitCommitMessageGenerator'
	| 'git-branch';

/** Telemetry attribution for a utility model call. Never carries prompt or response content. */
export interface IAgentHostUtilityModelCallTelemetryContext {
	readonly source: AgentHostUtilityModelCallSource;
	/**
	 * The agent session the call serves. Absent only while preparing a dev
	 * container worktree, before the session that uses it exists.
	 */
	readonly agentSessionId?: string;
}

export type AgentHostUtilityModelCallOutcome = 'success' | 'error' | 'cancelled';

/** One completed, failed, or cancelled utility model call. */
export interface IAgentHostUtilityModelCallReport {
	readonly context: IAgentHostUtilityModelCallTelemetryContext;
	readonly outcome: AgentHostUtilityModelCallOutcome;
	readonly isBYOK: boolean;
	/**
	 * The Copilot account the GitHub telemetry event is attributed to, captured
	 * from the call's credential before the request. Without it, the call is
	 * reported on the Microsoft telemetry stream only.
	 */
	readonly gitHubTelemetry?: IAgentHostGitHubTelemetryContext;
	/** The Copilot model requested. Ignored for BYOK calls, whose model is redacted. */
	readonly model?: string;
	/** The Copilot model the service reported serving. Ignored for BYOK calls. */
	readonly modelInvoked?: string;
	readonly finishReason?: string;
	readonly requestId?: string;
	readonly gitHubRequestId?: string;
	readonly copilotServiceRequestId?: string;
	readonly httpStatus?: number;
	readonly promptTokenCount?: number;
	readonly promptCacheTokenCount?: number;
	readonly completionTokens?: number;
	readonly tokenCount?: number;
	readonly reasoningTokens?: number;
	readonly timeToComplete: number;
}

type AgentHostUtilityModelCallEvent = {
	source: AgentHostUtilityModelCallSource;
	initiatorType: 'agent';
	requestKind: 'conversation-background';
	outcome: AgentHostUtilityModelCallOutcome;
	agentSessionId?: string;
	model?: string | TelemetryTrustedValue<string>;
	modelInvoked?: string | TelemetryTrustedValue<string>;
	reason?: string;
	requestId?: string;
	gitHubRequestId?: string;
	copilotServiceRequestId?: string;
	isBYOK: number;
	httpStatus?: number;
	promptTokenCount?: number;
	promptCacheTokenCount?: number;
	completionTokens?: number;
	tokenCount?: number;
	reasoningTokens?: number;
	timeToComplete: number;
};

type AgentHostUtilityModelCallClassification = {
	owner: 'karthiknadig';
	comment: 'One agent host utility model call (session title, pull request text, commit message, or branch name), mirroring the Copilot Chat extension response events. Carries no prompt or response content.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Feature that made the call, using the Copilot Chat extension messageSource value for the same feature.' };
	initiatorType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Always agent: utility calls are not user chat requests.' };
	requestKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Interaction type of the call; always conversation-background.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the call succeeded, failed, or was cancelled, like the Copilot Chat extension response.success, response.error, and response.cancelled events.' };
	agentSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Agent host session the call serves. Absent only for branch names generated while preparing a dev container worktree, whose conversation runs in a session created afterwards on the dev container agent host.' };
	model?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Copilot model requested, or byokModel for a BYOK model.' };
	modelInvoked?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Copilot model the service reported serving; absent for BYOK models.' };
	reason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Finish reason the service reported for the response.' };
	requestId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Client-generated X-Request-Id of the Copilot request.' };
	gitHubRequestId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Validated x-github-request-id response header, when present.' };
	copilotServiceRequestId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Validated x-copilot-service-request-id response header, when present.' };
	isBYOK: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: '1 for a BYOK model, -1 for a Copilot model, matching the Copilot Chat extension response events.' };
	httpStatus?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP status of the Copilot response, when one was received.' };
	promptTokenCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Prompt tokens reported by the model.' };
	promptCacheTokenCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Prompt tokens served from cache, as reported by the model.' };
	completionTokens?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Output tokens reported by the model.' };
	tokenCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total tokens reported by the model.' };
	reasoningTokens?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Reasoning tokens reported by the model.' };
	timeToComplete: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the start of the call until it completed or failed.' };
};

const EVENT_NAME = 'agentHost.utilityModelCall';
const BYOK_MODEL = 'byokModel';
const TELEMETRY_TOKEN_PATTERN = /^[\w.:/-]{1,128}$/;

/** Returns `value` when it is a short identifier that is safe to report, otherwise `undefined`. */
export function toTelemetryToken(value: unknown): string | undefined {
	return typeof value === 'string' && TELEMETRY_TOKEN_PATTERN.test(value) ? value : undefined;
}

/** Classifies a failed call as cancelled when its signal aborted or it threw a cancellation. */
export function getUtilityModelCallFailureOutcome(error: unknown, signal: AbortSignal | undefined): 'cancelled' | 'error' {
	return signal?.aborted || isCancellationError(error) || (error instanceof Error && error.name === 'AbortError') ? 'cancelled' : 'error';
}

/**
 * The GitHub telemetry account of a Copilot credential, routed like the agent
 * host's other GitHub telemetry: to the account's telemetry endpoint when it
 * enables restricted telemetry, otherwise to the default endpoint.
 */
export function toUtilityModelCallGitHubTelemetry(account: { readonly restrictedTelemetryEnabled: boolean; readonly trackingId?: string; readonly telemetryEndpoint?: string }): IAgentHostGitHubTelemetryContext {
	return {
		trackingId: account.trackingId,
		telemetryEndpoint: toRestrictedTelemetryEndpoint(account.restrictedTelemetryEnabled ? account.telemetryEndpoint : undefined),
	};
}

/**
 * Reports a utility model call on the Microsoft telemetry stream and, when the
 * report carries the call's Copilot account and the agent host telemetry
 * service provides it, the GitHub standard telemetry stream, like the Copilot
 * Chat extension's response events.
 */
export function reportUtilityModelCall(telemetryService: ITelemetryService, report: IAgentHostUtilityModelCallReport): void {
	const model = report.isBYOK ? BYOK_MODEL : toTelemetryToken(report.model);
	const modelInvoked = report.isBYOK ? undefined : toTelemetryToken(report.modelInvoked);
	const reason = toTelemetryToken(report.finishReason);
	const isBYOK = report.isBYOK ? 1 : -1;
	const { agentSessionId } = report.context;
	// Token counts come from model responses; drop anything that is not a number.
	const count = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	const httpStatus = count(report.httpStatus);
	const promptTokenCount = count(report.promptTokenCount);
	const promptCacheTokenCount = count(report.promptCacheTokenCount);
	const completionTokens = count(report.completionTokens);
	const tokenCount = count(report.tokenCount);
	const reasoningTokens = count(report.reasoningTokens);
	const measurements = {
		...(httpStatus !== undefined ? { httpStatus } : {}),
		...(promptTokenCount !== undefined ? { promptTokenCount } : {}),
		...(promptCacheTokenCount !== undefined ? { promptCacheTokenCount } : {}),
		...(completionTokens !== undefined ? { completionTokens } : {}),
		...(tokenCount !== undefined ? { tokenCount } : {}),
		...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
		timeToComplete: Math.max(0, report.timeToComplete),
	};
	const properties = {
		source: report.context.source,
		initiatorType: 'agent',
		requestKind: 'conversation-background',
		outcome: report.outcome,
		...(reason ? { reason } : {}),
		...(report.requestId ? { requestId: report.requestId } : {}),
		...(report.gitHubRequestId ? { gitHubRequestId: report.gitHubRequestId } : {}),
		...(report.copilotServiceRequestId ? { copilotServiceRequestId: report.copilotServiceRequestId } : {}),
	} as const;

	telemetryService.publicLog2<AgentHostUtilityModelCallEvent, AgentHostUtilityModelCallClassification>(EVENT_NAME, {
		...properties,
		...(agentSessionId ? { agentSessionId } : {}),
		...(model ? { model: report.isBYOK ? model : new TelemetryTrustedValue(model) } : {}),
		...(modelInvoked ? { modelInvoked: new TelemetryTrustedValue(modelInvoked) } : {}),
		isBYOK,
		...measurements,
	});

	const restricted = telemetryService as Partial<IAgentHostRestrictedTelemetry>;
	if (report.gitHubTelemetry && typeof restricted.sendGHTelemetryEventForContext === 'function') {
		restricted.sendGHTelemetryEventForContext(report.gitHubTelemetry, EVENT_NAME, {
			...properties,
			...(agentSessionId ? { conversationId: agentSessionId } : {}),
			...(model ? { model } : {}),
			...(modelInvoked ? { modelInvoked } : {}),
		}, { isBYOK, ...measurements });
	}
}
