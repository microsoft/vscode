/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import { Sequencer, timeout } from '../../../../../../base/common/async.js';
import { Disposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue, type IObservable } from '../../../../../../base/common/observable.js';
import * as path from '../../../../../../base/common/path.js';
import { localize } from '../../../../../../nls.js';
import type { ILogService } from '../../../../../log/common/log.js';
import type { ITelemetryService } from '../../../../../telemetry/common/telemetry.js';
import type { ILocalModelErrorV1, LocalModelLoadRetryReason, LocalModelServerState, LocalModelServingProfile } from '../../../../common/localModel.js';
import { errorCodeForLog } from '../../../../common/logRedaction.js';
import { FIRST_OUTPUT_TIMEOUT_MS, IDLE_UNLOAD_MS, LLAMA_API_KEY_ENV, LOAD_TIMEOUT_MS, MAX_AUTO_TTFT_MS, MIN_AUTO_DECODE_TPS, RESTART_BACKOFF_MS, SERVER_API_KEY_BYTES, SERVER_HEALTH_POLL_MS, SERVER_PORT_BIND_RETRIES, SIGKILL_GRACE_MS, STDERR_TAIL_BYTES, SYSTEM_DRAIN_TIMEOUT_MS, WARMUP_GENERATED_TOKENS } from './constants.js';
import { createLlamaRuntimeError, createRuntimeUnsupportedModelError, LLAMA_CPP_DIRECTIONS_ACTIONS } from './llamaCppRuntime.js';
import { acquireProcessLock, clearStaleProcessLock, type IProcessLock, type IProcessLockOptions } from './processLock.js';
import { PROCESS_START_TIME_TOLERANCE_MS, type ILongLivedProcess, type ILongLivedProcessSpawner, type IProcessControl, type IProcessIdentity } from './processRunner.js';
import { LocalModelServingError, type ILocalModelClock, type ILocalModelLoopbackEndpoint, type ILocalModelServerProps, type IServingHold, type IServingIdentity, type IServingLease } from './servingAccess.js';
import { classifyServerStartFailure, nextServerDowngrade, type IServerStartConfig, type ServerDowngradeStep, type ServerFailurePhase } from './servingProfile.js';

/*
 * The `llama-server` supervisor: one server at a time with one owner per machine, admission before every
 * spawn, readiness and warm-up, start-failure downgrades, idle unload, crash restarts, orphan recovery and
 * drains. It knows nothing about catalogs or swaps: the provider hands it a launch plan.
 */

// #region Launch plan

/** Admission right before a spawn: the device to bind, or a temporary/permanent rejection. */
export type ServerAdmission =
	| { readonly admitted: true; readonly device: string }
	| { readonly admitted: false; readonly error: ILocalModelErrorV1 };

/** Everything needed to start one model. Built by the provider; never logged (it holds paths). */
export interface IServerLaunchPlan {
	readonly familyId: string;
	readonly contentId: string;
	readonly capiId: string;
	/** `--alias`: the Azure ML asset name. */
	readonly alias: string;
	readonly displayName: string;
	/** Real path of the setting's `llama-server`; recorded as the server's image path. */
	readonly binaryPath: string;
	/** Working directory: the version directory (the preset names the draft GGUF relative to it). */
	readonly versionDir: string;
	readonly familyDir: string;
	/** Absolute path of the primary GGUF. */
	readonly modelPath: string;
	/** The preset uses a draft model (`--device-draft` binds it to the same device). */
	readonly hasDraft: boolean;
	readonly parallel: number;
	readonly profile: LocalModelServingProfile;
	readonly ctxReduced: boolean;
	/** GPU backend, for telemetry. */
	readonly backend: string;
	/** `llama-server --version` as shown in the status (`0.6.0-dev (b11459)`), for the `runtimeUnsupportedModel` message. */
	readonly runtimeVersion?: string;
	/** `general.architecture` of the primary GGUF, for the `runtimeUnsupportedModel` message. */
	readonly architecture?: string;
	readonly initialConfig: IServerStartConfig;
	/** Called once when speculative decoding (DFlash) crashed this build and the model is served without it; the provider records it so later starts skip DFlash. */
	onSpeculativeUnsupported?(): void;
	/** Preset arguments plus profile overrides for a start configuration (downgrade steps change it). */
	buildArgs(config: IServerStartConfig): readonly string[];
	/** Runs admission (fresh `--list-devices`, free memory, footprint) for `config`; never cached. */
	admit(config: IServerStartConfig, signal: AbortSignal): Promise<ServerAdmission>;
	/** The activation this plan was prepared for; once aborted, a pending start is abandoned before spawning and never restarted. */
	readonly signal?: AbortSignal;
}

/** Inputs of {@link buildLlamaServerArgs}. */
export interface ILlamaServerArgsInput {
	readonly modelPath: string;
	readonly alias: string;
	readonly device: string;
	readonly draftDevice: boolean;
	readonly ctxSize: number;
	readonly parallel: number;
	readonly port: number;
	/**
	 * The per-spawn API key, passed as `--api-key` only for a build that ignored {@link LLAMA_API_KEY_ENV}.
	 * Otherwise it travels in the environment so it never shows in process listings, which other users can read on Linux and macOS.
	 */
	readonly commandLineApiKey?: string;
	readonly presetArgs: readonly string[];
}

/**
 * The `llama-server` command line: loopback only, an ephemeral port, the model pinned to the selected device,
 * then the preset arguments with profile overrides. The per-spawn API key is on it only as a fallback. Pure.
 */
export function buildLlamaServerArgs(input: ILlamaServerArgsInput): string[] {
	return [
		'--host', '127.0.0.1',
		'--port', String(input.port),
		'--model', input.modelPath,
		'--alias', input.alias,
		'--device', input.device,
		'--split-mode', 'none',
		...(input.draftDevice ? ['--device-draft', input.device] : []),
		'--ctx-size', String(input.ctxSize),
		'--parallel', String(input.parallel),
		...(input.commandLineApiKey !== undefined ? ['--api-key', input.commandLineApiKey] : []),
		...input.presetArgs,
	];
}

const SECRET_ENV_PATTERN = /TOKEN|SECRET|PASSWORD|API_?KEY|CREDENTIAL|AUTH|COOKIE|COPILOT|GITHUB|^GH_|AZURE|OPENAI|ANTHROPIC|^LLAMA_|^VSCODE_/i;

/** Requests without the key a ready server gets to show that it refuses them before it is published; inconclusive after these. */
const API_KEY_PROBE_ATTEMPTS = 3;
const API_KEY_PROBE_TIMEOUT_MS = 5_000;

/**
 * Environment of `llama-server`: the host environment without credential-like variables and without `LLAMA_*`
 * variables (llama.cpp reads them as arguments), plus the per-spawn API key as {@link LLAMA_API_KEY_ENV}. Pure.
 */
export function buildServerEnvironment(env: Readonly<Record<string, string | undefined>>, apiKey: string): Record<string, string> {
	return {
		...Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !SECRET_ENV_PATTERN.test(entry[0]))),
		[LLAMA_API_KEY_ENV]: apiKey,
	};
}

/** Picks the last {@link STDERR_TAIL_BYTES} characters. */
function tail(text: string): string {
	return text.length > STDERR_TAIL_BYTES ? text.slice(text.length - STDERR_TAIL_BYTES) : text;
}

const ADDRESS_IN_USE = /couldn'?t bind|address already in use|eaddrinuse|only one usage of each socket address|failed to bind/i;

// #endregion

// #region Server ownership

/** `type` of the server lock (see `processLock.ts`), scoped to the models directory: one server owner per machine. */
export const SERVER_LOCK_TYPE = 'lmsrv';

/** `<azureml-models>/.vscode-server.json`: the server the lock holder runs, for orphan recovery. */
export const SERVER_RECORD_FILE_NAME = '.vscode-server.json';

/** A recorded server: pid, start time, image path and port. */
export interface IServerRecord extends IProcessIdentity {
	readonly imagePath: string;
	readonly port: number;
}

