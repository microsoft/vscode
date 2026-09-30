/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { IGitHubScheduler } from './githubScheduler.js';
import { getGitHubRequestFeature, GitHubRequestFeature } from './githubRequestMetadata.js';
import { GitHubRequestContext, GitHubRequestError, GitHubTelemetrySource } from './githubTypes.js';

export type GitHubRequestOutcome = 'success' | 'cancelled' | 'authentication' | 'authorization' | 'notFound' | 'validation' | 'schema' | 'rateLimit' | 'network' | 'server' | 'overloaded' | 'timeout' | 'responseTooLarge' | 'malformedResponse' | 'other';
type Caller = GitHubRequestFeature;
type Rejection = 'engine' | 'account' | 'caller' | 'waiter';

interface RequestCounters {
	requests: number;
	succeeded: number;
	cancelled: number;
	timedOut: number;
	overloaded: number;
	responseTooLarge: number;
	authenticationFailures: number;
	authorizationFailures: number;
	rateLimitFailures: number;
	networkFailures: number;
	serverFailures: number;
	otherFailures: number;
	wireAttempts: number;
	retries: number;
	coalesced: number;
	etagRevalidations: number;
	notModified: number;
	http2xx: number;
	http3xx: number;
	http4xx: number;
	http5xx: number;
	httpOther: number;
	rateLimitedResponses: number;
	graphqlErrorResponses: number;
	engineRejected: number;
	accountRejected: number;
	callerRejected: number;
	waiterRejected: number;
	activeHighWater: number;
	pendingHighWater: number;
}

type SummaryEvent = RequestCounters & {
	source: GitHubTelemetrySource;
	windowMs: number;
	admittedCompleted: number;
};

type SummaryClassification = {
	owner: 'dmitrivMS';
	comment: 'Aggregated GitHub engine health counters. Contains no request content or account, repository, host, or caller identifiers.';
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted engine hosting environment.' };
	windowMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds covered by this aggregate.' };
	admittedCompleted: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Completed admitted operations, including cancelled queued operations; timing-sample population.' };
	requests: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical transport calls, including coalesced callers.' };
	succeeded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Successful logical transport calls; GraphQL partial errors are counted separately.' };
	cancelled: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cancelled logical calls.' };
	timedOut: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical calls that exceeded their deadlines.' };
	overloaded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical calls rejected by capacity limits.' };
	responseTooLarge: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical calls rejected by response-size limits.' };
	authenticationFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical authentication failures.' };
	authorizationFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical authorization failures.' };
	rateLimitFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical calls returning a rate-limit error.' };
	networkFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical network failures.' };
	serverFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Logical server failures.' };
	otherFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Other logical failures; no error text is included.' };
	wireAttempts: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Actual fetch attempts, including retries and redirects.' };
	retries: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Additional fetch attempts caused by read retries.' };
	coalesced: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Accepted callers joining an existing in-flight read.' };
	etagRevalidations: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wire attempts carrying an ETag validator; no validator value is collected.' };
	notModified: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP 304 responses.' };
	http2xx: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP 2xx responses.' };
	http3xx: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP 3xx responses.' };
	http4xx: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP 4xx responses.' };
	http5xx: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP 5xx responses.' };
	httpOther: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Other HTTP status classes.' };
	rateLimitedResponses: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP 429, rate-limited HTTP 403, or GraphQL rate-limited responses.' };
	graphqlErrorResponses: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'GraphQL responses containing errors, including partial responses.' };
	engineRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Engine-wide admission rejections.' };
	accountRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Account-capacity rejections; no account identity is collected.' };
	callerRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Caller-capacity rejections; no caller identity is collected.' };
	waiterRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Shared-read waiter-capacity rejections.' };
	activeHighWater: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum simultaneous admitted active requests.' };
	pendingHighWater: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Maximum queued requests, including cooldown waits.' };
};

interface TimingSample {
	caller: Caller;
	kind: 'rest' | 'graphql' | 'download' | 'other';
	priority: 'mutationReconciliation' | 'mutation' | 'interactive' | 'mergeGate' | 'visible' | 'background' | 'enrichment' | 'other';
	resource: 'core' | 'search' | 'graphql' | 'other';
	outcome: GitHubRequestOutcome;
	queueMs: number;
	cooldownMs: number;
	executionMs: number;
}

type TimingEvent = TimingSample & { source: GitHubTelemetrySource; samplePopulation: number };
type TimingClassification = {
	owner: 'dmitrivMS';
	comment: 'Bounded reservoir samples of admitted GitHub request lifetimes. All categories are allowlisted and no request content or identities are included.';
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted engine hosting environment.' };
	caller: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fixed internal subsystem category; all unrecognized callers become other.' };
	kind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'REST, GraphQL, download, or other.' };
	priority: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted dispatch priority, or original priority if cancelled while queued.' };
	resource: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Core, search, GraphQL, or other quota category.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted result category, never an error message.' };
	queueMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Queued milliseconds excluding observed cooldown waits.' };
	cooldownMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Queued milliseconds spent in observed cooldowns.' };
	executionMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Active operation lifetime, including retries and body processing.' };
	samplePopulation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Completed admitted operations represented by this interval reservoir.' };
};

