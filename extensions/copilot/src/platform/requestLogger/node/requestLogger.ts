/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RequestMetadata } from '@vscode/copilot-api';
import { HTMLTracer, IChatEndpointInfo, RenderPromptResult } from '@vscode/prompt-tsx';
import { AsyncLocalStorage } from 'async_hooks';
import type { Event } from 'vscode';
import type { LanguageModelToolResult2 } from '../../../vscodeTypes';
import type { IModelAPIResponse } from '../../endpoint/common/endpointProvider';
import { CapturingToken } from '../common/capturingToken';
import { ILoggedPendingRequest, IRequestLogger, LoggedInfo, LoggedRequest, PendingLoggedChatRequest } from '../common/requestLogger';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IChatEndpoint } from '../../../platform/networking/common/networking';

const requestLogStorage = new AsyncLocalStorage<CapturingToken>();

/**
 * Correlation map for preserving CapturingToken across IPC boundaries.
 *
 * When requests cross the VS Code IPC boundary (e.g., BYOK providers),
 * AsyncLocalStorage context is lost. This map allows correlating requests
 * by storing the token before IPC and retrieving it on the other side.
 */
const capturingTokenCorrelationMap = new Map<string, CapturingToken>();

/**
 * Get the current CapturingToken from AsyncLocalStorage.
 * Returns undefined if not within a captureInvocation context.
 */
export function getCurrentCapturingToken(): CapturingToken | undefined {
	return requestLogStorage.getStore();
}

/**
 * Store the current CapturingToken with a correlation ID for cross-IPC retrieval.
 * Call this before making a request that will cross IPC boundaries.
 */
export function storeCapturingTokenForCorrelation(correlationId: string): void {
	const token = requestLogStorage.getStore();
	if (token) {
		capturingTokenCorrelationMap.set(correlationId, token);
	}
}

/**
 * Retrieve and remove a CapturingToken by correlation ID.
 * Returns undefined if no token was stored for this ID.
 */
export function retrieveCapturingTokenByCorrelation(correlationId: string): CapturingToken | undefined {
	const token = capturingTokenCorrelationMap.get(correlationId);
	if (token) {
		capturingTokenCorrelationMap.delete(correlationId);
	}
	return token;
}

/**
 * Run a function within a CapturingToken context without going through IRequestLogger.
 * Used to restore context after IPC boundary crossing.
 */
export function runWithCapturingToken<T>(token: CapturingToken, fn: () => T): T {
	return requestLogStorage.run(token, fn);
}

export abstract class AbstractRequestLogger extends Disposable implements IRequestLogger {
	declare _serviceBrand: undefined;

	public get promptRendererTracing() {
		return false;
	}

	public captureInvocation<T>(request: CapturingToken, fn: () => Promise<T>): Promise<T> {
		return requestLogStorage.run(request, () => fn());
	}

	public abstract logModelListCall(id: string, requestMetadata: RequestMetadata, models: IModelAPIResponse[]): void;
	public abstract logToolCall(id: string, name: string | undefined, args: unknown, response: LanguageModelToolResult2): void;

	public logContentExclusionRules(_repos: string[], _rules: { patterns: string[]; ifAnyMatch: string[]; ifNoneMatch: string[] }[], _durationMs: number): void {
		// no-op by default; concrete implementations can override
	}

	public logChatRequest(debugName: string, chatEndpoint: IChatEndpoint, chatParams: ILoggedPendingRequest): PendingLoggedChatRequest {
		return new PendingLoggedChatRequest(this, debugName, chatEndpoint, chatParams);
	}

	public abstract addPromptTrace(elementName: string, endpoint: IChatEndpointInfo, result: RenderPromptResult, trace: HTMLTracer): void;
	public abstract addEntry(entry: LoggedRequest): void;
	public abstract getRequests(): LoggedInfo[];
	public abstract getRequestById(id: string): LoggedInfo | undefined;
	abstract onDidChangeRequests: Event<void>;

	public enableWorkspaceEditTracing(): void {
		// no-op by default; concrete implementations can override
	}

	public disableWorkspaceEditTracing(): void {
		// no-op by default; concrete implementations can override
	}

	/** Current request being made to the LM. */
	protected get currentRequest() {
		return requestLogStorage.getStore();
	}
}