/** Reads the server record; `undefined` when it is incomplete or garbled. Pure. */
export function parseServerRecord(raw: string): IServerRecord | undefined {
	try {
		const value = JSON.parse(raw) as { pid?: unknown; processStartTime?: unknown; imagePath?: unknown; port?: unknown } | null;
		return value && isFiniteNumber(value.pid) && isFiniteNumber(value.processStartTime) && typeof value.imagePath === 'string' && isFiniteNumber(value.port)
			? { pid: value.pid, processStartTime: value.processStartTime, imagePath: value.imagePath, port: value.port }
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * What orphan recovery found: nothing that may still run (`none`), a live owner (`ownedElsewhere`), or a server
 * that may still run (`orphan`: Stop Previous Server), including a lock its dead holder left behind (macOS).
 */
export type PreviousServerCheck = 'none' | 'ownedElsewhere' | 'orphan';

function errorCodeOf(error: unknown): string | undefined {
	const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
	return typeof code === 'string' ? code : undefined;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
	const normalize = (value: string) => {
		const normalized = path.normalize(value);
		return platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized;
	};
	return normalize(a) === normalize(b);
}

// #endregion

// #region Telemetry

export type LocalModelServerEventKind = 'ready' | 'startFailed' | 'crash' | 'restart' | 'idleUnload' | 'admissionRejected' | 'memoryBusy' | 'ownedElsewhere' | 'orphanRecovered' | 'profileDowngraded' | 'swapStarted' | 'swapCompleted' | 'swapCancelled' | 'stopNow';

/** `localModel.server`. Never carries paths, ports, keys or model names. */
export interface ILocalModelServerEvent {
	event: LocalModelServerEventKind;
	target: string;
	backend: string;
	profile: string;
	ctxReduced: boolean;
	autoEligible: boolean;
	decodeTps: number;
	ttftMs: number;
	loadMs: number;
	drainMs: number;
	drainedStreams: number;
	nCtx: number;
	slots: number;
	errorCode: string;
}

type LocalModelServerClassification = {
	event: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Supervisor event: ready, startFailed, crash, restart, idleUnload, admissionRejected, memoryBusy, ownedElsewhere, orphanRecovered, profileDowngraded, swapStarted, swapCompleted, swapCancelled (the user cancelled a model change; while it waited for running responses, the previous model stays loaded) or stopNow.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Platform and architecture, for example win32-arm64.' };
	backend: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'GPU backend of the bound device (vulkan, metal, ...) or empty.' };
	profile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Serving profile: full-gpu, near-fit or empty.' };
	ctxReduced: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the context window was reduced to fit the device.' };
	autoEligible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the warm-up passed the Auto performance gate.' };
	decodeTps: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Warm-up decode throughput in tokens per second, or -1.' };
	ttftMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Warm-up time to first token in milliseconds, or -1.' };
	loadMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time from spawn to ready in milliseconds, or -1.' };
	drainMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time spent waiting for running responses before a stop or swap (for swapCancelled, before the cancel), or -1.' };
	drainedStreams: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Running responses when the drain started (for swapCancelled, still running at the cancel), or -1.' };
	nCtx: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Context size reported by the server, or -1.' };
	slots: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Parallel slots reported by the server, or -1.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-set error code (for example memoryBusy, crashed, startFailed), or empty.' };
	owner: 'lramos15';
	comment: 'Health of the on-device model server: starts, failures, crashes, drains and swaps.';
};

/** Emits `localModel.server`, filling unset fields with neutral values. */
export function reportLocalModelServer(telemetryService: Pick<ITelemetryService, 'publicLog2'> | undefined, event: Partial<ILocalModelServerEvent> & Pick<ILocalModelServerEvent, 'event' | 'target'>): void {
	telemetryService?.publicLog2<ILocalModelServerEvent, LocalModelServerClassification>('localModel.server', {
		backend: '',
		profile: '',
		ctxReduced: false,
		autoEligible: false,
		decodeTps: -1,
		ttftMs: -1,
		loadMs: -1,
		drainMs: -1,
		drainedStreams: -1,
		nCtx: -1,
		slots: -1,
		errorCode: '',
		...event,
	});
}

// #endregion

// #region Supervisor

/** Warm-up measurements of a started server. */
export interface IServerWarmupResult {
	readonly decodeTps: number | undefined;
	readonly ttftMs: number | undefined;
	readonly outputTokens: number;
}

/** Whether a warm-up passes the Auto performance gate. Pure. */
export function passesAutoGate(warmup: IServerWarmupResult | undefined): boolean {
	return !!warmup && warmup.decodeTps !== undefined && warmup.ttftMs !== undefined && warmup.decodeTps >= MIN_AUTO_DECODE_TPS && warmup.ttftMs <= MAX_AUTO_TTFT_MS;
}

/** The supervisor's published state. */
export interface IServerSupervisorState {
	readonly server: LocalModelServerState;
	/** The plan being started or served, or the last one. */
	readonly plan: IServerLaunchPlan | undefined;
	/** Identity of the current load while `ready`; the last load otherwise. */
	readonly identity: IServingIdentity | undefined;
	readonly endpoint?: ILocalModelLoopbackEndpoint;
	readonly props?: ILocalModelServerProps;
	readonly autoEligible: boolean;
	readonly device?: string;
	readonly config?: IServerStartConfig;
	readonly warmup?: IServerWarmupResult;
	readonly error?: ILocalModelErrorV1;
	/** Set while a stop waits for running responses: {@link ServerSupervisor.responseCount} for a `user` stop, in-flight requests for a `system` stop. */
	readonly drain?: { readonly runningStreams: number; readonly kind: 'user' | 'system' };
	/** While `starting` with a spawned server: the step of this attempt, when it was spawned, and its configuration and device. */
	readonly load?: IServerLoadProgress;
	/** While `ready`: how long the attempt that became ready took, from its spawn to the end of the warm-up. */
	readonly loaded?: IServerLoadRecord;
}

/** The attempt being loaded. A downgrade retry is a new attempt with its own start. */
export interface IServerLoadProgress {
	/** `loading`: spawned, `/health` answers 503; `warmingUp`: healthy, serving the warm-up request. */
	readonly step: 'loading' | 'warmingUp';
	/** Epoch ms of the spawn. */
	readonly startedAt: number;
	readonly device: string;
	readonly config: IServerStartConfig;
	/** `withoutSpeculativeDecoding` when this attempt retries a start that speculative decoding crashed. */
	readonly retry?: LocalModelLoadRetryReason;
}

/** A completed load: the duration of the attempt that became ready, with what it loaded. */
export interface IServerLoadRecord {
	readonly durationMs: number;
	readonly device: string;
	readonly config: IServerStartConfig;
}

/** Why a start was requested; only crash restarts keep the backoff counter. */
export type ServerStartReason = 'trigger' | 'restart';

/** How a stop treats running responses. */
export type ServerStopKind = 'user' | 'system' | 'idle';

/** Tunables; tests and the real-device validation shorten them. */
export interface IServerSupervisorTimings {
	readonly loadTimeoutMs: number;
	readonly idleUnloadMs: number;
	readonly healthPollMs: number;
	readonly restartBackoffMs: readonly number[];
	readonly systemDrainTimeoutMs: number;
	readonly warmupTimeoutMs: number;
	/** A crash after this much uptime starts a fresh backoff sequence. */
	readonly crashResetMs: number;
	/** Retry delays for server-record writes or deletions the file system refused (`EPERM`/`EBUSY`/`EACCES`, e.g. antivirus on Windows). */
	readonly recordRetryDelaysMs: readonly number[];
	/** How long a termination waits to observe the process gone before it escalates, then gives up as unconfirmed. */
	readonly exitWaitMs: number;
	/** Windows: how much longer to wait for a server `taskkill /T /F` terminated to exit (a large model can be slow to release GPU memory). */
	readonly terminatedExitWaitMs: number;
}

export const DEFAULT_SERVER_SUPERVISOR_TIMINGS: IServerSupervisorTimings = {
	loadTimeoutMs: LOAD_TIMEOUT_MS,
	idleUnloadMs: IDLE_UNLOAD_MS,
	healthPollMs: SERVER_HEALTH_POLL_MS,
	restartBackoffMs: RESTART_BACKOFF_MS,
	systemDrainTimeoutMs: SYSTEM_DRAIN_TIMEOUT_MS,
	warmupTimeoutMs: FIRST_OUTPUT_TIMEOUT_MS,
	crashResetMs: 5 * 60_000,
	recordRetryDelaysMs: [25, 100, 250, 500, 1000],
	exitWaitMs: SIGKILL_GRACE_MS + 1_000,
	terminatedExitWaitMs: 30_000,
};

/** Dependencies of {@link ServerSupervisor}, injected so tests never start processes. */
export interface IServerSupervisorOptions {
	readonly spawner: ILongLivedProcessSpawner;
	readonly processControl: IProcessControl;
	/** Loopback fetch (never through a proxy). */
	readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
	readonly clock: ILocalModelClock;
	readonly log: ILogService;
	readonly telemetry?: Pick<ITelemetryService, 'publicLog2'>;
	/** `<COPILOT_HOME>/azureml-models`: scope of the server lock, and where the server record lives. */
	readonly modelsDir: string;
	readonly platform: NodeJS.Platform;
	/** `platform-arch`, for telemetry. */
	readonly target: string;
	/** For redacting server output. */
	readonly homeDir: string;
	/** Environment the server inherits before filtering (see {@link buildServerEnvironment}). */
	readonly env: Readonly<Record<string, string | undefined>>;
	/** Ephemeral loopback port (listen on 0, then close). */
	readonly allocatePort?: () => Promise<number>;
	readonly randomHex?: (bytes: number) => string;
	readonly timings?: Partial<IServerSupervisorTimings>;
	/** Writes the server record; tests inject failures. */
	readonly writeRecord?: (file: string, text: string) => Promise<void>;
	/** Server lock seams (tests simulate a stale macOS lock). */
	readonly lockOptions?: IProcessLockOptions;
}

/** Listens on port 0 on the loopback interface, reads the port and closes. */
export function allocateEphemeralPort(): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = address && typeof address === 'object' ? address.port : 0;
			server.close(() => port ? resolve(port) : reject(new Error('No port')));
		});
	});
}

interface IRunningServer {
	readonly child: ILongLivedProcess;
	readonly plan: IServerLaunchPlan;
	readonly endpoint: ILocalModelLoopbackEndpoint;
	readonly stderr: { text: string };
	readonly listeners: IDisposable[];
	/** Set when the supervisor itself terminates the process. */
	terminating: boolean;
	exited: boolean;
	/** Requests leased on it after it was ready. */
	requests: number;
	/** The serving generation, once it became ready. */
	generation?: number;
}

interface IDrainWaiter {
	readonly generation: number;
	/** `system` drains wait only for in-flight requests, up to the system drain timeout; `user` drains wait for every response. */
	kind: 'user' | 'system';
	/** The system drain timeout. */
	timer?: IDisposable;
	readonly resolve: () => void;
}

/** A turn's hold on one generation ({@link ServerSupervisor.acquireHold}). */
class ServerHold implements IServingHold {
	/** In-flight requests leased through this hold. */
	streams = 0;
	released = false;

	constructor(
		readonly servingGeneration: number,
		private readonly _onRelease: (hold: ServerHold) => void,
	) { }

	dispose(): void {
		if (!this.released) {
			this.released = true;
			this._onRelease(this);
		}
	}
}

/** What a stop did, for the caller's telemetry. */
export interface IServerStopResult {
	/** Running responses when the stop started. */
	readonly drainedStreams: number;
	readonly drainMs: number;
	/** The drain ended through {@link ServerSupervisor.stopNow}. */
	readonly stopNow: boolean;
	/** The `user` stop was cancelled before it terminated the server, which serves as before. */
	readonly cancelled?: boolean;
}

type SpawnOutcome =
	| { readonly kind: 'ready'; readonly running: IRunningServer; readonly loadMs: number; readonly startedAt: number }
	| { readonly kind: 'failed'; readonly stderrTail: string; readonly exitCode: number | undefined; readonly phase?: ServerFailurePhase };

function errorOf(error: unknown, fallbackCode: string, message: string): LocalModelServingError {
	return error instanceof LocalModelServingError ? error : new LocalModelServingError(fallbackCode, message);
}

/** How long a failed warm-up waits to observe the server's exit (a crash on its first completion) before committing the start. */
const WARMUP_EXIT_GRACE_MS = 2_000;

/** Actions offered with a supervisor error code. Pure. */
export function getServerErrorActions(code: string): ILocalModelErrorV1['actions'] {
	switch (code) {
		case 'orphan': return ['stopPrevious'];
		case 'runtimeBlocked': return ['openSettings'];
		case 'runtimeUnsupportedModel':
		case 'runtimeTooOld':
		case 'runtimeNotFound':
			return [...LLAMA_CPP_DIRECTIONS_ACTIONS];
		case 'ownedElsewhere':
		case 'insufficientMemory':
			return [];
		default: return ['retry'];
	}
}

/**
 * Supervises the single `llama-server` of this Agent Host. Starts are serialized and single-flight per plan;
 * each successful start increments the serving generation that leases bind to. A user stop waits for running
 * responses with no timeout ({@link stopNow} ends it); a system stop waits at most 10 s, for in-flight requests only.
 */
