/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as inspector from 'inspector';

import type { API } from '@typescript/native/unstable/async';

import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { type ContextItem, type RequestContext, KnownSources } from '../../../../platform/languageServer/common/languageContextService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import * as protocol from '../../common/serverProtocol';
import { ContextItemResultBuilder, ResolvedRunnableResult } from '../types';
import { AbstractTSLanguageContextService, currentTokenBudget } from '../tsContextService';
import { computeContext as computeServerContext } from './api';
import { CharacterBudget, ComputeContextSession, ContextResult, RequestContext as ServerRequestContext, TokenBudgetExhaustedError } from './contextProvider';
import { CancellationTokenWithTimer, OperationCanceledException } from './typescripts';
import { TypeScript7Api } from './ts7Api';

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

type ComputeContextResult =
	| { readonly kind: 'ok'; readonly body: protocol.ComputeContextResponse.OK }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'failed'; readonly error: protocol.CustomResponse.Failed };

namespace ComputeContextResult {
	export const cancelled: ComputeContextResult = { kind: 'cancelled' };
	export const unavailable: ComputeContextResult = { kind: 'unavailable' };

	export function ok(body: protocol.ComputeContextResponse.OK): ComputeContextResult {
		return { kind: 'ok', body };
	}

	export function toErrorData(error: unknown): protocol.CustomResponse.Failed {
		return error instanceof Error
			? { error: protocol.ErrorCode.exception, message: error.message, stack: error.stack }
			: { error: protocol.ErrorCode.exception, message: 'Unknown error' };
	}

	export function failed(error: unknown): ComputeContextResult {
		return { kind: 'failed', error: toErrorData(error) };
	}
}

class InflightRequestInfo {
	public readonly document: string;
	public readonly position: vscode.Position;
	public readonly requestId: string;
	public readonly source: KnownSources | string;
	public readonly serverPromise: Promise<ComputeContextResult>;

	private readonly tokenSource: vscode.CancellationTokenSource;

	constructor(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, tokenSource: vscode.CancellationTokenSource, serverPromise: Promise<ComputeContextResult>) {
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

	public addRunnableResults(results: readonly ResolvedRunnableResult[]): void {
		this.runnableResults.push(...results);
	}

	public matches(document: vscode.TextDocument, position: vscode.Position): boolean {
		return this.document === document.uri.toString() && this.version === document.version && this.position.isEqual(position);
	}
}

export class TS7LanguageContextService extends AbstractTSLanguageContextService {
	private static readonly defaultCachePopulationRaceTimeout: number = 20;

	private readonly nativeApi: TypeScript7Api;
	private readonly isDebugging: boolean;
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
		this.isDebugging = inspector?.url() !== undefined;
		this.nativeApi = this.disposables.add(new TypeScript7Api(logService));
		this.disposables.add(this.nativeApi.onDidReconnect(() => this.reconnect()));
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
		return await this.getApi() !== undefined;
	}

