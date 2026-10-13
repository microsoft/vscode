/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { Codicon } from '../../../util/vs/base/common/codicons';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ILogService } from '../../log/common/logService';
import { Response } from '../../networking/common/fetcherService';
import { IRequestLogger, LoggedRequestKind } from '../../requestLogger/common/requestLogger';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import type { AutoModeTier } from '../common/autoModeTiers';
import { ICAPIClientService } from '../common/capiClient';
import type { IModelAPIResponse } from '../common/endpointProvider';

/**
 * The model embedded in a `POST /auto` response. Same shape as a `GET /models`
 * entry, but volatile fields (warnings, policy state, promos, picker flags) are
 * left unset. Typed as a partial so unknown fields pass through; only `id` is
 * guaranteed.
 */
export type AutoV2SelectedModel = Partial<IModelAPIResponse> & { id: string };

export interface AutoV2Response {
	session_token: string;
	/** UNIX seconds. The token lifetime is 24 hours; there is no refresh flow. */
	expires_at: number;
	selected_model: AutoV2SelectedModel;
	hydra_scores?: Record<string, number>;
	discounted_costs?: Record<string, number>;
}

/** Multi-turn routing state. Logged server-side only; does not affect routing. */
export interface AutoV2MultiTurnState {
	routing_intent?: string;
	turns_since_anchor?: number;
	current_skip_window?: number;
	anchor_cap_vector?: Record<string, number>;
}

/**
 * Thrown when `POST /auto` returns a non-OK response. Carries the status so
 * callers can tell "gated off" (404) from a transient failure (503).
 */
export class AutoV2Error extends Error {
	override readonly name = 'AutoV2Error';
	constructor(message: string, public readonly status: number, public readonly errorCode?: string) {
		super(message);
	}
}

/**
 * Fetches a model selection from `POST /auto`, which picks the model for a
 * prompt, mints the session token the chat request bills against, and embeds
 * the chosen model's metadata — all in a single request.
 */
export class AutoV2Fetcher {
	private static readonly TIMEOUT_MS = 5000;

	constructor(
		private readonly _capiClientService: ICAPIClientService,
		private readonly _authService: IAuthenticationService,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _requestLogger: IRequestLogger,
	) { }

	async getAutoDecision(
		prompt: string,
		options: {
			hasImage?: boolean;
			multiTurn?: AutoV2MultiTurnState;
			conversationId?: string;
			vscodeRequestId?: string;
			/** Routing profile for the session. Omitted lets the server pick its own default. */
			tier?: AutoModeTier;
		} = {},
	): Promise<AutoV2Response> {
		const startTime = Date.now();
		const requestBody: Record<string, unknown> = { prompt };
		if (options.hasImage) {
			requestBody.has_image = true;
		}
		if (options.multiTurn) {
			requestBody.multi_turn = options.multiTurn;
		}
		if (options.tier) {
			requestBody.tier = options.tier;
		}

		const copilotToken = (await this._authService.getCopilotToken()).token;
		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), AutoV2Fetcher.TIMEOUT_MS);
		let response: Response;
		try {
			response = await this._capiClientService.makeRequest<Response>({
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${copilotToken}`,
				},
				body: JSON.stringify(requestBody),
				signal: abortController.signal,
			}, { type: RequestType.Auto });
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			// Error bodies are not always JSON (e.g. gateway HTML).
			const parsed = await response.json().catch(() => undefined);
			const errorCode = typeof parsed === 'object' && parsed !== null && typeof parsed.error === 'string'
				? parsed.error
				: undefined;
			throw new AutoV2Error(`Auto request failed with status ${response.status}: ${response.statusText}`, response.status, errorCode);
		}

		const result = await response.json() as AutoV2Response;
		const e2eLatencyMs = Date.now() - startTime;
		if (!result.selected_model?.id) {
			throw new AutoV2Error('Auto response did not contain a selected model', response.status);
		}
		this._logService.trace(`[AutoV2Fetcher] Selected model: ${result.selected_model.id} (tier: ${options.tier ?? 'server default'}, e2e_latency_ms: ${e2eLatencyMs}, expires_at: ${result.expires_at})`);

		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: `Auto Mode (v2)`,
			startTimeMs: startTime,
			icon: Codicon.lightbulbSparkle,
			markdownContent: [
				`# Auto Mode Decision (POST /auto)`,
				`## Result`,
				`- **Selected Model**: ${result.selected_model.id}`,
				`- **Tier**: ${options.tier ?? 'server default'}`,
				`- **Expires At**: ${new Date(result.expires_at * 1000).toISOString()}`,
				`## Latency`,
				`- **E2E Latency**: ${e2eLatencyMs}ms`,
				...(result.hydra_scores
					? [`## Hydra Scores`, ...Object.entries(result.hydra_scores).map(([k, v]) => `- **${k}**: ${v}`)]
					: []),
				`## Query`,
				prompt,
			].join('\n'),
		});

		/* __GDPR__
			"automode.autoV2Decision" : {
				"owner": "lramos15",
				"comment": "Reports the model selection made by the single-call Auto endpoint (POST /auto)",
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The conversation ID in which the selection was made." },
				"vscodeRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The VS Code chat request id in which the selection was made." },
				"selectedModel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model the server selected for this prompt." },
				"tier": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The routing profile requested for this selection, e.g. efficiency, balance, intelligence, fast. Empty when none was requested." },
				"e2eLatencyMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The end-to-end latency of the auto request in milliseconds, including network overhead." },
				"scoreReasoning": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Hydra per-dimension score for reasoning. -1 if not present in the response." },
				"scoreCodeGen": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Hydra per-dimension score for code generation. -1 if not present in the response." },
				"scoreDebugging": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Hydra per-dimension score for debugging. -1 if not present in the response." },
				"scoreToolUse": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Hydra per-dimension score for tool use. -1 if not present in the response." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('automode.autoV2Decision',
			{
				conversationId: options.conversationId ?? '',
				vscodeRequestId: options.vscodeRequestId ?? '',
				selectedModel: result.selected_model.id,
				tier: options.tier ?? '',
			},
			{
				e2eLatencyMs,
				scoreReasoning: result.hydra_scores?.reasoning ?? -1,
				scoreCodeGen: result.hydra_scores?.code_gen ?? -1,
				scoreDebugging: result.hydra_scores?.debugging ?? -1,
				scoreToolUse: result.hydra_scores?.tool_use ?? -1,
			}
		);

		return result;
	}
}
