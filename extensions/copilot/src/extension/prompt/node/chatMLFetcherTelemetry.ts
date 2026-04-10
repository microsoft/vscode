/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatFetchError } from '../../../platform/chat/common/commonTypes';
import { isAutoModel } from '../../../platform/endpoint/node/autoChatEndpoint';
import { FetcherId } from '../../../platform/networking/common/fetcherService';
import { IChatEndpoint, IChatRequestTelemetryProperties, IEndpointBody } from '../../../platform/networking/common/networking';
import { ChatCompletion } from '../../../platform/networking/common/openai';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../platform/telemetry/common/telemetryData';
import { isBYOKModel } from '../../byok/node/openAIEndpoint';

export interface IChatMLFetcherSuccessfulData {
	chatCompletion: ChatCompletion;
	baseTelemetry: TelemetryData;
	userInitiatedRequest: boolean | undefined;
	chatEndpointInfo: IChatEndpoint | undefined;
	requestBody: IEndpointBody;
	maxResponseTokens: number;
	promptTokenCount: number;
	timeToFirstToken: number;
	timeToFirstTokenEmitted: number;
	hasImageMessages: boolean;
	transport: string;
	fetcher: FetcherId | undefined;
	bytesReceived: number | undefined;
	suspendEventSeen: boolean | undefined;
	resumeEventSeen: boolean | undefined;
}

export interface IChatMLFetcherCancellationProperties {
	source: string;
	requestId: string;
	model: string;
	apiType: string | undefined;
	transport: string;
	associatedRequestId?: string;
	retryAfterError?: string;
	retryAfterErrorGitHubRequestId?: string;
	connectivityTestError?: string;
	connectivityTestErrorGitHubRequestId?: string;
	retryAfterFilterCategory?: string;
	fetcher: FetcherId | undefined;
	suspendEventSeen: boolean | undefined;
	resumeEventSeen: boolean | undefined;
}

export interface IChatMLFetcherCancellationMeasures {
	totalTokenMax: number;
	promptTokenCount: number;
	tokenCountMax: number;
	timeToFirstToken: number | undefined;
	timeToFirstTokenEmitted?: number;
	timeToCancelled: number;
	isVisionRequest: number;
	isBYOK: number;
	isAuto: number;
	bytesReceived: number | undefined;
	issuedTime: number;
}

export interface IChatMLFetcherErrorData {
	processed: ChatFetchError;
	telemetryProperties: IChatRequestTelemetryProperties | undefined;
	chatEndpointInfo: IChatEndpoint;
	requestBody: IEndpointBody;
	tokenCount: number;
	maxResponseTokens: number;
	timeToFirstToken: number;
	isVisionRequest: boolean;
	transport: string;
	fetcher: FetcherId | undefined;
	bytesReceived: number | undefined;
	issuedTime: number;
	wasRetried: boolean;
	suspendEventSeen: boolean | undefined;
	resumeEventSeen: boolean | undefined;
}

export class ChatMLFetcherTelemetrySender {

