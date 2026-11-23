/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { KnownSources, TriggerKind, type RequestContext } from '../../../platform/languageServer/common/languageContextService';
import { ContextItemSummary, ErrorLocation, ErrorPart, type CacheState } from './types';

import * as protocol from '../common/serverProtocol';

namespace RequestContext {
	export function getSampleTelemetry(context: RequestContext): number {
		return Math.max(1, Math.min(100, context.sampleTelemetry ?? 1));
	}
}

interface TypeScriptServerError extends Error {
	response: {
		type: 'response';
		command: string;
		message: string;
	};
	version: {
		displayName: string;
	};
}
namespace TypeScriptServerError {
	export function is(value: Error): value is TypeScriptServerError {
		const candidate = value as TypeScriptServerError;
		return candidate instanceof Error && candidate.response !== undefined && candidate.version !== undefined && typeof candidate.version.displayName === 'string';
	}
}

export class TelemetrySender {

	private readonly telemetryService: ITelemetryService;
	private readonly logService: ILogService;
	private sendRequestTelemetryCounter: number;
	private sendSpeculativeRequestTelemetryCounter: number;

	constructor(telemetryService: ITelemetryService, logService: ILogService) {
		this.telemetryService = telemetryService;
		this.logService = logService;
		this.sendRequestTelemetryCounter = 0;
		this.sendSpeculativeRequestTelemetryCounter = 0;
	}

