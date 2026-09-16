/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import type { ILogService } from '../../../../log/common/log.js';
import type { IAgentConnection } from '../../../common/agentService.js';
import type { IAgentSubscription } from '../../../common/state/agentSubscription.js';
import { ContentEncoding } from '../../../common/state/protocol/commands.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../../common/state/protocol/errors.js';
import { SessionInputRequestKind, type SessionState, type SessionToolClientExecutionRequest } from '../../../common/state/protocol/channels-session/state.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ProtocolError } from '../../../common/state/sessionProtocol.js';
import { StateComponents, ToolCallContributorKind, type ToolCallResult, type ToolDefinition } from '../../../common/state/sessionState.js';

/** A client-owned tool request surfaced through session input-needed state. */
export interface IClientToolExecution {
	readonly request: SessionToolClientExecutionRequest;
	readonly rawInput: string;
}

/** Executes one client-owned tool request and produces its protocol result. */
export type ClientToolExecutor = (execution: IClientToolExecution, token: CancellationToken) => Promise<ToolCallResult>;

interface ITrackedExecution {
	readonly cancellation: CancellationTokenSource;
	promise?: Promise<void>;
	result?: ToolCallResult;
	completionDispatched: boolean;
	present: boolean;
	terminalError?: Error;
}

const enum SubscriptionErrorKind {
	Recoverable,
	Terminal,
}

class SessionClientToolError extends Error {
	constructor(message: string, readonly code: string) {
		super(message);
		this.name = 'SessionClientToolError';
	}
}

