/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { getGitHubRequestFeature, GitHubRequestFeature } from './githubRequestMetadata.js';
import { GitHubTelemetrySource } from './githubTypes.js';
import { IRequestScheduler } from './scheduler.js';
import { GitHubRequestDomain, gitHubRequestDomains, IRequestTiming, RequestContext, RequestOutcome } from './types.js';

type Caller = GitHubRequestFeature;
type Rejection = 'engine' | 'account' | 'caller' | 'waiter';

interface OutcomeCounters {
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
}

interface RejectionCounters {
	engineRejected: number;
	accountRejected: number;
	callerRejected: number;
	waiterRejected: number;
}

interface RequestCounters extends OutcomeCounters, RejectionCounters {
	requests: number;
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
	activeHighWater: number;
	pendingHighWater: number;
}

interface DomainCounters extends OutcomeCounters, RejectionCounters {
	admittedCompleted: number;
	queueMsTotal: number;
	cooldownMsTotal: number;
	executionMsTotal: number;
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

type DomainSummaryEvent = DomainCounters & {
	source: GitHubTelemetrySource;
	domain: GitHubRequestDomain;
	windowMs: number;
};

type DomainSummaryClassification = {
	owner: 'dmitrivMS';
	comment: 'Unsampled completed queue operations and capacity rejections by fixed GitHub API domain. Coalesced callers and wire retries are not separate completed operations.';
	source: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted engine hosting environment.' };
	domain: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fixed API domain supplied by the client, never a hostname, repository, path, or caller identifier.' };
	windowMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds covered by the engine aggregate interval.' };
	admittedCompleted: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Completed admitted operations in this domain, including queued cancellations and timeouts.' };
	succeeded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Successful completed admitted operations; transport success does not imply typed response validation succeeded.' };
	cancelled: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Cancelled admitted operations.' };
	timedOut: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations that exceeded their deadlines.' };
	overloaded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations ending with a capacity error; admission and waiter rejections have separate counters.' };
	responseTooLarge: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations rejected by response-size limits.' };
	authenticationFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations ending with an authentication failure.' };
	authorizationFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations ending with an authorization failure.' };
	rateLimitFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations ending with a rate-limit error.' };
	networkFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations ending with a network failure.' };
	serverFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Admitted operations ending with a server failure.' };
	otherFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Other admitted-operation failures; no error text is included.' };
	engineRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests in this domain rejected by engine admission capacity.' };
	accountRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests in this domain rejected by account admission capacity; no account identity is collected.' };
	callerRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests in this domain rejected by caller admission capacity; no caller identity is collected.' };
	waiterRejected: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Callers in this domain rejected by shared-read waiter capacity.' };
	queueMsTotal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total queued milliseconds excluding observed cooldowns across completed admitted operations.' };
	cooldownMsTotal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total observed queued cooldown milliseconds across completed admitted operations.' };
	executionMsTotal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total active lifetime including retries and body processing across completed admitted operations.' };
};

interface TimingSample {
	caller: Caller;
	domain: GitHubRequestDomain;
	priority: 'mutationReconciliation' | 'mutation' | 'interactive' | 'mergeGate' | 'visible' | 'background' | 'enrichment' | 'other';
	outcome: RequestOutcome;
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
	domain: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Fixed API domain of the admitted operation; unclassified operations become other.' };
	priority: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted dispatch priority, or original priority if cancelled while queued.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted result category, never an error message.' };
	queueMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Queued milliseconds excluding observed cooldown waits.' };
	cooldownMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Queued milliseconds spent in observed cooldowns.' };
	executionMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Active operation lifetime, including retries and body processing.' };
	samplePopulation: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Completed admitted operations represented by this interval reservoir.' };
};

/** Privacy-safe request counters and sampled timings for GitHub engine traffic. */
export class GitHubRequestTelemetry extends Disposable {

	static readonly interval = 10 * 60_000;
	static readonly maximumSamples = 10;

	private readonly _timer = this._register(new MutableDisposable());
	private _counters = emptyCounters();
	private readonly _domainCounters = new Map<GitHubRequestDomain, DomainCounters>();
	private _samples: TimingSample[] = [];
	private _samplePopulation = 0;
	private _windowStart: number | undefined;
	private _generation = 0;
	private _collecting = false;
	private _configuredTelemetryLevel = TelemetryLevel.USAGE;
	private readonly _source: GitHubTelemetrySource;