	public static sendSuccessTelemetry(
		telemetryService: ITelemetryService,
		{
			chatCompletion,
			baseTelemetry,
			userInitiatedRequest,
			chatEndpointInfo,
			requestBody,
			maxResponseTokens,
			promptTokenCount,
			timeToFirstToken,
			timeToFirstTokenEmitted,
			hasImageMessages,
			transport,
			fetcher,
			bytesReceived,
			suspendEventSeen,
			resumeEventSeen,
		}: IChatMLFetcherSuccessfulData,
	) {
		/* __GDPR__
			"response.success" : {
				"owner": "digitarald",
				"comment": "Report quality details for a successful service response.",
				"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason for why a response finished" },
				"filterReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason for why a response was filtered" },
				"source": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Source of the initial request" },
				"initiatorType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was initiated by a user or an agent" },
				"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selection for the response" },
				"modelInvoked": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Actual model invoked for the response" },
				"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type for the response- chat completions or responses" },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"associatedRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Another request ID that this request is associated with (eg, the originating request of a summarization request)." },
				"reasoningEffort": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning effort level" },
				"reasoningSummary": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning summary level" },
				"fetcher": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The fetcher used for the request" },
				"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The transport used for the request (http or websocket)" },
				"totalTokenMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum total token window", "isMeasurement": true },
				"clientPromptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens, locally counted", "isMeasurement": true },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens, server side counted", "isMeasurement": true },
				"promptCacheTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens hitting cache as reported by server", "isMeasurement": true },
				"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum generated tokens", "isMeasurement": true },
				"tokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of generated tokens", "isMeasurement": true },
				"reasoningTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of reasoning tokens", "isMeasurement": true },
				"acceptedPredictionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prediction that appeared in the completion", "isMeasurement": true },
				"rejectedPredictionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prediction that appeared in the completion", "isMeasurement": true },
				"completionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the output", "isMeasurement": true },
				"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token", "isMeasurement": true },
				"timeToFirstTokenEmitted": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token emitted (visible text)", "isMeasurement": true },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to complete the request", "isMeasurement": true },
				"issuedTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the request was issued", "isMeasurement": true },
				"isVisionRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request was for a vision model", "isMeasurement": true },
				"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for a BYOK model", "isMeasurement": true },
				"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for an Auto model", "isMeasurement": true },
				"bytesReceived": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of bytes received in the response", "isMeasurement": true },
				"retryAfterError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the original request." },
				"retryAfterErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the original request if available" },
				"connectivityTestError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the connectivity test." },
				"connectivityTestErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the connectivity test request if available" },
				"retryAfterFilterCategory": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the response was filtered and this is a retry attempt, this contains the original filtered content category." },
				"suspendEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system suspend event was seen during the request", "isMeasurement": true },
				"resumeEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system resume event was seen during the request", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryEvent('response.success', { github: true, microsoft: true }, {
			reason: chatCompletion.finishReason,
			filterReason: chatCompletion.filterReason,
			source: baseTelemetry?.properties.messageSource ?? 'unknown',
			initiatorType: userInitiatedRequest ? 'user' : 'agent',
			model: chatEndpointInfo?.model,
			modelInvoked: chatCompletion.model,
			apiType: chatEndpointInfo?.apiType,
			requestId: chatCompletion.requestId.headerRequestId,
			gitHubRequestId: chatCompletion.requestId.gitHubRequestId,
			associatedRequestId: baseTelemetry?.properties.associatedRequestId,
			reasoningEffort: requestBody.reasoning?.effort,
			reasoningSummary: requestBody.reasoning?.summary,
			...(fetcher ? { fetcher } : {}),
			transport,
			...(baseTelemetry?.properties.retryAfterError ? { retryAfterError: baseTelemetry.properties.retryAfterError } : {}),
			...(baseTelemetry?.properties.retryAfterErrorGitHubRequestId ? { retryAfterErrorGitHubRequestId: baseTelemetry.properties.retryAfterErrorGitHubRequestId } : {}),
			...(baseTelemetry?.properties.connectivityTestError ? { connectivityTestError: baseTelemetry.properties.connectivityTestError } : {}),
			...(baseTelemetry?.properties.connectivityTestErrorGitHubRequestId ? { connectivityTestErrorGitHubRequestId: baseTelemetry.properties.connectivityTestErrorGitHubRequestId } : {}),
			...(baseTelemetry?.properties.retryAfterFilterCategory ? { retryAfterFilterCategory: baseTelemetry.properties.retryAfterFilterCategory } : {}),
		}, {
			totalTokenMax: chatEndpointInfo?.modelMaxPromptTokens ?? -1,
			tokenCountMax: maxResponseTokens,
			promptTokenCount: chatCompletion.usage?.prompt_tokens,
			promptCacheTokenCount: chatCompletion.usage?.prompt_tokens_details?.cached_tokens,
			clientPromptTokenCount: promptTokenCount,
			tokenCount: chatCompletion.usage?.total_tokens,
			reasoningTokens: chatCompletion.usage?.completion_tokens_details?.reasoning_tokens,
			acceptedPredictionTokens: chatCompletion.usage?.completion_tokens_details?.accepted_prediction_tokens,
			rejectedPredictionTokens: chatCompletion.usage?.completion_tokens_details?.rejected_prediction_tokens,
			completionTokens: chatCompletion.usage?.completion_tokens,
			timeToFirstToken,
			timeToFirstTokenEmitted,
			timeToComplete: Date.now() - baseTelemetry.issuedTime,
			issuedTime: baseTelemetry.issuedTime,
			isVisionRequest: hasImageMessages ? 1 : -1,
			isBYOK: isBYOKModel(chatEndpointInfo),
			isAuto: isAutoModel(chatEndpointInfo),
			bytesReceived,
			suspendEventSeen: suspendEventSeen ? 1 : 0,
			resumeEventSeen: resumeEventSeen ? 1 : 0,
		});
	}

	public static sendCancellationTelemetry(
		telemetryService: ITelemetryService,
		{
			source,
			requestId,
			model,
			apiType,
			transport,
			associatedRequestId,
			retryAfterError,
			retryAfterErrorGitHubRequestId,
			connectivityTestError,
			connectivityTestErrorGitHubRequestId,
			retryAfterFilterCategory,
			fetcher,
			suspendEventSeen,
			resumeEventSeen,
		}: IChatMLFetcherCancellationProperties,
		{
			totalTokenMax,
			promptTokenCount,
			tokenCountMax,
			timeToFirstToken,
			timeToFirstTokenEmitted,
			timeToCancelled,
			isVisionRequest,
			isBYOK,
			isAuto,
			bytesReceived,
			issuedTime,
		}: IChatMLFetcherCancellationMeasures
	) {
		/* __GDPR__
			"response.cancelled" : {
				"owner": "digitarald",
				"comment": "Report canceled service responses for quality.",
				"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selection for the response" },
				"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type for the response- chat completions or responses" },
				"source": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Source for why the request was made" },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request" },
				"associatedRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Another request ID that this request is associated with (eg, the originating request of a summarization request)." },
				"fetcher": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The fetcher used for the request" },
				"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The transport used for the request (http or websocket)" },
				"totalTokenMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum total token window", "isMeasurement": true },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens", "isMeasurement": true },
				"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum generated tokens", "isMeasurement": true },
				"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token", "isMeasurement": true },
				"timeToFirstTokenEmitted": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token emitted (visible text)", "isMeasurement": true },
				"timeToCancelled": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to cancellation", "isMeasurement": true },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to complete the request", "isMeasurement": true },
				"issuedTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the request was issued", "isMeasurement": true },
				"isVisionRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request was for a vision model", "isMeasurement": true },
				"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for a BYOK model", "isMeasurement": true },
				"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for an Auto model", "isMeasurement": true },
				"bytesReceived": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of bytes received before cancellation", "isMeasurement": true },
				"retryAfterError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the original request." },
				"retryAfterErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the original request if available" },
				"connectivityTestError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the connectivity test." },
				"connectivityTestErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the connectivity test request if available" },
				"retryAfterFilterCategory": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the response was filtered and this is a retry attempt, this contains the original filtered content category." },
				"suspendEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system suspend event was seen during the request", "isMeasurement": true },
				"resumeEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system resume event was seen during the request", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryEvent('response.cancelled', { github: true, microsoft: true }, {
			apiType,
			source,
			requestId,
			model,
			associatedRequestId,
			...(fetcher ? { fetcher } : {}),
			transport,
			...(retryAfterError ? { retryAfterError } : {}),
			...(retryAfterErrorGitHubRequestId ? { retryAfterErrorGitHubRequestId } : {}),
			...(connectivityTestError ? { connectivityTestError } : {}),
			...(connectivityTestErrorGitHubRequestId ? { connectivityTestErrorGitHubRequestId } : {}),
			...(retryAfterFilterCategory ? { retryAfterFilterCategory } : {})
		}, {
			totalTokenMax,
			promptTokenCount,
			tokenCountMax,
			timeToFirstToken,
			timeToFirstTokenEmitted,
			timeToCancelled,
			timeToComplete: timeToCancelled,
			issuedTime,
			isVisionRequest,
			isBYOK,
			isAuto,
			bytesReceived,
			suspendEventSeen: suspendEventSeen ? 1 : 0,
			resumeEventSeen: resumeEventSeen ? 1 : 0,
		});
	}

	public static sendResponseErrorTelemetry(
		telemetryService: ITelemetryService,
		{
			processed,
			telemetryProperties,
			chatEndpointInfo,
			requestBody,
			tokenCount,
			maxResponseTokens,
			timeToFirstToken,
			isVisionRequest,
			transport,
			fetcher,
			bytesReceived,
			issuedTime,
			wasRetried,
			suspendEventSeen,
			resumeEventSeen,
		}: IChatMLFetcherErrorData,
	) {
		/* __GDPR__
			"response.error" : {
				"owner": "digitarald",
				"comment": "Report quality issue for when a service response failed.",
				"type": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Type of issue" },
				"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason of issue" },
				"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selection for the response" },
				"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type for the response- chat completions or responses" },
				"source": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Source for why the request was made" },
				"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the request" },
				"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
				"associatedRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Another request ID that this request is associated with (eg, the originating request of a summarization request)." },
				"reasoningEffort": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning effort level" },
				"reasoningSummary": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning summary level" },
				"fetcher": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The fetcher used for the request" },
				"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The transport used for the request (http or websocket)" },
				"totalTokenMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum total token window", "isMeasurement": true },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens", "isMeasurement": true },
				"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum generated tokens", "isMeasurement": true },
				"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token", "isMeasurement": true },
				"timeToFirstTokenEmitted": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token emitted (visible text)", "isMeasurement": true },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to complete the request", "isMeasurement": true },
				"issuedTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the request was issued", "isMeasurement": true },
				"isVisionRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request was for a vision model", "isMeasurement": true },
				"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for a BYOK model", "isMeasurement": true },
				"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for an Auto model", "isMeasurement": true },
				"wasRetried": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the error will be retried", "isMeasurement": true },
				"bytesReceived": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of bytes received before the error", "isMeasurement": true },
				"retryAfterError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the original request." },
				"retryAfterErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the original request if available" },
				"connectivityTestError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the connectivity test." },
				"connectivityTestErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the connectivity test request if available" },
				"retryAfterFilterCategory": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the response was filtered and this is a retry attempt, this contains the original filtered content category." },
				"suspendEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system suspend event was seen during the request", "isMeasurement": true },
				"resumeEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system resume event was seen during the request", "isMeasurement": true }
			}
		*/
		telemetryService.sendTelemetryEvent('response.error', { github: true, microsoft: true }, {
			type: processed.type,
			reason: processed.reasonDetail || processed.reason,
			source: telemetryProperties?.messageSource ?? 'unknown',
			requestId: processed.requestId,
			gitHubRequestId: processed.serverRequestId,
			model: chatEndpointInfo.model,
			apiType: chatEndpointInfo.apiType,
			reasoningEffort: requestBody.reasoning?.effort,
			reasoningSummary: requestBody.reasoning?.summary,
			...(fetcher ? { fetcher } : {}),
			transport,
			associatedRequestId: telemetryProperties?.associatedRequestId,
			...(telemetryProperties?.retryAfterError ? { retryAfterError: telemetryProperties.retryAfterError } : {}),
			...(telemetryProperties?.retryAfterErrorGitHubRequestId ? { retryAfterErrorGitHubRequestId: telemetryProperties.retryAfterErrorGitHubRequestId } : {}),
			...(telemetryProperties?.connectivityTestError ? { connectivityTestError: telemetryProperties.connectivityTestError } : {}),
			...(telemetryProperties?.connectivityTestErrorGitHubRequestId ? { connectivityTestErrorGitHubRequestId: telemetryProperties.connectivityTestErrorGitHubRequestId } : {}),
			...(telemetryProperties?.retryAfterFilterCategory ? { retryAfterFilterCategory: telemetryProperties.retryAfterFilterCategory } : {})
		}, {
			totalTokenMax: chatEndpointInfo.modelMaxPromptTokens ?? -1,
			promptTokenCount: tokenCount,
			tokenCountMax: maxResponseTokens,
			timeToFirstToken,
			timeToComplete: Date.now() - issuedTime,
			issuedTime,
			isVisionRequest: isVisionRequest ? 1 : -1,
			isBYOK: isBYOKModel(chatEndpointInfo),
			isAuto: isAutoModel(chatEndpointInfo),
			wasRetried: wasRetried ? 1 : 0,
			bytesReceived,
			suspendEventSeen: suspendEventSeen ? 1 : 0,
			resumeEventSeen: resumeEventSeen ? 1 : 0,
		});
	}
}
