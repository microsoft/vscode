/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { LRUCache } from 'lru-cache';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ContextKind, ILanguageContextService, KnownSources, TriggerKind, type ContextItem, type RequestContext } from '../../../platform/languageServer/common/languageContextService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Queue } from '../../../util/vs/base/common/async';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import * as protocol from '../common/serverProtocol';
import { InspectorDataProvider } from './inspector';
import { ThrottledDebouncer } from './throttledDebounce';
import { ContextItemResultBuilder, ContextItemSummary, ResolvedRunnableResult, type OnCachePopulatedEvent, type OnContextComputedEvent, type OnContextComputedOnTimeoutEvent } from './types';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';

const currentTokenBudget: number = 8 * 1024;

enum ExecutionTarget {
	Semantic,
	Syntax
}

type ExecConfig = {
	readonly lowPriority?: boolean;
	readonly nonRecoverable?: boolean;
	readonly cancelOnResourceChange?: vscode.Uri;
	readonly executionTarget?: ExecutionTarget;
};

enum ErrorLocation {
	Client = 'client',
	Server = 'server'
}

enum ErrorPart {
	ServerPlugin = 'server-plugin',
	TypescriptPlugin = 'typescript-plugin',
	CopilotExtension = 'copilot-extension'
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

namespace RequestContext {
	export function getSampleTelemetry(context: RequestContext): number {
		return Math.max(1, Math.min(100, context.sampleTelemetry ?? 1));
	}
}

class TelemetrySender {

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

type RequestInfo = {
	readonly document: string;
	readonly version: number;
	readonly languageId: string;
	readonly position: vscode.Position;
	readonly requestId: string;
	readonly path: number[];
};

type ContextRequestState = {
	client: readonly ResolvedRunnableResult[];
	clientOnTimeout: readonly ResolvedRunnableResult[];
	server: readonly protocol.CachedContextRunnableResult[];
	resultMap: Map<protocol.ContextRunnableResultId, ResolvedRunnableResult>;
	itemMap: Map<protocol.ContextItemKey, protocol.FullContextItem>;
};

type CacheInfo = {
	version: number;
	state: CacheState;
}

enum CacheState {
	NotPopulated = 'NotPopulated',
	PartiallyPopulated = 'PartiallyPopulated',
	FullyPopulated = 'FullyPopulated'
}

type ManagerUpdateResult = {
	resolved: ResolvedRunnableResult[];
	serverComputed: Set<string>;
	cached: number;
	referenced: number;
};

class RunnableResultManager implements vscode.Disposable {

	private readonly disposables = new DisposableStore();
	private requestInfo: RequestInfo | undefined;

	private cacheInfo: CacheInfo;
	private results: Map<protocol.ContextRunnableResultId, ResolvedRunnableResult>;
	private readonly withInRangeRunnableResults: { resultId: protocol.ContextRunnableResultId; range: vscode.Range }[];
	private readonly outsideRangeRunnableResults: { resultId: protocol.ContextRunnableResultId; ranges: vscode.Range[] }[] = [];
	private readonly neighborFileRunnableResults: { resultId: protocol.ContextRunnableResultId }[];