export class ServerSupervisor extends Disposable {

	private readonly _state = observableValue<IServerSupervisorState>(this, { server: 'stopped', plan: undefined, identity: undefined, autoEligible: false });
	readonly state: IObservable<IServerSupervisorState> = this._state;

	private readonly _timings: IServerSupervisorTimings;
	private readonly _allocatePort: () => Promise<number>;
	private readonly _randomHex: (bytes: number) => string;

	private _generation = 0;
	private readonly _queue = new Sequencer();
	private _starting: { readonly key: string; readonly promise: Promise<IServingIdentity>; readonly signal: AbortSignal | undefined } | undefined;
	private _startAbort: AbortController | undefined;
	private _running: IRunningServer | undefined;
	/** A server of ours whose termination could not be confirmed: its record and the lock are kept and nothing replaces it until its exit is observed. */
	private _unconfirmed: IRunningServer | undefined;
	/** The server lock, held while a server of ours may run. */
	private _lock: IProcessLock | undefined;
	/** Serializes writes and deletions of the server record. */
	private readonly _recordIo = new Sequencer();
	private _admitting = false;
	private readonly _leases = new Map<number, number>();
	/** Turns holding each generation ({@link acquireHold}). */
	private readonly _holds = new Map<number, Set<ServerHold>>();
	private readonly _drainWaiters = new Set<IDrainWaiter>();
	/** Stop Now was requested for a queued or running stop; cleared once no stop is pending. */
	private _stopNowRequested = false;
	/** Stops queued or running ({@link stop}). */
	private _pendingStops = 0;
	/** System stops queued or running: a user drain meanwhile is a system drain. */
	private _pendingSystemStops = 0;
	private _crashCount = 0;
	private _readyAt = 0;
	/** Plans whose speculative decoding crashed this build: their restarts start without it. */
	private readonly _speculativeUnsupported = new WeakSet<IServerLaunchPlan>();
	/** `llama-server` binaries that did not confirm they enforce {@link LLAMA_API_KEY_ENV}: they get the key as `--api-key`. */
	private readonly _apiKeyOnCommandLine = new Set<string>();
	/** The plan whose ready server crashed on its first request with speculative decoding: its next start is that retry. */
	private _speculativeRestart: IServerLaunchPlan | undefined;
	private _restartTimer: IDisposable | undefined;
	private _idleTimer: IDisposable | undefined;
	private _disposed = false;

	constructor(private readonly _options: IServerSupervisorOptions) {
		super();
		this._timings = { ...DEFAULT_SERVER_SUPERVISOR_TIMINGS, ..._options.timings };
		this._allocatePort = _options.allocatePort ?? allocateEphemeralPort;
		this._randomHex = _options.randomHex ?? (bytes => randomBytes(bytes).toString('hex'));
		this._register(toDisposable(() => this._shutdown()));
	}

	/** The last assigned serving generation (0 before the first successful start). */
	get servingGeneration(): number {
		return this._generation;
	}

	/** Leases held on `generation` (in-flight requests). */
	leaseCount(generation: number): number {
		return this._leases.get(generation) ?? 0;
	}

	/** Running responses on `generation`: each holding turn counts once (also between requests), plus each in-flight request of no holding turn. */
	responseCount(generation: number): number {
		const holds = this._holds.get(generation);
		let owned = 0;
		for (const hold of holds ?? []) {
			owned += hold.streams;
		}
		return (holds?.size ?? 0) + Math.max(0, this.leaseCount(generation) - owned);
	}

	// #region Leases and holds

	/**
	 * A lease on `identity`'s generation, or `undefined` when it is not the ready, admitting one. A `hold` that
	 * {@link admitsHold admits} its turn also admits the lease during a user drain; the request then counts as that turn's.
	 */
	acquireLease(identity: IServingIdentity, hold?: IServingHold): IServingLease | undefined {
		const state = this._state.get();
		const generation = identity.servingGeneration;
		const holding = hold instanceof ServerHold && hold.servingGeneration === generation && this.admitsHold(hold) ? hold : undefined;
		if (!holding && (!this._admitting || state.server !== 'ready' || state.identity?.servingGeneration !== generation)) {
			return undefined;
		}
		this._leases.set(generation, this.leaseCount(generation) + 1);
		if (holding) {
			holding.streams++;
		}
		if (this._running) {
			this._running.requests++;
		}
		this._clearIdle();
		let released = false;
		return {
			identity,
			dispose: () => {
				if (released) {
					return;
				}
				released = true;
				if (holding) {
					holding.streams = Math.max(0, holding.streams - 1);
				}
				const remaining = Math.max(0, this.leaseCount(generation) - 1);
				if (remaining) {
					this._leases.set(generation, remaining);
				} else {
					this._leases.delete(generation);
				}
				this._onUseReleased(generation);
			},
		};
	}

	/**
	 * A turn's hold on `identity`'s generation, or `undefined` when it is not the ready, admitting one. It counts
	 * as a running response until it is disposed or the generation stops.
	 */
	acquireHold(identity: IServingIdentity): IServingHold | undefined {
		const state = this._state.get();
		const generation = identity.servingGeneration;
		if (!this._admitting || state.server !== 'ready' || state.identity?.servingGeneration !== generation || !this._running) {
			return undefined;
		}
		const hold = new ServerHold(generation, released => this._releaseHold(released));
		let holds = this._holds.get(generation);
		if (!holds) {
			holds = new Set();
			this._holds.set(generation, holds);
		}
		holds.add(hold);
		this._clearIdle();
		return hold;
	}

	/** Whether `hold` still admits its turn's requests: its generation runs, ready or in a user drain Stop Now did not end. */
	admitsHold(hold: IServingHold): boolean {
		if (!(hold instanceof ServerHold) || hold.released || !this._holds.get(hold.servingGeneration)?.has(hold)) {
			return false;
		}
		return this.admitsHolders(hold.servingGeneration);
	}

	/** Whether the requests of turns holding `generation` are admitted: it runs, ready or draining for a user stop that Stop Now did not end. */
	admitsHolders(generation: number): boolean {
		const state = this._state.get();
		const running = this._running;
		if (!running || running.terminating || running.exited || running.generation !== generation || state.identity?.servingGeneration !== generation || this._stopNowRequested) {
			return false;
		}
		return (state.server === 'ready' && this._admitting) || (state.server === 'stopping' && state.drain?.kind === 'user');
	}

	private _releaseHold(hold: ServerHold): void {
		const holds = this._holds.get(hold.servingGeneration);
		if (holds?.delete(hold)) {
			if (!holds.size) {
				this._holds.delete(hold.servingGeneration);
			}
			this._onUseReleased(hold.servingGeneration);
		}
	}

	/** The generation stopped: its holds end without waking anyone (nothing waits for a stopped generation). */
	private _releaseHolds(generation: number | undefined): void {
		const holds = generation === undefined ? undefined : this._holds.get(generation);
		if (!holds || generation === undefined) {
			return;
		}
		this._holds.delete(generation);
		for (const hold of holds) {
			hold.released = true;
		}
	}

	/** What a stop of `kind` waits for on `generation`. */
	private _drainCount(generation: number, kind: ServerStopKind): number {
		return kind === 'system' ? this.leaseCount(generation) : this.responseCount(generation);
	}

	private _onUseReleased(generation: number): void {
		const state = this._state.get();
		if (state.drain && state.identity?.servingGeneration === generation) {
			this._state.set({ ...state, drain: { ...state.drain, runningStreams: this._drainCount(generation, state.drain.kind) } }, undefined);
		}
		for (const waiter of [...this._drainWaiters]) {
			if (waiter.generation === generation && this._drainCount(generation, waiter.kind) === 0) {
				this._drainWaiters.delete(waiter);
				waiter.resolve();
			}
		}
		if (this.responseCount(generation) === 0) {
			this._armIdle();
		}
	}

	// #endregion

	// #region Start

	/** Starts `plan` (no-op when already ready); starts are serialized and single-flight per plan. Rejects with a {@link LocalModelServingError}. */
	start(plan: IServerLaunchPlan, reason: ServerStartReason = 'trigger'): Promise<IServingIdentity> {
		const key = planKey(plan);
		const state = this._state.get();
		if (state.server === 'ready' && state.plan && planKey(state.plan) === key && state.identity && this._running) {
			return Promise.resolve(state.identity);
		}
		if (plan.signal?.aborted) {
			return Promise.reject(new LocalModelServingError('modelNotActive', unavailableMessage(plan.displayName)));
		}
		// A start whose activation was superseded is not shared with a fresh one.
		if (this._starting?.key === key && !this._starting.signal?.aborted) {
			return this._starting.promise;
		}
		if (reason === 'trigger') {
			this._crashCount = 0;
		}
		this._restartTimer?.dispose();
		this._restartTimer = undefined;
		const promise = this._queue.queue(() => this._doStart(plan, reason));
		const starting = { key, promise, signal: plan.signal };
		this._starting = starting;
		const clear = () => {
			if (this._starting === starting) {
				this._starting = undefined;
			}
		};
		promise.then(clear, clear);
		return promise;
	}

