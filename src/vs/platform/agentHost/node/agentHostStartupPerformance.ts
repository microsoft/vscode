/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { AgentHostExternalSessionsMode } from '../common/agentHostSchema.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';

export const IAgentHostStartupPerformance = createDecorator<IAgentHostStartupPerformance>('agentHostStartupPerformance');

type StartupMilestone = 'processStart' | 'bootstrapStart' | 'configuration' | 'telemetry' | 'services' | 'bootstrap' | 'hostReady' | 'firstSessionList' | 'startupSettled' | 'providerContext' | 'firstSessionDiscoveryResult' | 'firstSessionDiscoveryRegistration';
type StartupOperation = 'sessionList' | 'sessionMigration' | 'sessionMigrationScan' | 'sessionDiscoveryScan' | 'sessionMetadataScan' | 'sessionDiscoveryRegistration';
type StartupMarkName = StartupMilestone | StartupOperation | `${StartupOperation}Start`;
export type AgentHostStartupOutcome = 'success' | 'error' | 'unavailable' | 'deferred' | 'partial' | 'cancelled';
type StartupProvider = 'host' | 'copilotcli' | 'claude' | 'codex' | 'other';

export interface IAgentHostStartupMetrics {
	scannedSessionCount?: number;
	pageCount?: number;
	truncated?: boolean;
	candidateSessionCount?: number;
	externalSessionCount?: number;
	filteredSessionCount?: number;
	registeredSessionCount?: number;
	copilotSessionCount?: number;
	claudeSessionCount?: number;
	codexSessionCount?: number;
	otherSessionCount?: number;
	visibleSessionCount?: number;
	hiddenSessionCount?: number;
	catalogServedCount?: number;
	providerFallbackCount?: number;
	stateFallbackCount?: number;
	databaseOpenCount?: number;
	databaseStatCount?: number;
	catalogEnabled?: boolean;
	externalSessionsMode?: AgentHostExternalSessionsMode;
	synchronizedSessionCount?: number;
	skippedSessionCount?: number;
	excludedSessionCount?: number;
	incompleteSessionCount?: number;
	failedSessionCount?: number;
	migrationState?: 'backfilled' | 'required' | 'unknown';
	migrationForced?: boolean;
	activationState?: 'active' | 'inactive' | 'notRequired' | 'unknown';
	sdkAvailability?: 'available' | 'unavailable' | 'unknown';
	copilotRegistered?: boolean;
	claudeRegistered?: boolean;
	codexRegistered?: boolean;
	migrateLegacyEnabled?: boolean;
}

export interface IAgentHostStartupTiming {
	setMetrics(metrics: IAgentHostStartupMetrics): void;
	complete(outcome: AgentHostStartupOutcome, metrics?: IAgentHostStartupMetrics): void;
}

interface IStartupMarkData extends IAgentHostStartupMetrics {
	readonly provider?: string;
	readonly since?: StartupMilestone;
	readonly outcome?: AgentHostStartupOutcome;
}

interface IStartupMark extends IAgentHostStartupMetrics {
	readonly name: StartupMarkName;
	readonly timestampMs: number;
	readonly since?: StartupMarkName;
	readonly durationMs?: number;
	readonly outcome?: AgentHostStartupOutcome;
}

interface IRecordedStartupMark extends IStartupMark {
	readonly provider: StartupProvider;
}

/** Buffers the fixed set of bootstrap milestones before telemetry and configuration are ready. */
export class AgentHostStartupMarks {
	readonly agentHostSessionId = generateUuid();
	private readonly _marks = new Map<string, IRecordedStartupMark>([['processStart/host', { name: 'processStart', provider: 'host', timestampMs: 0 }]]);
	private _pending = [...this._marks.values()];

	constructor(private readonly _now: () => number = () => performance.now()) { }

	has(name: StartupMilestone, provider?: string): boolean {
		return this._marks.has(`${name}/${getStartupProvider(provider)}`);
	}

	mark(name: StartupMilestone, data: IStartupMarkData = {}): void {
		const provider = getStartupProvider(data.provider);
		const key = `${name}/${provider}`;
		if (this._marks.has(key)) {
			return;
		}
		const timestampMs = this._now();
		const previous = data.since === undefined ? undefined : this._marks.get(`${data.since}/${data.since === 'processStart' ? 'host' : provider}`);
		const mark: IRecordedStartupMark = {
			...data,
			name,
			provider,
			timestampMs,
			...(previous ? { durationMs: timestampMs - previous.timestampMs } : {}),
		};
		this._marks.set(key, mark);
		this._pending.push(mark);
	}

	takePending(): readonly IRecordedStartupMark[] {
		const pending = this._pending;
		if (pending.length > 0) {
			this._pending = [];
		}
		return pending;
	}
}

export interface IAgentHostStartupPerformance {
	readonly _serviceBrand: undefined;
	readonly agentHostSessionId: string;
	readonly isEnabled: boolean;
	/** Whether a milestone is still unobserved, independently of operation sampling and consent. */
	isPending(name: StartupMilestone, provider?: string): boolean;
	/** Records a milestone once per provider, optionally measuring from an explicitly named earlier milestone. */
	mark(name: StartupMilestone, data?: IStartupMarkData): void;
	/** Pairs start/end markers for one operation, bounded to three attempts and stopping after success. */
	start(operation: StartupOperation, provider?: string): IAgentHostStartupTiming | undefined;
}