	constructor() {
		this.requestInfo = undefined;
		this.results = new Map();

		this.cacheInfo = {
			version: 0,
			state: CacheState.NotPopulated
		};
		this.withInRangeRunnableResults = [];
		this.outsideRangeRunnableResults = [];
		this.neighborFileRunnableResults = [];

		this.disposables.add(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
			if (this.requestInfo === undefined || event.contentChanges.length === 0) {
				return;
			}
			if (event.document.uri.toString() !== this.requestInfo.document) {
				if (this.affectsTypeScript(event)) {
					this.clear();
				}
			} else {
				for (const change of event.contentChanges) {
					const changeRange = change.range;
					for (let i = 0; i < this.withInRangeRunnableResults.length;) {
						const entry = this.withInRangeRunnableResults[i];
						if (entry.range.contains(changeRange)) {
							entry.range = this.applyTextContentChangeEventToWithinRange(change, entry.range);
							i++;
						} else {
							const id = entry.resultId;
							this.results.delete(id);
							this.withInRangeRunnableResults.splice(i, 1);
						}
					}
					for (let i = 0; i < this.outsideRangeRunnableResults.length;) {
						const entry = this.outsideRangeRunnableResults[i];
						const ranges = this.applyTextContentChangeEventToOutsideRanges(change, entry.ranges);
						if (ranges === undefined) {
							const id = entry.resultId;
							this.results.delete(id);
							this.outsideRangeRunnableResults.splice(i, 1);
						} else {
							entry.ranges = ranges;
							i++;
						}
					}
					this.cacheInfo.version = event.document.version;
				}
			}
		}));
		this.disposables.add(vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
			if (this.requestInfo?.document === document.uri.toString()) {
				this.clear();
			}
		}));
		this.disposables.add(vscode.window.onDidChangeActiveTextEditor(() => {
			this.clear();
		}));
		this.disposables.add(vscode.window.tabGroups.onDidChangeTabs((event: vscode.TabChangeEvent) => {
			if (event.closed.length === 0 && event.opened.length === 0) {
				return;
			}
			for (const item of this.neighborFileRunnableResults) {
				this.results.delete(item.resultId);
			}
			this.neighborFileRunnableResults.length = 0;
		}));
	}

	public clear(): void {
		this.requestInfo = undefined;
		this.results.clear();

		this.cacheInfo = {
			version: 0,
			state: CacheState.NotPopulated
		};
		this.withInRangeRunnableResults.length = 0;
		this.outsideRangeRunnableResults.length = 0;
		this.neighborFileRunnableResults.length = 0;
	}

	public getCacheState(): CacheState {
		return this.cacheInfo.state;
	}

	public update(document: vscode.TextDocument, version: number, position: vscode.Position, context: RequestContext, body: protocol.ComputeContextResponse.OK, requestState: ContextRequestState | undefined): ManagerUpdateResult {
		const itemMap = requestState?.itemMap ?? new Map();
		const usedResults = requestState?.resultMap ?? new Map();

		this.withInRangeRunnableResults.length = 0;
		this.outsideRangeRunnableResults.length = 0;
		this.neighborFileRunnableResults.length = 0;
		this.results.clear();
		this.cacheInfo = {
			version: version,
			state: CacheState.NotPopulated
		};

		let cachedItems = 0;
		let referencedItems = 0;
		const serverComputed: Set<string> = new Set();
		this.requestInfo = {
			document: document.uri.toString(),
			version: version,
			languageId: document.languageId,
			position: position,
			requestId: context.requestId,
			path: body.path ?? [0]
		};

		if (body.runnableResults === undefined || body.runnableResults.length === 0 || body.path === undefined || body.path.length === 0 || body.path[0] === 0) {
			return { resolved: [], cached: cachedItems, referenced: referencedItems, serverComputed: serverComputed };
		}

		const serverItems: Set<protocol.ContextItemKey> = new Set();
		// Add new client side context items to the item map.
		if (body.contextItems !== undefined && body.contextItems.length > 0) {
			for (const item of body.contextItems) {
				if (protocol.ContextItem.hasKey(item)) {
					itemMap.set(item.key, item);
					serverItems.add(item.key);
				}
			}
		}
		const updateRunnableResult = (resultItem: protocol.ContextRunnableResultTypes): ResolvedRunnableResult | undefined => {
			let result: ResolvedRunnableResult | undefined;
			if (resultItem.kind === protocol.ContextRunnableResultKind.ComputedResult) {
				serverComputed.add(resultItem.id);
				const items: protocol.FullContextItem[] = [];
				for (const contextItem of resultItem.items) {
					if (contextItem.kind === protocol.ContextKind.Reference) {
						const referenced: protocol.FullContextItem | undefined = itemMap.get(contextItem.key);
						if (referenced !== undefined) {
							referencedItems++;
							items.push(referenced);
							if (!serverItems.has(contextItem.key)) {
								cachedItems++;
							}
						}
					} else {
						items.push(contextItem);
					}
				}
				result = ResolvedRunnableResult.from(resultItem, items);
			} else if (resultItem.kind === protocol.ContextRunnableResultKind.Reference) {
				result = usedResults.get(resultItem.id);
				if (result !== undefined) {
					cachedItems += result.items.length;
				}
			}
			if (result === undefined) {
				return;
			}
			this.results.set(result.id, result);
			if (result.cache !== undefined) {
				if (result.cache.scope.kind === protocol.CacheScopeKind.WithinRange) {
					const scopeRange = result.cache.scope.range;
					const range = new vscode.Range(scopeRange.start.line, scopeRange.start.character, scopeRange.end.line, scopeRange.end.character);
					this.withInRangeRunnableResults.push({ range, resultId: result.id });
				} else if (result.cache.scope.kind === protocol.CacheScopeKind.NeighborFiles) {
					this.neighborFileRunnableResults.push({ resultId: result.id });
				} else if (result.cache.scope.kind === protocol.CacheScopeKind.OutsideRange) {
					const ranges: vscode.Range[] = [];
					for (const scopeRange of result.cache.scope.ranges) {
						ranges.push(new vscode.Range(scopeRange.start.line, scopeRange.start.character, scopeRange.end.line, scopeRange.end.character));
					}
					this.outsideRangeRunnableResults.push({ resultId: result.id, ranges });
				}
			}
			this.updateCacheState(result.state);
			return result;
		};

		const results: ResolvedRunnableResult[] = [];
		for (const runnableResult of body.runnableResults) {
			const result = updateRunnableResult(runnableResult);
			if (result !== undefined) {
				results.push(result);
			}
		}
		return { resolved: results, cached: cachedItems, referenced: referencedItems, serverComputed: serverComputed };
	}

	private updateCacheState(state: protocol.ContextRunnableState): void {
		switch (this.cacheInfo.state) {
			case CacheState.NotPopulated:
				switch (state) {
					case protocol.ContextRunnableState.Finished:
						this.cacheInfo.state = CacheState.FullyPopulated;
						break;
					case protocol.ContextRunnableState.IsFull:
					case protocol.ContextRunnableState.InProgress:
						this.cacheInfo.state = CacheState.PartiallyPopulated;
						break;
					default:
						this.cacheInfo.state = CacheState.NotPopulated;
				}
				break;
			case CacheState.PartiallyPopulated:
				// If the cache is partially populated we can only stay in that state.
				break;
			case CacheState.FullyPopulated:
				switch (state) {
					case protocol.ContextRunnableState.Finished:
						// If the cache is fully populated we can only stay in that state.
						break;
					case protocol.ContextRunnableState.IsFull:
					case protocol.ContextRunnableState.InProgress:
						this.cacheInfo.state = CacheState.PartiallyPopulated;
						break;
					default:
						this.cacheInfo.state = CacheState.NotPopulated;
				}
				break;
		}
	}

	public getRequestId(): string | undefined {
		return this.requestInfo?.requestId;
	}

	public getNodePath(): number[] {
		return this.requestInfo?.path ?? [0];
	}

	public getRunnableResult(id: protocol.ContextRunnableResultId): ResolvedRunnableResult | undefined {
		return this.results.get(id);
	}

	public getCachedRunnableResults(document: vscode.TextDocument, position: vscode.Position, emitMode?: protocol.EmitMode): ResolvedRunnableResult[] {
		const results: ResolvedRunnableResult[] = [];
		if (this.requestInfo?.document !== document.uri.toString()) {
			return results;
		}
		if (this.cacheInfo.version !== document.version || this.cacheInfo.state === CacheState.NotPopulated || this.requestInfo.path.length === 0 || this.requestInfo.path[0] === 0) {
			return results;
		}
		for (const item of this.results.values()) {
			if (emitMode !== undefined && item.cache?.emitMode === emitMode) {
				continue;
			}
			const scope = item.cache?.scope;
			if (scope === undefined || scope.kind !== protocol.CacheScopeKind.WithinRange) {
				results.push(item);
			} else {
				const r = scope.range;
				const range = new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
				if (range.contains(position)) {
					results.push(item);
				}
			}
		}
		// Sort them by priority so that the most important items are emitted first if they
		// are contained in more than one runnable result.
		return results.sort((a, b) => {
			return a.priority < b.priority ? 1 : a.priority > b.priority ? -1 : 0;
		});
	}

	public getContextRequestState(document: vscode.TextDocument, position: vscode.Position): ContextRequestState | undefined {
		if (this.requestInfo?.document !== document.uri.toString()) {
			return undefined;
		}
		if (this.cacheInfo.version !== document.version || this.cacheInfo.state === CacheState.NotPopulated || this.requestInfo.path.length === 0 || this.requestInfo.path[0] === 0) {
			return undefined;
		}
		const items: Map<protocol.ContextItemKey, protocol.FullContextItem> = new Map();
		const client: ResolvedRunnableResult[] = [];
		const clientOnTimeout: ResolvedRunnableResult[] = [];
		const server: protocol.CachedContextRunnableResult[] = [];
		if (this.isCacheFullyUpToDate(document, position)) {
			for (const item of this.results.values()) {
				client.push(item);
			}
		} else {
			const canSkipItems = (rr: ResolvedRunnableResult, cache: protocol.CacheInfo): boolean => {
				if (rr.state === protocol.ContextRunnableState.Finished) {
					return true;
				}
				if (rr.state === protocol.ContextRunnableState.IsFull) {
					const kind = cache.scope.kind;
					return kind === protocol.CacheScopeKind.WithinRange || kind === protocol.CacheScopeKind.NeighborFiles || kind === protocol.CacheScopeKind.File;
				}
				return false;
			};
			const handleRunnableResult = (id: string, rr: ResolvedRunnableResult) => {
				const cache = rr.cache;
				const cachedResult: protocol.CachedContextRunnableResult = {
					id: id,
					kind: protocol.ContextRunnableResultKind.CacheEntry,
					state: rr.state,
					items: []
				};
				let skipItems = false;
				if (cache !== undefined) {
					cachedResult.cache = cache;
					const emitMode = cache.emitMode;
					if (emitMode === protocol.EmitMode.ClientBased) {
						client.push(rr);
						skipItems = canSkipItems(rr, cache);
					} else if (emitMode === protocol.EmitMode.ClientBasedOnTimeout) {
						clientOnTimeout.push(rr);
					}
				}
				server.push(cachedResult);

				if (skipItems) {
					return;
				}

				// Add cached context items to the result;
				for (const item of rr.items) {
					if (!protocol.ContextItem.hasKey(item)) {
						continue;
					}
					const key = item.key;
					let size: number | undefined = undefined;
					switch (item.kind) {
						case protocol.ContextKind.Snippet:
							size = protocol.CodeSnippet.sizeInChars(item);
							break;
						case protocol.ContextKind.Trait:
							size = protocol.Trait.sizeInChars(item);
							break;
						default:
					}
					cachedResult.items.push(protocol.CachedContextItem.create(key, size));
					items.set(key, item);
				}
			};
			// We don't need to sort by priority here since the data is used for the next cache request.
			for (const [id, item] of this.results.entries()) {
				const scope = item.cache?.scope;
				if (scope === undefined || scope.kind !== protocol.CacheScopeKind.WithinRange) {
					handleRunnableResult(id, item);
				} else {
					const r = scope.range;
					const range = new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
					if (range.contains(position)) {
						handleRunnableResult(id, item);
					}
				}
			}
		}
		return { client, clientOnTimeout, server, itemMap: items, resultMap: new Map(this.results) };
	}

	private isCacheFullyUpToDate(document: vscode.TextDocument, position: vscode.Position): boolean {
		if (this.requestInfo === undefined) {
			return false;
		}
		if (this.requestInfo.document !== document.uri.toString()) {
			return false;
		}

		// Same document, version and position. Cache can be full used.
		if (this.requestInfo.version === document.version && this.requestInfo.position.isEqual(position)) {
			return true;
		}

		// Document is older than cached request. Not up to date.
		if (this.requestInfo.version > document.version) {
			return false;
		}

		// if the position is not contained in all ranges return false.
		for (const runnable of this.withInRangeRunnableResults) {
			if (!runnable.range.contains(position)) {
				return false;
			}
		}

		const range = position.isBefore(this.requestInfo.position) ? new vscode.Range(position, this.requestInfo.position) : new vscode.Range(this.requestInfo.position, position);
		const text = document.getText(range);
		return text.trim().length === 0;
	}

	public dispose(): void {
		this.clear();
		this.disposables.dispose();
	}

	private affectsTypeScript(event: vscode.TextDocumentChangeEvent): boolean {
		const languageId = event.document.languageId;
		return languageId === 'typescript' || languageId === 'typescriptreact' || languageId === 'javascript' || languageId === 'javascriptreact' || languageId === 'json';
	}

	private applyTextContentChangeEventToWithinRange(event: vscode.TextDocumentContentChangeEvent, range: vscode.Range): vscode.Range {
		// The start stays untouched since the change range is contained in the range.
		const eventRange = event.range;
		const eventText = event.text;

		// Calculate how many lines the new text adds or removes
		const linesDelta = (eventText.match(/\n/g) || []).length - (eventRange.end.line - eventRange.start.line);

		// Calculate the new end position
		const endLine = range.end.line + linesDelta;

		let endCharacter = range.end.character;
		if (eventRange.end.line === range.end.line) {
			// Calculate the character delta for the last line of the change
			const lastNewLineIndex = eventText.lastIndexOf('\n');
			const newTextLength = lastNewLineIndex !== -1 ? eventText.length - lastNewLineIndex - 1 : eventText.length;
			const oldTextLength = eventRange.end.character - (eventRange.end.line > eventRange.start.line ? 0 : eventRange.start.character);
			const charDelta = newTextLength - oldTextLength;
			endCharacter += charDelta;
		}
		return new vscode.Range(range.start, new vscode.Position(endLine, endCharacter));
	}

	private applyTextContentChangeEventToOutsideRanges(event: vscode.TextDocumentContentChangeEvent, ranges: vscode.Range[]): vscode.Range[] | undefined {
		if (ranges.length === 0) {
			return ranges;
		}
		const changeRange = event.range;
		const eventText = event.text;

		// Quick optimization: if change is completely after last range, no ranges need adjustment
		const lastRange = ranges[ranges.length - 1];
		if (changeRange.start.isAfter(lastRange.end)) {
			return ranges;
		}
		// Calculate how many lines the new text adds or removes
		const linesDelta = (eventText.match(/\n/g) || []).length - (changeRange.end.line - changeRange.start.line);
		const adjustedRanges: vscode.Range[] = [];

		for (const range of ranges) {
			if (range.end.isBefore(changeRange.start)) {
				// Range is completely before change, no adjustment needed
				adjustedRanges.push(range);
			} else if (range.start.isAfter(changeRange.end)) {
				// Range is completely after change, adjust by lines delta
				if (linesDelta === 0) {
					adjustedRanges.push(range);
				} else {
					adjustedRanges.push(new vscode.Range(
						new vscode.Position(range.start.line + linesDelta, range.start.character),
						new vscode.Position(range.end.line + linesDelta, range.end.character)
					));
				}
			} else {

				// The range intersects with the range with will invalidate the cache entry.
				return undefined;
			}
		}

		return adjustedRanges;
	}
}

