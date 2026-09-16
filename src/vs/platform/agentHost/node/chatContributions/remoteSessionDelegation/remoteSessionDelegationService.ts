/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import type { ILogService } from '../../../../log/common/log.js';
import { AgentSession, type IAgent } from '../../../common/agent.js';
import { AgentHostRemoteTargetStatus, AgentHostRemoteTargetUnavailableError, type IAgentHostRemoteTargetHandle } from '../../../common/agentHostRemoteAgents.js';
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from '../../../common/agentHostSessionType.js';
import { agentHostAuthority } from '../../../common/agentHostUri.js';
import type { IAgentConnection } from '../../../common/agentService.js';
import { buildOpenSessionLinkUri } from '../../../common/openSessionLink.js';
import { REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY, type ISessionDatabase, type ISessionDataService } from '../../../common/sessionDataService.js';
import { SessionServerToolName } from '../../../common/serverToolNames.js';
import type { SessionToolClientExecutionRequest } from '../../../common/state/protocol/channels-session/state.js';
import { buildDefaultChatUri, SESSION_META_SPAWN_DEPTH_KEY, ToolCallConfirmationReason, ToolResultContentType, withSessionCreationReference, withSessionSpawnDepth, type ToolCallResult, type ToolDefinition } from '../../../common/state/sessionState.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostRemoteAgentsService } from '../../agentHostRemoteAgentsService.js';
import { AgentHostStateManager } from '../../agentHostStateManager.js';
import type { IAgentHostStorageService } from '../../agentHostStorageService.js';
import { IAgentHostSessionToolCallbacks, MAX_SESSION_SPAWN_DEPTH, sessionToolRequiresConfirmation, type ISessionCreationClaim } from '../../shared/sessionServerTools.js';
import { SessionClientToolBinding, type IClientToolExecution } from './sessionClientTools.js';

export const CREATE_REMOTE_SESSION_TOOL_NAME = 'create_remote_session';

const INVOCATION_METADATA_PREFIX = 'remoteSessionDelegation.invocation.';
const PROGRESS_METADATA_PREFIX = 'remoteSessionDelegation.progress.';
const RESULT_METADATA_PREFIX = 'remoteSessionDelegation.result.';
const LEGACY_METADATA_VERSION = 1;
const METADATA_VERSION = 2;
const CLEANUP_RETRY_INITIAL_DELAY_MS = 100;
const CLEANUP_RETRY_MAX_DELAY_MS = 1_000;
const CLEANUP_RETRY_LIMIT = 4;
const CLEANUP_STORAGE_KEY = 'remoteSessionDelegation.pendingCleanups';
const CLEANUP_STORAGE_VERSION = 1;

/** One A-owned session backed by a downstream remote target session. */
export interface IRemoteSessionDelegationSource {
	readonly session: URI;
	readonly chat: URI;
	readonly connectorId: string;
	readonly targetId: string;
	readonly downstreamSession: URI;
	readonly spawnDepth: number;
}

interface ICreateRemoteSessionArgs {
	readonly target: string;
	readonly provider: string;
	readonly prompt: string;
}

interface IRemoteSessionDestination {
	readonly target: IAgentHostRemoteTargetHandle;
	readonly targetHandle: string;
	readonly provider: string;
	readonly localProvider: IAgent;
}

type GenerationClientToolExecutor = (generation: number, isSuperseded: () => boolean, execution: IClientToolExecution, token: CancellationToken) => Promise<ToolCallResult>;

interface IStoredInvocation {
	readonly version: typeof LEGACY_METADATA_VERSION | typeof METADATA_VERSION;
	readonly inputHash: string;
	readonly operation?: IPlannedRemoteSessionOperation;
}

interface ICreateRemoteSessionResult {
	readonly session: string;
	readonly chat: string;
	readonly openLink: string;
}

interface IPlannedRemoteSessionOperation extends ICreateRemoteSessionResult {
	readonly provider: string;
	readonly spawnDepth: number;
}

type IStoredProgress =
	| { readonly version: typeof METADATA_VERSION; readonly phase: 'planned' }
	| { readonly version: typeof METADATA_VERSION; readonly phase: 'childCreating' }
	| { readonly version: typeof METADATA_VERSION; readonly phase: 'childCreated' }
	| { readonly version: typeof METADATA_VERSION; readonly phase: 'promptSending' }
	| { readonly version: typeof METADATA_VERSION; readonly phase: 'promptAccepted' }
	| {
		readonly version: typeof METADATA_VERSION;
		readonly phase: 'cleanupPending';
		readonly retry: boolean;
		readonly error?: { readonly message: string; readonly code: string };
	}
	| {
		readonly version: typeof METADATA_VERSION;
		readonly phase: 'cleanupComplete';
		readonly error: { readonly message: string; readonly code: string };
	};

type IStoredResult =
	| { readonly version: typeof METADATA_VERSION; readonly kind: 'success'; readonly result: ICreateRemoteSessionResult }
	| { readonly version: typeof METADATA_VERSION; readonly kind: 'failure'; readonly error: { readonly message: string; readonly code: string } };

interface IInvocationMetadataKeys {
	readonly invocation: string;
	readonly progress: string;
	readonly result: string;
}

type ICleanupProgress = Extract<IStoredProgress, { readonly phase: 'cleanupPending' | 'cleanupComplete' }>;

interface IStoredCleanupRecord {
	readonly version: typeof CLEANUP_STORAGE_VERSION;
	readonly source: string;
	readonly keys: IInvocationMetadataKeys;
	readonly operation: IPlannedRemoteSessionOperation;
	readonly progress: ICleanupProgress;
}

interface IStoredCleanupState {
	readonly version: typeof CLEANUP_STORAGE_VERSION;
	readonly records: Readonly<Record<string, unknown>>;
}

interface ICleanupDriver {
	readonly key: string;
	readonly storageKey: string;
	readonly source: URI;
	readonly keys: IInvocationMetadataKeys;
	readonly operation: IPlannedRemoteSessionOperation;
	readonly initialProgress: ICleanupProgress;
	readonly completion: DeferredPromise<void>;
	attempt: Promise<void> | undefined;
	waitingForAvailability: boolean;
	blockedConnection: IAgentConnection | undefined;
}

class RemoteSessionDelegationError extends Error {
	constructor(message: string, readonly code: string) {
		super(message);
		this.name = 'RemoteSessionDelegationError';
	}
}