	async populateCache(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): Promise<void> {
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}
		if (this.inflightCachePopulationRequest !== undefined) {
			if (!this.inflightCachePopulationRequest.matches(document, position)) {
				this.pendingRequest = new PendingRequestInfo(document, position, context);
			}
			return;
		}
		const startTime = Date.now();
		const contextRequestState = this.runnableResultManager.getContextRequestState(document, position);
		if (contextRequestState !== undefined && contextRequestState.server.length === 0) {
			return;
		}
		const neighborFiles = this.neighborFileModel.getNeighborFiles(document);
		const timeBudget = this.cachePopulationTimeout;
		try {
			const isDebugging = this.isDebugging;
			const forDebugging: ContextItem[] | undefined = isDebugging ? [] : undefined;
			const tokenSource = new vscode.CancellationTokenSource();
			const token = tokenSource.token;
			const documentVersion = document.version;
			const cacheState = this.runnableResultManager.getCacheState();
			let result: ComputeContextResult;
			const promise = this.computeContext(document, position, context, startTime, timeBudget, neighborFiles, contextRequestState?.server, token);
			const inflightRequest = new InflightRequestInfo(document, position, context, tokenSource, promise);
			this.inflightCachePopulationRequest = inflightRequest;
			try {
				result = await promise;
			} finally {
				if (this.inflightCachePopulationRequest === inflightRequest) {
					this.inflightCachePopulationRequest = undefined;
				}
				tokenSource.dispose();
			}
			if (result.kind === 'unavailable') {
				return;
			}
			const timeTaken = Date.now() - startTime;
			if (result.kind === 'cancelled') {
				this.telemetrySender.sendRequestCancelledTelemetry(context, timeTaken);
			} else if (result.kind === 'failed') {
				this.telemetrySender.sendRequestFailureTelemetry(context, result.error);
				this.logService.error(`Error computing TypeScript 7 context for document: ${document.uri.toString()} at position: ${position.line + 1}:${position.character + 1}`, result.error.stack ?? result.error.message);
			} else {
				const body = result.body;
				const contextItemResult = new ContextItemResultBuilder(timeTaken);
				const { resolved, cached, referenced, serverComputed } = this.runnableResultManager.update(document, documentVersion, position, context, body, contextRequestState);
				contextItemResult.cachedItems += cached;
				contextItemResult.referencedItems += referenced;
				contextItemResult.serverComputed = serverComputed;
				for (const runnableResult of resolved) {
					for (const converted of contextItemResult.update(runnableResult)) {
						forDebugging?.push(converted.item);
					}
				}
				contextItemResult.updateResponse(body, token);
				this.telemetrySender.sendRequestTelemetry(document, position, context, contextItemResult, timeTaken, { before: cacheState, after: this.runnableResultManager.getCacheState() }, undefined);
				// eslint-disable-next-line local/code-no-unused-expressions
				isDebugging && forDebugging?.length;
				this._onCachePopulated.fire({ document, position, source: context.source, items: resolved, summary: contextItemResult });
			}
		} catch (error) {
			this.telemetrySender.sendRequestFailureTelemetry(context, ComputeContextResult.toErrorData(error));
			this.logService.error(error, `Error populating cache for document: ${document.uri.toString()} at position: ${position.line + 1}:${position.character + 1}`);
		} finally {
			this.runPendingRequest();
		}
	}

	private async computeContext(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, startTime: number, timeBudget: number, neighborFiles: readonly string[], clientSideRunnableResults: readonly protocol.CachedContextRunnableResult[] | undefined, token: vscode.CancellationToken): Promise<ComputeContextResult> {
		try {
			const api = await this.getApi();
			if (api === undefined) {
				return ComputeContextResult.unavailable;
			}
			// Workaround for https://github.com/microsoft/typescript-go/issues/4916
			api.clearSourceFileCache();
			const snapshot = await api.updateSnapshot();
			try {
				if (token.isCancellationRequested) {
					return ComputeContextResult.cancelled;
				}
				const project = await snapshot.getDefaultProjectForFile({ uri: document.uri.toString() });
				if (project === undefined) {
					return ComputeContextResult.cancelled;
				}
				const sourceFile = await project.program.getSourceFile({ uri: document.uri.toString() });
				if (sourceFile === undefined || sourceFile.text !== document.getText()) {
					return ComputeContextResult.cancelled;
				}
				const cancellationToken = new CancellationTokenWithTimer(token, startTime, timeBudget, this.isDebugging);
				const session = new ComputeContextSession(project, cancellationToken);
				const cachedResults = clientSideRunnableResults ?? [];
				const requestContext = new ServerRequestContext(session, neighborFiles, new Map(cachedResults.map(result => [result.id, result])), this.includeDocumentation);
				const result = new ContextResult(
					new CharacterBudget((context.tokenBudget ?? 7 * 1024) * 4),
					new CharacterBudget(currentTokenBudget * 4),
					requestContext,
				);
				const computeStart = Date.now();
				try {
					const offset = sourceFile.getPositionOfLineAndCharacter(position.line, position.character);
					await computeServerContext(result, session, project, sourceFile, offset, cancellationToken);
				} catch (error) {
					if (error instanceof OperationCanceledException) {
						if (token.isCancellationRequested) {
							throw error;
						}
					} else if (!(error instanceof TokenBudgetExhaustedError)) {
						throw error;
					}
				}
				const endTime = Date.now();
				result.addTimings(endTime - startTime, endTime - computeStart);
				result.setTimedOut(cancellationToken.isTimedOut());
				return ComputeContextResult.ok(result.toJson());
			} finally {
				await snapshot.dispose();
			}
		} catch (error) {
			// Never reject: the same promise is raced by `getContext`.
			return error instanceof OperationCanceledException ? ComputeContextResult.cancelled : ComputeContextResult.failed(error);
		}
	}

	private runPendingRequest(): void {
		if (this.pendingRequest === undefined) {
			return;
		}
		const pendingRequest = this.pendingRequest;
		this.pendingRequest = undefined;
		const document = vscode.window.activeTextEditor?.document;
		if (document !== undefined && document.uri.toString() === pendingRequest.document && document.version === pendingRequest.version && document.validatePosition(pendingRequest.position).isEqual(pendingRequest.position)) {
			this.populateCache(document, pendingRequest.position, pendingRequest.context).catch(() => { /* handled in populateCache */ });
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
		const itemsToYield: ContextItem[] = [];
		const { mandatory, optional, onTimeout } = this.getRunnables(document, position, cachePopulationRequestInflight);
		this.onTimeoutData?.addRunnableResults(onTimeout);

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
					return;
				}
				yield item;
			}

			const inflightRequest = this.inflightCachePopulationRequest;
			if (inflightRequest !== undefined && inflightRequest.matchesDocument(document)) {
				cacheRequest = 'inflight';
				const timeout = Math.max(0, Math.min(context.timeBudget ?? TS7LanguageContextService.defaultCachePopulationRaceTimeout, TS7LanguageContextService.defaultCachePopulationRaceTimeout));
				const response = await Promise.race([
					inflightRequest.serverPromise,
					new Promise<'timedOut'>(resolve => setTimeout(() => resolve('timedOut'), timeout)),
				]);
				if (response !== 'timedOut') {
					if (this.onTimeoutData !== undefined) {
						this.onTimeoutData = undefined;
						for (const runnableResult of this.runnableResultManager.getCachedRunnableResults(document, position, protocol.EmitMode.ClientBasedOnTimeout)) {
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

		if (context.proposedEdits !== undefined) {
			this.telemetrySender.sendSpeculativeRequestTelemetry(context, this.runnableResultManager.getRequestId() ?? 'unknown', contextItemResult.stats.yielded);
		} else {
			const cacheState = this.runnableResultManager.getCacheState();
			contextItemResult.path = this.runnableResultManager.getNodePath();
			contextItemResult.cancelled = token.isCancellationRequested;
			contextItemResult.serverTime = 0;
			contextItemResult.contextComputeTime = 0;
			contextItemResult.fromCache = true;
			this.telemetrySender.sendRequestTelemetry(document, position, context, contextItemResult, Date.now() - startTime, { before: cacheState, after: cacheState }, cacheRequest);
			// eslint-disable-next-line local/code-no-unused-expressions
			isDebugging && forDebugging?.length;
			this._onContextComputed.fire({ document, position, source: context.source, items: itemsToYield, summary: contextItemResult });
		}
	}

	private getRunnables(document: vscode.TextDocument, position: vscode.Position, cachePopulationInflight: boolean): { mandatory: readonly ResolvedRunnableResult[]; optional: readonly ResolvedRunnableResult[]; onTimeout: readonly ResolvedRunnableResult[] } {
		const mandatory: ResolvedRunnableResult[] = [];
		const optional: ResolvedRunnableResult[] = [];
		const onTimeout: ResolvedRunnableResult[] = [];
		for (const runnable of this.runnableResultManager.getCachedRunnableResults(document, position)) {
			if (cachePopulationInflight && runnable.cache?.emitMode === protocol.EmitMode.ClientBasedOnTimeout) {
				onTimeout.push(runnable);
			} else if (runnable.priority === protocol.Priorities.Expression || runnable.priority === protocol.Priorities.Locals || runnable.priority === protocol.Priorities.Inherited || runnable.priority === protocol.Priorities.Traits) {
				mandatory.push(runnable);
			} else {
				optional.push(runnable);
			}
		}
		return { mandatory, optional, onTimeout };
	}

	public getContextOnTimeout(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): readonly ContextItem[] | undefined {
		try {
			if (this.onTimeoutData === undefined || !this.onTimeoutData.matches(document, position) || this.onTimeoutData.resultBuilder === undefined) {
				return [];
			}
			const result: ContextItem[] = [];
			for (const runnableResult of this.onTimeoutData.runnableResults) {
				for (const { item } of this.onTimeoutData.resultBuilder.update(runnableResult, true)) {
					result.push(item);
				}
			}
			return result;
		} finally {
			this.onTimeoutData = undefined;
		}
	}

	private async getApi(): Promise<API<true> | undefined> {
		return this.nativeApi.getApi();
	}

	private reconnect(): void {
		this.inflightCachePopulationRequest?.cancel();
		this.inflightCachePopulationRequest = undefined;
		this.pendingRequest = undefined;
		this.onTimeoutData = undefined;
		this.runnableResultManager.clear();
	}
}