namespace TextDocuments {
	export function consider(document: vscode.TextDocument): boolean {
		return document.uri.scheme === 'file' && (document.languageId === 'typescript' || document.languageId === 'typescriptreact');
	}
}

class NeighborFileModel implements vscode.Disposable {

	private static readonly MAX_ITEMS = 12;

	private readonly disposables;
	private readonly visible: LRUCache<string, string>;
	private readonly notVisible: LRUCache<string, string>;

	constructor() {
		this.disposables = new DisposableStore();
		this.visible = new LRUCache<string, string>({ max: NeighborFileModel.MAX_ITEMS });
		this.notVisible = new LRUCache<string, string>({ max: NeighborFileModel.MAX_ITEMS });
		this.disposables.add(vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
			if (editor === undefined) {
				return;
			}
			const document = editor.document;
			if (TextDocuments.consider(document)) {
				const uri = document.uri.toString();
				this.visible.set(uri, document.uri.fsPath);
				this.notVisible.delete(uri);
			}
		}));
		this.disposables.add(vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
			const uri = document.uri.toString();
			if (TextDocuments.consider(document)) {
				this.visible.delete(uri);
				this.notVisible.delete(uri);
			}
		}));
		this.disposables.add(vscode.window.tabGroups.onDidChangeTabs((e: vscode.TabChangeEvent) => {
			// We don't track open tabs here to ensure we only track documents that are
			// actually focused. Otherwise opening multiple tabs at once would cause too much churn.
			for (const tab of e.closed) {
				if (tab.input instanceof vscode.TabInputText) {
					const uri = tab.input.uri.toString();
					const isVisible = this.visible.has(uri);
					if (isVisible) {
						this.visible.delete(uri);
						this.notVisible.set(uri, tab.input.uri.fsPath);
					}
				}
			}
		}));
		const textDocumentsToConsider: Map<string, vscode.Uri> = new Map();
		for (const document of vscode.workspace.textDocuments) {
			if (TextDocuments.consider(document)) {
				textDocumentsToConsider.set(document.uri.toString(), document.uri);
			}
		}
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const uri = tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined;
				if (uri !== undefined && textDocumentsToConsider.has(uri.toString())) {
					this.visible.set(uri.toString(), uri.fsPath);
					textDocumentsToConsider.delete(uri.toString());
				}
			}
		}
		for (const [key, uri] of textDocumentsToConsider.entries()) {
			this.notVisible.set(key, uri.fsPath);
		}
		if (vscode.window.activeTextEditor !== undefined) {
			const document = vscode.window.activeTextEditor.document;
			if (TextDocuments.consider(document)) {
				const uri = document.uri.toString();
				this.visible.set(uri, document.uri.fsPath);
				this.notVisible.delete(uri);
			}
		}
	}

	public getNeighborFiles(currentDocument: vscode.TextDocument): string[] {
		const result: string[] = [];
		const currentUri = currentDocument.uri.toString();
		for (const [key, value] of this.visible.entries()) {
			if (key === currentUri) {
				continue;
			}
			result.push(value);
		}
		if (result.length < NeighborFileModel.MAX_ITEMS) {
			for (const [key, value] of this.notVisible.entries()) {
				if (key === currentUri) {
					continue;
				}
				result.push(value);
				if (result.length >= NeighborFileModel.MAX_ITEMS) {
					break;
				}
			}
		}
		return result;
	}

	public dispose(): void {
		this.disposables.dispose();
	}
}