	private async _doStart(plan: IServerLaunchPlan, reason: ServerStartReason): Promise<IServingIdentity> {
		if (this._disposed || plan.signal?.aborted) {
			throw new LocalModelServingError('modelNotActive', unavailableMessage(plan.displayName));
		}
		const current = this._state.get();
		if (current.server === 'ready' && current.plan && planKey(current.plan) === planKey(plan) && current.identity && this._running) {
			return current.identity;
		}
		if (this._running && this._currentLeases() > 0) {
			// Replacing a server terminates its running responses: only a completed drain may do that.
			this._options.log.warn('[LocalModelServer] Refusing to replace a server that has running responses; it must be drained first');
			throw new LocalModelServingError('modelNotActive', unavailableMessage(plan.displayName));
		}
		if (this._running) {
			// A different model is loaded with nothing in flight: unload it (confirmed below).
			await this._terminate();
		}
		const abort = new AbortController();
		const onPlanAborted = () => abort.abort();
		plan.signal?.addEventListener('abort', onPlanAborted);
		abort.signal.addEventListener('abort', () => this._onStartAborted(plan));
		this._startAbort = abort;
		this._admitting = false;
		this._setState({ server: 'starting', plan, identity: current.identity, autoEligible: false, endpoint: undefined, props: undefined, error: undefined, drain: undefined, warmup: undefined });
		const telemetryBase = { target: this._options.target, backend: plan.backend, profile: plan.profile, ctxReduced: plan.ctxReduced };
		let reported = false;
		try {
			// Never start a replacement while a server of ours may still be running.
			await this._confirmUnconfirmedGone();
			await this._acquireLock(plan);
			let config = this._speculativeUnsupported.has(plan) ? { ...plan.initialConfig, speculative: false } : plan.initialConfig;
			let retry: LocalModelLoadRetryReason | undefined = this._speculativeRestart === plan ? 'withoutSpeculativeDecoding' : undefined;
			this._speculativeRestart = undefined;
			const attempted: ServerDowngradeStep[] = [];
			let ready: { readonly running: IRunningServer; readonly props: ILocalModelServerProps; readonly warmup: IServerWarmupResult | undefined; readonly loadMs: number; readonly loaded: IServerLoadRecord };
			while (true) {
				const admission = await plan.admit(config, abort.signal);
				this._throwIfAborted(abort, plan);
				if (!admission.admitted) {
					reported = true;
					reportLocalModelServer(this._options.telemetry, { ...telemetryBase, event: admission.error.code === 'memoryBusy' ? 'memoryBusy' : 'admissionRejected', errorCode: admission.error.code });
					throw new LocalModelServingError(admission.error.code, admission.error.message);
				}
				let outcome = await this._spawnUntilHealthy(plan, config, admission.device, abort, retry);
				if (outcome.kind === 'ready') {
					const running = outcome.running;
					const spawnedAt = outcome.startedAt;
					this._setLoadStep(plan, { step: 'warmingUp', startedAt: spawnedAt, device: admission.device, config, ...(retry ? { retry } : {}) });
					const props = await this._readProps(running.endpoint, config, plan, abort.signal);
					this._throwIfAborted(abort, plan);
					let warmup: IServerWarmupResult | undefined;
					let warmedUp = false;
					if (this._isLive(running)) {
						warmedUp = true;
						const transport = { failed: false };
						warmup = await this._warmUp(running.endpoint, plan, abort.signal, transport);
						if (!warmup && transport.failed && !running.exited) {
							// A failed warm-up may be the server going down (a broken speculative
							// path aborts on its first completion): observe its exit before committing.
							const grace = timeout(WARMUP_EXIT_GRACE_MS);
							await Promise.race([running.child.exited, grace]).catch(() => undefined);
							grace.cancel();
						}
					}
					this._throwIfAborted(abort, plan);
					// Committed only while the child is still running: an exit during /props or
					// the warm-up (an allocation failure on the first request, for example) is a failed start.
					if (this._isLive(running)) {
						this._setState({ ...this._state.get(), device: admission.device, config });
						ready = { running, props, warmup, loadMs: outcome.loadMs, loaded: { durationMs: Math.max(0, this._options.clock.now() - spawnedAt), device: admission.device, config } };
						break;
					}
					const exitCode = (await running.child.exited).exitCode;
					await this._stopOrThrow(plan);
					outcome = { kind: 'failed', stderrTail: running.stderr.text, exitCode, phase: warmedUp ? 'warmUp' : 'load' };
				}
				const failure = classifyServerStartFailure(outcome.stderrTail, { speculative: config.speculative, phase: outcome.phase ?? 'load' });
				const next = nextServerDowngrade(config, attempted, failure);
				this._options.log.warn(`[LocalModelServer] llama-server exited during ${outcome.phase === 'warmUp' ? 'the warm-up' : 'load'} (exit ${outcome.exitCode ?? '?'}, ${failure}, ${outcome.stderrTail.length} characters of output)`);
				if (!next) {
					switch (failure) {
						case 'unsupportedArchitecture': {
							// No profile can help: this build doesn't know the model's architecture.
							const error = createRuntimeUnsupportedModelError(plan.runtimeVersion, plan.displayName, plan.architecture);
							throw new LocalModelServingError(error.code, error.message, error.actions);
						}
						case 'other':
						case 'specUnsupported':
							throw new LocalModelServingError('startFailed', startFailedMessage(plan.displayName));
						default: throw new LocalModelServingError('insufficientMemory', insufficientMemoryMessage(plan.displayName));
					}
				}
				attempted.push(next.step);
				config = next.config;
				retry = failure === 'specUnsupported' ? 'withoutSpeculativeDecoding' : undefined;
				if (failure === 'specUnsupported') {
					this._recordSpeculativeUnsupported(plan);
				}
				reportLocalModelServer(this._options.telemetry, { ...telemetryBase, event: 'profileDowngraded', ctxReduced: plan.ctxReduced || next.step === 'reduceContext', errorCode: failure === 'specUnsupported' ? 'specUnsupported' : next.step });
				this._options.log.info(`[LocalModelServer] Retrying with downgrade step ${next.step}${failure === 'specUnsupported' ? ' (speculative decoding crashed this llama.cpp build)' : ''}`);
				// The failed attempt is over: its step no longer describes the start. The retry is reported
				// as loading (and why) right away; its spawn restarts the clock.
				this._setLoadStep(plan, { step: 'loading', startedAt: this._options.clock.now(), device: admission.device, config, ...(retry ? { retry } : {}) });
			}

			const { running, props, warmup, loaded } = ready;
			const autoEligible = passesAutoGate(warmup);
			const identity: IServingIdentity = { familyId: plan.familyId, contentId: plan.contentId, capiId: plan.capiId, alias: plan.alias, servingGeneration: ++this._generation };
			running.generation = identity.servingGeneration;
			this._readyAt = this._options.clock.now();
			this._admitting = true;
			this._setState({ ...this._state.get(), server: 'ready', plan, identity, endpoint: running.endpoint, props, autoEligible, warmup, error: undefined, drain: undefined, loaded });
			this._armIdle();
			this._options.log.info(`[LocalModelServer] Ready: generation ${identity.servingGeneration}, loaded in ${(loaded.durationMs / 1000).toFixed(1)} s (${loaded.config.speculative ? 'with' : 'without'} speculative decoding, n_ctx ${loaded.config.ctxSize}, ${loaded.device}), n_ctx ${props.nCtx}, ${props.totalSlots} slot(s), ${warmup?.decodeTps?.toFixed(1) ?? '?'} tok/s, TTFT ${warmup?.ttftMs ?? '?'} ms, Auto ${autoEligible ? 'eligible' : 'not eligible'}`);
			reportLocalModelServer(this._options.telemetry, {
				...telemetryBase,
				event: reason === 'restart' ? 'restart' : 'ready',
				ctxReduced: plan.ctxReduced || config.ctxSize < plan.initialConfig.ctxSize,
				autoEligible,
				decodeTps: warmup?.decodeTps ?? -1,
				ttftMs: warmup?.ttftMs ?? -1,
				loadMs: ready.loadMs,
				nCtx: props.nCtx,
				slots: props.totalSlots,
			});
			return identity;
		} catch (error) {
			// A server of ours that may still run keeps its record and the lock, and blocks replacements.
			const stillRunning = !await this._terminate();
			if (!stillRunning) {
				await this._releaseLock();
			}
			if (abort.signal.aborted && !stillRunning) {
				this._setState({ ...this._state.get(), server: 'stopped', endpoint: undefined, props: undefined, autoEligible: false });
				throw new LocalModelServingError('modelNotActive', unavailableMessage(plan.displayName));
			}
			const servingError = stillRunning
				? new LocalModelServingError('orphan', stillRunningMessage(plan.displayName))
				: errorOf(error, 'startFailed', startFailedMessage(plan.displayName));
			this._setState({ ...this._state.get(), server: 'error', endpoint: undefined, props: undefined, autoEligible: false, error: { code: servingError.code, message: servingError.message, actions: servingError.actions ?? getServerErrorActions(servingError.code) } });
			if (!reported && servingError.code !== 'ownedElsewhere') {
				reportLocalModelServer(this._options.telemetry, { ...telemetryBase, event: 'startFailed', errorCode: servingError.code });
			}
			this._options.log.warn(`[LocalModelServer] Start failed (${servingError.code})`);
			throw servingError;
		} finally {
			plan.signal?.removeEventListener('abort', onPlanAborted);
			if (this._startAbort === abort) {
				this._startAbort = undefined;
			}
		}
	}

	/** Publishes the step of the attempt in progress, while plan is still the one starting. */
	private _setLoadStep(plan: IServerLaunchPlan, load: IServerLoadProgress): void {
		const state = this._state.get();
		if (state.server === 'starting' && state.plan === plan) {
			this._setState({ ...state, load });
		}
	}

	/** The child is still the running server and has not exited. */
	private _isLive(running: IRunningServer): boolean {
		return this._running === running && !running.exited && !running.terminating;
	}

	/** Remembers (for this plan's restarts) and reports (to the provider, which persists it) that speculative decoding crashed this build. */
	private _recordSpeculativeUnsupported(plan: IServerLaunchPlan): void {
		if (this._speculativeUnsupported.has(plan)) {
			return;
		}
		this._speculativeUnsupported.add(plan);
		try {
			plan.onSpeculativeUnsupported?.();
		} catch (error) {
			this._options.log.warn(`[LocalModelServer] Recording the speculative decoding downgrade failed (${errorCodeForLog(error)})`);
		}
	}

	private _throwIfAborted(abort: AbortController, plan: IServerLaunchPlan): void {
		if (abort.signal.aborted || this._disposed) {
			throw new LocalModelServingError('modelNotActive', unavailableMessage(plan.displayName));
		}
	}