export interface IGitHubRequestTiming {
	updateCooldown(delay: number): void;
	start(priority?: GitHubRequestContext['priority']): void;
	finish(outcome: GitHubRequestOutcome): void;
}

export class GitHubRequestTelemetry extends Disposable {

	static readonly interval = 5 * 60_000;
	static readonly maximumSamples = 10;

	private readonly _timer = this._register(new MutableDisposable());
	private _counters = emptyCounters();
	private _samples: TimingSample[] = [];
	private _samplePopulation = 0;
	private _windowStart: number | undefined;
	private _generation = 0;
	private _collecting = false;
	private _configuredTelemetryLevel = TelemetryLevel.USAGE;
	private readonly _source: GitHubTelemetrySource;

	constructor(
		source: GitHubTelemetrySource,
		private readonly _scheduler: IGitHubScheduler,
		private readonly _telemetryService: ITelemetryService,
		private readonly _logService: ILogService,
		onDidChangeTelemetryLevel: Event<TelemetryLevel> = Event.None,
	) {
		super();
		this._source = source === 'workbench' || source === 'web' || source === 'agentHost' || source === 'sharedProcess' ? source : 'other';
		this._register(onDidChangeTelemetryLevel(level => {
			this._configuredTelemetryLevel = level;
			if (level < TelemetryLevel.USAGE) {
				this._reset();
				this._generation++;
				this._collecting = false;
			}
		}));
	}

	startRequest(): ((outcome: GitHubRequestOutcome) => void) | undefined {
		if (!this._record()) {
			return undefined;
		}
		this._counters.requests++;
		const generation = this._generation;
		let completed = false;
		return outcome => {
			if (completed) {
				return;
			}
			completed = true;
			if (!this._record(generation)) {
				return;
			}
			switch (outcome) {
				case 'success': this._counters.succeeded++; break;
				case 'cancelled': this._counters.cancelled++; break;
				case 'timeout': this._counters.timedOut++; break;
				case 'overloaded': this._counters.overloaded++; break;
				case 'responseTooLarge': this._counters.responseTooLarge++; break;
				case 'authentication': this._counters.authenticationFailures++; break;
				case 'authorization': this._counters.authorizationFailures++; break;
				case 'rateLimit': this._counters.rateLimitFailures++; break;
				case 'network': this._counters.networkFailures++; break;
				case 'server': this._counters.serverFailures++; break;
				default: this._counters.otherFailures++; break;
			}
		};
	}

	record(counter: 'coalesced' | 'rateLimitedResponses' | 'graphqlErrorResponses'): void {
		if (this._record()) {
			switch (counter) {
				case 'coalesced': this._counters.coalesced++; break;
				case 'rateLimitedResponses': this._counters.rateLimitedResponses++; break;
				case 'graphqlErrorResponses': this._counters.graphqlErrorResponses++; break;
			}
		}
	}

	recordWireAttempt(retry: boolean, conditional: boolean): void {
		if (this._record()) {
			this._counters.wireAttempts++;
			this._counters.retries += Number(retry);
			this._counters.etagRevalidations += Number(conditional);
		}
	}

	recordResponse(status: number): void {
		if (!this._record()) {
			return;
		}
		switch (Math.floor(status / 100)) {
			case 2: this._counters.http2xx++; break;
			case 3: this._counters.http3xx++; break;
			case 4: this._counters.http4xx++; break;
			case 5: this._counters.http5xx++; break;
			default: this._counters.httpOther++; break;
		}
		this._counters.notModified += Number(status === 304);
		this._counters.rateLimitedResponses += Number(status === 429);
	}

	recordRejection(reason: Rejection): void {
		if (this._record()) {
			switch (reason) {
				case 'engine': this._counters.engineRejected++; break;
				case 'account': this._counters.accountRejected++; break;
				case 'caller': this._counters.callerRejected++; break;
				case 'waiter': this._counters.waiterRejected++; break;
			}
		}
	}

	recordQueueSize(active: number, pending: number): void {
		if ((active > 0 || pending > 0) && this._record()) {
			this._counters.activeHighWater = Math.max(this._counters.activeHighWater, active);
			this._counters.pendingHighWater = Math.max(this._counters.pendingHighWater, pending);
		}
	}