type ComputeContextRequestArgs = Omit<protocol.ComputeContextRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
	$traceId?: string;
};
namespace ComputeContextRequestArgs {
	export function create(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, startTime: number, timeBudget: number, willLogRequestTelemetry: boolean, neighborFiles: readonly string[] | undefined, clientSideRunnableResults: readonly protocol.CachedContextRunnableResult[] | undefined, includeDocumentation: boolean): ComputeContextRequestArgs {
		return {
			file: vscode.Uri.file(document.fileName),
			line: position.line + 1,
			offset: position.character + 1,
			startTime: startTime,
			timeBudget: timeBudget,
			primaryCharacterBudget: (context.tokenBudget ?? 7 * 1024) * 4,
			secondaryCharacterBudget: (currentTokenBudget * 4),
			includeDocumentation: includeDocumentation,
			neighborFiles: neighborFiles !== undefined && neighborFiles.length > 0 ? neighborFiles : undefined,
			clientSideRunnableResults: clientSideRunnableResults,
			$traceId: willLogRequestTelemetry ? context.requestId : undefined
		};
	}
}

class PendingRequestInfo {

	public readonly document: string;
	public readonly version: number;
	public readonly position: vscode.Position;
	public readonly context: RequestContext;

	constructor(document: vscode.TextDocument, position: vscode.Position, context: RequestContext) {
		this.document = document.uri.toString();
		this.version = document.version;
		this.position = position;
		this.context = context;
	}
}

class InflightRequestInfo {

	public readonly document: string;
	public readonly position: vscode.Position;
	public readonly requestId: string;
	public readonly source: KnownSources | string;
	public readonly serverPromise: Thenable<protocol.ComputeContextResponse>;

	private readonly tokenSource: vscode.CancellationTokenSource;

	constructor(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, tokenSource: vscode.CancellationTokenSource, serverPromise: Thenable<protocol.ComputeContextResponse>) {
		this.document = document.uri.toString();
		this.position = position;
		this.requestId = context.requestId;
		this.source = context.source ?? KnownSources.unknown;
		this.tokenSource = tokenSource;
		this.serverPromise = serverPromise;
	}

	public matches(document: vscode.TextDocument, position: vscode.Position): boolean {
		return this.document === document.uri.toString() && this.position.isEqual(position);
	}

	public matchesDocument(document: vscode.TextDocument): boolean {
		return this.document === document.uri.toString();
	}

	public cancel(): void {
		this.tokenSource.cancel();
	}
}

class OnTimeoutData {

	private readonly document: string;
	private readonly version: number;
	private readonly position: vscode.Position;

	public readonly runnableResults: ResolvedRunnableResult[] = [];
	public resultBuilder: ContextItemResultBuilder | undefined;

	constructor(document: vscode.TextDocument, position: vscode.Position) {
		this.document = document.uri.toString();
		this.version = document.version;
		this.position = position;
	}

	addRunnableResult(result: ResolvedRunnableResult): void {
		this.runnableResults.push(result);
	}

	addRunnableResults(results: readonly ResolvedRunnableResult[]): void {
		this.runnableResults.push(...results);
	}

	matches(document: vscode.TextDocument, position: vscode.Position): boolean {
		return this.document === document.uri.toString() && this.version === document.version && this.position.isEqual(position);
	}
}

enum ContextItemUsageMode {
	minimal = 'minimal',
	double = 'double',
	fillHalf = 'fillHalf',
	fill = 'fill'
}
namespace ContextItemUsageMode {
	export function fromString(value: string): ContextItemUsageMode {
		switch (value) {
			case 'minimal': return ContextItemUsageMode.minimal;
			case 'double': return ContextItemUsageMode.double;
			case 'fillHalf': return ContextItemUsageMode.fillHalf;
			case 'fill': return ContextItemUsageMode.fill;
			default: return ContextItemUsageMode.minimal;
		}
	}
}

class CharacterBudget {

	public readonly overall: number;
	private mandatory: number;
	private optional: number;
	private start: { mandatory: number; optional: number };

	constructor(mandatory: number, optional: number) {
		this.overall = mandatory;
		this.mandatory = mandatory;
		this.optional = optional;
		this.start = { mandatory, optional };
	}

	spend(chars: number): void {
		this.mandatory -= chars;
		this.optional -= chars;
	}

	isExhausted(): boolean {
		return this.mandatory <= 0;
	}

	isOptionalExhausted(): boolean {
		return this.optional <= 0;
	}

	public fresh(): CharacterBudget {
		return new CharacterBudget(this.start.mandatory, this.start.optional);
	}
}

export class LanguageContextServiceImpl implements ILanguageContextService, vscode.Disposable {

	private static readonly defaultCachePopulationBudget: number = 500;
	private static readonly defaultCachePopulationRaceTimeout: number = 20;
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	readonly _serviceBrand: undefined;

	private readonly disposables: DisposableStore;

	private readonly isDebugging: boolean;
	private _isActivated: Promise<boolean> | undefined;
	private telemetrySender: TelemetrySender;

	private readonly runnableResultManager: RunnableResultManager;
	private readonly neighborFileModel: NeighborFileModel;

	private pendingRequest: PendingRequestInfo | undefined;
	private inflightCachePopulationRequest: InflightRequestInfo | undefined;
	private onTimeoutData: OnTimeoutData | undefined;
	private cachePopulationTimeout: number;
	private usageMode: ContextItemUsageMode;
	private includeDocumentation: boolean;

	private _onCachePopulated: vscode.EventEmitter<OnCachePopulatedEvent>;
	public readonly onCachePopulated: vscode.Event<OnCachePopulatedEvent>;

	private _onContextComputed: vscode.EventEmitter<OnContextComputedEvent>;
	public readonly onContextComputed: vscode.Event<OnContextComputedEvent>;