	private async _spawnUntilHealthy(plan: IServerLaunchPlan, config: IServerStartConfig, device: string, abort: AbortController, retry: LocalModelLoadRetryReason | undefined): Promise<SpawnOutcome> {
		for (let attempt = 0; attempt <= SERVER_PORT_BIND_RETRIES; attempt++) {
			const port = await this._allocatePort();
			const apiKey = this._randomHex(SERVER_API_KEY_BYTES);
			const keyOnCommandLine = this._apiKeyOnCommandLine.has(plan.binaryPath);
			const args = buildLlamaServerArgs({
				modelPath: plan.modelPath,
				alias: plan.alias,
				device,
				draftDevice: plan.hasDraft && config.speculative,
				ctxSize: config.ctxSize,
				parallel: plan.parallel,
				port,
				...(keyOnCommandLine ? { commandLineApiKey: apiKey } : {}),
				presetArgs: plan.buildArgs(config),
			});
			// Immediately before spawning, after all launch preparation: a superseded activation or a
			// stop never starts a process.
			this._throwIfAborted(abort, plan);
			const spawning = this._options.clock.now();
			const child = this._options.spawner.spawn(plan.binaryPath, args, {
				cwd: plan.versionDir,
				env: buildServerEnvironment(this._options.env, apiKey),
				detached: this._options.platform !== 'win32',
			});
			const started = this._options.clock.now();
			this._setLoadStep(plan, { step: 'loading', startedAt: spawning, device, config, ...(retry ? { retry } : {}) });
			const stderr = { text: '' };
			const listeners = [
				child.onStderr(chunk => stderr.text = tail(stderr.text + chunk)),
				child.onStdout(chunk => stderr.text = tail(stderr.text + chunk)),
			];
			const endpoint: ILocalModelLoopbackEndpoint = { baseUrl: `http://127.0.0.1:${port}`, apiKey };
			const running: IRunningServer = { child, plan, endpoint, stderr, listeners, terminating: false, exited: false, requests: 0 };
			void child.exited.then(result => {
				running.exited = true;
				void this._deleteRecord();
				if (this._unconfirmed === running) {
					// A server whose termination could not be confirmed has exited after all: the lock can go.
					this._unconfirmed = undefined;
					this._options.log.info('[LocalModelServer] A server that did not stop in time has now exited');
					void this._releaseLock();
				}
				if (this._running === running && !running.terminating) {
					this._onUnexpectedExit(running, result.exitCode);
				}
			});
			if (child.pid === undefined) {
				const result = await child.exited;
				listeners.forEach(listener => listener.dispose());
				if (result.spawnErrorCode === 'EPERM' || result.spawnErrorCode === 'EACCES') {
					const error = createLlamaRuntimeError({ code: 'runtimeBlocked' }, {});
					throw new LocalModelServingError('runtimeBlocked', error.message);
				}
				throw new LocalModelServingError('startFailed', startFailedMessage(plan.displayName));
			}
			this._running = running;
			// Never run a server that orphan recovery could not find. (Should this process die before the
			// record is written, the server runs unrecorded until the user closes it; admission meanwhile
			// reports `memoryBusy`.)
			if (!await this._writeRecord(running, child.pid, port, started - spawning <= PROCESS_START_TIME_TOLERANCE_MS / 2 ? started : undefined)) {
				if (!await this._terminate()) {
					throw new LocalModelServingError('orphan', stillRunningMessage(plan.displayName));
				}
				throw new LocalModelServingError('startFailed', serverRecordFailedMessage(plan.displayName));
			}

			const health = await this._waitHealthy(endpoint, running, abort.signal, started + this._timings.loadTimeoutMs);
			let outcome: 'ready' | 'exited' | 'timeout' | 'aborted' = health;
			if (health === 'ready') {
				// Readiness is published only once the server is known to refuse requests without the key.
				const enforcement = await this._confirmApiKeyEnforced(endpoint, running, abort.signal);
				if (enforcement === 'enforced') {
					return { kind: 'ready', running, loadMs: this._options.clock.now() - started, startedAt: spawning };
				}
				if (enforcement === 'notEnforced' || enforcement === 'inconclusive') {
					await this._stopOrThrow(plan);
					this._throwIfAborted(abort, plan);
					if (!keyOnCommandLine) {
						// The build may ignore `LLAMA_API_KEY`, so any local process could use this server: replace it with one that takes the key on its command line.
						this._options.log.warn(`[LocalModelServer] llama-server did not confirm it requires the API key from LLAMA_API_KEY (${enforcement}); restarting it with --api-key`);
						this._apiKeyOnCommandLine.add(plan.binaryPath);
						continue;
					}
					// Even the command-line key isn't confirmed: never serve with authentication unknown.
					this._options.log.warn(`[LocalModelServer] llama-server did not confirm it requires its --api-key (${enforcement}); it was stopped`);
					throw new LocalModelServingError('startFailed', startFailedMessage(plan.displayName));
				}
				outcome = enforcement;
			}
			const exitCode = running.exited ? (await child.exited).exitCode : undefined;
			await this._stopOrThrow(plan);
			if (outcome === 'aborted') {
				throw new LocalModelServingError('modelNotActive', unavailableMessage(plan.displayName));
			}
			if (outcome === 'timeout') {
				throw new LocalModelServingError('startFailed', loadTimeoutMessage(plan.displayName));
			}
			if (ADDRESS_IN_USE.test(stderr.text) && attempt < SERVER_PORT_BIND_RETRIES) {
				this._options.log.info('[LocalModelServer] Port already in use; retrying with another port');
				continue;
			}
			return { kind: 'failed', stderrTail: stderr.text, exitCode };
		}
		throw new LocalModelServingError('startFailed', startFailedMessage(plan.displayName));
	}