	startQueue(context: GitHubRequestContext): IGitHubRequestTiming | undefined {
		if (!this._record()) {
			return undefined;
		}
		const metadata = {
			caller: getGitHubRequestFeature(context.caller),
			kind: context.kind === 'rest' || context.kind === 'graphql' || context.kind === 'download' ? context.kind : 'other',
			priority: classifyPriority(context.priority),
			resource: context.resource === 'core' || context.resource === 'search' || context.resource === 'graphql' ? context.resource : 'other',
		} as const;
		const generation = this._generation;
		const queuedAt = this._scheduler.now();
		let lastUpdated = queuedAt;
		let cooldownUntil = queuedAt;
		let cooldownMs = 0;
		let startedAt: number | undefined;
		let priority = metadata.priority;
		let completed = false;
		const update = () => {
			const now = this._scheduler.now();
			cooldownMs += Math.max(0, Math.min(now, cooldownUntil) - lastUpdated);
			lastUpdated = now;
		};
		return {
			updateCooldown: delay => {
				update();
				cooldownUntil = this._scheduler.now() + Math.max(0, delay);
			},
			start: effectivePriority => {
				update();
				startedAt = this._scheduler.now();
				if (effectivePriority !== undefined) {
					priority = classifyPriority(effectivePriority);
				}
			},
			finish: outcome => {
				if (completed) {
					return;
				}
				completed = true;
				if (startedAt === undefined) {
					update();
				}
				if (!this._record(generation)) {
					return;
				}
				const now = this._scheduler.now();
				const sample: TimingSample = {
					...metadata, priority, outcome: classifyOutcome(outcome),
					queueMs: Math.max(0, (startedAt ?? now) - queuedAt - cooldownMs),
					cooldownMs,
					executionMs: startedAt === undefined ? 0 : Math.max(0, now - startedAt),
				};
				const population = ++this._samplePopulation;
				const index = population <= GitHubRequestTelemetry.maximumSamples ? population - 1 : this._scheduler.jitter(population - 1);
				if (index < GitHubRequestTelemetry.maximumSamples) {
					this._samples[index] = sample;
				}
			},
		};
	}

	flush(): void {
		if (!this._enabled() || this._windowStart === undefined) {
			return;
		}
		const summary: SummaryEvent = {
			...this._counters,
			source: this._source,
			windowMs: Math.max(0, this._scheduler.now() - this._windowStart),
			admittedCompleted: this._samplePopulation,
		};
		const samples = this._samples;
		this._reset();
		try {
			this._telemetryService.publicLog2<SummaryEvent, SummaryClassification>('githubRequestSummary', summary);
			for (const sample of samples) {
				if (!this._enabled()) {
					break;
				}
				this._telemetryService.publicLog2<TimingEvent, TimingClassification>('githubRequestTiming', {
					...sample, source: this._source, samplePopulation: summary.admittedCompleted,
				});
			}
		} catch {
			this._logService.warn('[GitHubRequestTelemetry] Failed to emit request telemetry');
		}
	}

	override dispose(): void {
		this.flush();
		super.dispose();
	}

	private _record(generation = this._generation): boolean {
		if (!this._enabled() || generation !== this._generation) {
			return false;
		}
		if (this._windowStart === undefined) {
			this._windowStart = this._scheduler.now();
			this._timer.value = this._scheduler.schedule(() => this.flush(), GitHubRequestTelemetry.interval);
		}
		return true;
	}

	private _enabled(): boolean {
		if (this._store.isDisposed || this._configuredTelemetryLevel < TelemetryLevel.USAGE || this._telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
			if (this._collecting) {
				this._reset();
				this._generation++;
				this._collecting = false;
			}
			return false;
		}
		this._collecting = true;
		return true;
	}

	private _reset(): void {
		this._timer.clear();
		this._windowStart = undefined;
		this._counters = emptyCounters();
		this._samples = [];
		this._samplePopulation = 0;
	}
}

export function gitHubRequestOutcome(error: unknown, cancelled: boolean): GitHubRequestOutcome {
	if (error instanceof GitHubRequestError) {
		switch (error.kind) {
			case 'authentication': case 'authorization': case 'notFound': case 'validation': case 'schema':
			case 'rateLimit': case 'network': case 'server': case 'overloaded': case 'timeout':
			case 'responseTooLarge': case 'malformedResponse':
				return error.kind;
		}
	}
	return cancelled ? 'cancelled' : 'other';
}

function classifyPriority(priority: string): TimingSample['priority'] {
	switch (priority) {
		case 'mutationReconciliation': case 'mutation': case 'interactive': case 'mergeGate':
		case 'visible': case 'background': case 'enrichment':
			return priority;
		default: return 'other';
	}
}

function classifyOutcome(outcome: string): GitHubRequestOutcome {
	switch (outcome) {
		case 'success': case 'cancelled': case 'authentication': case 'authorization': case 'notFound':
		case 'validation': case 'schema': case 'rateLimit': case 'network': case 'server':
		case 'overloaded': case 'timeout': case 'responseTooLarge': case 'malformedResponse':
			return outcome;
		default: return 'other';
	}
}

function emptyCounters(): RequestCounters {
	return {
		requests: 0, succeeded: 0, cancelled: 0, timedOut: 0, overloaded: 0, responseTooLarge: 0,
		authenticationFailures: 0, authorizationFailures: 0, rateLimitFailures: 0, networkFailures: 0, serverFailures: 0, otherFailures: 0,
		wireAttempts: 0, retries: 0, coalesced: 0, etagRevalidations: 0, notModified: 0,
		http2xx: 0, http3xx: 0, http4xx: 0, http5xx: 0, httpOther: 0, rateLimitedResponses: 0, graphqlErrorResponses: 0,
		engineRejected: 0, accountRejected: 0, callerRejected: 0, waiterRejected: 0, activeHighWater: 0, pendingHighWater: 0,
	};
}
