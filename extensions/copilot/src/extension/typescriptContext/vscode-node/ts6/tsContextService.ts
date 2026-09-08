/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { type ContextItem, type RequestContext, KnownSources } from '../../../../platform/languageServer/common/languageContextService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import * as protocol from '../../common/serverProtocol';
import { ContextItemResultBuilder, ResolvedRunnableResult } from '../types';
import { currentTokenBudget, AbstractTSLanguageContextService } from '../tsContextService';

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

export class TS6LanguageContextService extends AbstractTSLanguageContextService {

	private static readonly defaultCachePopulationRaceTimeout: number = 20;
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	readonly _serviceBrand: undefined;

	private readonly isDebugging: boolean;
	private _isActivated: Promise<boolean> | undefined;

	private pendingRequest: PendingRequestInfo | undefined;
	private inflightCachePopulationRequest: InflightRequestInfo | undefined;
	private onTimeoutData: OnTimeoutData | undefined;

	constructor(
		telemetryService: ITelemetryService,
		configurationService: IConfigurationService,
		experimentationService: IExperimentationService,
		logService: ILogService
	) {
		super(telemetryService, logService, configurationService, experimentationService);
		this.isDebugging = process.execArgv.some((arg) => /^--(?:inspect|debug)(?:-brk)?(?:=\d+)?$/i.test(arg));
		this.pendingRequest = undefined;
		this.inflightCachePopulationRequest = undefined;
		this.onTimeoutData = undefined;
	}

	public override dispose(): void {
		this.inflightCachePopulationRequest?.cancel();
		this.inflightCachePopulationRequest = undefined;
		super.dispose();
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
			const response: protocol.PingResponse | undefined = await vscode.commands.executeCommand('typescript.tsserverRequest', '_.copilot.ping', TS6LanguageContextService.ExecConfig, CancellationToken.None);
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
				const promise: Thenable<protocol.ComputeContextResponse> = vscode.commands.executeCommand('typescript.tsserverRequest', '_.copilot.context', args, TS6LanguageContextService.ExecConfig, token);
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
				// eslint-disable-next-line local/code-no-unused-expressions
				isDebugging && forDebugging?.length;
				this._onCachePopulated.fire({ document, position, source: context.source, items: resolved, summary: contextItemResult });
			} else if (protocol.ComputeContextResponse.isError(response)) {
				this.telemetrySender.sendRequestFailureTelemetry(context, response.body);
				this.logService.error('Error populating cache:', response.body.message);
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
				const timeOut = Math.max(0, Math.min(context.timeBudget ?? TS6LanguageContextService.defaultCachePopulationRaceTimeout, TS6LanguageContextService.defaultCachePopulationRaceTimeout));
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
			// eslint-disable-next-line local/code-no-unused-expressions
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
}
