/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotChatAttr, type EditOutcome, type EditSource, GenAiAttr, GitHubCopilotAttr, StdAttr } from './genAiAttributes';
import type { IOTelService } from './otelService';

/**
 * Pre-configured OTel GenAI metric instruments.
 * All methods are static to avoid per-call allocations (aligned with gemini-cli pattern).
 */
export class GenAiMetrics {

	// ── GenAI Convention Metrics ──

	static recordOperationDuration(
		otel: IOTelService,
		durationSec: number,
		attrs: {
			operationName: string;
			providerName: string;
			requestModel: string;
			responseModel?: string;
			serverAddress?: string;
			serverPort?: number;
			errorType?: string;
		},
	): void {
		otel.recordMetric('gen_ai.client.operation.duration', durationSec, {
			[GenAiAttr.OPERATION_NAME]: attrs.operationName,
			[GenAiAttr.PROVIDER_NAME]: attrs.providerName,
			[GenAiAttr.REQUEST_MODEL]: attrs.requestModel,
			...(attrs.responseModel ? { [GenAiAttr.RESPONSE_MODEL]: attrs.responseModel } : {}),
			...(attrs.serverAddress ? { [StdAttr.SERVER_ADDRESS]: attrs.serverAddress } : {}),
			...(attrs.serverPort ? { [StdAttr.SERVER_PORT]: attrs.serverPort } : {}),
			...(attrs.errorType ? { [StdAttr.ERROR_TYPE]: attrs.errorType } : {}),
		});
	}

	static recordTokenUsage(
		otel: IOTelService,
		tokenCount: number,
		tokenType: 'input' | 'output',
		attrs: {
			operationName: string;
			providerName: string;
			requestModel: string;
			responseModel?: string;
			serverAddress?: string;
		},
	): void {
		otel.recordMetric('gen_ai.client.token.usage', tokenCount, {
			[GenAiAttr.OPERATION_NAME]: attrs.operationName,
			[GenAiAttr.PROVIDER_NAME]: attrs.providerName,
			[GenAiAttr.TOKEN_TYPE]: tokenType,
			[GenAiAttr.REQUEST_MODEL]: attrs.requestModel,
			...(attrs.responseModel ? { [GenAiAttr.RESPONSE_MODEL]: attrs.responseModel } : {}),
			...(attrs.serverAddress ? { [StdAttr.SERVER_ADDRESS]: attrs.serverAddress } : {}),
		});
	}

	// ── Extension-Specific Metrics ──

	static recordToolCallCount(otel: IOTelService, toolName: string, success: boolean): void {
		otel.incrementCounter('copilot_chat.tool.call.count', 1, {
			[GenAiAttr.TOOL_NAME]: toolName,
			success,
		});
	}

	static recordToolCallDuration(otel: IOTelService, toolName: string, durationMs: number): void {
		otel.recordMetric('copilot_chat.tool.call.duration', durationMs, {
			[GenAiAttr.TOOL_NAME]: toolName,
		});
	}

	static recordAgentDuration(otel: IOTelService, agentName: string, durationSec: number): void {
		otel.recordMetric('copilot_chat.agent.invocation.duration', durationSec, {
			[GenAiAttr.AGENT_NAME]: agentName,
		});
	}

	static recordAgentTurnCount(otel: IOTelService, agentName: string, turnCount: number): void {
		otel.recordMetric('copilot_chat.agent.turn.count', turnCount, {
			[GenAiAttr.AGENT_NAME]: agentName,
		});
	}

	static recordTimeToFirstToken(otel: IOTelService, model: string, ttftSec: number): void {
		otel.recordMetric('copilot_chat.time_to_first_token', ttftSec, {
			[GenAiAttr.REQUEST_MODEL]: model,
		});
	}

	/**
	 * GenAI-convention time-to-first-chunk histogram (seconds). Emitted for streaming
	 * responses alongside the legacy `copilot_chat.time_to_first_token` metric.
	 */
	static recordTimeToFirstChunk(
		otel: IOTelService,
		ttfcSec: number,
		attrs: {
			operationName: string;
			providerName: string;
			requestModel: string;
			responseModel?: string;
		},
	): void {
		otel.recordMetric('gen_ai.client.operation.time_to_first_chunk', ttfcSec, {
			[GenAiAttr.OPERATION_NAME]: attrs.operationName,
			[GenAiAttr.PROVIDER_NAME]: attrs.providerName,
			[GenAiAttr.REQUEST_MODEL]: attrs.requestModel,
			...(attrs.responseModel ? { [GenAiAttr.RESPONSE_MODEL]: attrs.responseModel } : {}),
		});
	}

	/**
	 * GenAI-convention inter-chunk latency histogram (seconds). Recorded once per
	 * streamed output chunk after the first, measuring the gap since the prior chunk.
	 */
	static recordTimePerOutputChunk(
		otel: IOTelService,
		interChunkSec: number,
		attrs: {
			operationName: string;
			providerName: string;
			requestModel: string;
			responseModel?: string;
		},
	): void {
		otel.recordMetric('gen_ai.client.operation.time_per_output_chunk', interChunkSec, {
			[GenAiAttr.OPERATION_NAME]: attrs.operationName,
			[GenAiAttr.PROVIDER_NAME]: attrs.providerName,
			[GenAiAttr.REQUEST_MODEL]: attrs.requestModel,
			...(attrs.responseModel ? { [GenAiAttr.RESPONSE_MODEL]: attrs.responseModel } : {}),
		});
	}

	static incrementSessionCount(otel: IOTelService): void {
		otel.incrementCounter('copilot_chat.session.count');
	}

	// ── Agent Activity & Outcome Metrics ──