	private _onContextComputedOnTimeout: vscode.EventEmitter<OnContextComputedOnTimeoutEvent>;
	public readonly onContextComputedOnTimeout: vscode.Event<OnContextComputedOnTimeoutEvent>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService
	) {
		this.isDebugging = process.execArgv.some((arg) => /^--(?:inspect|debug)(?:-brk)?(?:=\d+)?$/i.test(arg));
		this.telemetrySender = new TelemetrySender(telemetryService, logService);
		this.runnableResultManager = new RunnableResultManager();
		this.neighborFileModel = new NeighborFileModel();
		this.pendingRequest = undefined;
		this.inflightCachePopulationRequest = undefined;
		this.onTimeoutData = undefined;
		this.cachePopulationTimeout = this.getCachePopulationBudget();
		this.usageMode = this.getUsageMode();
		this.includeDocumentation = this.getIncludeDocumentation();

		this.disposables = new DisposableStore();
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContextMode.fullyQualifiedId)) {
				this.usageMode = this.getUsageMode();
			} else if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContextCacheTimeout.fullyQualifiedId)) {
				this.cachePopulationTimeout = this.getCachePopulationBudget();
			} else if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContextIncludeDocumentation.fullyQualifiedId)) {
				this.includeDocumentation = this.getIncludeDocumentation();
			}
		}));

		this._onCachePopulated = this.disposables.add(new vscode.EventEmitter<OnCachePopulatedEvent>());
		this.onCachePopulated = this._onCachePopulated.event;

		this._onContextComputed = this.disposables.add(new vscode.EventEmitter<OnContextComputedEvent>());
		this.onContextComputed = this._onContextComputed.event;

		this._onContextComputedOnTimeout = this.disposables.add(new vscode.EventEmitter<OnContextComputedOnTimeoutEvent>());
		this.onContextComputedOnTimeout = this._onContextComputedOnTimeout.event;
	}

	public dispose(): void {
		this.runnableResultManager.dispose();
		this.neighborFileModel.dispose();
		this.inflightCachePopulationRequest = undefined;
	}

	async isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean> {
		const languageId = typeof documentOrLanguageId === 'string' ? documentOrLanguageId : documentOrLanguageId.languageId;
		if (languageId !== 'typescript' && languageId !== 'typescriptreact') {
			return false;
		}
		if (this._isActivated === undefined) {
			this._isActivated = this.doIsTypeScriptActivated(languageId);
		}
		return this._isActivated;
	}

	private async doIsTypeScriptActivated(languageId: string): Promise<boolean> {

		let activated = false;

		try {
			// Check that the TypeScript extension is installed and runs in the same extension host.
			const typeScriptExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
			if (typeScriptExtension === undefined) {
				return false;
			}

			// Make sure the TypeScript extension is activated.
			await typeScriptExtension.activate();

			// Send a ping request to see if the TS server plugin got installed correctly.
			const response: protocol.PingResponse | undefined = await vscode.commands.executeCommand('typescript.tsserverRequest', '_.copilot.ping', LanguageContextServiceImpl.ExecConfig, CancellationToken.None);
			this.telemetrySender.sendActivationTelemetry(response, undefined);
			if (response !== undefined) {
				if (response.body?.kind === 'ok') {
					this.logService.info('TypeScript server plugin activated.');
					activated = true;
				} else {
					this.logService.error('TypeScript server plugin not activated:', response.body?.message ?? 'Message not provided.');
				}
			} else {
				this.logService.error('TypeScript server plugin not activated:', 'No ping response received.');
			}
		} catch (error) {
			this.telemetrySender.sendActivationTelemetry(undefined, error);
			this.logService.error('Error pinging TypeScript server plugin:', error);
		}

		return activated;
	}

	async populateCache(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): Promise<void> {
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}
		if (this.inflightCachePopulationRequest !== undefined) {
			if (!this.inflightCachePopulationRequest.matches(document, position)) {
				// We have a request running. Do not issue another cache request but remember the pending request.
				this.pendingRequest = new PendingRequestInfo(document, position, context);
			}
			return;
		}
		const startTime = Date.now();
		const contextRequestState = this.runnableResultManager.getContextRequestState(document, position);
		if (contextRequestState !== undefined && contextRequestState.server.length === 0) {
			// There is nothing to do on the server. Cache is up to date.
			return;
		}
		const neighborFiles: string[] = this.neighborFileModel.getNeighborFiles(document);
		const timeBudget = this.cachePopulationTimeout;
		const willLogRequestTelemetry = this.telemetrySender.willLogRequestTelemetry(context);
		const args: ComputeContextRequestArgs = ComputeContextRequestArgs.create(
			document, position, context, startTime, timeBudget, willLogRequestTelemetry,
			neighborFiles, contextRequestState?.server, this.includeDocumentation
		);
		try {
			const isDebugging = this.isDebugging;
			const forDebugging: ContextItem[] | undefined = isDebugging ? [] : undefined;
			const tokenSource = new vscode.CancellationTokenSource();
			const token = tokenSource.token;
			const documentVersion = document.version;
			const cacheState = this.runnableResultManager.getCacheState();
			let response: protocol.ComputeContextResponse;
			let inflightRequest: InflightRequestInfo | undefined = undefined;
			try {
				const promise: Thenable<protocol.ComputeContextResponse> = vscode.commands.executeCommand('typescript.tsserverRequest', '_.copilot.context', args, LanguageContextServiceImpl.ExecConfig, token);
				inflightRequest = new InflightRequestInfo(document, position, context, tokenSource, promise);
				this.inflightCachePopulationRequest = inflightRequest;
				response = await promise;
			} finally {
				if (this.inflightCachePopulationRequest === inflightRequest) {
					this.inflightCachePopulationRequest = undefined;
				}
				tokenSource.dispose();
			}
			const timeTaken = Date.now() - startTime;
			if (protocol.ComputeContextResponse.isCancelled(response)) {
				this.telemetrySender.sendRequestCancelledTelemetry(context, timeTaken);
			} else if (protocol.ComputeContextResponse.isOk(response)) {
				const body: protocol.ComputeContextResponse.OK = response.body;
				const contextItemResult = new ContextItemResultBuilder(timeTaken);
				const { resolved, cached, referenced, serverComputed } = this.runnableResultManager.update(document, documentVersion, position, context, body, contextRequestState);
				contextItemResult.cachedItems += cached;
				contextItemResult.referencedItems += referenced;
				contextItemResult.serverComputed = serverComputed;
				if (resolved.length > 0) {
					// Update the stats for telemetry.
					for (const runnableResult of resolved) {
						for (const converted of contextItemResult.update(runnableResult)) {
							forDebugging?.push(converted.item);
						}
					}
				}
				contextItemResult.updateResponse(body, token);
				this.telemetrySender.sendRequestTelemetry(document, position, context, contextItemResult, timeTaken, { before: cacheState, after: this.runnableResultManager.getCacheState() }, undefined);
				isDebugging && forDebugging?.length;
				this._onCachePopulated.fire({ document, position, source: context.source, items: resolved, summary: contextItemResult });
			} else if (protocol.ComputeContextResponse.isError(response)) {
				this.telemetrySender.sendRequestFailureTelemetry(context, response.body);
				console.error('Error populating cache:', response.body.message, response.body.stack);
			}
		} catch (error) {
			this.logService.error(error, `Error populating cache for document: ${document.uri.toString()} at position: ${position.line + 1}:${position.character + 1}`);
		}
		if (this.pendingRequest !== undefined) {
			// We had a pending request. Clear it and try to populate the cache again.
			const pendingRequest = this.pendingRequest;
			this.pendingRequest = undefined;
			const textEditor = vscode.window.activeTextEditor;
			if (textEditor !== undefined) {
				const document = textEditor.document;
				if (document.uri.toString() === pendingRequest.document && document.version === pendingRequest.version && document.validatePosition(pendingRequest.position).isEqual(pendingRequest.position)) {
					this.populateCache(document, pendingRequest.position, pendingRequest.context).catch(() => { /* handled in populateCache */ });
				}
			}
		}
	}

	public async *getContext(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, token: vscode.CancellationToken): AsyncIterable<ContextItem> {
		this.onTimeoutData = undefined;
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}

		const startTime = Date.now();
		let cacheRequest = 'none';
		const cachePopulationRequestInflight = this.inflightCachePopulationRequest !== undefined && this.inflightCachePopulationRequest.matchesDocument(document);
		if (cachePopulationRequestInflight) {
			this.onTimeoutData = new OnTimeoutData(document, position);
			cacheRequest = 'inflight';
		}
		if (token.isCancellationRequested) {
			this.telemetrySender.sendRequestCancelledTelemetry(context, Date.now() - startTime);
			return;
		}
		const isDebugging = this.isDebugging;
		const forDebugging: ContextItem[] | undefined = isDebugging ? [] : undefined;
		const contextItemResult = new ContextItemResultBuilder(Date.now() - startTime);
		if (this.onTimeoutData !== undefined) {
			this.onTimeoutData.resultBuilder = contextItemResult;
		}
		const characterBudget = this.getCharacterBudget(context, document);
		// We first collect all items to yield so that the state of the cache doesn't change underneath us.
		// This could otherwise happen if the cache population request finishes while we are yielding items.
		const itemsToYield: ContextItem[] = [];
		const { mandatory, optional, onTimeout } = this.getRunnables(document, position, cachePopulationRequestInflight);
		if (this.onTimeoutData !== undefined) {
			this.onTimeoutData.addRunnableResults(onTimeout);
		}
		outer: for (const runnableResult of mandatory) {
			for (const { item, size } of contextItemResult.update(runnableResult, true)) {
				forDebugging?.push(item);
				characterBudget.spend(size);
				if (characterBudget.isExhausted()) {
					break outer;
				}
				itemsToYield.push(item);
			}
		}
		if (!characterBudget.isOptionalExhausted()) {
			outer: for (const runnableResult of optional) {
				for (const { item, size } of contextItemResult.update(runnableResult, true)) {
					forDebugging?.push(item);
					characterBudget.spend(size);
					if (characterBudget.isOptionalExhausted()) {
						break outer;
					}
					itemsToYield.push(item);
				}
			}
		}
		if (!token.isCancellationRequested) {
			for (const item of itemsToYield) {
				if (token.isCancellationRequested) {
					this.onTimeoutData = undefined;
					break;
				}
				yield item;
			}

			// Recheck for an inflight request and join it if it is for the same document and position.
			if (this.inflightCachePopulationRequest !== undefined && this.inflightCachePopulationRequest.matchesDocument(document)) {
				cacheRequest = 'inflight';
				// We have an inflight request for the same document and position.
				// We wait for the server promise to resolve and then see if we can yield items from the
				// inflight request.
				const timeOut = Math.max(0, Math.min(context.timeBudget ?? LanguageContextServiceImpl.defaultCachePopulationRaceTimeout, LanguageContextServiceImpl.defaultCachePopulationRaceTimeout));
				const result = await Promise.race([this.inflightCachePopulationRequest.serverPromise, new Promise((resolve) => setTimeout(resolve, timeOut)).then(() => 'timedOut')]);
				// The server promised resolved first. So the inflight request is done.
				if (result !== 'timedOut') {
					this.inflightCachePopulationRequest = undefined;
					if (this.onTimeoutData !== undefined) {
						this.onTimeoutData = undefined;
						const runnableResults = this.runnableResultManager.getCachedRunnableResults(document, position, protocol.EmitMode.ClientBasedOnTimeout);
						for (const runnableResult of runnableResults) {
							for (const { item } of contextItemResult.update(runnableResult)) {
								forDebugging?.push(item);
								yield item;
							}
						}
						cacheRequest = 'awaited';
					}
				}
			}
		} else {
			this.onTimeoutData = undefined;
		}

		const isSpeculativeRequest = context.proposedEdits !== undefined;
		if (isSpeculativeRequest) {
			this.telemetrySender.sendSpeculativeRequestTelemetry(context, this.runnableResultManager.getRequestId() ?? 'unknown', contextItemResult.stats.yielded);
		} else {
			const cacheState = this.runnableResultManager.getCacheState();
			contextItemResult.path = this.runnableResultManager.getNodePath();
			contextItemResult.cancelled = token.isCancellationRequested;
			contextItemResult.serverTime = 0;
			contextItemResult.contextComputeTime = 0;
			contextItemResult.fromCache = true;
			this.telemetrySender.sendRequestTelemetry(
				document, position, context, contextItemResult, Date.now() - startTime,
				{ before: cacheState, after: cacheState }, cacheRequest
			);
			isDebugging && forDebugging?.length;
			this._onContextComputed.fire({
				document, position, source: context.source, items: itemsToYield, summary: contextItemResult
			});
		}
		return;
	}

	private getRunnables(document: vscode.TextDocument, position: vscode.Position, cachePopulationInflight: boolean): { mandatory: readonly ResolvedRunnableResult[]; optional: readonly ResolvedRunnableResult[]; onTimeout: readonly ResolvedRunnableResult[] } {
		const mandatory: ResolvedRunnableResult[] = [];
		const optional: ResolvedRunnableResult[] = [];
		const onTimeout: ResolvedRunnableResult[] = [];
		for (const runnable of this.runnableResultManager.getCachedRunnableResults(document, position)) {
			if (cachePopulationInflight && runnable.cache?.emitMode === protocol.EmitMode.ClientBasedOnTimeout) {
				onTimeout.push(runnable);
			} else {
				const priority = runnable.priority;
				if (priority === protocol.Priorities.Expression || priority === protocol.Priorities.Locals || priority === protocol.Priorities.Inherited || priority === protocol.Priorities.Traits) {
					mandatory.push(runnable);
				} else {
					optional.push(runnable);
				}
			}
		}
		return { mandatory, optional, onTimeout };
	}

	public getContextOnTimeout(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): readonly ContextItem[] | undefined {
		try {
			if (this.onTimeoutData === undefined) {
				return [];
			}
			if (!this.onTimeoutData.matches(document, position) || this.onTimeoutData.resultBuilder === undefined) {
				return [];
			}
			const result: ContextItem[] = [];
			const contextItemResult = this.onTimeoutData.resultBuilder;
			for (const runnableResult of this.onTimeoutData.runnableResults) {
				for (const { item } of contextItemResult.update(runnableResult, true)) {
					result.push(item);
				}
			}
			return result;
		} finally {
			this.onTimeoutData = undefined;
		}
	}

	private getCachePopulationBudget(): number {
		const result = this.configurationService.getExperimentBasedConfig(ConfigKey.TypeScriptLanguageContextCacheTimeout, this.experimentationService);
		return result ?? LanguageContextServiceImpl.defaultCachePopulationBudget;
	}

	private getUsageMode(): ContextItemUsageMode {
		const value = this.configurationService.getExperimentBasedConfig(ConfigKey.TypeScriptLanguageContextMode, this.experimentationService);
		return ContextItemUsageMode.fromString(value);
	}

	private getIncludeDocumentation(): boolean {
		return this.configurationService.getExperimentBasedConfig<boolean>(ConfigKey.TypeScriptLanguageContextIncludeDocumentation, this.experimentationService);
	}

	private getCharacterBudget(context: RequestContext, document: vscode.TextDocument): CharacterBudget {
		const chars = (context.tokenBudget ?? currentTokenBudget) * 4;
		switch (this.usageMode) {
			case ContextItemUsageMode.minimal:
				return new CharacterBudget(chars, 0);
			case ContextItemUsageMode.double:
				return new CharacterBudget(chars, Math.min(chars, document.getText().length));
			case ContextItemUsageMode.fillHalf:
				return new CharacterBudget(chars, Math.floor(chars / 2));
			case ContextItemUsageMode.fill:
				return new CharacterBudget(chars, chars);
			default:
				return new CharacterBudget(chars, chars);
		}
	}
}

