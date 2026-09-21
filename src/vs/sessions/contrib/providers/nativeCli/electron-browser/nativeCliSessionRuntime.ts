/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../../../base/common/network.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { delimiter, isAbsolute, join } from '../../../../../base/common/path.js';
import { IProcessEnvironment, isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { dirname, joinPath, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { INativeCliLifecycleConfiguration, INativeCliLifecycleEvent, INativeCliLifecycleService } from '../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { getNativeCliProxyArguments, getNativeCliProxyEnvironment } from '../../../../../platform/agentHost/common/nativeCliProxyConfiguration.js';
import { INativeCliProxyConfiguration } from '../../../../../platform/agentHost/common/nativeCliProxy.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TerminalExitReason, TerminalLocation, TitleEventSource } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { createTerminalEnvironment, createVariableResolver } from '../../../../../workbench/contrib/terminal/common/terminalEnvironment.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IConfigurationResolverService } from '../../../../../workbench/services/configurationResolver/common/configurationResolver.js';
import { INativeWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/electron-browser/environmentService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { NativeCliLifecycleObserver } from '../browser/nativeCliLifecycleObserver.js';
import { NativeCopilotLifecycleObserver } from '../browser/nativeCopilotLifecycleObserver.js';
import { getNativeCliArguments, getNativeCliBundledExecutablePaths, getNativeCliDefinition, isNativeCliKindEnabled, NATIVE_CLI_PROVIDER_ID, readNativeCliTerminalData, readNativeCopilotMetadata } from '../common/nativeCli.js';
import type { NativeCliSession } from './nativeCliSession.js';
import { NativeCliSessionAuthentication } from './nativeCliSessionAuthentication.js';

type NativeCliTrackingSource = 'lifecycle' | 'copilot';

/** Bounded so the event can never carry a path, a prompt, or CLI output. */
type NativeCliStartOutcome = 'success' | 'cancelled' | 'notInstalled' | 'executableMisconfigured' | 'untrusted' | 'disabled' | 'lifecycleUnavailable' | 'proxyFailed' | 'earlyExit' | 'startupTimeout' | 'failed';

type NativeCliStartEvent = {
	cliKind: string;
	accountSource: string;
	isResume: boolean;
	outcome: string;
	durationMs: number;
};

type NativeCliStartClassification = {
	owner: 'roblourens';
	comment: 'Tracks whether launching an agent CLI in an Agents window terminal succeeds, and why it fails.';
	cliKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Which CLI was launched: copilot, claude, or codex.' };
	accountSource: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Which account pays for the session: copilot or native.' };
	isResume: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether an existing native conversation was resumed rather than started fresh.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded launch outcome category; never an error message.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the launch request until its outcome.' };
};

type NativeCliTrackingEvent = {
	cliKind: string;
	timedOut: boolean;
	hasSessionTracking: boolean;
	hasActivityTracking: boolean;
	failedSources: string;
};

type NativeCliTrackingClassification = {
	owner: 'roblourens';
	comment: 'Reports whether lifecycle hook tracking reached VS Code for a running agent CLI. This failure mode is silent by design, so it is otherwise invisible in the field.';
	cliKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Which CLI was tracked: copilot, claude, or codex.' };
	timedOut: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether no conversation data arrived within the tracking timeout.' };
	hasSessionTracking: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether conversation identity data was received.' };
	hasActivityTracking: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether activity data was received from the terminal.' };
	failedSources: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded set of tracking sources that failed to read: none, lifecycle, copilot, or both.' };
};

/** Bounds the whole launch, including backend, shell environment and Copilot lease resolution. */
const NATIVE_CLI_STARTUP_TIMEOUT = 60_000;
/** A session switch inside a running CLI is local, so it either happens quickly or was rejected. */
const NATIVE_CLI_SWITCH_TIMEOUT = 20_000;

/**
 * A launch failure that carries a bounded telemetry category alongside its localized,
 * user-facing message, so the category never has to be recovered from the message text.
 */
class NativeCliStartError extends Error {
	constructor(readonly outcome: NativeCliStartOutcome, message: string) {
		super(message);
	}
}

/** One native process can display several conversations during its lifetime. */
export class NativeCliSessionRuntime extends Disposable {
	readonly instance = observableValue<ITerminalInstance | undefined>(this, undefined);
	readonly isStarting = observableValue(this, false);
	readonly isInitializing = observableValue(this, false);
	readonly error = observableValue<string | undefined>(this, undefined);
	readonly warning = observableValue<string | undefined>(this, undefined);
	/**
	 * Terminals are launched with `waitOnExit`, so the instance outlives its process and
	 * never reports an `exitReason`. Liveness must come from the exit event instead.
	 */
	private readonly _hasExited = observableValue(this, false);
	readonly isRunning = derived(this, reader => {
		const terminal = this.instance.read(reader);
		return !!terminal && !terminal.isDisposed && !this._hasExited.read(reader);
	});
	readonly authentication: NativeCliSessionAuthentication | undefined;
	private readonly _listeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _startup = this._register(new MutableDisposable<DisposableStore>());
	private readonly _lifecycleObserver = this._register(new MutableDisposable<NativeCliLifecycleObserver>());
	private readonly _copilotObserver = this._register(new MutableDisposable<NativeCopilotLifecycleObserver>());
	private readonly _eventQueue = new Sequencer();
	private readonly _metadataWatcher = this._register(new MutableDisposable<DisposableStore>());
	private readonly _failedTrackingSources = new Set<NativeCliTrackingSource>();
	private _hasSessionTracking = false;
	private _hasActivityTracking = false;
	private _trackingTimedOut = false;
	private _reportedTrackingHealth = false;
	private readonly _trackingTimeout = this._register(new RunOnceScheduler(() => {
		if (this.isRunning.get() && !this._hasSessionTracking) {
			this._trackingTimedOut = true;
			this._updateTrackingWarning();
		}
		this._reportTrackingHealth();
	}, 30_000));

	/** The tracking failure mode is silent by design, so it is otherwise invisible in the field. */
	private _reportTrackingHealth(): void {
		if (this._reportedTrackingHealth) {
			return;
		}
		this._reportedTrackingHealth = true;
		const lifecycle = this._failedTrackingSources.has('lifecycle');
		const copilot = this._failedTrackingSources.has('copilot');
		this._telemetryService.publicLog2<NativeCliTrackingEvent, NativeCliTrackingClassification>('agents/nativeCli/trackingHealth', {
			cliKind: this.session.kind,
			timedOut: this._trackingTimedOut,
			hasSessionTracking: this._hasSessionTracking,
			hasActivityTracking: this._hasActivityTracking,
			failedSources: lifecycle && copilot ? 'both' : lifecycle ? 'lifecycle' : copilot ? 'copilot' : 'none',
		});
	}
	private _metadataHome: URI | undefined;
	private _metadataResource: URI | undefined;
	private _lifecycle: INativeCliLifecycleConfiguration | undefined;
	private _lifecycleService: INativeCliLifecycleService | undefined;
	private _startPromise: Promise<void> | undefined;
	private _reconnectPromise: Promise<boolean> | undefined;
	private _generation = 0;
	private _terminalProgress: number | undefined;
	private _startupWatch: StopWatch | undefined;
	copilotForegroundTimestamp: number;

	get hasForegroundTracking(): boolean {
		return !!this._copilotObserver.value;
	}

	/** The conversation the CLI currently shows; other conversations stay open in the same process. */
	readonly foregroundSession: IObservable<NativeCliSession>;
	private readonly _foregroundSession: ISettableObservable<NativeCliSession>;

	get session(): NativeCliSession {
		return this._foregroundSession.get();
	}

	set session(session: NativeCliSession) {
		this._foregroundSession.set(session, undefined);
	}

	/** Whether a reconnection to a persisted terminal is still being attempted. */
	get isReconnecting(): boolean {
		return !!this._reconnectPromise;
	}

	constructor(
		session: NativeCliSession,
		readonly resource: URI,
		private readonly _onNativeEvent: (runtime: NativeCliSessionRuntime, event: INativeCliLifecycleEvent) => Promise<void>,
		private readonly _onDidStopRunning: (runtime: NativeCliSessionRuntime) => void,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@INativeWorkbenchEnvironmentService private readonly _environment: INativeWorkbenchEnvironmentService,
		@IWorkspaceTrustManagementService private readonly _trust: IWorkspaceTrustManagementService,
		@IChatEntitlementService private readonly _entitlement: IChatEntitlementService,
		@ISessionsService private readonly _sessions: ISessionsService,
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._foregroundSession = observableValue(this, session);
		this.foregroundSession = this._foregroundSession;
		this.pendingConversation = this._pendingConversation;
		this.copilotForegroundTimestamp = session.serialize().copilotForegroundTimestamp ?? 0;
		this._register(runOnChange(this.isRunning, running => {
			if (!running) {
				this._onDidStopRunning(this);
			}
		}));
		this._register(_agentHost.onAgentHostExit(() => {
			this._lifecycleService = undefined;
			if (this.session.kind === 'codex' && this.instance.get() && this.authentication?.source.get() !== 'copilot') {
				this.stop();
				this.error.set(localize('nativeCliHostStopped', "The native CLI connection stopped. Resume the CLI to reconnect."), undefined);
				this.session.setActivity('error');
			}
		}));
		const data = session.serialize();
		this.authentication = session.kind === 'copilot' ? undefined : this._register(_instantiationService.createInstance(
			NativeCliSessionAuthentication, resource.fragment || resource.path.slice(1), session.kind, data.authentication, data.copilotModel,
			() => !this.session.hasStarted && !this.isStarting.get() && !this.instance.get(),
			() => this.session.changed(),
			message => {
				this.stop();
				this.error.set(message, undefined);
				this.session.status.set(SessionStatus.Error, undefined);
				this.session.changed();
			},
		));
	}

	async reconnect(): Promise<boolean> {
		if (this._reconnectPromise) {
			return this._reconnectPromise;
		}
		this._reconnectPromise = this._reconnect().finally(() => this._reconnectPromise = undefined);
		return this._reconnectPromise;
	}

	private async _reconnect(): Promise<boolean> {
		if (this.session.isArchived.get() || this._store.isDisposed || this._entitlement.sentiment.hidden
			|| !isNativeCliKindEnabled(this.session.kind, this._configurationService)) {
			return false;
		}
		if (this.isRunning.get()) {
			return true;
		}
		const current = this.instance.get();
		const terminal = this._terminalService.instances.find(instance =>
			instance !== current
			&& !instance.isDisposed && instance.exitReason === undefined
			&& instance.reconnectionProperties?.ownerId === NATIVE_CLI_PROVIDER_ID
			&& readNativeCliTerminalData(instance.reconnectionProperties.data)?.resource === this.resource.toString());
		if (!terminal) {
			return false;
		}
		const data = readNativeCliTerminalData(terminal.reconnectionProperties?.data);
		try {
			await this.authentication?.reconnect(data?.leaseId);
		} catch (error) {
			// The process survived the reload; an authentication problem must not destroy it.
			this.error.set(toErrorMessage(error), undefined);
			this.session.status.set(SessionStatus.Error, undefined);
			throw error;
		}
		if (this._store.isDisposed || this.session.isArchived.get() || terminal.isDisposed) {
			return false;
		}
		this._lifecycle = data?.lifecycle;
		this._lifecycleService = this._agentHost.nativeCliLifecycle;
		this._metadataHome = data?.metadataHome ? URI.file(data.metadataHome) : undefined;
		this._bind(terminal);
		this._observeLifecycle();
		// A malformed lifecycle record is a tracking problem, not a reason to kill the CLI.
		await this._lifecycleObserver.value?.read().catch(error => {
			this._logService.warn('Could not read native CLI lifecycle after reconnect', error);
			this._failedTrackingSources.add('lifecycle');
			this._updateTrackingWarning();
		});
		return true;
	}

	/** The conversation this process has been asked to show next, until the CLI confirms the switch. */
	readonly pendingConversation: IObservable<NativeCliSession | undefined>;
	private readonly _pendingConversation = observableValue<NativeCliSession | undefined>(this, undefined);
	private readonly _pendingSwitch = this._register(new MutableDisposable());

	/** Whether the shown conversation can accept a session command right now. */
	get canSwitchConversation(): boolean {
		return this.isRunning.get() && !this._isBusy(this.session.status.get());
	}

	private _isBusy(status: SessionStatus): boolean {
		return status === SessionStatus.InProgress || status === SessionStatus.NeedsInput;
	}

	/**
	 * Shows `target` in this Copilot process, waiting for the CLI to become idle first: the
	 * CLI rejects session commands mid-turn, and typing into an approval prompt would answer it.
	 */
	requestConversation(target: NativeCliSession): void {
		if (this.session.kind !== 'copilot' || this.session === target || !this.isRunning.get()) {
			return;
		}
		this._pendingConversation.set(target, undefined);
		this._pendingSwitch.value = autorun(reader => {
			const status = this._foregroundSession.read(reader).status.read(reader);
			if (this._pendingConversation.read(reader) !== target || !this.isRunning.read(reader) || this._isBusy(status)) {
				return;
			}
			queueMicrotask(() => {
				if (this._pendingConversation.get() !== target || this._store.isDisposed) {
					return;
				}
				this._pendingSwitch.clear();
				void this.showConversation(target).catch(error => {
					this._logService.warn(`Could not switch the native ${this.session.kind} CLI conversation`, error);
				});
			});
		});
	}

	/** Resumes or creates `target` in this running Copilot process and resolves once the CLI shows it. */
	async showConversation(target: NativeCliSession): Promise<void> {
		await this._startPromise?.catch(() => undefined);
		await this._reconnectPromise?.catch(() => undefined);
		if (this.session === target) {
			this._pendingConversation.set(undefined, undefined);
			return;
		}
		const terminal = this.instance.get();
		if (!terminal || !this.isRunning.get() || this._store.isDisposed) {
			throw new Error(localize('nativeCliNotRunningForSwitch', "The CLI terminal is not running."));
		}
		if (this.session.kind !== 'copilot') {
			throw new Error(localize('nativeCliSwitchUnsupported', "Use the CLI's session commands to switch conversations."));
		}
		if (!this.canSwitchConversation) {
			throw new Error(localize('nativeCliBusy', "The CLI is still working on “{0}”. Wait for it to finish or interrupt it, then open this conversation again.", this.session.title.get()));
		}
		this._pendingConversation.set(target, undefined);
		const command = target.hasStarted ? `/resume ${target.nativeSessionId.get() ?? target.id}` : '/new';
		// Pasted so the TUI inserts the whole command at once instead of reacting to each key.
		await terminal.sendText(command, false, true);
		await terminal.sendText('', true);
		const shown = new DeferredPromise<void>();
		const store = new DisposableStore();
		store.add(autorun(reader => {
			if (this._foregroundSession.read(reader) === target) {
				void shown.complete();
			} else if (this._pendingConversation.read(reader) !== target || !this.isRunning.read(reader)) {
				void shown.error(new CancellationError());
			}
		}));
		store.add(new RunOnceScheduler(() => {
			void shown.error(new Error(localize('nativeCliSwitchTimeout', "The CLI did not switch to this conversation. Use its session list to open it.")));
		}, NATIVE_CLI_SWITCH_TIMEOUT)).schedule();
		try {
			await shown.p;
		} finally {
			store.dispose();
			if (this._pendingConversation.get() === target) {
				this._pendingConversation.set(undefined, undefined);
			}
		}
	}

	async start(query?: string): Promise<void> {
		if (this._entitlement.sentiment.hidden) {
			throw new NativeCliStartError('disabled', localize('nativeCliDisabled', "AI features are disabled."));
		}
		if (!isNativeCliKindEnabled(this.session.kind, this._configurationService)) {
			throw new NativeCliStartError('disabled', localize('nativeCliKindDisabled', "{0} sessions are disabled by policy.", getNativeCliDefinition(this.session.kind).sessionType.label));
		}
		if (this.session.isArchived.get() || this._store.isDisposed) {
			throw new Error(localize('nativeCliArchived', "Restore this session before starting its CLI."));
		}
		const trust = await this._trust.getUriTrustInfo(this.session.folder);
		if (!trust.trusted) {
			throw new NativeCliStartError('untrusted', localize('nativeCliUntrusted', "Trust this folder before starting a CLI session."));
		}
		if (this._store.isDisposed || this.session.isArchived.get() || this._entitlement.sentiment.hidden) {
			throw new CancellationError();
		}
		if (this._startPromise) {
			return this._startPromise;
		}
		if (this.isRunning.get()) {
			return;
		}
		this._startPromise = this._start(query).finally(() => this._startPromise = undefined);
		return this._startPromise;
	}

	private async _start(query: string | undefined): Promise<void> {
		const generation = this._generation;
		this._startupWatch = StopWatch.create(true);
		this.isStarting.set(true, undefined);
		this.error.set(undefined, undefined);
		this.warning.set(undefined, undefined);
		const launch = new DisposableStore();
		// Kept separate from `_startup`, which `_launch` reuses for the post-spawn phase.
		const launchTimedOut = new DeferredPromise<never>();
		launch.add(toDisposable(() => { void launchTimedOut.cancel(); }));
		const launchTimeout = launch.add(new RunOnceScheduler(() => {
			void launchTimedOut.error(new NativeCliStartError('startupTimeout', localize('nativeCliStartupTimeout', "The CLI did not start within one minute. Try starting it again.")));
		}, NATIVE_CLI_STARTUP_TIMEOUT));
		launchTimeout.schedule();
		let outcome: NativeCliStartOutcome = 'failed';
		try {
			await Promise.race([this._launch(generation, query, launchTimedOut.p), launchTimedOut.p]);
			outcome = 'success';
		} catch (error) {
			if (generation !== this._generation || this._store.isDisposed) {
				error = new CancellationError();
			}
			outcome = this._classifyStartFailure(error, launchTimeout.isScheduled());
			if (!this.session.hasStarted || this.isInitializing.get()) {
				this.stop();
			}
			if (!this.isRunning.get()) {
				await this._releaseAuthentication();
				this._cleanupLifecycle();
			}
			if (!isCancellationError(error)) {
				this.error.set(toErrorMessage(error), undefined);
				if (this.session.hasStarted) {
					this.session.status.set(SessionStatus.Error, undefined);
				}
				this._logService.error('Could not start native CLI', error);
				this.session.changed();
			}
			throw error;
		} finally {
			launch.dispose();
			this._startup.clear();
			this._telemetryService.publicLog2<NativeCliStartEvent, NativeCliStartClassification>('agents/nativeCli/start', {
				cliKind: this.session.kind,
				accountSource: this.authentication?.source.get() ?? 'native',
				isResume: this.session.hasStarted,
				outcome,
				durationMs: Math.round(this._startupWatch?.elapsed() ?? 0),
			});
			if (!this._store.isDisposed) {
				this.isStarting.set(false, undefined);
			}
		}
	}

	/** Maps a launch failure to a bounded category; never carries the message itself. */
	private _classifyStartFailure(error: unknown, timeoutStillPending: boolean): NativeCliStartOutcome {
		if (isCancellationError(error)) {
			return 'cancelled';
		}
		if (error instanceof NativeCliStartError) {
			return error.outcome;
		}
		return timeoutStillPending ? 'failed' : 'startupTimeout';
	}

	/**
	 * Resolves the environment, launches the CLI and waits for its first screen.
	 * Armed with the caller's launch watchdog so a blocked dependency cannot wedge the session.
	 */
	private async _launch(generation: number, query: string | undefined, launchTimedOut: Promise<never>): Promise<void> {
		await this._terminalService.whenConnected;
		if (await this.reconnect()) {
			return;
		}
		const changesReady = this.session.initializeChanges().catch(error => this._logService.error('Native CLI change tracking unavailable', error));
		const backend = await this._terminalInstanceService.getBackend(undefined);
		const shellEnvironment = await backend?.getShellEnvironment() ?? await backend?.getEnvironment() ?? {};
		const platform = isWindows ? 'windows' : isMacintosh ? 'osx' : 'linux';
		const environment = await createTerminalEnvironment(
			{}, this._configurationService.getValue<Record<string, string | null>>(`terminal.integrated.env.${platform}`),
			createVariableResolver(toWorkspaceFolder(this.session.folder), shellEnvironment, this._configurationResolverService),
			undefined, this._configurationService.getValue<'auto' | 'off' | 'on'>('terminal.integrated.detectLocale') ?? 'auto', shellEnvironment,
		);
		const copilotHome = environment?.COPILOT_HOME;
		const home = environment[isWindows ? 'USERPROFILE' : 'HOME'];
		const userHome = home && isAbsolute(home) ? URI.file(home) : this._environment.userHome;
		this._metadataHome = copilotHome && isAbsolute(copilotHome) ? URI.file(copilotHome) : joinPath(userHome, '.copilot');
		const executable = await this._resolveExecutable(environment);
		const resume = this.session.hasStarted && (this.session.kind === 'copilot' || this.session.hasInteraction.get());
		let args = getNativeCliArguments(this.session.kind, this.session.id, resume, this.session.nativeSessionId.get());
		let proxy: INativeCliProxyConfiguration | undefined;
		try {
			proxy = await this.authentication?.prepare();
		} catch (error) {
			// Keeps the localized message but records the failure as an account/proxy problem
			// rather than an unclassified launch error.
			throw isCancellationError(error)
				? error
				: new NativeCliStartError('proxyFailed', error instanceof Error ? error.message : String(error));
		}
		const proxyKind = this.session.kind === 'copilot' ? undefined : this.session.kind;
		if (proxy && proxyKind) {
			args.push(...getNativeCliProxyArguments(proxyKind, proxy, !resume));
		}
		const lifecycleService = this._agentHost.nativeCliLifecycle;
		if (!lifecycleService) {
			throw new NativeCliStartError('lifecycleUnavailable', localize('nativeCliLifecycleUnavailable', "Native CLI session tracking requires a local agent host."));
		}
		this._lifecycleService = lifecycleService;
		const proxyEnv = proxy && proxyKind ? getNativeCliProxyEnvironment(proxyKind, proxy) : {};
		this._lifecycle = await lifecycleService.createNativeCliLifecycle(this.session.kind, this._environment.execPath, {
			executable, args, cwd: this.session.folder.fsPath,
			env: { ...environment, ...proxyEnv },
		});
		args = this._lifecycle.replaceArgs ? [...this._lifecycle.args] : [...args, ...this._lifecycle.args];
		if (query) {
			args.push(...(this.session.kind === 'copilot' ? ['--interactive', query] : ['--', query]));
		}
		await changesReady;
		this._logService.debug(`Native ${this.session.kind} CLI launch preparation: ${this._startupWatch?.elapsed()}ms`);
		this._checkGeneration(generation);
		const env = { ...this._lifecycle.env, ...proxyEnv };
		const terminal = await this._terminalService.createTerminal({
			config: {
				executable, args, cwd: this.session.folder,
				...(Object.keys(env).length ? { env } : {}),
				hideFromUser: true, forcePersist: true, isFeatureTerminal: true,
				ignoreConfigurationCwd: true, ignoreShellIntegration: true, useShellEnvironment: true, waitOnExit: true,
				reconnectionProperties: { ownerId: NATIVE_CLI_PROVIDER_ID, data: { resource: this.resource.toString(), leaseId: proxy?.leaseId, lifecycle: { ...this._lifecycle, args: [], env: undefined }, metadataHome: this._metadataHome?.fsPath }, canRevive: false },
				icon: this.session.icon,
			},
			cwd: this.session.folder, location: TerminalLocation.Panel, skipContributedProfileCheck: true,
		});
		try {
			this._checkGeneration(generation);
		} catch (error) {
			terminal.dispose(TerminalExitReason.User);
			throw error;
		}
		this._bind(terminal, true);
		this._observeLifecycle();
		if (!this.isRunning.get()) {
			throw new NativeCliStartError('earlyExit', localize('nativeCliStoppedDuringStartup', "The CLI stopped before it was ready."));
		}
		const startup = new DisposableStore();
		this._startup.value = startup;
		const ready = new DeferredPromise<void>();
		startup.add(toDisposable(() => { void ready.cancel(); }));
		startup.add(terminal.onExit(exit => {
			void ready.error(new NativeCliStartError('earlyExit', typeof exit === 'object' ? exit.message : localize('nativeCliEarlyExit', "The CLI exited before it was ready (exit code: {0}).", exit ?? 0)));
		}));
		startup.add(autorun(reader => {
			// `_hasExited` is set by the `_bind` exit listener, which runs before the
			// listener above; without it an early exit would race to `complete()`.
			if (!this.isInitializing.read(reader) && this.isRunning.read(reader)) {
				void ready.complete();
			}
		}));
		// `processReady` never settles when the process fails to launch at all.
		await Promise.race([Promise.all([terminal.processReady, ready.p]), launchTimedOut]);
		this._checkGeneration(generation);
		if (!this.isRunning.get()) {
			throw new NativeCliStartError('earlyExit', localize('nativeCliStoppedDuringStartup', "The CLI stopped before it was ready."));
		}
		await this._lifecycleObserver.value?.read();
	}

	private _checkGeneration(generation: number): void {
		if (this._store.isDisposed || this.session.isArchived.get() || this._entitlement.sentiment.hidden
			|| !isNativeCliKindEnabled(this.session.kind, this._configurationService) || generation !== this._generation) {
			throw new CancellationError();
		}
	}

	private _observeLifecycle(): void {
		if (!this._lifecycle) {
			return;
		}
		const generation = this._generation;
		const onError = (source: NativeCliTrackingSource) => (error: unknown) => {
			if (this._store.isDisposed || generation !== this._generation) {
				return;
			}
			this._logService.warn(`Native CLI ${source} tracking failed`, error);
			this._failedTrackingSources.add(source);
			this._updateTrackingWarning();
		};
		const onEvent = (source: NativeCliTrackingSource) => (event: INativeCliLifecycleEvent) => this._eventQueue.queue(async () => {
			const foreground = this.session.kind === 'copilot' && event.source === 'switch';
			if (this._store.isDisposed || generation !== this._generation
				|| event.pid && this.instance.get()?.processId && event.pid !== this.instance.get()?.processId
				|| event.timestamp < (foreground ? this.copilotForegroundTimestamp : this.session.lifecycleTimestamp)) {
				return;
			}
			if (foreground) {
				this.copilotForegroundTimestamp = event.timestamp;
			}
			await this._onNativeEvent(this, event);
			if (this._store.isDisposed || generation !== this._generation || event.sessionId !== (this.session.nativeSessionId.get() ?? this.session.id)) {
				return;
			}
			this._failedTrackingSources.delete(source);
			this._hasSessionTracking = true;
			this._trackingTimedOut = false;
			this._trackingTimeout.cancel();
			this._updateTrackingWarning();
			if (!foreground) {
				this.session.lifecycleTimestamp = event.timestamp;
			}
			this._observeMetadata();
		});
		if (this.session.kind === 'copilot' && this._lifecycle.logsDirectory && this._metadataHome) {
			this._copilotObserver.value = this._instantiationService.createInstance(
				NativeCopilotLifecycleObserver, URI.file(this._lifecycle.logsDirectory), this._metadataHome,
				this.session.nativeSessionId.get() ?? this.session.id, onEvent('copilot'), onError('copilot'),
			);
		}
		const acceptLifecycleEvent = onEvent('lifecycle');
		this._lifecycleObserver.value = this._instantiationService.createInstance(NativeCliLifecycleObserver, URI.file(this._lifecycle.eventsFile), async event => {
			try {
				await this._copilotObserver.value?.read();
			} catch (error) {
				this._logService.warn('Could not refresh Copilot foreground tracking before a lifecycle update', error);
			}
			await acceptLifecycleEvent(event);
		}, onError('lifecycle'));
		this._observeMetadata();
	}

	private _updateTrackingWarning(): void {
		let warning: string | undefined;
		if (this._failedTrackingSources.size) {
			warning = localize('nativeCliTrackingReadFailed', "Some native CLI session updates could not be read. Session information may be out of date. See the window log for details.");
		} else if (this._trackingTimedOut && !this._hasSessionTracking) {
			warning = this._hasActivityTracking
				? localize('nativeCliConversationTrackingWaiting', "CLI activity is available, but VS Code has not received conversation details. Titles and session switching may be out of date.")
				: localize('nativeCliTrackingDataWaiting', "VS Code has not received native CLI session tracking data yet. The CLI can still run, but session details and activity may be out of date.");
		}
		this.warning.set(warning, undefined);
	}

	private _resetTracking(): void {
		this._trackingTimeout.cancel();
		this._trackingTimedOut = false;
		this._hasSessionTracking = false;
		this._hasActivityTracking = false;
		this._failedTrackingSources.clear();
		this.warning.set(undefined, undefined);
	}

	private _observeMetadata(): void {
		if (this.session.kind !== 'copilot' || !this._metadataHome) {
			return;
		}
		const id = this.session.nativeSessionId.get() ?? this.session.id;
		const resource = joinPath(this._metadataHome, 'session-state', id, 'workspace.yaml');
		if (isEqual(resource, this._metadataResource)) {
			return;
		}
		this._metadataResource = resource;
		const session = this.session;
		const store = new DisposableStore();
		this._metadataWatcher.value = store;
		const readTitle = async () => {
			try {
				const content = await this._fileService.readFile(resource, { limits: { size: 65536 } });
				const metadata = readNativeCopilotMetadata(content.value.toString());
				if (store.isDisposed) {
					return;
				}
				if (metadata.id === id && metadata.title) {
					session.acceptCliTitle(metadata.title);
				}
			} catch (error) {
				if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
					this._logService.warn('Could not read native CLI session title', error);
				}
			}
		};
		const scheduler = store.add(new RunOnceScheduler(() => { void readTitle(); }, 100));
		const watcher = store.add(this._fileService.createWatcher(resource, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(() => scheduler.schedule()));
		void readTitle();
	}

	async readLifecycle(): Promise<void> {
		await this._copilotObserver.value?.read();
		await this._lifecycleObserver.value?.read();
	}

	private _bind(terminal: ITerminalInstance, waitForOutput = false): void {
		const previous = this.instance.get();
		this._listeners.clear();
		if (previous && previous !== terminal && !previous.isDisposed) {
			previous.dispose(TerminalExitReason.User);
		}
		const store = new DisposableStore();
		this._listeners.value = store;
		this._resetTracking();
		this._hasExited.set(false, undefined);
		this._terminalProgress = undefined;
		this.isInitializing.set(waitForOutput, undefined);
		const initialization = store.add(new MutableDisposable());
		store.add(this._terminalService.registerEmbeddedTerminal(terminal, () => this._sessions.openSession(this.session.resource)));
		let titleWasWorking = false;
		store.add(terminal.onTitleChanged(() => {
			if (this.session.kind === 'claude' && terminal.titleSource === TitleEventSource.Sequence) {
				const title = terminal.title;
				const working = /^[\u25d0\u25d1] /.test(title);
				const stopped = titleWasWorking && title.startsWith('\u2733 ');
				titleWasWorking = working;
				if (working || stopped) {
					this._hasActivityTracking = true;
					this._updateTrackingWarning();
				}
				void this.readLifecycle().then(() => {
					if (!this._store.isDisposed && this.instance.get() === terminal && !terminal.isDisposed && terminal.title === title) {
						this.session.acceptTerminalTitle(title);
						if (working) {
							this.session.setActivity('working');
						} else if (stopped && this.session.status.get() === SessionStatus.InProgress) {
							// Claude also uses the resting title for permission waits; hooks retain that state.
							this.session.setActivity('idle');
						}
					}
				}).catch(error => this._logService.warn('Could not correlate native CLI title', error));
			}
		}));
		let lastProgress: number | undefined;
		const acceptProgress = (state: number) => {
			if (state === lastProgress) {
				return;
			}
			lastProgress = state;
			this._terminalProgress = state;
			this._hasActivityTracking = true;
			this._updateTrackingWarning();
			this.session.setActivity(state === 1 || state === 3 ? 'working' : state === 4 ? 'input' : state === 2 ? 'error' : 'idle');
		};
		let live = true;
		store.add(toDisposable(() => live = false));
		void terminal.xtermReadyPromise.then(xterm => {
			if (live && xterm) {
				if (waitForOutput) {
					const checkOutput = () => {
						const buffer = xterm.raw.buffer.active;
						for (let line = buffer.baseY; line < buffer.length; line++) {
							if (buffer.getLine(line)?.translateToString(true).trim()) {
								initialization.clear();
								this.isInitializing.set(false, undefined);
								this._logService.debug(`Native ${this.session.kind} CLI first output: ${this._startupWatch?.elapsed()}ms`);
								return;
							}
						}
					};
					initialization.value = xterm.raw.onWriteParsed(checkOutput);
					checkOutput();
				}
				store.add(xterm.onDidChangeProgress(progress => acceptProgress(progress.state)));
				if (xterm.progressState.state !== 0) {
					acceptProgress(xterm.progressState.state);
				}
			}
		}).catch(error => this._logService.error('Could not observe native terminal progress', error));
		store.add(terminal.onDidInputData(data => {
			if (data === '\r' && !this._hasSessionTracking && !this._trackingTimeout.isScheduled()) {
				this._trackingTimeout.schedule();
			}
		}));
		store.add(terminal.onExit(exit => {
			this._hasExited.set(true, undefined);
			const failed = typeof exit === 'object' || typeof exit === 'number' && exit !== 0;
			this.session.setActivity(failed ? 'error' : 'idle');
			if (failed) {
				this.error.set(typeof exit === 'object' ? exit.message : localize('nativeCliExitCode', "The CLI exited with code {0}.", exit), undefined);
			}
			this._teardown();
			void this.session.refreshChanges().catch(error => this._logService.error('Final CLI change refresh failed', error));
		}));
		store.add(terminal.onDisposed(() => {
			this.instance.set(undefined, undefined);
			if (this.session.status.get() === SessionStatus.InProgress || this.session.status.get() === SessionStatus.NeedsInput) {
				this.session.setActivity('idle');
			}
		}));
		this.instance.set(terminal, undefined);
		this.session.setActivity('idle');
	}

	applyEvent(event: INativeCliLifecycleEvent, session: NativeCliSession = this.session): void {
		if (event.event === 'title' || event.event === 'start') {
			if (event.title) {
				session.acceptCliTitle(event.title);
			}
		}
		if (event.event === 'prompt') {
			session.acceptPromptTitle(event.title);
		}
		// Terminal progress describes the foreground conversation only.
		const foreground = session === this.session;
		if (event.activity) {
			session.setActivity(event.activity);
		} else if (event.event === 'prompt') {
			session.setActivity('working');
		} else if (event.event === 'start') {
			if (session.status.get() !== SessionStatus.InProgress) {
				session.setActivity('idle');
			}
		} else if (event.event === 'input') {
			session.setActivity('input');
		} else if (event.event !== 'title' && (!foreground || this._terminalProgress !== 1 && this._terminalProgress !== 3)) {
			session.setActivity('idle');
		}
		session.changed();
	}

	stop(): void {
		this._generation++;
		this._startup.clear();
		this.instance.get()?.dispose(TerminalExitReason.User);
		this._listeners.clear();
		this._hasExited.set(true, undefined);
		this._teardown();
		this.instance.set(undefined, undefined);
		this.session.setActivity('idle');
	}

	/**
	 * Releases everything owned by a running CLI. `ITerminalInstance.dispose` fires
	 * `onExit` a microtask later, after our listener store is already gone, so `stop()`
	 * must run this itself rather than relying on the exit handler.
	 */
	private _teardown(): void {
		this._lifecycleObserver.clear();
		this._copilotObserver.clear();
		this._metadataWatcher.clear();
		this._metadataResource = undefined;
		this._terminalProgress = undefined;
		this.isInitializing.set(false, undefined);
		this._resetTracking();
		void this._releaseAuthentication();
		this._cleanupLifecycle();
	}

	private async _releaseAuthentication(): Promise<void> {
		try {
			await this.authentication?.release();
		} catch (error) {
			this._logService.warn('Could not release CLI authentication', error);
		}
	}

	private _cleanupLifecycle(): void {
		const lifecycle = this._lifecycle;
		this._lifecycle = undefined;
		if (lifecycle) {
			void this._releaseLifecycle(lifecycle).catch(error => this._logService.warn('Could not remove CLI lifecycle observer', error));
		}
	}

	private async _releaseLifecycle(lifecycle: INativeCliLifecycleConfiguration): Promise<void> {
		// The agent host owns the directory it created and removes it here, so a path
		// recovered from persisted terminal state never reaches a recursive delete.
		await this._lifecycleService?.releaseNativeCliLifecycle(lifecycle.id);
	}

	private async _resolveExecutable(environment: IProcessEnvironment | undefined): Promise<string> {
		const definition = getNativeCliDefinition(this.session.kind);
		const configured = this._configurationService.getValue<string>(definition.executableSetting)?.trim();
		if (configured) {
			if (!isAbsolute(configured) || isWindows && /\.(cmd|bat)$/i.test(configured)) {
				throw new NativeCliStartError('executableMisconfigured', localize('nativeCliExecutablePath', "Set {0} to the absolute path of the native CLI executable.", definition.executableSetting));
			}
			if (!await this._fileService.exists(URI.file(configured))) {
				throw new NativeCliStartError('executableMisconfigured', localize('nativeCliExecutableMissing', "The CLI executable does not exist: {0}", configured));
			}
			return configured;
		}
		const platform = isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux';
		const candidates = getNativeCliBundledExecutablePaths(this.session.kind, platform, this._environment.os.arch);
		for (const folder of (environment?.PATH ?? environment?.Path ?? '').split(delimiter).filter(folder => isAbsolute(folder))) {
			const executable = join(folder, `${this.session.kind}${isWindows ? '.exe' : ''}`);
			if (await this._fileService.exists(URI.file(executable))) {
				return executable;
			}
			if (isWindows && await this._fileService.exists(URI.file(join(folder, `${this.session.kind}.cmd`)))) {
				const uri = URI.file(folder);
				const executable = await this._findExecutable([joinPath(uri, 'node_modules'), dirname(uri)], candidates);
				if (executable) {
					return executable;
				}
			}
		}
		const bundled = await this._findExecutable([FileAccess.asFileUri(nodeModulesAsarUnpackedPath), FileAccess.asFileUri(nodeModulesPath)], candidates);
		if (!bundled) {
			throw new NativeCliStartError('notInstalled', localize('nativeCliNotInstalled', "Install {0} on your PATH, or configure {1} with its executable path, then try again.", definition.sessionType.label, definition.executableSetting));
		}
		return bundled;
	}

	private async _findExecutable(roots: readonly URI[], candidates: readonly string[]): Promise<string | undefined> {
		for (const root of roots) {
			for (const candidate of candidates) {
				const resource = joinPath(root, candidate);
				if (await this._fileService.exists(resource)) {
					return resource.fsPath;
				}
			}
		}
		return undefined;
	}

	override dispose(): void {
		if (!this.session.hasStarted) {
			this.stop();
		}
		super.dispose();
	}
}
