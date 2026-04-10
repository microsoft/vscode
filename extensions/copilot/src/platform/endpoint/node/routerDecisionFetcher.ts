/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { Codicon } from '../../../util/vs/base/common/codicons';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ILogService } from '../../log/common/logService';
import { Response } from '../../networking/common/fetcherService';
import { IRequestLogger, LoggedRequestKind } from '../../requestLogger/node/requestLogger';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { ICAPIClientService } from '../common/capiClient';

export interface RouterDecisionResponse {
	predicted_label: 'needs_reasoning' | 'no_reasoning' | 'fallback';
	confidence: number;
	latency_ms: number;
	candidate_models: string[];
	scores: {
		needs_reasoning: number;
		no_reasoning: number;
	};
	sticky_override?: boolean;
	routing_method?: string;
	fallback?: boolean;
	fallback_reason?: string;
	hydra_scores?: Record<string, number>;
	chosen_model?: string;
	chosen_shortfall?: number;
}

export interface RoutingContextSignals {
	turn_number?: number;
	session_id?: string;
	previous_model?: string;
	reference_count?: number;
	prompt_char_count?: number;
}

/**
 * Fetches routing decisions from a classification API to determine which model should handle a query.
 *
 * This class sends queries along with available models to a router API endpoint, which uses reasoning
 * classification to select the most appropriate model based on the query's requirements.
 */
export class RouterDecisionFetcher {
	constructor(
		private readonly _capiClientService: ICAPIClientService,
		private readonly _authService: IAuthenticationService,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _requestLogger: IRequestLogger,
	) {
	}

	async getRouterDecision(query: string, autoModeToken: string, availableModels: string[], stickyThreshold?: number, contextSignals?: RoutingContextSignals, conversationId?: string, vscodeRequestId?: string, routingMethod?: string): Promise<RouterDecisionResponse> {
		const startTime = Date.now();
		const requestBody: Record<string, unknown> = { prompt: query, available_models: availableModels, ...contextSignals };
		if (stickyThreshold !== undefined) {
			requestBody.sticky_threshold = stickyThreshold;
		}
		if (routingMethod) {
			requestBody.routing_method = routingMethod;
		}
		const copilotToken = (await this._authService.getCopilotToken()).token;
		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), 1000);
		let response: Response;
		try {
			response = await this._capiClientService.makeRequest<Response>({
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${copilotToken}`,
					'Copilot-Session-Token': autoModeToken,
				},
				body: JSON.stringify(requestBody),
				signal: abortController.signal,
			}, { type: RequestType.ModelRouter });
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			throw new Error(`Router decision request failed with status ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();
		const result: RouterDecisionResponse = JSON.parse(text);
		const e2eLatencyMs = Date.now() - startTime;
		this._logService.trace(`[RouterDecisionFetcher] Prediction: ${result.predicted_label}, (confidence: ${(result.confidence * 100).toFixed(1)}%, scores: needs_reasoning=${(result.scores.needs_reasoning * 100).toFixed(1)}%, no_reasoning=${(result.scores.no_reasoning * 100).toFixed(1)}%) (latency_ms: ${result.latency_ms}, e2e_latency_ms: ${e2eLatencyMs}, candidate models: ${result.candidate_models.join(', ')}, sticky_override: ${result.sticky_override ?? false}, routing_method: ${result.routing_method ?? 'n/a'}, fallback: ${result.fallback ?? false})`);

		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: `Auto Mode Router`,
			startTimeMs: startTime,
			icon: Codicon.lightbulbSparkle,
			markdownContent: [
				`# Auto Mode Router Decision`,
				`## Result`,
				`- **Predicted Label**: ${result.predicted_label}`,
				`- **Confidence**: ${(result.confidence * 100).toFixed(1)}%`,
				`- **Sticky Override**: ${result.sticky_override ?? false}`,
				`## Scores`,
				`- **Needs Reasoning**: ${(result.scores.needs_reasoning * 100).toFixed(1)}%`,
				`- **No Reasoning**: ${(result.scores.no_reasoning * 100).toFixed(1)}%`,
				`## Latency`,
				`- **Router Latency**: ${result.latency_ms}ms`,
				`- **E2E Latency**: ${e2eLatencyMs}ms`,
				`## Candidate Models`,
				...result.candidate_models.map(m => `- ${m}`),
				`## Query`,
				query,
			].join('\n'),
		});

		/* __GDPR__
			"automode.routerDecision" : {
				"owner": "lramos15",
				"comment": "Reports the routing decision made by the auto mode router API",
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The conversation ID in which the routing decision was made." },
				"vscodeRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The VS Code chat request id in which the routing decision was made." },
				"predictedLabel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The predicted classification label (needs_reasoning, no_reasoning, or fallback)" },
				"routingMethod": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The routing method used for this request (empty=server default, binary, hydra). Identifies the A/B/C experiment path." },
				"fallback": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the router signaled a fallback to default automod selection." },
				"fallbackReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The reason provided by the server when fallback is true." },
				"candidateModel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The top candidate model recommended by the router before any sticky-provider or vision overrides are applied." },
				"confidence": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The confidence score of the routing decision" },
				"latencyMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The latency of the router API call in milliseconds" },
				"e2eLatencyMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The end-to-end latency of the router request in milliseconds, including network overhead" },
				"stickyOverride": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the router applied a sticky override (1) or not (0)" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('automode.routerDecision',
			{
				conversationId: conversationId ?? '',
				vscodeRequestId: vscodeRequestId ?? '',
				predictedLabel: result.predicted_label,
				routingMethod: result.routing_method ?? '',
				fallback: String(result.fallback ?? false),
				fallbackReason: result.fallback_reason ?? '',
				candidateModel: result.candidate_models[0] ?? '',
			},
			{
				confidence: result.confidence,
				latencyMs: result.latency_ms,
				e2eLatencyMs: e2eLatencyMs,
				stickyOverride: result.sticky_override ? 1 : 0,
			}
		);
		return result;
	}
}
