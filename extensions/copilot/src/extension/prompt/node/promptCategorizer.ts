/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ICopilotTokenStore } from '../../../platform/authentication/common/copilotTokenStore';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { ICopilotToolCall } from '../../../platform/networking/common/fetch';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { PromptCategorizationPrompt } from '../../prompts/node/panel/promptCategorization';
import { CATEGORIZE_PROMPT_TOOL_NAME, CATEGORIZE_PROMPT_TOOL_SCHEMA, isValidDomain, isValidIntent, isValidScope, PromptClassification } from '../common/promptCategorizationTaxonomy';

/** Experiment flag to enable prompt categorization */
const EXP_FLAG_PROMPT_CATEGORIZATION = 'copilotchat.promptCategorization';

export const IPromptCategorizerService = createServiceIdentifier<IPromptCategorizerService>('IPromptCategorizerService');

export interface IPromptCategorizerService {
	readonly _serviceBrand: undefined;

	/**
	 * Categorizes the first user prompt in a chat session.
	 * This runs as a fire-and-forget operation and sends results to telemetry.
	 * Only runs for panel location, first attempt, non-subagent requests.
	 * Requires telemetry to be enabled and experiment flag to be set.
	 *
	 * @param telemetryMessageId The extension-generated request ID (shared with panel.request telemetry)
	 */
	categorizePrompt(request: vscode.ChatRequest, context: vscode.ChatContext, telemetryMessageId: string): void;
}

// Categorization outcome values for telemetry
// Success: outcome == '' — full classification with valid timeEstimates
// Partial success: outcome == 'partialClassification' — core fields valid, timeEstimate malformed
// Pipeline failures: other non-empty outcomes (timeout, requestFailed, noToolCall, parseError, invalidClassification, error)
// Low confidence: outcome == '' AND confidence < 0.5
const CATEGORIZATION_OUTCOMES = {
	SUCCESS: '',
	TIMEOUT: 'timeout',
	REQUEST_FAILED: 'requestFailed',
	NO_TOOL_CALL: 'noToolCall',
	PARSE_ERROR: 'parseError',
	INVALID_CLASSIFICATION: 'invalidClassification',
	PARTIAL_CLASSIFICATION: 'partialClassification',
	ERROR: 'error',
} as const;

// ISO 8601 duration regex: PT followed by at least one of hours (H), minutes (M), seconds (S)
const ISO_8601_DURATION_REGEX = /^PT(?!$)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

function isValidIsoDuration(duration: string): boolean {
	return ISO_8601_DURATION_REGEX.test(duration);
}

/**
 * Returns true when the partial classification has fully valid ISO 8601 time estimates.
 */
function hasValidTimeEstimates(partial: PromptClassification): boolean {
	return partial.timeEstimate.bestCase !== '' && partial.timeEstimate.realistic !== '';
}

/**
 * Extracts a partial classification from the LLM response, validating only the core
 * fields (intent, domain, scope, confidence, reasoning). Time estimates are extracted
 * on a best-effort basis — malformed durations are replaced with empty strings.
 *
 * Returns undefined if the core fields are missing or invalid.
 */
function extractPartialClassification(obj: unknown): PromptClassification | undefined {
	if (typeof obj !== 'object' || obj === null) {
		return undefined;
	}

	const c = obj as Record<string, unknown>;

	// Core fields must all be valid
	if (
		typeof c.intent !== 'string' || !isValidIntent(c.intent) ||
		typeof c.domain !== 'string' || !isValidDomain(c.domain) ||
		typeof c.scope !== 'string' || !isValidScope(c.scope) ||
		typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1 ||
		typeof c.reasoning !== 'string'
	) {
		return undefined;
	}

	// Time estimates are optional — extract valid durations, fall back to ''
	let bestCase = '';
	let realistic = '';
	if (typeof c.timeEstimate === 'object' && c.timeEstimate !== null) {
		const te = c.timeEstimate as Record<string, unknown>;
		if (typeof te.bestCase === 'string' && isValidIsoDuration(te.bestCase)) {
			bestCase = te.bestCase;
		}
		if (typeof te.realistic === 'string' && isValidIsoDuration(te.realistic)) {
			realistic = te.realistic;
		}
	}

	return {
		intent: c.intent,
		domain: c.domain,
		scope: c.scope,
		confidence: c.confidence,
		reasoning: c.reasoning,
		timeEstimate: { bestCase, realistic },
	};
}