type StartupMarkEvent = IStartupMark & {
	agentHostSessionId: string;
	hostLaunchKind: AgentHostLaunchKind;
	schemaVersion: number;
	provider: StartupProvider;
	attempt: number;
};

type StartupMarkClassification = {
	owner: 'benibenj';
	comment: 'Bounded Agent Host startup markers and workload counts, correlated by a random process-lifetime identifier.';
	agentHostSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Random identifier for this Agent Host process lifetime, not a conversation or user identifier.' };
	hostLaunchKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the Agent Host was launched by VS Code main, CLI, or an unknown launcher.' };
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Version of the startup marker schema.' };
	name: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted name of this startup milestone or operation boundary.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Built-in provider, host for shared work, or other for an unrecognized provider.' };
	attempt: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Observation attempt for this operation and provider, capped at three; milestones use one.' };
	timestampMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Marker offset in milliseconds from the Node performance time origin in this process.' };
	since?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Explicit predecessor marker; operation markers pair within the same host, provider, and attempt.' };
	durationMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed milliseconds since the named predecessor; absent when no predecessor was observed.' };
	outcome?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Success, error, unavailable, deferred, partial, or cancelled when an operation settles; start markers have no outcome.' };
	scannedSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Provider catalog entries returned by enumeration, before host visibility or migration filtering; not the number of physical files read by an SDK.' };
	pageCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of provider catalog pages successfully read.' };
	truncated?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether catalog enumeration ended before exhausting the provider cursor.' };
	candidateSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Classified candidates in the first provider discovery result, or entries in one host discovery registration batch; not a provider-wide catalog size.' };
	externalSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Discovery candidates classified as external by the provider, before host provenance and visibility checks.' };
	filteredSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Observed entries deliberately filtered by provider discovery, or skipped without a new registration by host discovery processing.' };
	registeredSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Host registrations before visibility filtering in the final session-list computation, or accepted registry writes in one discovery batch.' };
	copilotSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Copilot host registrations before visibility filtering, not the provider-wide scan count.' };
	claudeSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Claude host registrations before visibility filtering, not the provider-wide scan count.' };
	codexSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Codex host registrations before visibility filtering, not the provider-wide scan count.' };
	otherSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Host registrations for providers other than Copilot, Claude, and Codex.' };
	visibleSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Session rows returned after visibility filtering and live-state overlays.' };
	hiddenSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Session rows hidden by the external-session visibility mode.' };
	catalogServedCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Rows served from the central catalog in the final session-list computation.' };
	providerFallbackCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Rows requiring provider metadata fallback in the final session-list computation.' };
	stateFallbackCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Rows added from live host state rather than persisted registrations.' };
	databaseOpenCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Process-wide session database opens during this operation, including overlapping work.' };
	databaseStatCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Process-wide session database stats during this operation, including overlapping work.' };
	catalogEnabled?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether session listing used the central catalog.' };
	externalSessionsMode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded external-session visibility mode used by the listing.' };
	synchronizedSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Migration candidates synchronized into the central catalog.' };
	skippedSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Migration candidates already current.' };
	excludedSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Migration candidates excluded from the host catalog.' };
	incompleteSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Migration candidates incomplete or carrying stale exclusions, or discovery candidates whose catalog synchronization remains pending.' };
	failedSessionCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Migration or discovery candidates with an observed processing failure; a discovery registration may already have been accepted before a later failure.' };
	migrationState?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the provider catalog was already backfilled for the current payload version at the start of this migration attempt, or unknown if the check failed.' };
	migrationForced?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the migration attempt forces enumeration even when the provider catalog is already backfilled.' };
	activationState?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Explicit activation gate state at the first provider catalog access check: active, inactive, notRequired, or unknown. Does not indicate authentication or connection readiness.' };
	sdkAvailability?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the provider SDK is locally available without a download at the first catalog access check, or unknown when no check ran.' };
	copilotRegistered?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the Copilot provider is registered at this host milestone; not SDK, authentication, or connection readiness.' };
	claudeRegistered?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the Claude provider is registered at this host milestone; not SDK, authentication, or connection readiness.' };
	codexRegistered?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the Codex provider is registered at this host milestone; not SDK, authentication, or connection readiness.' };
	migrateLegacyEnabled?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether legacy chat migration is enabled for this host lifetime.' };
};

interface IOperationState {
	attempts: number;
	done: boolean;
	active?: IActiveTiming;
}

interface IActiveTiming {
	readonly operation: StartupOperation;
	readonly provider: StartupProvider;
	readonly state: IOperationState;
	readonly startTimeMs: number;
	readonly sendTelemetry: boolean;
	readonly metrics: IAgentHostStartupMetrics;
}