interface TokenBudgetProvider {
	getTokenBudget(document: vscode.TextDocument): number;
}

class CachePopulationTrigger implements vscode.Disposable {

	private readonly languageContextService: ILanguageContextService;
	private readonly tokenBudgetProvider: TokenBudgetProvider;
	private readonly disposables: DisposableStore;
	private readonly selectionChangeDebouncer: ThrottledDebouncer;

	private lastDocumentChange: { document: string; time: number } | undefined;

	constructor(languageContextService: ILanguageContextService, tokenBudgetProvider: TokenBudgetProvider) {
		this.languageContextService = languageContextService;
		this.tokenBudgetProvider = tokenBudgetProvider;
		this.disposables = new DisposableStore();
		this.lastDocumentChange = undefined;

		this.selectionChangeDebouncer = this.disposables.add(new ThrottledDebouncer());
		this.disposables.add(vscode.workspace.onDidChangeTextDocument((event) => {
			// console.log(`Text document change ${Date.now()}`);
			this.didChangeTextDocument(event);
		}));

		this.disposables.add(vscode.window.onDidChangeActiveTextEditor((editor) => {
			this.didChangeActiveTextEditor(editor);
		}));

		this.disposables.add(vscode.window.onDidChangeTextEditorSelection(async (event) => {
			// console.log(`Selection ${Date.now()}`);
			this.didChangeTextEditorSelection(event);
		}));
		this.disposables.add(vscode.languages.registerInlineCompletionItemProvider([{ scheme: 'file', language: 'typescript' }, { scheme: 'file', language: 'typescriptreact' }], {
			provideInlineCompletionItems: async (document, position, context, _token) => {
				// console.log(`Inline completion ${Date.now()}`);
				this.onInlineCompletion(document, position, context);
				return undefined;
			}
		}, { debounceDelayMs: 0, groupId: 'contextService' }));
	}

	public dispose() {
		this.disposables.dispose();
	}