	public sendSpeculativeRequestTelemetry(context: RequestContext, originalRequestId: string, numberOfItems: number): void {
		const sampleTelemetry = RequestContext.getSampleTelemetry(context);
		const shouldSendTelemetry = sampleTelemetry === 1 || this.sendSpeculativeRequestTelemetryCounter % sampleTelemetry === 0;
		this.sendSpeculativeRequestTelemetryCounter++;

		if (shouldSendTelemetry) {
			/* __GDPR__
				"typescript-context-plugin.completion-context.speculative" : {
					"owner": "dirkb",
					"comment": "Telemetry for copilot inline completion context",
					"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
					"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" },
					"originalRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The original request id for which this is a speculative request" },
					"numberOfItems": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of items in the speculative request", "isMeasurement": true },
					"sampleTelemetry": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The sampling rate for telemetry. A value of 1 means every request is logged, a value of 5 means every 5th request is logged, etc.", "isMeasurement": true }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent(
				'typescript-context-plugin.completion-context.speculative',
				{
					requestId: context.requestId,
					source: context.source ?? KnownSources.unknown,
					originalRequestId: originalRequestId
				},
				{
					numberOfItems: numberOfItems,
					sampleTelemetry: sampleTelemetry
				}
			);
		}
		this.logService.debug(`TypeScript Copilot context speculative request: [${context.requestId} - ${originalRequestId}, numberOfItems: ${numberOfItems}]`);
	}

	public willLogRequestTelemetry(context: RequestContext): boolean {
		const sampleTelemetry = RequestContext.getSampleTelemetry(context);
		return sampleTelemetry === 1 || this.sendRequestTelemetryCounter % sampleTelemetry === 0;
	}

	public sendRequestTelemetry(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, data: ContextItemSummary, timeTaken: number, cacheState: { before: CacheState; after: CacheState } | undefined, cacheRequest: string | undefined): void {
		const stats = data.stats;
		const nodePath = data?.path ? JSON.stringify(data.path) : JSON.stringify([0]);
		const items = stats.items;
		const totalSize = stats.totalSize;
		const fileSize = document.getText().length;

		const sampleTelemetry = RequestContext.getSampleTelemetry(context);
		const shouldSendTelemetry = sampleTelemetry === 1 || this.sendRequestTelemetryCounter % sampleTelemetry === 0;
		this.sendRequestTelemetryCounter++;
		if (shouldSendTelemetry) {
			/* __GDPR__
				"typescript-context-plugin.completion-context.request" : {
					"owner": "dirkb",
					"comment": "Telemetry for copilot inline completion context",
					"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
					"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity id" },
					"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" },
					"trigger": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The trigger kind of the request" },
					"cacheRequest": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The cache request that was used to populate the cache" },
					"nodePath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The syntax kind path to the AST node the position resolved to." },
					"cancelled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request got cancelled on the client side" },
					"timedOut": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request timed out on the server side" },
					"tokenBudgetExhausted": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the token budget was exhausted" },
					"serverTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time taken on the server side", "isMeasurement": true },
					"contextComputeTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time taken on the server side to compute the context", "isMeasurement": true },
					"timeTaken": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time taken to provide the completion", "isMeasurement": true },
					"total": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total number of context items", "isMeasurement": true },
					"snippets": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of code snippets", "isMeasurement": true },
					"traits": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of traits", "isMeasurement": true },
					"yielded": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of yielded items", "isMeasurement": true },
					"items": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Detailed information about each context item delivered." },
					"totalSize": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total size of all context items", "isMeasurement": true },
					"fileSize": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The size of the file", "isMeasurement": true },
					"cachedItems": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of cache items", "isMeasurement": true },
					"referencedItems": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of referenced items", "isMeasurement": true },
					"isSpeculative": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was speculative" },
					"beforeCacheState": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The cache state before the request was sent" },
					"afterCacheState": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The cache state after the request was sent" },
					"fromCache": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the context was fully provided from cache" },
					"sampleTelemetry": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The sampling rate for telemetry. A value of 1 means every request is logged, a value of 5 means every 5th request is logged, etc.", "isMeasurement": true }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent(
				'typescript-context-plugin.completion-context.request',
				{
					requestId: context.requestId,
					opportunityId: context.opportunityId ?? 'unknown',
					source: context.source ?? KnownSources.unknown,
					trigger: context.trigger ?? TriggerKind.unknown,
					cacheRequest: cacheRequest ?? 'unknown',
					nodePath: nodePath,
					cancelled: data.cancelled.toString(),
					timedOut: data.timedOut.toString(),
					tokenBudgetExhausted: data.tokenBudgetExhausted.toString(),
					items: JSON.stringify(items),
					isSpeculative: (context.proposedEdits !== undefined && context.proposedEdits.length > 0 ? true : false).toString(),
					beforeCacheState: cacheState?.before.toString(),
					afterCacheState: cacheState?.after.toString(),
					fromCache: data.fromCache.toString(),
				},
				{
					serverTime: data.serverTime,
					contextComputeTime: data.contextComputeTime,
					timeTaken,
					total: stats.total,
					snippets: stats.snippets,
					traits: stats.traits,
					yielded: stats.yielded,
					totalSize: totalSize,
					fileSize: fileSize,
					cachedItems: data.cachedItems,
					referencedItems: data.referencedItems,
					sampleTelemetry: sampleTelemetry
				}
			);
		}
		this.logService.debug(`TypeScript Copilot context: [${context.requestId}, ${context.source ?? KnownSources.unknown}, ${JSON.stringify(position, undefined, 0)}, ${JSON.stringify(nodePath, undefined, 0)}, ${JSON.stringify(stats, undefined, 0)}, cacheItems:${data.cachedItems}, cacheState:${JSON.stringify(cacheState, undefined, 0)}, budgetExhausted:${data.tokenBudgetExhausted}, cancelled:${data.cancelled}, timedOut:${data.timedOut}, fileSize:${fileSize}] in [${timeTaken},${data.serverTime},${data.contextComputeTime}]ms.${data.timedOut ? ' Timed out.' : ''}`);
		if (data.errorData !== undefined && data.errorData.length > 0) {
			const errorData = data.errorData;
			for (const error of errorData) {
				/* __GDPR__
					"typescript-context-plugin.completion-context.error" : {
						"owner": "dirkb",
						"comment": "Telemetry for copilot inline completion context errors",
						"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
						"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" },
						"code": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The failure code", "isMeasurement": true },
						"message": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure message" }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent(
					'typescript-context-plugin.completion-context.error',
					{
						requestId: context.requestId,
						source: context.source ?? KnownSources.unknown,
						message: error.message
					},
					{
						code: error.code
					}
				);
				this.logService.error('Error computing context:', `${error.message} [${error.code}]`);
			}
		}
	}

	public sendRequestOnTimeoutTelemetry(context: RequestContext, data: ContextItemSummary, cacheState: CacheState): void {
		const stats = data.stats;
		const items = stats.items;
		const totalSize = stats.totalSize;
		/* __GDPR__
			"typescript-context-plugin.completion-context.on-timeout" : {
				"owner": "dirkb",
				"comment": "Telemetry for copilot inline completion context on timeout",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
				"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity id" },
				"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" },
				"total": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total number of context items", "isMeasurement": true },
				"snippets": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of code snippets", "isMeasurement": true },
				"traits": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of traits", "isMeasurement": true },
				"yielded": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of yielded items", "isMeasurement": true },
				"items": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Detailed information about each context item delivered." },
				"totalSize": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total size of all context items", "isMeasurement": true },
				"cacheState": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The cache state for the onTimeout request" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.completion-context.on-timeout',
			{
				requestId: context.requestId,
				opportunityId: context.opportunityId ?? 'unknown',
				source: context.source ?? KnownSources.unknown,
				items: JSON.stringify(items),
				cacheState: cacheState.toString()
			},
			{
				total: stats.total,
				snippets: stats.snippets,
				traits: stats.traits,
				yielded: stats.yielded,
				totalSize: totalSize
			}
		);
		this.logService.debug(`TypeScript Copilot context on timeout: [${context.requestId}, ${JSON.stringify(stats, undefined, 0)}]`);
	}

	public sendRequestFailureTelemetry(context: RequestContext, data: { error: protocol.ErrorCode; message: string; stack?: string }): void {
		/* __GDPR__
			"typescript-context-plugin.completion-context.failed" : {
				"owner": "dirkb",
				"comment": "Telemetry for copilot inline completion context in failure case",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
				"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity id" },
				"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" },
				"code:": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The failure code" },
				"message": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure message" },
				"stack": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure stack" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.completion-context.failed',
			{
				requestId: context.requestId,
				opportunityId: context.opportunityId ?? 'unknown',
				source: context.source ?? KnownSources.unknown,
				code: data.error,
				message: data.message,
				stack: data.stack ?? 'Not available'
			}
		);
	}

	public sendRequestCancelledTelemetry(context: RequestContext, timeTaken: number): void {
		/* __GDPR__
			"typescript-context-plugin.completion-context.cancelled" : {
				"owner": "dirkb",
				"comment": "Telemetry for copilot inline completion context in cancellation case",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
				"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity id" },
				"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" },
				"timeTaken": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time taken to provide the completion", "isMeasurement": true }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.completion-context.cancelled',
			{
				requestId: context.requestId,
				opportunityId: context.opportunityId ?? 'unknown',
				source: context.source ?? KnownSources.unknown
			},
			{
				timeTaken: timeTaken
			}
		);
		this.logService.debug(`TypeScript Copilot context request ${context.requestId} got cancelled.`);
	}

	public sendActivationTelemetry(response: protocol.PingResponse | undefined, error: unknown | undefined): void {
		if (response !== undefined) {
			const body: protocol.PingResponse['body'] | undefined = response?.body;
			if (body?.kind === 'ok') {
				/* __GDPR__
					"typescript-context-plugin.activation.ok" : {
						"owner": "dirkb",
						"comment": "Telemetry for TypeScript server plugin",
						"session": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the TypeScript server had a session" },
						"supported": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the TypeScript server version is supported" },
						"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The version of the TypeScript server" }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent(
					'typescript-context-plugin.activation.ok',
					{
						session: body.session.toString(),
						supported: body.supported.toString(),
						version: body.version ?? 'unknown'
					}
				);
			} else if (body?.kind === 'error') {
				this.sendActivationFailedTelemetry(ErrorLocation.Server, ErrorPart.ServerPlugin, body.message, body.stack);
			} else {
				this.sendUnknownPingResponseTelemetry(ErrorLocation.Server, ErrorPart.ServerPlugin, response);
			}
		} else if (error !== undefined) {
			const isError = error instanceof Error;
			if (isError && TypeScriptServerError.is(error)) {
				this.sendActivationFailedTelemetry(ErrorLocation.Server, ErrorPart.ServerPlugin, error.response.message ?? error.message, undefined, error.version.displayName);
			} else if (isError) {
				this.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.ServerPlugin, error.message, error.stack);
			} else {
				this.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.ServerPlugin, 'Unknown error', undefined);
			}
		} else {
			this.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.ServerPlugin, 'Neither response nor error received.', undefined);
		}
	}

	public sendActivationFailedTelemetry(location: ErrorLocation, part: ErrorPart, message: string, stack?: string | undefined, version?: string | undefined): void {
		/* __GDPR__
			"typescript-context-plugin.activation.failed" : {
				"owner": "dirkb",
				"comment": "Telemetry for TypeScript server plugin",
				"location": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The location of the failure" },
				"part": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The part that errored" },
				"message": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure message" },
				"stack": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure stack" },
				"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The version" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.activation.failed',
			{
				location: location,
				part: part,
				message: message,
				stack: stack ?? 'Not available',
				version: version ?? 'Not specified'
			}
		);
	}

	private sendUnknownPingResponseTelemetry(location: ErrorLocation, part: ErrorPart, response: object): void {
		/* __GDPR__
			"typescript-context-plugin.activation.unknown-ping-response" : {
				"owner": "dirkb",
				"comment": "Telemetry for TypeScript server plugin",
				"location": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The location of the failure" },
				"part": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The part that errored" },
				"response": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The response literal" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.activation.unknown-ping-response',
			{
				location: location,
				part: part,
				response: JSON.stringify(response, undefined, 0)
			}
		);
	}

	public sendIntegrationTelemetry(requestId: string, document: string, versionMismatch?: string): void {
		/* __GDPR__
			"typescript-context-plugin.integration.failed" : {
				"owner": "dirkb",
				"comment": "Telemetry for Copilot inline chat integration.",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
				"document": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The document for which the integration failed" },
				"versionMismatch": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The version mismatch" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.integration.failed',
			{
				requestId: requestId,
				document: document,
				versionMismatch: versionMismatch
			}
		);
	}

	public sendInlineCompletionProviderTelemetry(source: KnownSources, registered: boolean): void {
		if (registered) {
			/* __GDPR__
				"typescript-context-plugin.inline-completion-provider.registered" : {
					"owner": "dirkb",
					"comment": "Telemetry for Copilot inline completions",
					"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent(
				'typescript-context-plugin.inline-completion-provider.registered',
				{
					source: source
				}
			);
		} else {
			/* __GDPR__
				"typescript-context-plugin.inline-completion-provider.unregistered" : {
					"owner": "dirkb",
					"comment": "Telemetry for Copilot inline completions",
					"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the request" }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent(
				'typescript-context-plugin.inline-completion-provider.unregistered',
				{
					source: source
				}
			);
		}
	}
}