	/** Accept/reject counter for inline chat and chat editing edits */
	static recordEditAcceptance(otel: IOTelService, source: EditSource, outcome: EditOutcome, languageId?: string): void {
		otel.incrementCounter('copilot_chat.edit.acceptance.count', 1, {
			[CopilotChatAttr.EDIT_SOURCE]: source,
			[CopilotChatAttr.EDIT_OUTCOME]: outcome,
			...(languageId ? { [CopilotChatAttr.LANGUAGE_ID]: languageId } : {}),
		});
	}

	/** File-level chat editing session outcome (accepted/rejected/saved) */
	static recordChatEditOutcome(otel: IOTelService, source: EditSource, outcome: EditOutcome, languageId?: string, hasRemainingEdits?: boolean): void {
		otel.incrementCounter('copilot_chat.chat_edit.outcome.count', 1, {
			[CopilotChatAttr.EDIT_SOURCE]: source,
			[CopilotChatAttr.EDIT_OUTCOME]: outcome,
			...(languageId ? { [CopilotChatAttr.LANGUAGE_ID]: languageId } : {}),
			...(hasRemainingEdits !== undefined ? { [CopilotChatAttr.HAS_REMAINING_EDITS]: hasRemainingEdits } : {}),
		});
	}

	/** 4-gram text similarity survival score */
	static recordEditSurvivalFourGram(otel: IOTelService, source: EditSource, score: number, timeDelayMs: number): void {
		otel.recordMetric('copilot_chat.edit.survival.four_gram', score, {
			[CopilotChatAttr.EDIT_SOURCE]: source,
			[CopilotChatAttr.TIME_DELAY_MS]: timeDelayMs,
		});
	}

	/** No-revert survival score */
	static recordEditSurvivalNoRevert(otel: IOTelService, source: EditSource, score: number, timeDelayMs: number): void {
		otel.recordMetric('copilot_chat.edit.survival.no_revert', score, {
			[CopilotChatAttr.EDIT_SOURCE]: source,
			[CopilotChatAttr.TIME_DELAY_MS]: timeDelayMs,
		});
	}

	/** Lines of code added/removed by accepted agent edits */
	static incrementLinesOfCode(otel: IOTelService, type: 'added' | 'removed', languageId: string | undefined, count: number): void {
		otel.incrementCounter('copilot_chat.lines_of_code.count', count, {
			'type': type,
			...(languageId ? { [CopilotChatAttr.LANGUAGE_ID]: languageId } : {}),
		});
	}

	// ── User Engagement Metrics ──

	static incrementUserActionCount(otel: IOTelService, action: string): void {
		otel.incrementCounter('copilot_chat.user.action.count', 1, {
			'action': action,
		});
	}

	static incrementUserFeedbackCount(otel: IOTelService, rating: string): void {
		otel.incrementCounter('copilot_chat.user.feedback.count', 1, {
			'rating': rating,
		});
	}

	// ── Agent Internals Metrics ──

	static incrementAgentEditResponseCount(otel: IOTelService, outcome: string): void {
		otel.incrementCounter('copilot_chat.agent.edit_response.count', 1, {
			'outcome': outcome,
		});
	}

	static incrementAgentSummarizationCount(otel: IOTelService, outcome: string): void {
		otel.incrementCounter('copilot_chat.agent.summarization.count', 1, {
			'outcome': outcome,
		});
	}

	// ── Background/Cloud Metrics ──

	static incrementPullRequestCount(otel: IOTelService): void {
		otel.incrementCounter('copilot_chat.pull_request.count');
	}

	static incrementCloudSessionCount(otel: IOTelService, partnerAgent: string, backendVersion?: string): void {
		otel.incrementCounter('copilot_chat.cloud.session.count', 1, {
			'partner_agent': partnerAgent,
			...(backendVersion ? { [GitHubCopilotAttr.CLOUD_BACKEND_VERSION]: backendVersion } : {}),
		});
	}

	static incrementCloudPrReadyCount(otel: IOTelService, backendVersion?: string): void {
		otel.incrementCounter('copilot_chat.cloud.pr_ready.count', 1, backendVersion ? { [GitHubCopilotAttr.CLOUD_BACKEND_VERSION]: backendVersion } : undefined);
	}

	/**
	 * Cloud backend funnel metric: records a single backend operation outcome (e.g. createSession,
	 * fetchSessionList, followUp) tagged with the backend version so v1 (Jobs API) and v2 (Task API) can
	 * be compared apples-to-apples. Emits a count and, when provided, an operation-duration histogram.
	 */
	static recordCloudOperation(otel: IOTelService, operation: string, backendVersion: string, success: boolean, durationMs?: number): void {
		otel.incrementCounter('copilot_chat.cloud.operation.count', 1, {
			'operation': operation,
			[GitHubCopilotAttr.CLOUD_BACKEND_VERSION]: backendVersion,
			'success': success,
		});
		if (durationMs !== undefined) {
			otel.recordMetric('copilot_chat.cloud.operation.duration', durationMs, {
				'operation': operation,
				[GitHubCopilotAttr.CLOUD_BACKEND_VERSION]: backendVersion,
			});
		}
	}

	/** Cloud backend guardrail metric: increments the per-backend-version error counter for a failed backend operation. */
	static incrementCloudError(otel: IOTelService, operation: string, backendVersion: string, errorType: string): void {
		otel.incrementCounter('copilot_chat.cloud.error.count', 1, {
			'operation': operation,
			[GitHubCopilotAttr.CLOUD_BACKEND_VERSION]: backendVersion,
			[StdAttr.ERROR_TYPE]: errorType,
		});
	}
}