	private didChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
		const time = Date.now();
		this.lastDocumentChange = undefined;
		const document = event.document;
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}
		if (event.contentChanges.length === 0) {
			return;
		}
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor === undefined || activeEditor.document.uri.toString() !== document.uri.toString()) {
			return;
		}
		this.lastDocumentChange = { document: document.uri.toString(), time: time };
	}

	private didChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
		if (this.lastDocumentChange === undefined) {
			return;
		}
		if (editor === undefined) {
			this.lastDocumentChange = undefined;
			return;
		}
		const document = editor.document;
		if (this.lastDocumentChange.document !== document.uri.toString()) {
			this.lastDocumentChange = undefined;
		}
	}

	private didChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
		const document = event.textEditor.document;
		const tokenBudget = this.tokenBudgetProvider.getTokenBudget(document);
		if (tokenBudget <= 0) {
			// There is no token budget left, so we don't want to trigger the cache population.
			return;
		}
		const position = this.getPosition(event);
		if (position === undefined) {
			this.selectionChangeDebouncer.cancel();
			return;
		}

		try {
			if (event.kind === vscode.TextEditorSelectionChangeKind.Command || event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
				this.selectionChangeDebouncer.cancel();
				this.populateCache(document, position, tokenBudget, undefined, TriggerKind.selection, false);
			}
			this.selectionChangeDebouncer.trigger(() => {
				this.populateCache(document, position, tokenBudget, undefined, TriggerKind.selection, true);
			});
		} catch (error) {
			console.error(error);
		}
	}

	private onInlineCompletion(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext): void {
		const tokenBudget = this.tokenBudgetProvider.getTokenBudget(document);
		if (tokenBudget <= 0) {
			// There is no token budget left, so we don't want to trigger the cache population.
			return;
		}
		this.populateCache(document, position, tokenBudget, context.requestUuid, TriggerKind.completion, false);
	}

	private getPosition(event: vscode.TextEditorSelectionChangeEvent): vscode.Position | undefined {
		const time = Date.now();
		const activeEditor = vscode.window.activeTextEditor;
		if (event.textEditor !== activeEditor) {
			return undefined;
		}
		const document = event.textEditor.document;
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}
		if (event.selections.length !== 1) {
			return undefined;
		}
		const range = event.selections[0];
		if (!range.isEmpty) {
			return undefined;
		}
		const line = document.lineAt(range.start.line);
		const end = line.text.substring(range.start.character);
		// If we are not on an empty line or the end of the line is not empty, we don't want to trigger the context request.
		if (line.text.trim().length !== 0 && end.length > 0) {
			return undefined;
		}

		// If the last document change was within 500 ms, we don't want to trigger the context request. Instead we wait for the next change or
		// a normal inline completion request.
		if (this.lastDocumentChange !== undefined && this.lastDocumentChange.document === document.uri.toString() && time - this.lastDocumentChange.time < 500) {
			return undefined;
		}
		return range.start;
	}

	private populateCache(document: vscode.TextDocument, position: vscode.Position, tokenBudget: number, requestId: string | undefined, trigger: TriggerKind, check: boolean): void {
		if (check) {
			const activeTextEditor = vscode.window.activeTextEditor;
			if (activeTextEditor === undefined || activeTextEditor.document.uri.toString() !== document.uri.toString()) {
				return;
			}
			const selections = activeTextEditor.selections;
			if (selections === undefined || selections.length !== 1) {
				return;
			}
			const selection = selections[0];
			if (!selection.isEmpty || selection.start.line !== position.line || selection.start.character !== position.character) {
				return;
			}
		}
		const context: RequestContext = {
			requestId: requestId ?? generateUuid(),
			timeBudget: 50,
			tokenBudget: tokenBudget,
			source: KnownSources.populateCache,
			trigger: trigger,
			proposedEdits: undefined
		};
		this.languageContextService.populateCache(document, position, context).catch(() => {
			// Error got log inside the cache population call.
		});
	}
}

async function* mapAsyncIterable<T, U>(
	source: AsyncIterable<T>,
	transform: (item: T) => U | undefined
): AsyncIterable<U> {
	for await (const item of source) {
		const result = transform(item);
		if (result !== undefined) {
			yield result;
		}
	}
}

const showContextInspectorViewContextKey = `github.copilot.chat.showContextInspectorView`;
export class InlineCompletionContribution implements vscode.Disposable, TokenBudgetProvider {

	private disposables: DisposableStore;

	private registrations: DisposableStore | undefined;
	private readonly registrationQueue: Queue<void>;