/** Builds the stable model-facing handle for an admitted target. */
export function toRemoteSessionTargetHandle(connectorId: string, targetId: string): string {
	return agentHostAuthority(JSON.stringify([connectorId, targetId]));
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string {
	return error instanceof RemoteSessionDelegationError ? error.code : 'remoteSessionCreationFailed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function invocationMetadataKeys(source: IRemoteSessionDelegationSource, request: SessionToolClientExecutionRequest): IInvocationMetadataKeys {
	const digest = createHash('sha256')
		.update(source.downstreamSession.toString())
		.update('\0')
		.update(request.chat.toString())
		.update('\0')
		.update(request.turnId)
		.update('\0')
		.update(request.toolCall.toolCallId)
		.digest('hex');
	return {
		invocation: `${INVOCATION_METADATA_PREFIX}${digest}`,
		progress: `${PROGRESS_METADATA_PREFIX}${digest}`,
		result: `${RESULT_METADATA_PREFIX}${digest}`,
	};
}

function invocationInputHash(args: ICreateRemoteSessionArgs): string {
	return createHash('sha256').update(JSON.stringify(args)).digest('hex');
}

function cleanupStorageRecordKey(source: URI, keys: IInvocationMetadataKeys): string {
	return createHash('sha256')
		.update(source.toString())
		.update('\0')
		.update(keys.progress)
		.digest('hex');
}

function readRequiredSessionSpawnDepth(meta: Readonly<Record<string, unknown>> | undefined): number | undefined {
	const value = meta?.[SESSION_META_SPAWN_DEPTH_KEY];
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

function parseCreateRemoteSessionArgs(rawInput: string): ICreateRemoteSessionArgs {
	let value: unknown;
	try {
		value = JSON.parse(rawInput);
	} catch (error) {
		throw new RemoteSessionDelegationError(`Invalid ${CREATE_REMOTE_SESSION_TOOL_NAME} input: ${getErrorMessage(error)}`, 'invalidRemoteSessionInput');
	}
	if (!isRecord(value)) {
		throw new RemoteSessionDelegationError(`Invalid ${CREATE_REMOTE_SESSION_TOOL_NAME} input: expected an object.`, 'invalidRemoteSessionInput');
	}
	const target = value.target;
	const provider = value.provider;
	const prompt = value.prompt;
	if (typeof target !== 'string' || target.length === 0) {
		throw new RemoteSessionDelegationError(`Invalid ${CREATE_REMOTE_SESSION_TOOL_NAME} input: target must be a non-empty string.`, 'invalidRemoteSessionInput');
	}
	if (typeof provider !== 'string' || provider.length === 0) {
		throw new RemoteSessionDelegationError(`Invalid ${CREATE_REMOTE_SESSION_TOOL_NAME} input: provider must be a non-empty string.`, 'invalidRemoteSessionInput');
	}
	if (typeof prompt !== 'string' || prompt.length === 0) {
		throw new RemoteSessionDelegationError(`Invalid ${CREATE_REMOTE_SESSION_TOOL_NAME} input: prompt must be a non-empty string.`, 'invalidRemoteSessionInput');
	}
	return { target, provider, prompt };
}

function parseStoredInvocation(value: string | undefined): IStoredInvocation | undefined {
	if (value === undefined) {
		return undefined;
	}
	try {
		const candidate: unknown = JSON.parse(value);
		if (!isRecord(candidate)) {
			return undefined;
		}
		if (candidate.version === LEGACY_METADATA_VERSION && typeof candidate.inputHash === 'string') {
			return {
				version: LEGACY_METADATA_VERSION,
				inputHash: candidate.inputHash,
			};
		}
		return candidate.version === METADATA_VERSION
			&& typeof candidate.inputHash === 'string'
			&& isRecord(candidate.operation)
			&& typeof candidate.operation.session === 'string'
			&& typeof candidate.operation.chat === 'string'
			&& typeof candidate.operation.openLink === 'string'
			&& typeof candidate.operation.provider === 'string'
			&& typeof candidate.operation.spawnDepth === 'number'
			&& Number.isInteger(candidate.operation.spawnDepth)
			&& candidate.operation.spawnDepth >= 0
			? {
				version: METADATA_VERSION,
				inputHash: candidate.inputHash,
				operation: {
					session: candidate.operation.session,
					chat: candidate.operation.chat,
					openLink: candidate.operation.openLink,
					provider: candidate.operation.provider,
					spawnDepth: candidate.operation.spawnDepth,
				},
			}
			: undefined;
	} catch {
		return undefined;
	}
}

function parseStoredProgress(value: string | undefined): IStoredProgress | undefined {
	if (value === undefined) {
		return undefined;
	}
	try {
		const candidate: unknown = JSON.parse(value);
		if (!isRecord(candidate) || candidate.version !== METADATA_VERSION || typeof candidate.phase !== 'string') {
			return undefined;
		}
		switch (candidate.phase) {
			case 'planned':
			case 'childCreating':
			case 'childCreated':
			case 'promptSending':
			case 'promptAccepted':
				return { version: METADATA_VERSION, phase: candidate.phase };
			case 'cleanupPending':
				if (typeof candidate.retry !== 'boolean') {
					return undefined;
				}
				const error = candidate.error;
				let parsedError: { readonly message: string; readonly code: string } | undefined;
				if (error !== undefined) {
					if (!isRecord(error) || typeof error.message !== 'string' || typeof error.code !== 'string') {
						return undefined;
					}
					parsedError = { message: error.message, code: error.code };
				}
				if (!candidate.retry && !parsedError) {
					return undefined;
				}
				return {
					version: METADATA_VERSION,
					phase: candidate.phase,
					retry: candidate.retry,
					...(parsedError ? { error: parsedError } : {}),
				};
			case 'cleanupComplete':
				if (!isRecord(candidate.error) || typeof candidate.error.message !== 'string' || typeof candidate.error.code !== 'string') {
					return undefined;
				}
				return {
					version: METADATA_VERSION,
					phase: candidate.phase,
					error: { message: candidate.error.message, code: candidate.error.code },
				};
		}
		return undefined;
	} catch {
		return undefined;
	}
}

function parseStoredResult(value: string | undefined): IStoredResult | undefined {
	if (value === undefined) {
		return undefined;
	}
	try {
		const candidate: unknown = JSON.parse(value);
		if (!isRecord(candidate)) {
			return undefined;
		}
		if ((candidate.version !== LEGACY_METADATA_VERSION && candidate.version !== METADATA_VERSION)
			|| (candidate.kind !== 'success' && candidate.kind !== 'failure')) {
			return undefined;
		}
		if (candidate.kind === 'success' && isRecord(candidate.result)) {
			const result = candidate.result;
			if (typeof result.session === 'string' && typeof result.chat === 'string' && typeof result.openLink === 'string') {
				return {
					version: METADATA_VERSION,
					kind: 'success',
					result: { session: result.session, chat: result.chat, openLink: result.openLink },
				};
			}
		}
		if (candidate.kind === 'failure' && isRecord(candidate.error)) {
			const error = candidate.error;
			if (typeof error.message === 'string' && typeof error.code === 'string') {
				return {
					version: METADATA_VERSION,
					kind: 'failure',
					error: { message: error.message, code: error.code },
				};
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

function parseStoredCleanupState(value: unknown): IStoredCleanupState | undefined {
	return isRecord(value)
		&& value.version === CLEANUP_STORAGE_VERSION
		&& isRecord(value.records)
		? { version: CLEANUP_STORAGE_VERSION, records: value.records }
		: undefined;
}

function parseStoredCleanupRecord(value: unknown): IStoredCleanupRecord | undefined {
	if (!isRecord(value)
		|| value.version !== CLEANUP_STORAGE_VERSION
		|| typeof value.source !== 'string'
		|| !isRecord(value.keys)
		|| typeof value.keys.invocation !== 'string'
		|| typeof value.keys.progress !== 'string'
		|| typeof value.keys.result !== 'string'
		|| !isRecord(value.operation)
		|| typeof value.operation.session !== 'string'
		|| typeof value.operation.chat !== 'string'
		|| typeof value.operation.openLink !== 'string'
		|| typeof value.operation.provider !== 'string'
		|| typeof value.operation.spawnDepth !== 'number'
		|| !Number.isInteger(value.operation.spawnDepth)
		|| value.operation.spawnDepth < 0) {
		return undefined;
	}
	const suffix = value.keys.progress.startsWith(PROGRESS_METADATA_PREFIX)
		? value.keys.progress.slice(PROGRESS_METADATA_PREFIX.length)
		: undefined;
	const progress = parseStoredProgress(JSON.stringify(value.progress));
	if (suffix === undefined
		|| value.keys.invocation !== `${INVOCATION_METADATA_PREFIX}${suffix}`
		|| value.keys.result !== `${RESULT_METADATA_PREFIX}${suffix}`
		|| (progress?.phase !== 'cleanupPending' && progress?.phase !== 'cleanupComplete')) {
		return undefined;
	}
	return {
		version: CLEANUP_STORAGE_VERSION,
		source: value.source,
		keys: {
			invocation: value.keys.invocation,
			progress: value.keys.progress,
			result: value.keys.result,
		},
		operation: {
			session: value.operation.session,
			chat: value.operation.chat,
			openLink: value.operation.openLink,
			provider: value.operation.provider,
			spawnDepth: value.operation.spawnDepth,
		},
		progress,
	};
}

function storedCleanupRecord(source: URI, keys: IInvocationMetadataKeys, operation: IPlannedRemoteSessionOperation, progress: ICleanupProgress): IStoredCleanupRecord {
	return {
		version: CLEANUP_STORAGE_VERSION,
		source: source.toString(),
		keys,
		operation,
		progress,
	};
}

function hasSameCleanupIdentity(left: IStoredCleanupRecord, right: IStoredCleanupRecord): boolean {
	return left.source === right.source && equals(left.keys, right.keys) && equals(left.operation, right.operation);
}

function resultFromStored(record: IStoredResult): ICreateRemoteSessionResult {
	if (record.kind === 'failure') {
		throw new RemoteSessionDelegationError(record.error.message, record.error.code);
	}
	return record.result;
}

function toToolResult(result: ICreateRemoteSessionResult): ToolCallResult {
	return {
		success: true,
		pastTenseMessage: localize('remoteSessionDelegation.complete', "Created remote session"),
		content: [{ type: ToolResultContentType.Text, text: JSON.stringify(result) }],
		structuredContent: {
			session: result.session,
			chat: result.chat,
			openLink: result.openLink,
		},
	};
}

class SourceSessionRegistration extends Disposable {
	private readonly _binding = this._register(new MutableDisposable<SessionClientToolBinding>());
	private readonly _targetObserver = this._register(new MutableDisposable<DisposableStore>());
	private _target: IAgentHostRemoteTargetHandle | undefined;
	private _connection: IAgentConnection | undefined;
	private _definition: ToolDefinition | undefined;
	private _bindingGeneration = 0;
	private _isDisposed = false;

	constructor(
		readonly source: IRemoteSessionDelegationSource,
		private readonly _execute: GenerationClientToolExecutor,
		private readonly _logService: ILogService,
	) {
		super();
	}

	update(target: IAgentHostRemoteTargetHandle | undefined, definition: ToolDefinition | undefined): void {
		this._definition = definition;
		if (this._target === target) {
			this._binding.value?.updateDefinition(definition);
			return;
		}
		this._target = target;
		this._targetObserver.clear();
		this._setConnection(undefined);
		if (!target) {
			return;
		}
		const observer = new DisposableStore();
		observer.add(autorun(reader => this._setConnection(target.connection.read(reader))));
		this._targetObserver.value = observer;
	}

	async whenPublished(): Promise<void> {
		while (true) {
			const binding = this._binding.value;
			if (!binding) {
				throw new RemoteSessionDelegationError(
					`Remote source target is unavailable: ${this.source.connectorId}/${this.source.targetId}.`,
					'remoteSourceUnavailable',
				);
			}
			try {
				await binding.whenPublished();
			} catch (error) {
				if (this._binding.value !== binding) {
					continue;
				}
				throw error;
			}
			if (this._binding.value === binding) {
				return;
			}
		}
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	private _setConnection(connection: IAgentConnection | undefined): void {
		if (this._connection === connection) {
			return;
		}
		this._connection = connection;
		const generation = ++this._bindingGeneration;
		this._binding.value = connection
			? new SessionClientToolBinding(
				connection,
				this.source.downstreamSession,
				CREATE_REMOTE_SESSION_TOOL_NAME,
				this._definition,
				(execution, token) => this._execute(generation, () => !this._isDisposed && this._bindingGeneration !== generation, execution, token),
				this._logService,
			)
			: undefined;
	}
}

/**
 * Publishes and executes A-owned delegation tools in downstream sessions.
 */
export class RemoteSessionDelegationService extends Disposable {
	private readonly _sources = this._register(new DisposableMap<string, SourceSessionRegistration>());
	private readonly _inflight = new Map<string, { readonly source: string; readonly generation: number; readonly promise: Promise<ToolCallResult> }>();
	private readonly _cleanupCancellation = this._register(new CancellationTokenSource());
	private readonly _cleanupDrivers = new Map<string, ICleanupDriver>();
	private _targets: readonly IAgentHostRemoteTargetHandle[] = [];

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _storageService: IAgentHostStorageService,
		private readonly _remoteAgentsService: IAgentHostRemoteAgentsService,
		private readonly _providerService: IAgentHostProviderService,
		private readonly _sessionToolCallbacks: IAgentHostSessionToolCallbacks,
		private readonly _stateManager: AgentHostStateManager,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(autorun(reader => {
			this._targets = this._remoteAgentsService.targets.read(reader);
			this._providerService.agents.read(reader);
			for (const target of this._targets) {
				target.label.read(reader);
				target.status.read(reader);
				target.connection.read(reader);
			}
			for (const registration of this._sources.values()) {
				this._updateRegistration(registration);
			}
			for (const driver of this._cleanupDrivers.values()) {
				this._scheduleCleanupDriver(driver);
			}
		}));
		this._register(this._sessionDataService.onWillDeleteSessionData(event => {
			event.waitUntil(this.releaseSource(event.session));
		}));
		this._register(this._stateManager.onDidRemoveSession(session => {
			void this.releaseSource(URI.parse(session)).catch(error => {
				this._logService.error(`[RemoteSessionDelegation] Failed to release evicted source ${session}: ${getErrorMessage(error)}`);
			});
		}));
		this._recoverDurableCleanups();
	}

	async ensureSource(source: IRemoteSessionDelegationSource): Promise<void> {
		this._assertSourceAvailable(source);
		await this._recoverPendingCleanups(source.session);
		const key = source.session.toString();
		let registration = this._sources.get(key);
		if (!registration || !equals(registration.source, source)) {
			await this.releaseSource(source.session);
			registration = new SourceSessionRegistration(
				source,
				(generation, isSuperseded, execution, token) => this._execute(source, generation, isSuperseded, execution, token),
				this._logService,
			);
			this._sources.set(key, registration);
		}
		this._updateRegistration(registration);
		await registration.whenPublished();
	}

	async releaseSource(session: URI): Promise<void> {
		const key = session.toString();
		this._sources.deleteAndDispose(key);
		while (this._hasInflight(key) || this._hasActiveCleanupDrivers(key)) {
			await this._whenInflightSettles(key);
			await this._whenActiveCleanupSettles(key);
		}
	}

	async whenIdle(): Promise<void> {
		while (this._hasInflight() || this._hasActiveCleanupDrivers()) {
			await this._whenInflightSettles();
			await this._whenActiveCleanupSettles();
		}
	}

	override dispose(): void {
		this._cleanupCancellation.cancel();
		for (const driver of this._cleanupDrivers.values()) {
			void driver.completion.complete(undefined);
		}
		this._cleanupDrivers.clear();
		super.dispose();
	}

	private _hasInflight(source?: string): boolean {
		return Array.from(this._inflight.values()).some(operation => source === undefined || operation.source === source);
	}

	private async _whenInflightSettles(source?: string): Promise<void> {
		await Promise.allSettled(Array.from(
			this._inflight.values(),
			operation => source === undefined || operation.source === source ? operation.promise : undefined,
		).filter((promise): promise is Promise<ToolCallResult> => promise !== undefined));
	}

	private _hasActiveCleanupDrivers(source?: string): boolean {
		return Array.from(this._cleanupDrivers.values()).some(driver =>
			driver.attempt !== undefined && (source === undefined || driver.source.toString() === source)
		);
	}

	private async _whenActiveCleanupSettles(source?: string): Promise<void> {
		await Promise.allSettled(Array.from(
			this._cleanupDrivers.values(),
			driver => source === undefined || driver.source.toString() === source ? driver.attempt : undefined,
		).filter((promise): promise is Promise<void> => promise !== undefined));
	}

	private _updateRegistration(registration: SourceSessionRegistration): void {
		const sourceTarget = this._targets.find(target =>
			target.connectorId === registration.source.connectorId
			&& target.targetId === registration.source.targetId
		);
		const definition = sourceTarget ? this._createToolDefinition(sourceTarget) : undefined;
		registration.update(sourceTarget, definition);
	}

	private _createToolDefinition(sourceTarget: IAgentHostRemoteTargetHandle): ToolDefinition | undefined {
		const destinations = this._availableDestinations(sourceTarget);
		if (destinations.length === 0) {
			return undefined;
		}
		const pairs = destinations.map(destination => ({
			target: destination.targetHandle,
			label: destination.target.label.get(),
			provider: destination.provider,
		}));
		const targetHandles = [...new Set(pairs.map(pair => pair.target))];
		const providers = [...new Set(pairs.map(pair => pair.provider))];
		return {
			name: CREATE_REMOTE_SESSION_TOOL_NAME,
			title: localize('remoteSessionDelegation.toolTitle', "Create Remote Session"),
			description: `Create a persistent agent session on another admitted remote host and send its initial prompt. Use this when work should be delegated to a different remote target/provider. Do not use it for follow-up work in the current session. This creates one session owned by the current host and starts its prompt immediately. Available target/provider pairs: ${JSON.stringify(pairs)}. Repeating the same tool invocation returns its durable result; do not issue a new invocation to retry an ambiguous failure.`,
			inputSchema: {
				type: 'object',
				properties: {
					target: {
						type: 'string',
						enum: targetHandles,
						description: 'Opaque target handle from the available target/provider pairs in this tool description.',
					},
					provider: {
						type: 'string',
						enum: providers,
						description: 'Provider identifier paired with the selected target in this tool description.',
					},
					prompt: {
						type: 'string',
						description: 'Initial prompt to dispatch exactly once to the new remote-backed session.',
					},
				},
				required: ['target', 'provider', 'prompt'],
			},
			outputSchema: {
				type: 'object',
				properties: {
					session: { type: 'string' },
					chat: { type: 'string' },
					openLink: { type: 'string' },
				},
				required: ['session', 'chat', 'openLink'],
			},
		};
	}

	private _availableDestinations(sourceTarget: IAgentHostRemoteTargetHandle): IRemoteSessionDestination[] {
		const destinations: IRemoteSessionDestination[] = [];
		for (const target of this._targets) {
			if (target === sourceTarget || target.status.get() !== AgentHostRemoteTargetStatus.Connected) {
				continue;
			}
			const connection = target.connection.get();
			const rootState = connection?.rootState.value;
			if (!connection || !rootState || rootState instanceof Error) {
				continue;
			}
			const targetHandle = toRemoteSessionTargetHandle(target.connectorId, target.targetId);
			for (const agent of rootState.agents) {
				const localProvider = this._providerService.getProvider(remoteAgentHostSessionTypeId(targetHandle, agent.provider));
				if (localProvider) {
					destinations.push({ target, targetHandle, provider: agent.provider, localProvider });
				}
			}
		}
		return destinations.sort((left, right) =>
			left.targetHandle.localeCompare(right.targetHandle) || left.provider.localeCompare(right.provider)
		);
	}

	private _execute(source: IRemoteSessionDelegationSource, generation: number, isSuperseded: () => boolean, execution: IClientToolExecution, token: CancellationToken): Promise<ToolCallResult> {
		const keys = invocationMetadataKeys(source, execution.request);
		const inflightKey = `${source.session.toString()}\0${keys.invocation}`;
		const existing = this._inflight.get(inflightKey);
		if (existing?.generation === generation) {
			return existing.promise;
		}
		let operation: { readonly source: string; readonly generation: number; readonly promise: Promise<ToolCallResult> };
		const promise = (async () => {
			await existing?.promise;
			throwIfCancelled(token);
			return this._executeOnce(source, execution, keys, token, isSuperseded);
		})()
			.then(toToolResult)
			.catch(error => toolFailure(error))
			.finally(() => {
				if (this._inflight.get(inflightKey) === operation) {
					this._inflight.delete(inflightKey);
				}
			});
		operation = { source: source.session.toString(), generation, promise };
		this._inflight.set(inflightKey, operation);
		return promise;
	}

	private async _executeOnce(
		source: IRemoteSessionDelegationSource,
		execution: IClientToolExecution,
		keys: IInvocationMetadataKeys,
		token: CancellationToken,
		isSuperseded: () => boolean,
	): Promise<ICreateRemoteSessionResult> {
		const args = parseCreateRemoteSessionArgs(execution.rawInput);
		this._validateConfirmation(execution.request);
		this._assertSourceAvailable(source);
		if (source.spawnDepth >= MAX_SESSION_SPAWN_DEPTH) {
			throw new RemoteSessionDelegationError(
				`Refusing to create a remote session: recursion limit reached (max spawn depth ${MAX_SESSION_SPAWN_DEPTH}).`,
				'remoteSessionDelegationLimit',
			);
		}
		throwIfCancelled(token);
		const ref = this._sessionDataService.openDatabase(source.session);
		try {
			const existing = await ref.object.getMetadataObject({
				[keys.invocation]: true,
				[keys.progress]: true,
				[keys.result]: true,
			});
			const existingInvocation = parseStoredInvocation(existing[keys.invocation]);
			const existingProgress = parseStoredProgress(existing[keys.progress]);
			if (existing[keys.invocation] !== undefined) {
				this._validateMatchingInvocation(existingInvocation, args);
				if (existing[keys.progress] !== undefined && !existingProgress) {
					throw new RemoteSessionDelegationError(
						`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} attempt has invalid progress and will not be retried.`,
						'remoteSessionCreationOutcomeUnknown',
					);
				}
				const existingResult = parseStoredResult(existing[keys.result]);
				if (existingResult) {
					return resultFromStored(existingResult);
				}
				if (!existingInvocation?.operation) {
					throw new RemoteSessionDelegationError(
						`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} attempt has an unknown outcome and will not be retried.`,
						'remoteSessionCreationOutcomeUnknown',
					);
				}
				return this._finishPlannedOperation(ref.object, keys, source, args, existingInvocation.operation, existingProgress, token, isSuperseded);
			}
			if (existing[keys.result] !== undefined) {
				throw new RemoteSessionDelegationError(
					`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} attempt has an unknown outcome and will not be retried.`,
					'remoteSessionCreationOutcomeUnknown',
				);
			}

			const plannedProvider = remoteAgentHostSessionTypeId(args.target, args.provider);
			const session = AgentSession.uri(plannedProvider, `delegated-${generateUuid()}`);
			const operation: IPlannedRemoteSessionOperation = {
				session: session.toString(),
				chat: buildDefaultChatUri(session),
				openLink: buildOpenSessionLinkUri(session),
				provider: plannedProvider,
				spawnDepth: source.spawnDepth + 1,
			};
			const invocation: IStoredInvocation = {
				version: METADATA_VERSION,
				inputHash: invocationInputHash(args),
				operation,
			};
			const progress: IStoredProgress = { version: METADATA_VERSION, phase: 'planned' };
			const claim = this._claimSessionCreation(operation.session);
			try {
				throwIfCancelled(token);
				const claimed = await ref.object.setMetadataValuesIfAbsent(keys.invocation, {
					[keys.invocation]: JSON.stringify(invocation),
					[keys.progress]: JSON.stringify(progress),
				});
				if (!claimed) {
					claim.dispose();
					const raced = await this._readStoredInvocation(ref.object, keys, args);
					const racedResult = parseStoredResult(raced.result);
					if (racedResult) {
						return resultFromStored(racedResult);
					}
					if (!raced.invocation.operation) {
						throw new RemoteSessionDelegationError(
							`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} attempt has an unknown outcome and will not be retried.`,
							'remoteSessionCreationOutcomeUnknown',
						);
					}
					return this._finishPlannedOperation(ref.object, keys, source, args, raced.invocation.operation, raced.progress, token, isSuperseded);
				}
				return await this._finishPlannedOperation(ref.object, keys, source, args, operation, progress, token, isSuperseded, claim);
			} finally {
				claim.dispose();
			}
		} finally {
			ref.dispose();
		}
	}

	private async _finishPlannedOperation(
		database: ISessionDatabase,
		keys: IInvocationMetadataKeys,
		source: IRemoteSessionDelegationSource,
		args: ICreateRemoteSessionArgs,
		operation: IPlannedRemoteSessionOperation,
		progress: IStoredProgress | undefined,
		token: CancellationToken,
		isSuperseded: () => boolean,
		claim?: ISessionCreationClaim,
	): Promise<ICreateRemoteSessionResult> {
		try {
			if (progress?.phase === 'cleanupPending' || progress?.phase === 'cleanupComplete') {
				const driver = await this._ensureDurableCleanupDriver(source.session, keys, operation, progress);
				await raceCancellationError(driver.completion.p, token);
				progress = parseStoredProgress(await database.getMetadata(keys.progress));
				if (!progress) {
					throw new RemoteSessionDelegationError(
						`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} cleanup has invalid progress.`,
						'remoteSessionCreationOutcomeUnknown',
					);
				}
				if (progress.phase === 'cleanupPending') {
					throw new RemoteSessionDelegationError(
						`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} cleanup remains pending.`,
						'remoteSessionCleanupFailed',
					);
				}
			}
			if (progress?.phase === 'cleanupComplete') {
				throw new RemoteSessionDelegationError(progress.error.message, progress.error.code);
			}
			const result = await this._runPlannedOperation(database, keys, source, args, operation, progress, token, isSuperseded, claim);
			try {
				await this._persistResult(database, keys.result, { version: METADATA_VERSION, kind: 'success', result });
			} catch (error) {
				throw new RemoteSessionDelegationError(getErrorMessage(error), 'remoteSessionResultPersistenceFailed');
			}
			return result;
		} catch (error) {
			const errorCode = getErrorCode(error);
			if (isCancellationError(error)
				|| errorCode === 'remoteSessionCleanupFailed'
				|| errorCode === 'remoteSessionDelegationLimit'
				|| errorCode === 'remoteSessionProgressPersistenceFailed'
				|| errorCode === 'remoteSessionResultPersistenceFailed') {
				throw error;
			}
			const failure: IStoredResult = {
				version: METADATA_VERSION,
				kind: 'failure',
				error: { message: getErrorMessage(error), code: getErrorCode(error) },
			};
			try {
				await this._persistResult(database, keys.result, failure);
			} catch (persistenceError) {
				throw new RemoteSessionDelegationError(getErrorMessage(persistenceError), 'remoteSessionResultPersistenceFailed');
			}
			throw error;
		}
	}

	private async _runPlannedOperation(
		database: ISessionDatabase,
		keys: IInvocationMetadataKeys,
		source: IRemoteSessionDelegationSource,
		args: ICreateRemoteSessionArgs,
		operation: IPlannedRemoteSessionOperation,
		progress: IStoredProgress | undefined,
		token: CancellationToken,
		isSuperseded: () => boolean,
		existingClaim?: ISessionCreationClaim,
	): Promise<ICreateRemoteSessionResult> {
		const accessor = this._sessionToolCallbacks.accessor;
		const session = URI.parse(operation.session);
		const chat = URI.parse(operation.chat);
		const claim = existingClaim ?? this._claimSessionCreation(operation.session);
		let cleanupSession: URI | undefined;
		let currentProgress = progress;
		let promptWasAccepted = progress?.phase === 'promptAccepted';
		if (promptWasAccepted) {
			claim.commit();
		}
		try {
			throwIfCancelled(token);
			const existing = await accessor.getSession(session);
			if (existing && AgentSession.provider(existing.session) !== operation.provider) {
				throw new RemoteSessionDelegationError(
					`The planned ${CREATE_REMOTE_SESSION_TOOL_NAME} session is owned by a different provider.`,
					'remoteSessionCreationConflict',
				);
			}
			if (!currentProgress) {
				if (existing) {
					throw new RemoteSessionDelegationError(
						`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} attempt has no durable prompt phase and will not be retried.`,
						'remoteSessionCreationOutcomeUnknown',
					);
				}
				currentProgress = { version: METADATA_VERSION, phase: 'planned' };
				await this._persistProgress(database, keys.progress, currentProgress);
			}
			if (currentProgress.phase === 'promptSending') {
				throw new RemoteSessionDelegationError(
					`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} prompt has an unknown delivery outcome and will not be retried.`,
					'remoteSessionCreationOutcomeUnknown',
				);
			}
			if (currentProgress.phase === 'promptAccepted' && !existing) {
				throw new RemoteSessionDelegationError(
					`The accepted ${CREATE_REMOTE_SESSION_TOOL_NAME} child no longer exists.`,
					'remoteSessionCreationOutcomeUnknown',
				);
			}
			if (currentProgress.phase === 'cleanupPending' || currentProgress.phase === 'cleanupComplete') {
				throw new Error(`Unexpected cleanup ${CREATE_REMOTE_SESSION_TOOL_NAME} progress.`);
			}
			if (currentProgress.phase === 'childCreating' && !existing) {
				throw new RemoteSessionDelegationError(
					`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} child creation has an unknown outcome and will not be retried.`,
					'remoteSessionCreationOutcomeUnknown',
				);
			}
			if (currentProgress.phase === 'childCreated' && !existing) {
				throw new RemoteSessionDelegationError(
					`The created ${CREATE_REMOTE_SESSION_TOOL_NAME} child no longer exists.`,
					'remoteSessionCreationOutcomeUnknown',
				);
			}
			cleanupSession = existing ? session : undefined;
			if (existing && (currentProgress.phase === 'planned' || currentProgress.phase === 'childCreating')) {
				currentProgress = { version: METADATA_VERSION, phase: 'childCreated' };
				await this._persistProgress(database, keys.progress, currentProgress);
			}
			if (!existing) {
				const destination = this._resolveDestination(source, args);
				if (destination.localProvider.id !== operation.provider) {
					throw new RemoteSessionDelegationError(
						`The planned ${CREATE_REMOTE_SESSION_TOOL_NAME} provider no longer matches its destination.`,
						'remoteSessionCreationConflict',
					);
				}
				currentProgress = { version: METADATA_VERSION, phase: 'childCreating' };
				await this._persistProgress(database, keys.progress, currentProgress);
				const created = await accessor.createSession({
					session,
					provider: operation.provider,
					workingDirectories: [],
					_meta: withSessionSpawnDepth(
						withSessionCreationReference(undefined, {
							session: source.session.toString(),
							chat: source.chat.toString(),
						}),
						operation.spawnDepth,
					),
				});
				cleanupSession = created;
				if (created.toString() !== operation.session) {
					throw new RemoteSessionDelegationError(
						`The planned ${CREATE_REMOTE_SESSION_TOOL_NAME} session URI was not honored.`,
						'remoteSessionCreationConflict',
					);
				}
				currentProgress = { version: METADATA_VERSION, phase: 'childCreated' };
				await this._persistProgress(database, keys.progress, currentProgress);
			}
			throwIfCancelled(token);
			await this._persistSessionSpawnDepth(session, operation.spawnDepth);
			accessor.setSessionSpawnDepth(session, operation.spawnDepth);

			if (existing && !await accessor.getChatContext(session)) {
				await accessor.restoreSession(session);
				accessor.setSessionSpawnDepth(session, operation.spawnDepth);
			}
			if (currentProgress.phase !== 'promptAccepted') {
				throwIfCancelled(token);
				currentProgress = { version: METADATA_VERSION, phase: 'promptSending' };
				await this._persistProgress(database, keys.progress, currentProgress);
				const accepted = await accessor.startPrompt(session, chat, args.prompt, {
					sourceSession: source.session.toString(),
					sourceChat: source.chat.toString(),
				});
				if (!accepted) {
					throwIfCancelled(token);
					throw new RemoteSessionDelegationError(
						`The initial prompt for ${CREATE_REMOTE_SESSION_TOOL_NAME} was rejected before provider execution.`,
						'remoteSessionPromptRejected',
					);
				}
				claim.commit();
				if (token.isCancellationRequested && !isSuperseded()) {
					throw new CancellationError();
				}
				promptWasAccepted = true;
				currentProgress = { version: METADATA_VERSION, phase: 'promptAccepted' };
				await this._persistProgress(database, keys.progress, currentProgress);
			}
			return {
				session: operation.session,
				chat: operation.chat,
				openLink: operation.openLink,
			};
		} catch (error) {
			if (promptWasAccepted) {
				throw error;
			}
			const operationError = token.isCancellationRequested ? new CancellationError() : error;
			if (cleanupSession) {
				try {
					await accessor.deleteSession(cleanupSession);
				} catch (cleanupError) {
					this._logService.error(`[RemoteSessionDelegation] Failed to clean up child ${cleanupSession.toString()}: ${getErrorMessage(cleanupError)}`);
					const retry = isCancellationError(operationError);
					const cleanupProgress: ICleanupProgress = {
						version: METADATA_VERSION,
						phase: 'cleanupPending',
						retry,
						...(!retry ? { error: { message: getErrorMessage(operationError), code: getErrorCode(operationError) } } : {}),
					};
					await this._persistProgress(database, keys.progress, cleanupProgress);
					await this._ensureDurableCleanupDriver(source.session, keys, operation, cleanupProgress);
					throw new RemoteSessionDelegationError(
						`Failed to clean up ${CREATE_REMOTE_SESSION_TOOL_NAME} child after ${getErrorMessage(operationError)}: ${getErrorMessage(cleanupError)}`,
						'remoteSessionCleanupFailed',
					);
				}
			}
			if (isCancellationError(operationError) && currentProgress?.phase !== 'childCreating') {
				await this._persistProgress(database, keys.progress, { version: METADATA_VERSION, phase: 'planned' });
			}
			throw operationError;
		} finally {
			claim.dispose();
		}
	}

	private async _readStoredInvocation(
		database: ISessionDatabase,
		keys: IInvocationMetadataKeys,
		args: ICreateRemoteSessionArgs,
	): Promise<{ readonly invocation: IStoredInvocation; readonly progress: IStoredProgress | undefined; readonly result: string | undefined }> {
		const stored = await database.getMetadataObject({
			[keys.invocation]: true,
			[keys.progress]: true,
			[keys.result]: true,
		});
		const invocation = parseStoredInvocation(stored[keys.invocation]);
		this._validateMatchingInvocation(invocation, args);
		const progress = parseStoredProgress(stored[keys.progress]);
		if (stored[keys.progress] !== undefined && !progress) {
			throw new RemoteSessionDelegationError(
				`The previous ${CREATE_REMOTE_SESSION_TOOL_NAME} attempt has invalid progress and will not be retried.`,
				'remoteSessionCreationOutcomeUnknown',
			);
		}
		return { invocation: invocation!, progress, result: stored[keys.result] };
	}

	private _validateMatchingInvocation(invocation: IStoredInvocation | undefined, args: ICreateRemoteSessionArgs): void {
		if (!invocation
			|| invocation.inputHash !== invocationInputHash(args)) {
			throw new RemoteSessionDelegationError(
				`The ${CREATE_REMOTE_SESSION_TOOL_NAME} invocation identity was replayed with different input.`,
				'remoteSessionInvocationMismatch',
			);
		}
	}

	private async _persistResult(database: ISessionDatabase, key: string, result: IStoredResult): Promise<void> {
		const stored = await database.setMetadataValuesIfAbsent(key, { [key]: JSON.stringify(result) });
		if (!stored) {
			const existing = parseStoredResult(await database.getMetadata(key));
			if (!existing || !equals(existing, result)) {
				throw new Error(`Conflicting persisted result for ${CREATE_REMOTE_SESSION_TOOL_NAME}.`);
			}
		}
	}

	private async _persistProgress(database: ISessionDatabase, key: string, progress: IStoredProgress): Promise<void> {
		try {
			await database.setMetadata(key, JSON.stringify(progress));
		} catch (error) {
			throw new RemoteSessionDelegationError(getErrorMessage(error), 'remoteSessionProgressPersistenceFailed');
		}
	}

	private async _persistSessionSpawnDepth(session: URI, depth: number): Promise<void> {
		const ref = this._sessionDataService.openDatabase(session);
		try {
			await ref.object.setMetadata(REMOTE_SESSION_DELEGATION_SPAWN_DEPTH_METADATA_KEY, String(depth));
		} finally {
			ref.dispose();
		}
	}

	private _readStoredCleanupState(): IStoredCleanupState {
		if (this._storageService.loadError) {
			throw new Error('Agent Host storage is unavailable while reading remote session cleanup state.', { cause: this._storageService.loadError });
		}
		const value = this._storageService.get<unknown>(CLEANUP_STORAGE_KEY);
		if (value === undefined) {
			return { version: CLEANUP_STORAGE_VERSION, records: {} };
		}
		const state = parseStoredCleanupState(value);
		if (!state) {
			throw new Error('Persisted remote session cleanup state is invalid.');
		}
		return state;
	}

	private async _persistDurableCleanup(source: URI, keys: IInvocationMetadataKeys, operation: IPlannedRemoteSessionOperation, progress: ICleanupProgress): Promise<string> {
		const storageKey = cleanupStorageRecordKey(source, keys);
		const record = storedCleanupRecord(source, keys, operation, progress);
		const state = this._readStoredCleanupState();
		const existingValue = state.records[storageKey];
		if (existingValue !== undefined) {
			const existing = parseStoredCleanupRecord(existingValue);
			if (!existing || !hasSameCleanupIdentity(existing, record)) {
				throw new Error(`Conflicting persisted cleanup state for ${CREATE_REMOTE_SESSION_TOOL_NAME}.`);
			}
			if (equals(existing.progress, progress) || existing.progress.phase === 'cleanupComplete') {
				return storageKey;
			}
		}
		await this._storageService.setAndFlush(CLEANUP_STORAGE_KEY, {
			version: CLEANUP_STORAGE_VERSION,
			records: {
				...state.records,
				[storageKey]: record,
			},
		});
		return storageKey;
	}

	private async _deleteDurableCleanup(driver: ICleanupDriver): Promise<void> {
		const state = this._readStoredCleanupState();
		const existingValue = state.records[driver.storageKey];
		if (existingValue === undefined) {
			return;
		}
		const existing = parseStoredCleanupRecord(existingValue);
		const expected = storedCleanupRecord(driver.source, driver.keys, driver.operation, driver.initialProgress);
		if (!existing || !hasSameCleanupIdentity(existing, expected)) {
			throw new Error(`Conflicting persisted cleanup state for ${CREATE_REMOTE_SESSION_TOOL_NAME}.`);
		}
		const records = { ...state.records };
		delete records[driver.storageKey];
		await this._storageService.setAndFlush(CLEANUP_STORAGE_KEY, {
			version: CLEANUP_STORAGE_VERSION,
			records,
		});
	}

	private _recoverDurableCleanups(): void {
		let state: IStoredCleanupState;
		try {
			state = this._readStoredCleanupState();
		} catch (error) {
			this._logService.error(`[RemoteSessionDelegation] Failed to recover durable child cleanup state: ${getErrorMessage(error)}`);
			return;
		}
		for (const [storageKey, value] of Object.entries(state.records)) {
			const record = parseStoredCleanupRecord(value);
			if (!record) {
				this._logService.error(`[RemoteSessionDelegation] Ignoring invalid durable child cleanup record: ${storageKey}`);
				continue;
			}
			const source = URI.parse(record.source);
			if (storageKey !== cleanupStorageRecordKey(source, record.keys)) {
				this._logService.error(`[RemoteSessionDelegation] Ignoring mismatched durable child cleanup record: ${storageKey}`);
				continue;
			}
			this._startCleanupDriver(storageKey, source, record.keys, record.operation, record.progress);
		}
	}

	private async _ensureDurableCleanupDriver(source: URI, keys: IInvocationMetadataKeys, operation: IPlannedRemoteSessionOperation, progress: ICleanupProgress): Promise<ICleanupDriver> {
		const storageKey = await this._persistDurableCleanup(source, keys, operation, progress);
		return this._startCleanupDriver(storageKey, source, keys, operation, progress);
	}

	private async _recoverPendingCleanups(source: URI): Promise<void> {
		const ref = this._sessionDataService.openDatabase(source);
		try {
			const progresses = await ref.object.getMetadataByPrefix(PROGRESS_METADATA_PREFIX);
			for (const [progressKey, value] of progresses) {
				const progress = parseStoredProgress(value);
				if (progress?.phase !== 'cleanupPending' && progress?.phase !== 'cleanupComplete') {
					continue;
				}
				const suffix = progressKey.slice(PROGRESS_METADATA_PREFIX.length);
				const keys: IInvocationMetadataKeys = {
					invocation: `${INVOCATION_METADATA_PREFIX}${suffix}`,
					progress: progressKey,
					result: `${RESULT_METADATA_PREFIX}${suffix}`,
				};
				const stored = await ref.object.getMetadataObject({
					[keys.invocation]: true,
					[keys.result]: true,
				});
				if (progress.phase === 'cleanupComplete' && parseStoredResult(stored[keys.result])) {
					continue;
				}
				const invocation = parseStoredInvocation(stored[keys.invocation]);
				if (!invocation?.operation) {
					this._logService.error(`[RemoteSessionDelegation] Cannot recover cleanup with invalid invocation metadata: ${progressKey}`);
					continue;
				}
				await this._ensureDurableCleanupDriver(source, keys, invocation.operation, progress);
			}
		} finally {
			ref.dispose();
		}
	}

	private _startCleanupDriver(storageKey: string, source: URI, keys: IInvocationMetadataKeys, operation: IPlannedRemoteSessionOperation, progress: ICleanupProgress): ICleanupDriver {
		const driverKey = `${source.toString()}\0${keys.progress}`;
		const existing = this._cleanupDrivers.get(driverKey);
		if (existing) {
			return existing;
		}
		const driver: ICleanupDriver = {
			key: driverKey,
			storageKey,
			source,
			keys,
			operation,
			initialProgress: progress,
			completion: new DeferredPromise<void>(),
			attempt: undefined,
			waitingForAvailability: false,
			blockedConnection: undefined,
		};
		this._cleanupDrivers.set(driverKey, driver);
		this._scheduleCleanupDriver(driver);
		return driver;
	}

	private _scheduleCleanupDriver(driver: ICleanupDriver): void {
		if (driver.completion.isSettled || driver.attempt) {
			return;
		}
		if (this._cleanupCancellation.token.isCancellationRequested) {
			this._settleCleanupDriver(driver);
			return;
		}
		let connection: IAgentConnection | undefined;
		if (driver.initialProgress.phase === 'cleanupPending') {
			const target = this._findCleanupTarget(driver.operation.provider);
			connection = target?.connection.get();
			if (target?.status.get() !== AgentHostRemoteTargetStatus.Connected
				|| !connection
				|| (driver.waitingForAvailability && driver.blockedConnection === connection)) {
				driver.waitingForAvailability = true;
				return;
			}
		}
		driver.waitingForAvailability = false;
		driver.blockedConnection = undefined;
		let attempt: Promise<void>;
		attempt = this._drivePendingCleanup(driver, connection).finally(() => {
			if (driver.attempt !== attempt) {
				return;
			}
			driver.attempt = undefined;
			if (!driver.completion.isSettled) {
				this._scheduleCleanupDriver(driver);
			}
		});
		driver.attempt = attempt;
	}

	private async _drivePendingCleanup(driver: ICleanupDriver, attemptedConnection: IAgentConnection | undefined): Promise<void> {
		const token = this._cleanupCancellation.token;
		let retryCount = 0;
		if (driver.initialProgress.phase === 'cleanupPending') {
			try {
				await timeout(CLEANUP_RETRY_INITIAL_DELAY_MS, token);
			} catch (error) {
				if (isCancellationError(error)) {
					return;
				}
				throw error;
			}
		}
		while (!token.isCancellationRequested) {
			try {
				await this._completePendingCleanup(driver);
				this._settleCleanupDriver(driver);
				return;
			} catch (error) {
				if (token.isCancellationRequested) {
					return;
				}
				if (driver.initialProgress.phase === 'cleanupPending'
					&& this._shouldWaitForCleanupTarget(driver.operation.provider, attemptedConnection, error)) {
					driver.waitingForAvailability = true;
					driver.blockedConnection = attemptedConnection;
					return;
				}
				if (retryCount >= CLEANUP_RETRY_LIMIT) {
					this._logService.error(`[RemoteSessionDelegation] Pending child cleanup paused after bounded retries: ${getErrorMessage(error)}`);
					this._settleCleanupDriver(driver);
					return;
				}
				const delay = Math.min(CLEANUP_RETRY_INITIAL_DELAY_MS * (2 ** retryCount), CLEANUP_RETRY_MAX_DELAY_MS);
				retryCount++;
				try {
					await timeout(delay, token);
				} catch (timeoutError) {
					if (isCancellationError(timeoutError)) {
						return;
					}
					throw timeoutError;
				}
			}
		}
	}

	private _settleCleanupDriver(driver: ICleanupDriver): void {
		if (this._cleanupDrivers.get(driver.key) === driver) {
			this._cleanupDrivers.delete(driver.key);
		}
		void driver.completion.complete(undefined);
	}

	private _findCleanupTarget(provider: string): IAgentHostRemoteTargetHandle | undefined {
		const targets = this._targets.map(target => ({
			authority: toRemoteSessionTargetHandle(target.connectorId, target.targetId),
			target,
		}));
		const authority = findRemoteAgentHostSessionTypeAuthority(provider, targets.map(candidate => candidate.authority));
		return targets.find(candidate => candidate.authority === authority)?.target;
	}

	private _shouldWaitForCleanupTarget(provider: string, attemptedConnection: IAgentConnection | undefined, error: unknown): boolean {
		const target = this._findCleanupTarget(provider);
		const connection = target?.connection.get();
		return error instanceof AgentHostRemoteTargetUnavailableError
			|| target?.status.get() !== AgentHostRemoteTargetStatus.Connected
			|| !connection
			|| connection !== attemptedConnection;
	}

	private async _completePendingCleanup(driver: ICleanupDriver): Promise<void> {
		const ref = await this._sessionDataService.tryOpenDatabase(driver.source);
		try {
			let progress = driver.initialProgress;
			if (ref) {
				const stored = await ref.object.getMetadataObject({
					[driver.keys.invocation]: true,
					[driver.keys.progress]: true,
					[driver.keys.result]: true,
				});
				const invocation = parseStoredInvocation(stored[driver.keys.invocation]);
				const persistedProgress = parseStoredProgress(stored[driver.keys.progress]);
				if (!invocation?.operation || !persistedProgress || !equals(invocation.operation, driver.operation)) {
					throw new Error(`Invalid persisted cleanup state for ${CREATE_REMOTE_SESSION_TOOL_NAME}.`);
				}
				if (persistedProgress.phase !== 'cleanupPending' && persistedProgress.phase !== 'cleanupComplete') {
					await this._deleteDurableCleanup(driver);
					return;
				}
				progress = persistedProgress;
				if (progress.phase === 'cleanupComplete' && parseStoredResult(stored[driver.keys.result])) {
					await this._deleteDurableCleanup(driver);
					return;
				}
			}
			let terminalProgress = progress;
			if (progress.phase === 'cleanupPending') {
				const session = URI.parse(driver.operation.session);
				await this._sessionToolCallbacks.accessor.deleteSession(session);
				if (!ref) {
					await this._deleteDurableCleanup(driver);
					return;
				}
				if (progress.retry) {
					await this._persistProgress(ref.object, driver.keys.progress, { version: METADATA_VERSION, phase: 'planned' });
					await this._deleteDurableCleanup(driver);
					return;
				}
				if (!progress.error) {
					throw new Error(`Invalid persisted cleanup error for ${CREATE_REMOTE_SESSION_TOOL_NAME}.`);
				}
				terminalProgress = {
					version: METADATA_VERSION,
					phase: 'cleanupComplete',
					error: progress.error,
				};
				await this._persistProgress(ref.object, driver.keys.progress, terminalProgress);
			}
			if (!ref) {
				await this._deleteDurableCleanup(driver);
				return;
			}
			if (terminalProgress.phase !== 'cleanupComplete') {
				return;
			}
			await this._persistResult(ref.object, driver.keys.result, {
				version: METADATA_VERSION,
				kind: 'failure',
				error: terminalProgress.error,
			});
			await this._deleteDurableCleanup(driver);
		} finally {
			ref?.dispose();
		}
	}

	private _claimSessionCreation(session: string): ISessionCreationClaim {
		try {
			return this._sessionToolCallbacks.sessionCreationBudget.claim(session);
		} catch (error) {
			throw new RemoteSessionDelegationError(getErrorMessage(error), 'remoteSessionDelegationLimit');
		}
	}

	private _validateConfirmation(request: SessionToolClientExecutionRequest): void {
		if (sessionToolRequiresConfirmation(SessionServerToolName.CreateSession)
			&& request.toolCall.confirmed === ToolCallConfirmationReason.NotNeeded) {
			throw new RemoteSessionDelegationError(
				'Creating a remote session requires confirmation.',
				'remoteSessionConfirmationRequired',
			);
		}
	}

	private _assertSourceAvailable(source: IRemoteSessionDelegationSource): void {
		const summary = this._stateManager.getSessionSummary(source.session.toString());
		const spawnDepth = readRequiredSessionSpawnDepth(summary?._meta);
		if (!summary || spawnDepth === undefined || spawnDepth !== source.spawnDepth) {
			throw new RemoteSessionDelegationError(
				`Remote delegation source is not resident: ${source.session.toString()}.`,
				'remoteDelegationSourceUnavailable',
			);
		}
	}

	private _resolveDestination(source: IRemoteSessionDelegationSource, args: ICreateRemoteSessionArgs): IRemoteSessionDestination {
		if (!this._remoteAgentsService.enabled.get()) {
			throw new RemoteSessionDelegationError('Remote Agent Hosts are disabled.', 'remoteAgentHostsDisabled');
		}
		const target = this._targets.find(candidate => toRemoteSessionTargetHandle(candidate.connectorId, candidate.targetId) === args.target);
		if (!target) {
			throw new RemoteSessionDelegationError(`Remote target is not admitted: ${args.target}.`, 'remoteTargetUnavailable');
		}
		if (target.connectorId === source.connectorId && target.targetId === source.targetId) {
			throw new RemoteSessionDelegationError('The source remote target cannot delegate back to itself.', 'remoteDelegationCycle');
		}
		if (target.status.get() !== AgentHostRemoteTargetStatus.Connected || !target.connection.get()) {
			throw new RemoteSessionDelegationError(`Remote target is unavailable: ${target.connectorId}/${target.targetId}.`, 'remoteTargetUnavailable');
		}
		const connection = target.requireConnection();
		const rootState = connection.rootState.value;
		if (!rootState || rootState instanceof Error || !rootState.agents.some(agent => agent.provider === args.provider)) {
			throw new RemoteSessionDelegationError(`Remote provider is unavailable on the admitted target: ${args.provider}.`, 'remoteProviderUnavailable');
		}
		const localProvider = this._providerService.getProvider(remoteAgentHostSessionTypeId(args.target, args.provider));
		if (!localProvider) {
			throw new RemoteSessionDelegationError(`Remote provider is unavailable on the admitted target: ${args.provider}.`, 'remoteProviderUnavailable');
		}
		return { target, targetHandle: args.target, provider: args.provider, localProvider };
	}
}