	constructor(
		source: GitHubTelemetrySource,
		private readonly _scheduler: IRequestScheduler,
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

	startRequest(): ((outcome: RequestOutcome) => void) | undefined {
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

			recordOutcome(this._counters, outcome);
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

	recordRejection(reason: Rejection, domain?: GitHubRequestDomain): void {
		if (this._record()) {
			for (const counters of [this._counters, this._getDomainCounters(classifyDomain(domain))]) {
				switch (reason) {
					case 'engine': counters.engineRejected++; break;
					case 'account': counters.accountRejected++; break;
					case 'caller': counters.callerRejected++; break;
					case 'waiter': counters.waiterRejected++; break;
				}
			}
		}
	}

	recordQueueSize(active: number, pending: number): void {
		if ((active > 0 || pending > 0) && this._record()) {
			this._counters.activeHighWater = Math.max(this._counters.activeHighWater, active);
			this._counters.pendingHighWater = Math.max(this._counters.pendingHighWater, pending);
		}
	}

	startQueue(context: RequestContext): IRequestTiming | undefined {
		if (!this._record()) {
			return undefined;
		}

		const metadata = {
			caller: getGitHubRequestFeature(context.caller),
			domain: classifyDomain(context.domain),
			priority: classifyPriority(context.priority),
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
					...metadata,
					priority,
					outcome: classifyOutcome(outcome),
					queueMs: Math.max(0, (startedAt ?? now) - queuedAt - cooldownMs),
					cooldownMs,
					executionMs: startedAt === undefined ? 0 : Math.max(0, now - startedAt),
				};

				const counters = this._getDomainCounters(metadata.domain);
				counters.admittedCompleted++;
				recordOutcome(counters, sample.outcome);
				counters.queueMsTotal += sample.queueMs;
				counters.cooldownMsTotal += sample.cooldownMs;
				counters.executionMsTotal += sample.executionMs;

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
		const domainSummaries: DomainSummaryEvent[] = Array.from(this._domainCounters, ([domain, counters]) => ({
			...counters, domain, source: this._source, windowMs: summary.windowMs,
		}));
		this._reset();
		try {
			this._telemetryService.publicLog2<SummaryEvent, SummaryClassification>('githubRequestSummary', summary);
			for (const domainSummary of domainSummaries) {
				if (!this._enabled()) {
					break;
				}
				this._telemetryService.publicLog2<DomainSummaryEvent, DomainSummaryClassification>('githubRequestDomainSummary', domainSummary);
			}
			for (const sample of samples) {
				if (!this._enabled()) {
					break;
				}
				this._telemetryService.publicLog2<TimingEvent, TimingClassification>('githubRequestTiming', {
					...sample,
					source: this._source,
					samplePopulation: summary.admittedCompleted,
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

	private _getDomainCounters(domain: GitHubRequestDomain): DomainCounters {
		let counters = this._domainCounters.get(domain);
		if (!counters) {
			counters = {
				...emptyOutcomeCounters(),
				...emptyRejectionCounters(),
				admittedCompleted: 0,
				queueMsTotal: 0,
				cooldownMsTotal: 0,
				executionMsTotal: 0,
			};
			this._domainCounters.set(domain, counters);
		}
		return counters;
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
		this._domainCounters.clear();
		this._samples = [];
		this._samplePopulation = 0;
	}
}

function classifyDomain(domain: GitHubRequestDomain | undefined): GitHubRequestDomain {
	return gitHubRequestDomains.find(value => value === domain) ?? 'other';
}

function classifyPriority(priority: string): TimingSample['priority'] {
	switch (priority) {
		case 'mutationReconciliation':
		case 'mutation':
		case 'interactive':
		case 'mergeGate':
		case 'visible':
		case 'background':
		case 'enrichment':
			return priority;
		default: return 'other';
	}
}

function classifyOutcome(outcome: string): RequestOutcome {
	switch (outcome) {
		case 'success':
		case 'cancelled':
		case 'authentication':
		case 'authorization':
		case 'notFound':
		case 'validation':
		case 'schema':
		case 'rateLimit':
		case 'network':
		case 'server':
		case 'overloaded':
		case 'timeout':
		case 'responseTooLarge':
		case 'malformedResponse':
			return outcome;
		default: return 'other';
	}
}

function recordOutcome(counters: OutcomeCounters, outcome: RequestOutcome): void {
	switch (outcome) {
		case 'success': counters.succeeded++; break;
		case 'cancelled': counters.cancelled++; break;
		case 'timeout': counters.timedOut++; break;
		case 'overloaded': counters.overloaded++; break;
		case 'responseTooLarge': counters.responseTooLarge++; break;
		case 'authentication': counters.authenticationFailures++; break;
		case 'authorization': counters.authorizationFailures++; break;
		case 'rateLimit': counters.rateLimitFailures++; break;
		case 'network': counters.networkFailures++; break;
		case 'server': counters.serverFailures++; break;
		default: counters.otherFailures++; break;
	}
}

function emptyOutcomeCounters(): OutcomeCounters {
	return {
		succeeded: 0,
		cancelled: 0,
		timedOut: 0,
		overloaded: 0,
		responseTooLarge: 0,
		authenticationFailures: 0,
		authorizationFailures: 0,
		rateLimitFailures: 0,
		networkFailures: 0,
		serverFailures: 0,
		otherFailures: 0,
	};
}

function emptyRejectionCounters(): RejectionCounters {
	return {
		engineRejected: 0,
		accountRejected: 0,
		callerRejected: 0,
		waiterRejected: 0,
	};
}

function emptyCounters(): RequestCounters {
	return {
		requests: 0,
		...emptyOutcomeCounters(),
		wireAttempts: 0,
		retries: 0,
		coalesced: 0,
		etagRevalidations: 0,
		notModified: 0,
		http2xx: 0,
		http3xx: 0,
		http4xx: 0,
		http5xx: 0,
		httpOther: 0,
		rateLimitedResponses: 0,
		graphqlErrorResponses: 0,
		...emptyRejectionCounters(),
		activeHighWater: 0,
		pendingHighWater: 0,
	};
}