export class PromptCategorizerService implements IPromptCategorizerService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@ICopilotTokenStore private readonly copilotTokenStore: ICopilotTokenStore,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
	) { }

	categorizePrompt(request: vscode.ChatRequest, context: vscode.ChatContext, telemetryMessageId: string): void {
		// Always enable for internal users; external users require experiment flag
		const isInternal = this.copilotTokenStore.copilotToken?.isInternal === true;
		if (!isInternal && !this.experimentationService.getTreatmentVariable<boolean>(EXP_FLAG_PROMPT_CATEGORIZATION)) {
			return;
		}

		// Guard conditions - only run for first attempt, panel location, non-subagent
		// location2 === undefined means Panel (ChatRequestEditorData = editor, ChatRequestNotebookData = notebook)
		if (request.location2 !== undefined) {
			return;
		}
		if (request.subAgentName !== undefined) {
			return;
		}
		if (request.attempt !== 0) {
			return;
		}
		// Only categorize truly first messages in a session
		if (context.history.length > 0) {
			return;
		}

		// Fire and forget - don't await
		const parentChatSessionId = (request as { sessionId?: string }).sessionId;
		this._categorizePromptAsync(request, context, telemetryMessageId, parentChatSessionId).catch(err => {
			this.logService.error(`[PromptCategorizer] Error categorizing prompt: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private async _categorizePromptAsync(request: vscode.ChatRequest, _context: vscode.ChatContext, telemetryMessageId: string, parentChatSessionId: string | undefined): Promise<void> {
		const startTime = Date.now();
		let outcome: typeof CATEGORIZATION_OUTCOMES[keyof typeof CATEGORIZATION_OUTCOMES] = CATEGORIZATION_OUTCOMES.ERROR;
		let errorDetail = '';
		let classification: PromptClassification | undefined;

		// Gather context signals (outside try block for telemetry access)
		const currentLanguage = this.tabsAndEditorsService.activeTextEditor?.document.languageId;

		// Use 10 second timeout - classification should be fast with copilot-fast model
		const CATEGORIZATION_TIMEOUT_MS = 10_000;
		const cts = new CancellationTokenSource();
		const timeoutHandle = setTimeout(() => cts.cancel(), CATEGORIZATION_TIMEOUT_MS);

		try {
			const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');

			const { messages } = await renderPromptElement(
				this.instantiationService,
				endpoint,
				PromptCategorizationPrompt,
				{
					userRequest: request.prompt,
				}
			);

			// Collect tool calls from the response stream
			const toolCalls: ICopilotToolCall[] = [];

			const capturingToken = new CapturingToken(
				'categorization',
				undefined,
				undefined,
				undefined,
				undefined,
				parentChatSessionId,
				'categorization',
			);

			const response = await this.requestLogger.captureInvocation(capturingToken, () => endpoint.makeChatRequest2({
				debugName: 'promptCategorization',
				messages,
				finishedCb: async (_text, _index, delta) => {
					if (delta.copilotToolCalls) {
						toolCalls.push(...delta.copilotToolCalls);
					}
					return undefined;
				},
				location: ChatLocation.Panel,
				userInitiatedRequest: false,
				isConversationRequest: false,
				interactionTypeOverride: 'conversation-background',
				requestOptions: {
					tools: [{
						type: 'function',
						function: {
							name: CATEGORIZE_PROMPT_TOOL_NAME,
							description: 'Classify a user prompt across intent, domain, scope, and time estimate dimensions',
							parameters: CATEGORIZE_PROMPT_TOOL_SCHEMA
						}
					}],
					tool_choice: { type: 'function', function: { name: CATEGORIZE_PROMPT_TOOL_NAME } }
				}
			}, cts.token));

			if (cts.token.isCancellationRequested) {
				outcome = CATEGORIZATION_OUTCOMES.TIMEOUT;
				errorDetail = `Timed out after ${CATEGORIZATION_TIMEOUT_MS}ms`;
				this.logService.debug('[PromptCategorizer] Request cancelled due to timeout');
				// Don't return early - still send telemetry below to track timeouts
			} else if (response.type === ChatFetchResponseType.Success) {
				// Find the categorize_prompt tool call
				const categorizationCall = toolCalls.find(tc => tc.name === CATEGORIZE_PROMPT_TOOL_NAME);

				if (categorizationCall) {
					try {
						const parsed = JSON.parse(categorizationCall.arguments);
						const partial = extractPartialClassification(parsed);
						if (partial && hasValidTimeEstimates(partial)) {
							classification = partial;
							outcome = CATEGORIZATION_OUTCOMES.SUCCESS;
						} else if (partial) {
							// Core fields valid but timeEstimate malformed — recover partial
							classification = partial;
							outcome = CATEGORIZATION_OUTCOMES.PARTIAL_CLASSIFICATION;
							errorDetail = `Recovered core fields; invalid timeEstimate (arguments length: ${categorizationCall.arguments.length})`;
							this.logService.debug(`[PromptCategorizer] Partial classification recovered; ${errorDetail}`);
						} else {
							outcome = CATEGORIZATION_OUTCOMES.INVALID_CLASSIFICATION;
							errorDetail = `Invalid classification structure (arguments length: ${categorizationCall.arguments.length})`;
							this.logService.warn(`[PromptCategorizer] Invalid classification structure; ${errorDetail}`);
						}
					} catch (parseError) {
						outcome = CATEGORIZATION_OUTCOMES.PARSE_ERROR;
						const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
						errorDetail = `${parseMsg} (arguments length: ${categorizationCall.arguments.length}, timedOut: ${cts.token.isCancellationRequested})`;
						this.logService.warn(`[PromptCategorizer] Failed to parse tool arguments: ${errorDetail}`);
					}
				} else {
					outcome = CATEGORIZATION_OUTCOMES.NO_TOOL_CALL;
					errorDetail = `${toolCalls.length} tool calls returned, none matched ${CATEGORIZE_PROMPT_TOOL_NAME}`;
					this.logService.warn('[PromptCategorizer] No categorization tool call found in response');
				}
			} else {
				outcome = CATEGORIZATION_OUTCOMES.REQUEST_FAILED;
				errorDetail = `Response type: ${response.type}`;
				this.logService.warn(`[PromptCategorizer] Request failed with type: ${response.type}`);
			}

			// Release accumulated tool call data that may be retained via finishedCb closure
			toolCalls.length = 0;
		} catch (err) {
			if (isCancellationError(err)) {
				outcome = CATEGORIZATION_OUTCOMES.TIMEOUT;
				errorDetail = `Request cancelled after ${Date.now() - startTime}ms`;
			} else {
				errorDetail = err instanceof Error ? err.message : String(err);
			}
			this.logService.error(`[PromptCategorizer] Error during categorization: ${errorDetail}`);
		} finally {
			clearTimeout(timeoutHandle);
			cts.dispose();
		}

		const latencyMs = Date.now() - startTime;

		// Truncate errorDetail to prevent telemetry backend limits
		const MAX_ERROR_DETAIL_LENGTH = 500;
		const truncatedErrorDetail = errorDetail.length > MAX_ERROR_DETAIL_LENGTH
			? errorDetail.slice(0, MAX_ERROR_DETAIL_LENGTH)
			: errorDetail;

		// Send telemetry
		/* __GDPR__
			"promptCategorization" : {
				"owner": "digitarald",
				"comment": "Classifies agent requests for understanding user intent and response quality",
				"taxonomyVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The taxonomy version used for classification (e.g. v2). Used to segment data when taxonomy keys change." },
				"sessionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat session identifier" },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The extension-generated request identifier, matches panel.request requestId" },
				"vscodeRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The VS Code chat request id, for joining with VS Code telemetry events" },
				"modeName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat mode name being used" },
				"currentLanguage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language ID of the active editor" },
				"outcome": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Classification outcome: empty string for success, partialClassification for recovered core fields, or error kind (timeout, requestFailed, noToolCall, parseError, invalidClassification, error)" },
				"intent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The classified intent (populated on success or partialClassification, empty string on failure)" },
				"domain": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The classified domain (populated on success or partialClassification, empty string on failure)" },
				"timeEstimateBestCase": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "ISO 8601 duration for best case time estimate" },
				"timeEstimateRealistic": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "ISO 8601 duration for realistic time estimate" },
				"scope": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The classified scope (populated on success or partialClassification, empty string on failure)" },
				"promptLength": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Length of the user prompt in characters" },
				"numReferences": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of context references attached to the request" },
				"numToolReferences": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of tool references in the request" },
				"confidence": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Confidence score of the classification (0.0 to 1.0)" },
				"latencyMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time in milliseconds to complete the classification" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'promptCategorization',
			{
				taxonomyVersion: 'v2',
				sessionId: request.sessionId ?? '',
				requestId: telemetryMessageId,
				vscodeRequestId: request.id ?? '',
				modeName: request.modeInstructions2?.isBuiltin ? request.modeInstructions2?.name.toLowerCase() : 'custom',
				currentLanguage: currentLanguage ?? '',
				outcome,
				intent: classification?.intent ?? '',
				domain: classification?.domain ?? '',
				timeEstimateBestCase: classification?.timeEstimate?.bestCase ?? '',
				timeEstimateRealistic: classification?.timeEstimate?.realistic ?? '',
				scope: classification?.scope ?? '',
			},
			{
				promptLength: request.prompt.length,
				numReferences: request.references?.length ?? 0,
				numToolReferences: request.toolReferences?.length ?? 0,
				confidence: classification?.confidence ?? 0,
				latencyMs,
			}
		);

		// Send internal telemetry with full metrics including PAI data (reasoning + prompt)
		// Truncate prompt to 8192 chars to avoid telemetry backend limits; promptLength measurement preserves original size
		const MAX_TELEMETRY_PROMPT_LENGTH = 8192;
		const truncatedPrompt = request.prompt.length > MAX_TELEMETRY_PROMPT_LENGTH
			? request.prompt.slice(0, MAX_TELEMETRY_PROMPT_LENGTH)
			: request.prompt;

		this.telemetryService.sendInternalMSFTTelemetryEvent(
			'promptCategorization',
			{
				taxonomyVersion: 'v2',
				sessionId: request.sessionId ?? '',
				requestId: telemetryMessageId,
				vscodeRequestId: request.id ?? '',
				modeName: request.modeInstructions2?.isBuiltin ? request.modeInstructions2?.name.toLowerCase() : 'custom',
				currentLanguage: currentLanguage ?? '',
				outcome,
				errorDetail: truncatedErrorDetail,
				intent: classification?.intent ?? '',
				domain: classification?.domain ?? '',
				timeEstimateBestCase: classification?.timeEstimate?.bestCase ?? '',
				timeEstimateRealistic: classification?.timeEstimate?.realistic ?? '',
				scope: classification?.scope ?? '',
				reasoning: classification?.reasoning ?? '',
				prompt: truncatedPrompt,
			},
			{
				promptLength: request.prompt.length,
				numReferences: request.references?.length ?? 0,
				numToolReferences: request.toolReferences?.length ?? 0,
				confidence: classification?.confidence ?? 0,
				latencyMs,
			}
		);

		this.logService.debug(`[PromptCategorizer] Classification complete: outcome=${outcome || 'success'}, latencyMs=${latencyMs}, intent=${classification?.intent}, domain=${classification?.domain}, scope=${classification?.scope}`);
	}
}