	private readonly telemetrySender: TelemetrySender;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ILogService readonly logService: ILogService,
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@ILanguageContextService private readonly languageContextService: ILanguageContextService,
		@ILanguageContextProviderService private readonly languageContextProviderService: ILanguageContextProviderService,
	) {
		this.registrations = undefined;
		this.telemetrySender = new TelemetrySender(telemetryService, logService);
		this.registrationQueue = new Queue<void>();

		this.disposables = new DisposableStore();
		if (languageContextService instanceof LanguageContextServiceImpl) {
			this.disposables.add(vscode.commands.registerCommand('github.copilot.debug.showContextInspectorView', async () => {
				await vscode.commands.executeCommand('setContext', showContextInspectorViewContextKey, true);
				await vscode.commands.executeCommand('context-inspector.focus');
			}));
			this.disposables.add(vscode.window.registerTreeDataProvider('context-inspector', new InspectorDataProvider(languageContextService)));
		}

		// Check if there are any TypeScript files open in the workspace.
		const open = vscode.workspace.textDocuments.some((document) => document.languageId === 'typescript' || document.languageId === 'typescriptreact');
		if (open) {
			this.typeScriptFileOpen();
		} else {
			const disposable = vscode.workspace.onDidOpenTextDocument((document) => {
				if (document.languageId === 'typescript' || document.languageId === 'typescriptreact') {
					disposable.dispose();
					this.typeScriptFileOpen();
				}
			});
		}
	}

	dispose() {
		this.registrations?.dispose();
		this.disposables.dispose();
		this.registrationQueue.dispose();
	}

	private typeScriptFileOpen(): void {
		this.checkRegistration();
		this.disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContext.fullyQualifiedId)) {
				this.checkRegistration();
			}
		}));
	}

	private checkRegistration(): void {
		this.registrationQueue.queue(async () => {
			const value = this.getConfig();
			if (value === 'on') {
				await this.register();
			} else {
				this.unregister();
			}
		}).catch((error) => this.logService.error(error, 'Error checking TypeScript context provider registration'));
	}

	private async register(): Promise<void> {
		if (! await this.isTypeScriptRunning()) {
			return;
		}

		const languageContextService = this.languageContextService;
		const logService = this.logService;
		try {
			if (! await languageContextService.isActivated('typescript')) {
				return;
			}

			if (this.registrations !== undefined) {
				this.registrations.dispose();
				this.registrations = undefined;
			}

			this.registrations = new DisposableStore();
			this.registrations.add(new CachePopulationTrigger(this.languageContextService, this));

			const telemetrySender = this.telemetrySender;
			const self = this;
			const resolver: Copilot.ContextResolver<Copilot.SupportedContextItem> = {
				resolve(request: Copilot.ResolveRequest, token: vscode.CancellationToken): Promise<Copilot.SupportedContextItem[]> | AsyncIterable<Copilot.SupportedContextItem> {
					// console.log(`Resolve request ${Date.now()}`);
					const isSpeculativeRequest = request.documentContext.proposedEdits !== undefined;
					const [document, position] = self.getDocumentAndPosition(request, token);
					if (document === undefined || position === undefined) {
						return Promise.resolve([]);
					}
					const tokenBudget = self.getTokenBudget(document);
					if (tokenBudget <= 0) {
						telemetrySender.sendRequestTelemetry(document, position, { requestId: request.completionId, source: KnownSources.completion }, ContextItemSummary.DefaultExhausted, 0, undefined, undefined);
						return Promise.resolve([]);
					}
					const context: RequestContext = {
						requestId: request.completionId,
						opportunityId: request.opportunityId,
						timeBudget: request.timeBudget,
						tokenBudget: tokenBudget,
						source: request.source === 'nes' ? KnownSources.nes : KnownSources.completion,
						trigger: TriggerKind.completion,
						proposedEdits: isSpeculativeRequest ? [] : undefined,
						sampleTelemetry: self.getSampleTelemetry(request.activeExperiments)
					};
					const items = languageContextService.getContext(document, position, context, token);
					if (Array.isArray(items)) {
						const convertedItems: Copilot.SupportedContextItem[] = [];
						for (const item of items) {
							const converted = self.convertItem(item);
							if (converted === undefined) {
								continue;
							}
							convertedItems.push(converted);
						}
						return Promise.resolve(convertedItems);
					} else if (typeof (items as AsyncIterable<ContextItem>)[Symbol.asyncIterator] === 'function') {
						return mapAsyncIterable(items as AsyncIterable<ContextItem>, (item) => self.convertItem(item));
					} else if (items instanceof Promise) {
						return items.then((resolvedItems) => {
							const convertedItems: Copilot.SupportedContextItem[] = [];
							for (const item of resolvedItems) {
								const converted = self.convertItem(item);
								if (converted === undefined) {
									continue;
								}
								convertedItems.push(converted);
							}
							return convertedItems;
						});
					} else {
						return Promise.resolve([]);
					}
				}
			};
			if (typeof languageContextService.getContextOnTimeout === 'function') {
				resolver.resolveOnTimeout = (request) => {
					if (typeof languageContextService.getContextOnTimeout !== 'function') {
						return;
					}
					const [document, position] = self.getDocumentAndPosition(request);
					if (document === undefined || position === undefined) {
						return;
					}
					const context: RequestContext = {
						requestId: request.completionId,
						source: KnownSources.completion,
					};
					const items = languageContextService.getContextOnTimeout(document, position, context);
					if (items === undefined) {
						return;
					}
					const result: Copilot.SupportedContextItem[] = [];
					for (const item of items) {
						const converted = self.convertItem(item);
						if (converted === undefined) {
							continue;
						}
						result.push(converted);
					}
					return result;
				};
			}
			const provider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'typescript-ai-context-provider',
				selector: { scheme: 'file', language: 'typescript' },
				resolver: resolver
			};

			// For legacy register with the copilot API
			const copilotAPI = await this.getCopilotApi();
			if (copilotAPI !== undefined) {
				this.registrations.add(copilotAPI.registerContextProvider(provider));
			}

			// Register with chat always.
			this.registrations.add(this.languageContextProviderService.registerContextProvider(provider, [ProviderTarget.Completions]));
			this.telemetrySender.sendInlineCompletionProviderTelemetry(KnownSources.completion, true);
			logService.info('Registered TypeScript context provider with Copilot inline completions.');
		} catch (error) {
			logService.error('Error checking if server plugin is installed:', error);
		}
	}

	private async isTypeScriptRunning(): Promise<boolean> {
		// Check that the TypeScript extension is installed and runs in the same extension host.
		const typeScriptExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
		if (typeScriptExtension === undefined) {
			this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.TypescriptPlugin, 'TypeScript extension not found', undefined);
			this.logService.error('TypeScript extension not found');
			return false;
		}
		try {
			await typeScriptExtension.activate();
			return true;
		} catch (error) {
			if (error instanceof Error) {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.TypescriptPlugin, error.message, error.stack);
				this.logService.error('Error checking if TypeScript plugin is installed:', error.message);
			} else {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.TypescriptPlugin, 'Unknown error', undefined);
				this.logService.error('Error checking if TypeScript plugin is installed: Unknown error');
			}
			return false;
		}
	}

	private getDocumentAndPosition(request: Copilot.ResolveRequest, token?: vscode.CancellationToken): [vscode.TextDocument | undefined, vscode.Position | undefined] {
		let document: vscode.TextDocument | undefined;
		if (vscode.window.activeTextEditor?.document.uri.toString() === request.documentContext.uri) {
			document = vscode.window.activeTextEditor.document;
		} else {
			document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === request.documentContext.uri);
		}
		if (document === undefined) {
			this.telemetrySender.sendIntegrationTelemetry(request.completionId, request.documentContext.uri);
			return [undefined, undefined];
		}
		const requestPos = request.documentContext.position;
		const position = requestPos !== undefined ? new vscode.Position(requestPos.line, requestPos.character) : document.positionAt(request.documentContext.offset);
		if (document.version > request.documentContext.version) {
			if (!token?.isCancellationRequested) {
				this.telemetrySender.sendIntegrationTelemetry(request.completionId, request.documentContext.uri, `Version mismatch: ${document.version} !== ${request.documentContext.version}`);
			}
			return [undefined, undefined];
		}
		if (document.version < request.documentContext.version) {
			this.telemetrySender.sendIntegrationTelemetry(request.completionId, request.documentContext.uri, `Version mismatch: ${document.version} !== ${request.documentContext.version}`);
			return [undefined, undefined];
		}
		return [document, position];
	}

	private convertItem(item: ContextItem): Copilot.SupportedContextItem | undefined {
		if (item.kind === ContextKind.Snippet) {
			const converted: Copilot.CodeSnippet = {
				importance: item.priority * 100,
				id: item.id,
				uri: item.uri.toString(),
				value: item.value
			};
			if (item.additionalUris !== undefined) {
				converted.additionalUris = item.additionalUris.map((uri) => uri.toString());
			}
			return converted;
		} else if (item.kind === ContextKind.Trait) {
			const converted: Copilot.Trait = {
				importance: item.priority * 100,
				id: item.id,
				name: item.name,
				value: item.value
			};
			return converted;
		} else if (item.kind === ContextKind.DiagnosticBag) {
			const converted: Copilot.DiagnosticBag = {
				importance: item.priority * 100,
				id: item.id,
				uri: item.uri,
				values: item.values
			};
			return converted;
		}
		return undefined;
	}

	private async getCopilotApi(): Promise<Copilot.ContextProviderApiV1 | undefined> {
		const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
		if (copilotExtension === undefined) {
			// this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.CopilotExtension, 'Copilot extension not found', undefined);
			// this.logService.error('Copilot extension not found');
			return undefined;
		}
		try {
			const api = await copilotExtension.activate();
			return api.getContextProviderAPI('v1');
		} catch (error) {
			if (error instanceof Error) {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.CopilotExtension, error.message, error.stack);
				this.logService.error('Error activating Copilot extension:', error.message);
			} else {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.CopilotExtension, 'Unknown error', undefined);
				this.logService.error('Error activating Copilot extension: Unknown error.');
			}
			return undefined;
		}
	}

	private unregister(): void {
		if (this.registrations !== undefined) {
			this.registrations.dispose();
			this.registrations = undefined;
		}
		this.telemetrySender.sendInlineCompletionProviderTelemetry(KnownSources.completion, false);
	}

	private getConfig(): 'off' | 'on' {
		const expFlag = this.configurationService.getExperimentBasedConfig(ConfigKey.TypeScriptLanguageContext, this.experimentationService);
		return expFlag === true ? 'on' : 'off';
	}

	public getTokenBudget(document: vscode.TextDocument): number {
		return Math.trunc((currentTokenBudget) - (document.getText().length / 4) - 256);
	}

	private getSampleTelemetry(activeExperiments: Map<string, string | number | boolean | string[]>): number {
		const value = activeExperiments.get('sampleTelemetry');
		if (value === undefined || value === null || value === false) {
			return 1;
		}
		if (value === true) {
			return 10;
		}
		if (typeof value === 'number') {
			return Math.max(1, Math.min(100, value));
		}
		return 1;
	}
}