async function resolveToolInput(connection: IAgentConnection, request: SessionToolClientExecutionRequest): Promise<string> {
	const toolInput = request.toolCall.toolInput;
	if (toolInput === undefined) {
		return '{}';
	}
	if (typeof toolInput === 'string') {
		return toolInput;
	}
	const result = await connection.resourceRead(URI.parse(toolInput.uri));
	return result.encoding === ContentEncoding.Base64 ? decodeBase64(result.data).toString() : result.data;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string {
	return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
		? error.code
		: 'remoteSessionCreationFailed';
}

function toolFailure(error: unknown): ToolCallResult {
	return {
		success: false,
		pastTenseMessage: localize('remoteSessionDelegation.failed', "Couldn't create remote session"),
		error: {
			message: getErrorMessage(error),
			code: getErrorCode(error),
		},
	};
}

function classifySubscriptionError(error: Error): SubscriptionErrorKind {
	if (error instanceof ProtocolError) {
		switch (error.code) {
			case JsonRpcErrorCodes.InvalidRequest:
			case JsonRpcErrorCodes.MethodNotFound:
			case JsonRpcErrorCodes.InvalidParams:
			case AhpErrorCodes.SessionNotFound:
			case AhpErrorCodes.ProviderNotFound:
			case AhpErrorCodes.UnsupportedProtocolVersion:
			case AhpErrorCodes.NotFound:
				return SubscriptionErrorKind.Terminal;
		}
	}
	return SubscriptionErrorKind.Recoverable;
}

/** Publishes and executes one named client tool for one downstream session. */
export class SessionClientToolBinding extends Disposable {
	private readonly _subscriptionReference = this._register(new MutableDisposable<IReference<IAgentSubscription<SessionState>>>());
	private readonly _subscriptionListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _executions = new Map<string, ITrackedExecution>();
	private _definition: ToolDefinition | undefined;
	private _ready = this._createReady();
	private _terminalError: Error | undefined;

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _session: URI,
		private readonly _toolName: string,
		definition: ToolDefinition | undefined,
		private readonly _execute: ClientToolExecutor,
		private readonly _logService: ILogService,
	) {
		super();
		this._definition = definition;
		this._subscribe();
	}

	updateDefinition(definition: ToolDefinition | undefined): void {
		if (equals(this._definition, definition)) {
			return;
		}
		this._definition = definition;
		this._replaceReady();
		this._sync();
	}

	async whenPublished(): Promise<void> {
		while (true) {
			if (this._terminalError) {
				throw this._terminalError;
			}
			const ready = this._ready;
			await ready.p;
			if (ready === this._ready) {
				if (this._terminalError) {
					throw this._terminalError;
				}
				return;
			}
		}
	}

	async whenIdle(): Promise<void> {
		await Promise.allSettled(Array.from(this._executions.values(), execution => execution.promise));
	}

	override dispose(): void {
		void this._ready.error(new CancellationError());
		for (const execution of this._executions.values()) {
			execution.present = false;
			execution.cancellation.cancel();
			execution.cancellation.dispose();
		}
		super.dispose();
	}

	private _subscribe(): void {
		const reference = this._connection.getSubscription(StateComponents.Session, this._session, 'RemoteSessionDelegation');
		const listeners = new DisposableStore();
		listeners.add(reference.object.onDidChange(() => this._sync(reference)));
		if (reference.object.onDidError) {
			listeners.add(reference.object.onDidError(error => this._handleSubscriptionError(reference, error)));
		}
		this._subscriptionListeners.value = listeners;
		this._subscriptionReference.value = reference;
		this._sync(reference);
	}

	private _sync(reference = this._subscriptionReference.value): void {
		if (!reference || this._subscriptionReference.value !== reference) {
			return;
		}
		const state = reference.object.value;
		if (!state || state instanceof Error) {
			return;
		}
		if (this._syncDefinition(state)) {
			this._syncExecutions(state);
		}
	}

	private _syncDefinition(state: SessionState): boolean {
		const current = state.activeClients.find(client => client.clientId === this._connection.clientId);
		const tools = [
			...current?.tools.filter(tool => tool.name !== this._toolName) ?? [],
			...(this._definition ? [this._definition] : []),
		];
		if (current && equals(current.tools, tools)) {
			this._ready.complete();
			return true;
		}
		if (!current && !this._definition) {
			this._ready.complete();
			return false;
		}
		this._connection.dispatch(this._session.toString(), {
			type: ActionType.SessionActiveClientSet,
			activeClient: {
				clientId: this._connection.clientId,
				displayName: current?.displayName ?? localize('remoteSessionDelegation.clientName', "Agent Host"),
				tools,
				...(current?.customizations ? { customizations: current.customizations } : {}),
			},
		});
		return false;
	}

	private _syncExecutions(state: SessionState): void {
		for (const execution of this._executions.values()) {
			execution.present = false;
		}
		const present = new Set<string>();
		for (const request of state.inputNeeded ?? []) {
			if (request.kind !== SessionInputRequestKind.ToolClientExecution
				|| request.clientId !== this._connection.clientId
				|| request.toolCall.toolName !== this._toolName
				|| request.toolCall.contributor?.kind !== ToolCallContributorKind.Client
				|| request.toolCall.contributor.clientId !== this._connection.clientId) {
				continue;
			}
			const key = this._executionKey(request);
			present.add(key);
			let execution = this._executions.get(key);
			if (!execution) {
				const tracked: ITrackedExecution = {
					cancellation: new CancellationTokenSource(),
					completionDispatched: false,
					present: true,
				};
				this._executions.set(key, tracked);
				tracked.promise = this._runExecution(request, tracked).then(result => {
					tracked.result = result;
					this._dispatchCompletion(request, tracked);
				}).finally(() => {
					if (!tracked.present && this._executions.get(key) === tracked) {
						this._executions.delete(key);
						tracked.cancellation.dispose();
					}
				});
			} else if (execution.result) {
				execution.present = true;
				this._dispatchCompletion(request, execution);
			} else {
				execution.present = true;
			}
		}
		for (const [key, execution] of this._executions) {
			if (!present.has(key)) {
				execution.present = false;
				if (execution.result) {
					this._executions.delete(key);
					execution.cancellation.dispose();
				} else {
					execution.cancellation.cancel();
				}
			}
		}
	}

	private async _runExecution(request: SessionToolClientExecutionRequest, tracked: ITrackedExecution): Promise<ToolCallResult> {
		try {
			const rawInput = await resolveToolInput(this._connection, request);
			if (tracked.cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			const result = await this._execute({ request, rawInput }, tracked.cancellation.token);
			return tracked.terminalError ? toolFailure(tracked.terminalError) : result;
		} catch (error) {
			const reportedError = tracked.terminalError ?? error;
			if (!isCancellationError(reportedError)) {
				this._logService.warn(`[RemoteSessionDelegation] ${this._toolName} failed: ${getErrorMessage(reportedError)}`);
			}
			return toolFailure(reportedError);
		}
	}

	private _dispatchCompletion(request: SessionToolClientExecutionRequest, execution: ITrackedExecution): void {
		if (this._store.isDisposed || !execution.present || execution.completionDispatched || !execution.result) {
			return;
		}
		execution.completionDispatched = true;
		this._connection.dispatch(request.chat.toString(), {
			type: ActionType.ChatToolCallComplete,
			turnId: request.turnId,
			toolCallId: request.toolCall.toolCallId,
			result: execution.result,
		});
	}

	private _executionKey(request: SessionToolClientExecutionRequest): string {
		return JSON.stringify([request.chat.toString(), request.turnId, request.toolCall.toolCallId]);
	}

	private _handleSubscriptionError(reference: IReference<IAgentSubscription<SessionState>>, error: Error): void {
		if (this._subscriptionReference.value !== reference) {
			return;
		}
		this._logService.warn(`[RemoteSessionDelegation] Source session subscription failed for ${this._session.toString()}: ${error.message}`);
		if (classifySubscriptionError(error) === SubscriptionErrorKind.Terminal) {
			this._terminalError = error;
			void this._ready.error(error);
			for (const execution of this._executions.values()) {
				execution.terminalError = new SessionClientToolError(
					`Source session subscription failed: ${error.message}`,
					'remoteSessionSourceSubscriptionFailed',
				);
				execution.cancellation.cancel();
			}
			return;
		}
		queueMicrotask(() => {
			if (this._store.isDisposed || this._subscriptionReference.value !== reference) {
				return;
			}
			this._subscriptionListeners.clear();
			this._subscriptionReference.clear();
			for (const execution of this._executions.values()) {
				execution.completionDispatched = false;
			}
			this._terminalError = undefined;
			this._replaceReady();
			this._subscribe();
		});
	}

	private _replaceReady(): void {
		const previous = this._ready;
		this._ready = this._createReady();
		previous.complete();
	}

	private _createReady(): DeferredPromise<void> {
		const ready = new DeferredPromise<void>();
		void ready.p.catch(() => { });
		return ready;
	}
}