export class AgentHostStartupPerformance extends Disposable implements IAgentHostStartupPerformance {
	declare readonly _serviceBrand: undefined;
	readonly agentHostSessionId: string;
	private readonly _marks: AgentHostStartupMarks;
	private readonly _operations = new Map<string, IOperationState>();
	private _disposed = false;

	constructor(
		private readonly _hostLaunchKind: AgentHostLaunchKind,
		marks: AgentHostStartupMarks | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		private readonly _now: () => number = () => performance.now(),
	) {
		super();
		this._marks = marks ?? new AgentHostStartupMarks(this._now);
		this.agentHostSessionId = this._marks.agentHostSessionId;
		// __GDPR__COMMON__ "common.agentHostSessionId" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Random identifier for one Agent Host process lifetime, independent of conversations and client connections." }
		this._telemetryService.setCommonProperty('common.agentHostSessionId', this.agentHostSessionId);
	}

	get isEnabled(): boolean {
		return !this._disposed && (this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE || this._logService.getLevel() === LogLevel.Trace);
	}

	isPending(name: StartupMilestone, provider?: string): boolean {
		return !this._disposed && !this._marks.has(name, provider);
	}

	mark(name: StartupMilestone, data?: IStartupMarkData): void {
		if (this._disposed) {
			return;
		}
		this._marks.mark(name, data);
		this._reportPendingMarks();
	}

	start(operation: StartupOperation, provider?: string): IAgentHostStartupTiming | undefined {
		const timing = this._begin(operation, provider);
		if (!timing) {
			return undefined;
		}
		return {
			setMetrics: metrics => {
				if (timing.state.active === timing) {
					Object.assign(timing.metrics, metrics);
				}
			},
			complete: (outcome, metrics) => {
				if (timing.state.active === timing) {
					Object.assign(timing.metrics, metrics);
					this._complete(timing, this._now(), outcome);
				}
			},
		};
	}

	private _begin(operation: StartupOperation, providerId?: string): IActiveTiming | undefined {
		if (this._disposed) {
			return undefined;
		}
		const provider = getStartupProvider(providerId);
		const key = `${operation}/${provider}`;
		let state = this._operations.get(key);
		if (state?.done || state?.active) {
			return undefined;
		}
		this._reportPendingMarks();
		const sendTelemetry = this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE;
		if (!sendTelemetry && this._logService.getLevel() !== LogLevel.Trace) {
			this._operations.set(key, { attempts: 0, done: true });
			return undefined;
		}
		if (!state) {
			state = { attempts: 0, done: false };
			this._operations.set(key, state);
		}
		state.attempts++;
		const timing: IActiveTiming = { operation, provider, state, startTimeMs: this._now(), sendTelemetry, metrics: {} };
		state.active = timing;
		this._report({ name: `${operation}Start`, timestampMs: timing.startTimeMs }, provider, state.attempts, sendTelemetry);
		return timing;
	}

	private _complete(timing: IActiveTiming, endTimeMs: number, outcome: AgentHostStartupOutcome): void {
		timing.state.active = undefined;
		timing.state.done = outcome === 'success' || timing.state.attempts >= 3;
		this._report({
			...timing.metrics,
			name: timing.operation,
			timestampMs: endTimeMs,
			since: `${timing.operation}Start`,
			durationMs: endTimeMs - timing.startTimeMs,
			outcome,
		}, timing.provider, timing.state.attempts, timing.sendTelemetry);
	}

	private _reportPendingMarks(): void {
		for (const mark of this._marks.takePending()) {
			if (mark.since !== undefined && mark.durationMs === undefined) {
				this._logService.warn(`[AgentHostStartupPerformance] Missing predecessor '${mark.since}' for '${mark.name}'`);
			}
			this._report(mark, mark.provider, 1, this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE);
		}
	}

	private _report(mark: IStartupMark, provider: StartupProvider, attempt: number, sendTelemetry: boolean): void {
		const event: StartupMarkEvent = {
			...mark,
			agentHostSessionId: this.agentHostSessionId,
			hostLaunchKind: this._hostLaunchKind,
			schemaVersion: 1,
			provider,
			attempt,
		};
		this._logService.trace('[AgentHostStartupPerformance]', event);
		if (sendTelemetry && this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE) {
			try {
				this._telemetryService.publicLog2<StartupMarkEvent, StartupMarkClassification>('agentHost.startupMark', event);
			} catch (error) {
				this._logService.warn('[AgentHostStartupPerformance] Failed to report startup marker', error);
			}
		}
	}

	override dispose(): void {
		this._disposed = true;
		for (const state of this._operations.values()) {
			if (state.active) {
				this._complete(state.active, this._now(), 'cancelled');
			}
		}
		this._operations.clear();
		this._marks.takePending();
		super.dispose();
	}
}

function getStartupProvider(providerId: string | undefined): StartupProvider {
	return providerId === undefined ? 'host'
		: providerId === 'copilotcli' || providerId === 'claude' || providerId === 'codex' ? providerId : 'other';
}

export const NullAgentHostStartupPerformance: IAgentHostStartupPerformance = {
	_serviceBrand: undefined,
	agentHostSessionId: '',
	isEnabled: false,
	isPending: () => false,
	start: () => undefined,
	mark: () => { },
};