	private async _waitHealthy(endpoint: ILocalModelLoopbackEndpoint, running: IRunningServer, signal: AbortSignal, deadline: number): Promise<'ready' | 'exited' | 'timeout' | 'aborted'> {
		while (true) {
			if (signal.aborted || this._disposed) {
				return 'aborted';
			}
			if (running.exited) {
				return 'exited';
			}
			if (this._options.clock.now() >= deadline) {
				return 'timeout';
			}
			try {
				const response = await this._options.fetch(`${endpoint.baseUrl}/health`, { headers: { authorization: `Bearer ${endpoint.apiKey}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]) });
				const ok = response.status === 200;
				await response.body?.cancel().catch(() => undefined);
				if (ok && !running.exited) {
					return 'ready';
				}
			} catch {
				// Not listening yet.
			}
			if (running.exited) {
				return 'exited';
			}
			await this._pausePoll(running, signal);
		}
	}

	/** Waits one health poll interval, or less when the process exits or the start is aborted. */
	private async _pausePoll(running: IRunningServer, signal: AbortSignal): Promise<void> {
		let timer: IDisposable | undefined;
		let onAbort: (() => void) | undefined;
		await Promise.race([
			new Promise<void>(resolve => timer = this._options.clock.setTimeout(resolve, this._timings.healthPollMs)),
			running.child.exited,
			new Promise<void>(resolve => {
				onAbort = resolve;
				signal.addEventListener('abort', onAbort);
			}),
		]);
		timer?.dispose();
		if (onAbort) {
			signal.removeEventListener('abort', onAbort);
		}
	}

	/**
	 * Whether a ready server refuses `/props` without the API key: `enforced` on a 401 or 403, `notEnforced` when it
	 * serves it, `inconclusive` when no attempt answered either way. Up to {@link API_KEY_PROBE_ATTEMPTS} attempts,
	 * a health poll apart.
	 */
	private async _confirmApiKeyEnforced(endpoint: ILocalModelLoopbackEndpoint, running: IRunningServer, signal: AbortSignal): Promise<'enforced' | 'notEnforced' | 'inconclusive' | 'exited' | 'aborted'> {
		for (let attempt = 1; ; attempt++) {
			if (signal.aborted || this._disposed) {
				return 'aborted';
			}
			if (running.exited) {
				return 'exited';
			}
			const answer = await this._probeWithoutApiKey(endpoint, signal);
			if (signal.aborted || this._disposed) {
				return 'aborted';
			}
			if (running.exited) {
				return 'exited';
			}
			if (answer !== 'inconclusive' || attempt >= API_KEY_PROBE_ATTEMPTS) {
				return answer;
			}
			await this._pausePoll(running, signal);
		}
	}

	/** One `/props` request without the API key; see {@link _confirmApiKeyEnforced}. */
	private async _probeWithoutApiKey(endpoint: ILocalModelLoopbackEndpoint, signal: AbortSignal): Promise<'enforced' | 'notEnforced' | 'inconclusive'> {
		try {
			const response = await this._options.fetch(`${endpoint.baseUrl}/props`, { signal: AbortSignal.any([signal, AbortSignal.timeout(API_KEY_PROBE_TIMEOUT_MS)]) });
			await response.body?.cancel().catch(() => undefined);
			if (response.status === 401 || response.status === 403) {
				return 'enforced';
			}
			return response.status >= 200 && response.status < 300 ? 'notEnforced' : 'inconclusive';
		} catch {
			return 'inconclusive';
		}
	}

	private async _readProps(endpoint: ILocalModelLoopbackEndpoint, config: IServerStartConfig, plan: IServerLaunchPlan, signal: AbortSignal): Promise<ILocalModelServerProps> {
		const fallback: ILocalModelServerProps = { nCtx: config.ctxSize, totalSlots: plan.parallel };
		try {
			const response = await this._options.fetch(`${endpoint.baseUrl}/props`, { headers: { authorization: `Bearer ${endpoint.apiKey}` }, signal });
			if (response.status !== 200) {
				await response.body?.cancel().catch(() => undefined);
				return fallback;
			}
			const body = await response.json() as { n_ctx?: unknown; total_slots?: unknown; default_generation_settings?: { n_ctx?: unknown } };
			const nCtx = body.default_generation_settings?.n_ctx ?? body.n_ctx;
			const slots = body.total_slots;
			const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
			return { nCtx: positive(nCtx) ? nCtx : fallback.nCtx, totalSlots: positive(slots) ? slots : fallback.totalSlots };
		} catch {
			return fallback;
		}
	}

	/**
	 * One prompt plus {@link WARMUP_GENERATED_TOKENS} streamed tokens, measuring time to first token and decode
	 * throughput. A failed connection (not a timeout or cancellation) sets `transport.failed`: the server may be going down.
	 */
	private async _warmUp(endpoint: ILocalModelLoopbackEndpoint, plan: IServerLaunchPlan, signal: AbortSignal, transport?: { failed: boolean }): Promise<IServerWarmupResult | undefined> {
		const abort = new AbortController();
		const timer = this._options.clock.setTimeout(() => abort.abort(), this._timings.warmupTimeoutMs);
		const combined = AbortSignal.any([signal, abort.signal]);
		const started = this._options.clock.now();
		try {
			const response = await this._options.fetch(`${endpoint.baseUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: `Bearer ${endpoint.apiKey}` },
				body: JSON.stringify({
					model: plan.alias,
					messages: [{ role: 'user', content: 'Write a short greeting.' }],
					max_tokens: WARMUP_GENERATED_TOKENS,
					stream: true,
					temperature: 0,
					ignore_eos: true,
					cache_prompt: false,
				}),
				signal: combined,
			});
			if (response.status !== 200 || !response.body) {
				await response.body?.cancel().catch(() => undefined);
				return undefined;
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let firstAt: number | undefined;
			let lastAt: number | undefined;
			let outputTokens = 0;
			let predictedPerSecond: number | undefined;
			let done = false;
			while (!done) {
				const chunk = await reader.read();
				if (chunk.done) {
					break;
				}
				buffer += decoder.decode(chunk.value, { stream: true });
				let newline: number;
				while ((newline = buffer.indexOf('\n')) >= 0) {
					const line = buffer.slice(0, newline).trim();
					buffer = buffer.slice(newline + 1);
					if (!line.startsWith('data:')) {
						continue;
					}
					const data = line.slice(5).trim();
					if (data === '[DONE]') {
						done = true;
						break;
					}
					let event: { choices?: { delta?: { content?: unknown; reasoning_content?: unknown } }[]; timings?: { predicted_per_second?: unknown } };
					try {
						event = JSON.parse(data);
					} catch {
						continue;
					}
					const delta = event.choices?.[0]?.delta;
					const text = (typeof delta?.content === 'string' ? delta.content : '') + (typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '');
					if (text) {
						const now = this._options.clock.now();
						firstAt ??= now;
						lastAt = now;
						outputTokens++;
					}
					const tps = event.timings?.predicted_per_second;
					if (typeof tps === 'number' && Number.isFinite(tps) && tps > 0) {
						predictedPerSecond = tps;
					}
				}
			}
			await reader.cancel().catch(() => undefined);
			const ttftMs = firstAt === undefined ? undefined : Math.max(0, firstAt - started);
			const measured = firstAt !== undefined && lastAt !== undefined && lastAt > firstAt && outputTokens > 1 ? (outputTokens - 1) * 1000 / (lastAt - firstAt) : undefined;
			const decodeTps = predictedPerSecond ?? measured;
			return { decodeTps: decodeTps === undefined ? undefined : Math.round(decodeTps * 10) / 10, ttftMs, outputTokens };
		} catch (error) {
			if (transport && !combined.aborted) {
				transport.failed = true;
			}
			this._options.log.warn(`[LocalModelServer] Warm-up failed: ${error instanceof Error ? error.name : 'error'}`);
			return undefined;
		} finally {
			timer.dispose();
		}
	}

	// #endregion

	// #region Stop and drain

	/**
	 * Stops the server; stops run one at a time. `user`: stops admitting new work (except holding turns' requests)
	 * and waits for running responses with no timeout ({@link stopNow} ends the wait). `system`: waits at most 10 s
	 * for in-flight requests only, and turns a pending user drain into a system drain. `idle`: only when no response runs.
	 *
	 * `cancellation` ends a `user` stop before it terminates the server, which then serves as before; the result is
	 * `cancelled`. A stop escalated to a system drain or ended by Stop Now can't be cancelled.
	 */
	stop(kind: ServerStopKind, cancellation?: AbortSignal): Promise<IServerStopResult> {
		this._restartTimer?.dispose();
		this._restartTimer = undefined;
		this._startAbort?.abort();
		this._pendingStops++;
		if (kind === 'system') {
			this._pendingSystemStops++;
			this._escalateDrains();
		}
		return this._queue.queue(async () => {
			try {
				return await this._doStop(kind, kind === 'user' ? cancellation : undefined);
			} finally {
				if (kind === 'system') {
					this._pendingSystemStops--;
				}
				if (--this._pendingStops === 0) {
					this._stopNowRequested = false;
				}
			}
		});
	}

	/** Ends the current or queued drain at once and terminates the server, ending running responses. Returns how many were running. */
	stopNow(): number {
		const state = this._state.get();
		const generation = state.identity?.servingGeneration;
		const running = generation === undefined ? 0 : this.responseCount(generation);
		if (this._pendingStops > 0) {
			this._stopNowRequested = true;
		}
		for (const waiter of [...this._drainWaiters]) {
			this._drainWaiters.delete(waiter);
			waiter.resolve();
		}
		return running;
	}

	/** Whether a stop is waiting for running responses. */
	get isDraining(): boolean {
		return !!this._state.get().drain;
	}

	/** On a system stop or disposal: a user drain stops admitting holding turns' requests and waits at most the system drain timeout. */
	private _escalateDrains(): void {
		const state = this._state.get();
		if (state.drain?.kind === 'user') {
			const generation = state.identity?.servingGeneration ?? -1;
			this._setState({ ...state, drain: { runningStreams: this.leaseCount(generation), kind: 'system' } });
		}
		for (const waiter of [...this._drainWaiters]) {
			if (waiter.kind !== 'user') {
				continue;
			}
			waiter.kind = 'system';
			if (this._drainCount(waiter.generation, 'system') === 0) {
				this._drainWaiters.delete(waiter);
				waiter.resolve();
			} else {
				this._armDrainTimeout(waiter, this._timings.systemDrainTimeoutMs);
			}
		}
	}

	/** Ends the drains of `generation`: nothing can finish there any more (its server exited). */
	private _resolveDrainWaiters(generation: number | undefined): void {
		for (const waiter of [...this._drainWaiters]) {
			if (waiter.generation === generation) {
				this._drainWaiters.delete(waiter);
				waiter.resolve();
			}
		}
	}

	private _armDrainTimeout(waiter: IDrainWaiter, timeoutMs: number): void {
		waiter.timer?.dispose();
		waiter.timer = this._options.clock.setTimeout(() => {
			this._drainWaiters.delete(waiter);
			waiter.resolve();
		}, timeoutMs);
	}

	private async _doStop(kind: ServerStopKind, cancellation: AbortSignal | undefined): Promise<IServerStopResult> {
		const state = this._state.get();
		const none: IServerStopResult = { drainedStreams: 0, drainMs: 0, stopNow: false };
		if (cancellation?.aborted) {
			// Cancelled while queued: whatever serves keeps serving.
			return { ...none, cancelled: true };
		}
		if (!this._running) {
			const unconfirmed = this._unconfirmed;
			if (unconfirmed && kind !== 'idle') {
				// A server that did not stop before: try again; the lock and its record stay until it is gone.
				if (!await this._terminateChild(unconfirmed)) {
					this._publishStillRunning(unconfirmed.plan);
					return none;
				}
				if (this._unconfirmed === unconfirmed) {
					this._unconfirmed = undefined;
				}
			}
			if (state.server !== 'stopped') {
				this._setState({ ...state, server: 'stopped', endpoint: undefined, props: undefined, autoEligible: false, error: undefined, drain: undefined });
			}
			await this._releaseLock();
			return none;
		}
		if (kind === 'idle' && (state.server !== 'ready' || this._currentResponses() > 0)) {
			return none;
		}
		this._admitting = false;
		this._clearIdle();
		const generation = state.identity?.servingGeneration ?? -1;
		const drainStarted = this._options.clock.now();
		// A system stop pending behind this one never lets it wait for whole turns.
		const drainKind: 'user' | 'system' = kind === 'system' || this._pendingSystemStops > 0 ? 'system' : 'user';
		const drainedStreams = this._drainCount(generation, drainKind);
		if (kind !== 'idle' && drainedStreams > 0) {
			// A Stop Now requested since this stop was queued still applies: it is not cleared here.
			this._setState({ ...state, server: 'stopping', autoEligible: false, drain: { runningStreams: drainedStreams, kind: drainKind } });
			if (await this._waitForDrain(generation, drainKind, cancellation) === 'cancelled' && state.server === 'ready' && this._canResumeDrain(generation)) {
				this._resumeAfterCancelledDrain(state);
				return { drainedStreams, drainMs: this._options.clock.now() - drainStarted, stopNow: false, cancelled: true };
			}
		} else {
			this._setState({ ...state, server: 'stopping', autoEligible: false });
		}
		const stopNow = drainedStreams > 0 && this._stopNowRequested;
		const remaining = this._drainCount(generation, this._state.get().drain?.kind ?? drainKind);
		if (this._disposed && !this._running) {
			// Disposed while draining: the shutdown already took the server down.
			return { drainedStreams, drainMs: this._options.clock.now() - drainStarted, stopNow };
		}
		const stopped = await this._terminate();
		const result: IServerStopResult = { drainedStreams, drainMs: this._options.clock.now() - drainStarted, stopNow };
		if (!stopped) {
			// Its exit was not observed: keep the lock and its record, and offer Stop Previous Server.
			this._publishStillRunning(state.plan);
			return result;
		}
		await this._releaseLock();
		this._setState({ ...this._state.get(), server: 'stopped', endpoint: undefined, props: undefined, autoEligible: false, error: undefined, drain: undefined });
		if (stopNow) {
			reportLocalModelServer(this._options.telemetry, { target: this._options.target, backend: state.plan?.backend ?? '', profile: state.plan?.profile ?? '', event: 'stopNow', drainMs: result.drainMs, drainedStreams });
		}
		this._options.log.info(`[LocalModelServer] Stopped (${kind}${remaining ? `, ${remaining} running response(s) ended` : ''})`);
		return result;
	}

	private _currentLeases(): number {
		const generation = this._state.get().identity?.servingGeneration;
		return generation === undefined ? 0 : this.leaseCount(generation);
	}

	private _currentResponses(): number {
		const generation = this._state.get().identity?.servingGeneration;
		return generation === undefined ? 0 : this.responseCount(generation);
	}

	private _waitForDrain(generation: number, kind: 'user' | 'system', cancellation?: AbortSignal): Promise<'drained' | 'cancelled'> {
		if (this._drainCount(generation, kind) === 0 || this._stopNowRequested) {
			return Promise.resolve('drained');
		}
		return new Promise(resolve => {
			const onCancel = () => {
				// Only a user drain can be taken back: not one a system stop escalated or Stop Now ended.
				if (!this._drainWaiters.has(waiter) || waiter.kind !== 'user' || this._stopNowRequested || !this._canResumeDrain(generation)) {
					return;
				}
				this._drainWaiters.delete(waiter);
				cancellation?.removeEventListener('abort', onCancel);
				resolve('cancelled');
			};
			const waiter: IDrainWaiter = {
				generation,
				kind,
				resolve: () => {
					waiter.timer?.dispose();
					cancellation?.removeEventListener('abort', onCancel);
					resolve('drained');
				},
			};
			this._drainWaiters.add(waiter);
			if (kind === 'system') {
				this._armDrainTimeout(waiter, this._timings.systemDrainTimeoutMs);
			}
			cancellation?.addEventListener('abort', onCancel);
			if (cancellation?.aborted) {
				onCancel();
			}
		});
	}

	/** Whether the server of `generation` still runs, so a cancelled drain can let it serve again. */
	private _canResumeDrain(generation: number): boolean {
		const running = this._running;
		return !!running && !running.terminating && !running.exited && running.generation === generation && !this._disposed;
	}

	/** A user drain was cancelled: the server admits new work again, as it did before the stop. */
	private _resumeAfterCancelledDrain(before: IServerSupervisorState): void {
		this._admitting = true;
		this._setState({ ...this._state.get(), server: 'ready', autoEligible: before.autoEligible, drain: undefined, loaded: before.loaded });
		this._options.log.info('[LocalModelServer] Stop cancelled while waiting for running responses; serving again');
		if (this._currentResponses() === 0) {
			this._armIdle();
		}
	}

	/** Terminates the running server; `true` only once its exit was observed. Otherwise it becomes {@link _unconfirmed}: its record and the lock are kept and nothing replaces it. */
	private async _terminate(): Promise<boolean> {
		const running = this._running;
		if (!running) {
			return !this._unconfirmed;
		}
		running.terminating = true;
		this._running = undefined;
		this._clearIdle();
		this._releaseHolds(running.generation);
		running.listeners.forEach(listener => listener.dispose());
		if (await this._terminateChild(running)) {
			return !this._unconfirmed;
		}
		this._unconfirmed = running;
		this._options.log.warn('[LocalModelServer] llama-server did not exit after termination; keeping its record and the lock');
		return false;
	}

	/** Terminates our child (tree, then `SIGKILL`); `true` only once its exit was observed within the bounded waits. */
	private async _terminateChild(running: IRunningServer): Promise<boolean> {
		if (running.exited) {
			return true;
		}
		const pid = running.child.pid;
		let requested = false;
		try {
			if (pid !== undefined) {
				requested = await this._options.processControl.terminateTree(pid);
			} else {
				running.child.kill('SIGKILL');
			}
			if (pid !== undefined && !requested) {
				this._options.log.warn('[LocalModelServer] The termination command for the server failed');
			}
		} catch (error) {
			this._options.log.warn(`[LocalModelServer] Terminating the server failed (${errorCodeForLog(error)})`);
		}
		if (await this._waitForExit(running)) {
			return true;
		}
		if (this._options.platform === 'win32' && requested) {
			// `taskkill /T /F` already terminated the tree: a large model's process can take a while to
			// release its GPU memory and exit, and terminating it again would only fail. Keep waiting.
			this._options.log.info('[LocalModelServer] The terminated server is still releasing its memory; waiting for it to exit');
			return this._waitForExit(running, this._timings.terminatedExitWaitMs);
		}
		if (!running.child.kill('SIGKILL')) {
			this._options.log.warn('[LocalModelServer] SIGKILL could not be delivered to the server');
		}
		return this._waitForExit(running);
	}

	/** Whether the child's exit is observed within `waitMs` ({@link IServerSupervisorTimings.exitWaitMs} by default). */
	private _waitForExit(running: IRunningServer, waitMs = this._timings.exitWaitMs): Promise<boolean> {
		if (running.exited) {
			return Promise.resolve(true);
		}
		return new Promise<boolean>(resolve => {
			const timer = setTimeout(() => resolve(running.exited), waitMs);
			void running.child.exited.then(() => {
				clearTimeout(timer);
				resolve(true);
			});
		});
	}

	/** Terminates the running server, or fails the start with the `orphan` error when its exit cannot be confirmed. */
	private async _stopOrThrow(plan: IServerLaunchPlan): Promise<void> {
		if (!await this._terminate()) {
			throw new LocalModelServingError('orphan', stillRunningMessage(plan.displayName));
		}
	}

	/** Before a start: a server of ours that did not stop before must be confirmed gone first. */
	private async _confirmUnconfirmedGone(): Promise<void> {
		const unconfirmed = this._unconfirmed;
		if (!unconfirmed) {
			return;
		}
		if (!await this._terminateChild(unconfirmed)) {
			throw new LocalModelServingError('orphan', stillRunningMessage(unconfirmed.plan.displayName));
		}
		if (this._unconfirmed === unconfirmed) {
			this._unconfirmed = undefined;
		}
	}

	/** Publishes that a server of ours may still be running (Stop Previous Server). */
	private _publishStillRunning(plan: IServerLaunchPlan | undefined): void {
		const message = stillRunningMessage(plan?.displayName ?? '');
		this._setState({ ...this._state.get(), server: 'error', endpoint: undefined, props: undefined, autoEligible: false, drain: undefined, error: { code: 'orphan', message, actions: getServerErrorActions('orphan') } });
	}

	// #endregion

	// #region Idle unload and crashes

	private _armIdle(): void {
		this._clearIdle();
		const state = this._state.get();
		if (state.server !== 'ready' || !this._admitting || this._currentResponses() > 0 || this._disposed) {
			return;
		}
		this._idleTimer = this._options.clock.setTimeout(() => {
			this._idleTimer = undefined;
			const current = this._state.get();
			if (current.server === 'ready' && this._currentResponses() === 0) {
				this._options.log.info('[LocalModelServer] Unloading after the idle timeout');
				reportLocalModelServer(this._options.telemetry, { target: this._options.target, backend: current.plan?.backend ?? '', profile: current.plan?.profile ?? '', event: 'idleUnload' });
				void this.stop('idle');
			}
		}, this._timings.idleUnloadMs);
	}

	private _clearIdle(): void {
		this._idleTimer?.dispose();
		this._idleTimer = undefined;
	}

	private _onUnexpectedExit(running: IRunningServer, exitCode: number | undefined): void {
		if (this._running !== running) {
			return;
		}
		const state = this._state.get();
		if (state.server === 'stopping' && state.drain && running.generation !== undefined) {
			// It exited while a stop waited for its responses: none can finish now, so its holds end and
			// the stop goes on to clean up. No restart: it was being stopped anyway.
			this._options.log.warn(`[LocalModelServer] llama-server exited while its responses were drained (exit ${exitCode ?? '?'}, ${running.stderr.text.length} characters of output)`);
			reportLocalModelServer(this._options.telemetry, { target: this._options.target, backend: running.plan.backend, profile: running.plan.profile, event: 'crash', errorCode: exitCode === undefined ? '' : String(exitCode) });
			this._releaseHolds(running.generation);
			this._resolveDrainWaiters(running.generation);
			return;
		}
		if (state.server !== 'ready') {
			// Exits during a start are handled by the start itself.
			return;
		}
		this._running = undefined;
		this._admitting = false;
		this._clearIdle();
		this._releaseHolds(running.generation);
		running.listeners.forEach(listener => listener.dispose());
		const plan = running.plan;
		this._options.log.warn(`[LocalModelServer] llama-server exited unexpectedly (exit ${exitCode ?? '?'}, ${running.stderr.text.length} characters of output)`);
		reportLocalModelServer(this._options.telemetry, { target: this._options.target, backend: plan.backend, profile: plan.profile, event: 'crash', errorCode: exitCode === undefined ? '' : String(exitCode) });
		// An assertion on the first request it served, with DFlash on: this build's speculative path is
		// broken, so the restart (and every later start) runs without it instead of crashing again.
		const speculativeCrash = !!state.config?.speculative && running.requests === 1 && classifyServerStartFailure(running.stderr.text, { speculative: true, phase: 'firstRequest' }) === 'specUnsupported';
		if (speculativeCrash) {
			this._recordSpeculativeUnsupported(plan);
			reportLocalModelServer(this._options.telemetry, { target: this._options.target, backend: plan.backend, profile: plan.profile, event: 'profileDowngraded', errorCode: 'specUnsupported' });
			this._options.log.info('[LocalModelServer] Restarting without speculative decoding (it crashed this llama.cpp build)');
		}
		void this._releaseLock();
		if (this._options.clock.now() - this._readyAt >= this._timings.crashResetMs) {
			this._crashCount = 0;
		}
		const attempt = this._crashCount++;
		const backoff = this._timings.restartBackoffMs[attempt];
		if (backoff === undefined || this._disposed) {
			this._setState({ ...state, server: 'error', endpoint: undefined, props: undefined, autoEligible: false, drain: undefined, error: { code: 'crashed', message: crashedMessage(plan.displayName), actions: ['retry'] } });
			return;
		}
		if (plan.signal?.aborted) {
			// The activation was superseded meanwhile: nothing to restart.
			this._setState({ ...state, server: 'stopped', endpoint: undefined, props: undefined, autoEligible: false, drain: undefined });
			return;
		}
		// Auto stops declaring the model immediately; the restart gets a new generation.
		this._speculativeRestart = speculativeCrash ? plan : undefined;
		this._setState({ ...state, server: 'starting', endpoint: undefined, props: undefined, autoEligible: false, drain: undefined });
		this._restartTimer = this._options.clock.setTimeout(() => {
			this._restartTimer = undefined;
			if (plan.signal?.aborted) {
				this._setState({ ...this._state.get(), server: 'stopped', endpoint: undefined, props: undefined, autoEligible: false, drain: undefined });
				return;
			}
			this.start(plan, 'restart').catch(() => { /* reflected in state */ });
		}, backoff);
	}

	// #endregion

	// #region Ownership and orphans

	private get _recordPath(): string {
		return path.join(this._options.modelsDir, SERVER_RECORD_FILE_NAME);
	}

	/**
	 * Orphan recovery, serialized with starts and stops. Taking the server lock proves that whoever recorded a server
	 * is gone; while another live process holds it, this is `ownedElsewhere` and nothing is touched. `stopPrevious`
	 * (Stop Previous Server) also clears a stale macOS lock and deletes an unreadable record.
	 */
	checkPreviousServer(options: { readonly stopPrevious?: boolean } = {}): Promise<PreviousServerCheck> {
		return this._queue.queue(async () => {
			if (this._lock) {
				return this._retryUnconfirmed();
			}
			if (options.stopPrevious) {
				await clearStaleProcessLock(this._options.modelsDir, SERVER_LOCK_TYPE, this._options.lockOptions);
			}
			const lock = await this._tryLock();
			if (typeof lock === 'string') {
				return lock === 'busy' ? 'ownedElsewhere' : 'orphan';
			}
			try {
				return await this._recoverOrphan(!!options.stopPrevious) ? 'none' : 'orphan';
			} finally {
				lock.dispose();
			}
		});
	}

	/** Stop Previous Server while this supervisor holds the lock: retries a server of its own that did not stop. */
	private async _retryUnconfirmed(): Promise<PreviousServerCheck> {
		const unconfirmed = this._unconfirmed;
		if (!unconfirmed) {
			return 'none';
		}
		if (!await this._terminateChild(unconfirmed)) {
			return 'orphan';
		}
		if (this._unconfirmed === unconfirmed) {
			this._unconfirmed = undefined;
		}
		await this._releaseLock();
		return 'none';
	}

	/** The server lock, `'busy'` while another live process (or supervisor) holds it, or `'stale'` (macOS). */
	private async _tryLock(): Promise<IProcessLock | 'busy' | 'stale'> {
		// A lock this supervisor released is freed after its record work (see `_releaseLock`).
		await this._recordIo.queue(async () => undefined);
		await fs.promises.mkdir(this._options.modelsDir, { recursive: true });
		return acquireProcessLock(this._options.modelsDir, SERVER_LOCK_TYPE, this._options.lockOptions);
	}

	/** Takes the server lock for a start (kept until no server of ours may run) and recovers an orphan first. */
	private async _acquireLock(plan: IServerLaunchPlan): Promise<void> {
		if (this._lock) {
			return;
		}
		let lock: IProcessLock | 'busy' | 'stale';
		try {
			lock = await this._tryLock();
		} catch (error) {
			this._options.log.warn(`[LocalModelServer] Could not take the server lock (${errorCodeForLog(error)})`);
			throw new LocalModelServingError('startFailed', startFailedMessage(plan.displayName));
		}
		if (lock === 'busy') {
			reportLocalModelServer(this._options.telemetry, { target: this._options.target, backend: plan.backend, profile: plan.profile, event: 'ownedElsewhere', errorCode: 'ownedElsewhere' });
			throw new LocalModelServingError('ownedElsewhere', ownedElsewhereMessage(plan.displayName));
		}
		if (lock === 'stale') {
			this._options.log.warn('[LocalModelServer] The server lock was left behind by a process that died');
			throw new LocalModelServingError('orphan', orphanMessage());
		}
		this._lock = lock;
		if (!await this._recoverOrphan(false)) {
			throw new LocalModelServingError('orphan', orphanMessage());
		}
	}

	/**
	 * With the server lock held, judges the server record: a server whose pid, start time and image path match is
	 * terminated; a record whose process is gone or reused is deleted. `false` while a server may still run or the
	 * record can't be read (deleted only when `force`).
	 */
	private async _recoverOrphan(force: boolean): Promise<boolean> {
		let raw = '';
		try {
			raw = await fs.promises.readFile(this._recordPath, 'utf8');
		} catch (error) {
			if (errorCodeOf(error) === 'ENOENT') {
				return true;
			}
		}
		const server = parseServerRecord(raw);
		if (!server) {
			this._options.log.warn(`[LocalModelServer] The previous server record cannot be read${force ? '; deleting it' : ''}`);
			return force && this._deleteRecord();
		}
		const info = await this._options.processControl.inspect(server.pid);
		const reused = !!info && ((info.startTime !== undefined && Math.abs(info.startTime - server.processStartTime) > PROCESS_START_TIME_TOLERANCE_MS)
			|| (info.imagePath !== undefined && !samePath(info.imagePath, server.imagePath, this._options.platform)));
		if (!info || reused) {
			if (reused) {
				this._options.log.info('[LocalModelServer] The recorded server pid now belongs to another process; not touching it');
			}
			return this._deleteRecord();
		}
		if (info.startTime === undefined || info.imagePath === undefined) {
			this._options.log.warn('[LocalModelServer] The previous server cannot be verified');
			return false;
		}
		this._options.log.info('[LocalModelServer] Stopping a verified orphan server from a previous session');
		if (!await this._terminateOrphan(server)) {
			this._options.log.warn('[LocalModelServer] The orphan server did not exit; keeping its record');
			return false;
		}
		reportLocalModelServer(this._options.telemetry, { target: this._options.target, event: 'orphanRecovered' });
		return this._deleteRecord();
	}

	/**
	 * Records the just-spawned server; `false` when the record could not be written. Without an OS start time it records
	 * `spawnedAt`, given only when the spawn took at most half of {@link PROCESS_START_TIME_TOLERANCE_MS}, so it stays
	 * within that tolerance of the OS start time (whole seconds on macOS).
	 */
	private async _writeRecord(running: IRunningServer, pid: number, port: number, spawnedAt: number | undefined): Promise<boolean> {
		const info = await this._options.processControl.inspect(pid).catch(() => undefined);
		const processStartTime = info?.startTime ?? spawnedAt;
		if (processStartTime === undefined) {
			this._options.log.warn('[LocalModelServer] The server start time is unknown');
			return false;
		}
		const record: IServerRecord = { pid, processStartTime, imagePath: running.plan.binaryPath, port };
		const write = this._options.writeRecord ?? ((file, text) => fs.promises.writeFile(file, text));
		return this._recordIo.queue(async () => {
			if (running.exited) {
				// Gone already: its exit deletes the record, so nothing runs unrecorded.
				return true;
			}
			try {
				await this._withRetries(() => write(this._recordPath, JSON.stringify(record)));
				return true;
			} catch (error) {
				this._options.log.warn(`[LocalModelServer] Could not record the server (${errorCodeForLog(error)})`);
				return false;
			}
		});
	}

	/** Deletes the server record; `true` once it is gone. */
	private _deleteRecord(): Promise<boolean> {
		return this._recordIo.queue(async () => {
			try {
				await this._withRetries(() => fs.promises.rm(this._recordPath, { force: true }));
				return true;
			} catch (error) {
				this._options.log.warn(`[LocalModelServer] Could not delete the server record (${errorCodeForLog(error)})`);
				return false;
			}
		});
	}

	/** Runs a record operation, retrying refusals that pass (`EPERM`/`EBUSY`/`EACCES`, antivirus on Windows). */
	private async _withRetries(operation: () => Promise<void>): Promise<void> {
		for (const delay of [...this._timings.recordRetryDelaysMs, undefined]) {
			try {
				return await operation();
			} catch (error) {
				const code = errorCodeOf(error);
				if (delay === undefined || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
					throw error;
				}
				await timeout(delay);
			}
		}
	}

	/**
	 * Releases the server lock, never while a server of ours may still run. The OS handle is closed after pending
	 * record work, so a late deletion of our record can never remove the next owner's.
	 */
	private _releaseLock(): Promise<void> {
		const lock = this._lock;
		if (!lock || this._running || this._unconfirmed) {
			return Promise.resolve();
		}
		this._lock = undefined;
		return this._recordIo.queue(async () => lock.dispose());
	}

	/** Terminates a verified orphan; `true` only once its pid no longer runs the recorded process (bounded wait). */
	private async _terminateOrphan(server: IServerRecord): Promise<boolean> {
		const isGone = async () => {
			const info = await this._options.processControl.inspect(server.pid);
			return !info || (info.startTime !== undefined && Math.abs(info.startTime - server.processStartTime) > PROCESS_START_TIME_TOLERANCE_MS);
		};
		let requested = false;
		try {
			requested = await this._options.processControl.terminateTree(server.pid);
		} catch (error) {
			this._options.log.warn(`[LocalModelServer] Terminating the orphan failed (${errorCodeForLog(error)})`);
		}
		if (!requested) {
			this._options.log.warn('[LocalModelServer] The termination command for the orphan failed');
		}
		const deadline = Date.now() + this._timings.exitWaitMs;
		const pollMs = Math.max(1, Math.min(250, Math.floor(this._timings.exitWaitMs / 10)));
		while (!await isGone()) {
			if (Date.now() >= deadline) {
				return false;
			}
			await timeout(pollMs);
		}
		return true;
	}

	// #endregion

	private _setState(state: IServerSupervisorState): void {
		// Load progress only describes a start in progress; `loaded` only the server that is ready.
		const { load, loaded, ...rest } = state;
		this._state.set({ ...rest, ...(load && state.server === 'starting' ? { load } : {}), ...(loaded && state.server === 'ready' ? { loaded } : {}) }, undefined);
	}

	/** A start in progress was asked to stop: publishes `stopping` at once so the status no longer reads as loading. */
	private _onStartAborted(plan: IServerLaunchPlan): void {
		const state = this._state.get();
		if (state.server === 'starting' && state.plan === plan) {
			this._setState({ ...state, server: 'stopping', autoEligible: false });
		}
	}

	/** Dispose: system drain (<= 10 s) and stop. A process that is idle is killed at once. */
	private _shutdown(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._restartTimer?.dispose();
		this._clearIdle();
		this._startAbort?.abort();
		for (const generation of [...this._holds.keys()]) {
			this._releaseHolds(generation);
		}
		// A user drain no longer waits for turns: the server goes now (in-flight requests get the system timeout).
		this._escalateDrains();
		const running = this._running;
		if (!running) {
			// A server of ours that did not stop before: try once more; the exit handler releases the lock.
			const unconfirmed = this._unconfirmed;
			if (unconfirmed && !unconfirmed.exited) {
				unconfirmed.child.kill('SIGKILL');
				if (unconfirmed.child.pid !== undefined) {
					void this._options.processControl.terminateTree(unconfirmed.child.pid).catch(() => false);
				}
			}
			void this._releaseLock();
			return;
		}
		if (this._currentLeases() === 0) {
			running.terminating = true;
			this._running = undefined;
			running.listeners.forEach(listener => listener.dispose());
			// The lock and the server record go only once the exit is observed (its exit handler
			// releases them); if this process ends first, the next instance recovers the server.
			this._unconfirmed = running;
			running.child.kill('SIGKILL');
			if (running.child.pid !== undefined) {
				void this._options.processControl.terminateTree(running.child.pid).catch(() => false);
			}
			return;
		}
		void this._doStop('system', undefined);
	}
}

function planKey(plan: Pick<IServerLaunchPlan, 'familyId' | 'contentId'>): string {
	return `${plan.familyId}\n${plan.contentId}`;
}

function unavailableMessage(displayName: string): string {
	return localize('localModel.server.unavailable', "{0} is unavailable. Start a new chat or pick another model.", displayName);
}

function startFailedMessage(displayName: string): string {
	return localize('localModel.server.startFailed', "{0} couldn't start. Select Retry to try again.", displayName);
}

function loadTimeoutMessage(displayName: string): string {
	return localize('localModel.server.loadTimeout', "{0} took too long to load. Select Retry to try again.", displayName);
}

function serverRecordFailedMessage(displayName: string): string {
	return localize('localModel.server.recordFailed', "{0} was stopped because VS Code couldn't record its server process on disk. Select Retry to try again.", displayName);
}

function stillRunningMessage(displayName: string): string {
	return localize('localModel.server.stillRunning', "{0}'s server didn't stop and may still be running. Select Stop Previous Server to stop it.", displayName);
}

function insufficientMemoryMessage(displayName: string): string {
	return localize('localModel.server.insufficientMemory', "{0} couldn't start because this device ran out of GPU memory.", displayName);
}

function crashedMessage(displayName: string): string {
	return localize('localModel.server.crashed', "{0} stopped unexpectedly. Auto is using cloud models. Select Retry to restart it.", displayName);
}

export function ownedElsewhereMessage(displayName: string): string {
	return localize('localModel.server.ownedElsewhere', "{0} can't start while another VS Code instance is running an on-device model.", displayName);
}

export function orphanMessage(): string {
	return localize('localModel.server.orphan', "A previous on-device model server may still be running. Select Stop Previous Server to stop it.");
}

// #endregion
