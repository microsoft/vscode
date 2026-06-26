/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { Memento } from '../../../common/memento.js';
import { onboardingPresentationRegistry } from '../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../common/onboardingRegistry.js';
import { IOnboardingRunResult, IOnboardingScenario, ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX, OnboardingOutcome } from '../common/onboardingScenario.js';
import { isOnboardingDeveloperModeEnabled, IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../common/onboardingScenarioService.js';

/** Persisted "shown" state for a single scenario. */
interface IScenarioState {
	readonly shownAt: number;
	outcome?: OnboardingOutcome;
	seenCount: number;
}

type OnboardingMementoData = { [scenarioId: string]: IScenarioState };

/** Resolved experiment treatment state for a scenario that declares an experiment. */
interface IExperimentState {
	/** Both treatment flags resolved (the experiment is configured for this user). */
	readonly active: boolean;
	/** Value of the boolean behavior flag: `true` shows the tour (treatment), `false` is control. */
	readonly behavior: boolean;
	/** Value of the assignment-context id flag (the id the scorecard keys on). */
	readonly assignmentContextId: string;
}

export class OnboardingScenarioService extends Disposable implements IOnboardingScenarioService {

	declare readonly _serviceBrand: undefined;

	private static readonly MEMENTO_ID = 'onboarding';

	/**
	 * Storage key for the set of assignment-context identifiers whose telemetry gate has been
	 * opened (the user reached the onboarding moment). Persisted so the identifier keeps
	 * flowing across reloads/relaunches until the experiment is stopped.
	 */
	private static readonly OPENED_IDS_STORAGE_KEY = 'onboarding.openedAssignmentContextIds';

	private readonly _memento: Memento<OnboardingMementoData>;
	private readonly _state: Partial<OnboardingMementoData>;

	/** Listeners for `observable` triggers, rebuilt whenever the registry changes. */
	private readonly _triggerListeners = this._register(new DisposableStore());

	/** Scenario ids currently queued or running (prevents double-scheduling). */
	private readonly _pending = new Set<string>();
	private readonly _queue: { scenario: IOnboardingScenario; deferred: DeferredPromise<OnboardingOutcome> }[] = [];
	/** Deferreds for scenarios that have been dequeued and are currently running, keyed by id. */
	private readonly _inflight = new Map<string, DeferredPromise<OnboardingOutcome>>();
	private _pumping = false;

	/** Abort signal for the scenario currently running. */
	private _activeAbort: Emitter<void> | undefined;

	/** Resolved experiment treatment state, keyed by scenario id. */
	private readonly _experimentStates = new Map<string, IExperimentState>();

	/**
	 * Assignment-context ids whose telemetry gate is open. While an onboarding id is *not* in
	 * this set, the eagerly-registered filter excludes it from telemetry (see the prefix
	 * constant). The set is seeded from storage and grows as users reach the onboarding moment.
	 */
	private readonly _openedAssignmentContextIds: Set<string>;
	private readonly _onDidChangeOpenedIds = this._register(new Emitter<void>());

	private _started = false;
	private _stopped = false;
	private readonly _shownSinceStart = new Set<string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._memento = new Memento(OnboardingScenarioService.MEMENTO_ID, this.storageService);
		this._state = this._memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);

		this._openedAssignmentContextIds = this._loadOpenedIds();

		// Register the telemetry gate filter eagerly (in the constructor) so onboarding
		// assignment-context ids are excluded from the very first event — before the treatment
		// flags resolve. The filter blocks any id with the reserved onboarding prefix unless its
		// gate has already been opened (this session or persisted from a previous one).
		this.assignmentService.addTelemetryAssignmentFilter({
			exclude: assignment => assignment.startsWith(ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX) && !this._openedAssignmentContextIds.has(assignment),
			onDidChange: this._onDidChangeOpenedIds.event
		});

		// On shutdown abort the active run and drain anything still queued so no
		// fresh overlay is mounted while the window is going away.
		this._register(this.lifecycleService.onWillShutdown(() => this._stop()));
	}

	private _stop(): void {
		this._stopped = true;
		this._activeAbort?.fire();

		let entry: { scenario: IOnboardingScenario; deferred: DeferredPromise<OnboardingOutcome> } | undefined;
		while ((entry = this._queue.shift())) {
			this._pending.delete(entry.scenario.id);
			entry.deferred.complete(OnboardingOutcome.Aborted);
		}
	}

	start(): void {
		if (this._started) {
			return;
		}
		this._started = true;

		this._register(onboardingScenarioRegistry.onDidChange(() => {
			this._registerTriggerListeners();
			this._resolveExperiments();
			this._evaluate();
		}));

		this._register(this.contextKeyService.onDidChangeContext(() => this._evaluate()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ONBOARDING_ENABLED_CONFIG) || e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)) {
				this._evaluate();
			}
		}));

		this._registerTriggerListeners();
		this._resolveExperiments();
		this._evaluate();
	}

	getScenarios(): readonly IOnboardingScenario[] {
		return onboardingScenarioRegistry.getScenarios();
	}

	async runScenario(id: string): Promise<OnboardingOutcome> {
		const scenario = onboardingScenarioRegistry.getScenario(id);
		if (!scenario) {
			throw new Error(`Unknown onboarding scenario '${id}'.`);
		}
		return this._enqueue(scenario);
	}

	hasBeenShown(id: string): boolean {
		const scenario = onboardingScenarioRegistry.getScenario(id);
		return this._hasBeenShownKey(scenario ? this._seenKey(scenario) : id, id);
	}

	reset(id: string): void {
		const scenario = onboardingScenarioRegistry.getScenario(id);
		delete this._state[scenario ? this._seenKey(scenario) : id];
		this._memento.saveMemento();
	}

	resetAll(): void {
		for (const key of Object.keys(this._state)) {
			delete this._state[key];
		}
		this._memento.saveMemento();
	}

	//#region Eligibility & scheduling

	private get _enabled(): boolean {
		return this.configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) !== false;
	}

	private _isDeveloperMode(scenarioId: string): boolean {
		return isOnboardingDeveloperModeEnabled(this.configurationService, scenarioId);
	}

	/**
	 * Re-evaluate every scenario and enqueue any that are eligible to run
	 * automatically. Idempotent: already shown / queued scenarios are skipped.
	 *
	 * For an experiment-active scenario, reaching eligibility *is* the "would-show"
	 * moment: the telemetry gate is opened for the experiment's assignment-context id
	 * (in both arms), and then only the treatment arm is enqueued to actually show the
	 * tour. Control opens the gate but renders nothing and is not marked as shown.
	 */
	private _evaluate(): void {
		if (!this._enabled || this._stopped) {
			return;
		}

		// Seen keys already claimed by a pending/queued/running non-repeatable
		// scenario. Scenarios that share a `seenKey` are gated together, so once
		// one sibling is scheduled we must not also schedule another in the same
		// pass: shown state is only written when a scenario starts running, after
		// the queue has been populated, so the shared-key check in
		// `_isAutoEligible` cannot see the sibling yet.
		const claimedSeenKeys = new Set<string>();
		for (const scenario of onboardingScenarioRegistry.getScenarios()) {
			if (!scenario.repeatable && this._pending.has(scenario.id)) {
				claimedSeenKeys.add(this._seenKey(scenario));
			}
		}

		for (const scenario of onboardingScenarioRegistry.getScenarios()) {
			if (!this._isAutoEligible(scenario)) {
				continue;
			}

			const seenKey = this._seenKey(scenario);
			if (!scenario.repeatable && claimedSeenKeys.has(seenKey)) {
				// A sibling sharing this seen key is already scheduled this pass;
				// showing it will mark this scenario seen too.
				continue;
			}

			const experiment = scenario.experiment ? this._experimentStates.get(scenario.id) : undefined;
			if (experiment?.active) {
				// Would-show reached: start emitting the assignment-context id from now on.
				this._openGate(experiment.assignmentContextId);
				if (!experiment.behavior) {
					// Control arm: the identifier now flows, but no tour is shown and the
					// scenario is left un-shown so the user stays eligible to see it later.
					continue;
				}
			}

			this._enqueue(scenario);
			if (!scenario.repeatable) {
				claimedSeenKeys.add(seenKey);
			}
		}
	}

	private _isAutoEligible(scenario: IOnboardingScenario): boolean {
		// `command` triggers never run automatically.
		if (scenario.trigger.kind === 'command') {
			return false;
		}

		if (this._pending.has(scenario.id)) {
			return false;
		}

		if (!scenario.repeatable && this._hasBeenShownKey(this._seenKey(scenario), scenario.id)) {
			return false;
		}

		if (scenario.when && !this.contextKeyService.contextMatchesRules(scenario.when)) {
			return false;
		}

		// Experiment-driven scenarios only run once the experiment is active (both treatment
		// flags resolved). The behavior flag does NOT gate eligibility — control still reaches
		// the would-show moment so the gate opens for it too.
		if (scenario.experiment && this._experimentStates.get(scenario.id)?.active !== true) {
			return false;
		}

		if (scenario.trigger.kind === 'observable' && scenario.trigger.signal.get() !== true) {
			return false;
		}

		return true;
	}

	private _enqueue(scenario: IOnboardingScenario): Promise<OnboardingOutcome> {
		if (this._stopped) {
			return Promise.resolve(OnboardingOutcome.Aborted);
		}

		// De-duplicate against both the queue and the in-flight run so a repeated
		// `runScenario(id)` (e.g. a command invoked while the tour is active)
		// joins the existing run instead of scheduling a second one.
		const queued = this._queue.find(entry => entry.scenario.id === scenario.id);
		if (queued) {
			return queued.deferred.p;
		}
		const inflight = this._inflight.get(scenario.id);
		if (inflight) {
			return inflight.p;
		}

		const deferred = new DeferredPromise<OnboardingOutcome>();
		this._pending.add(scenario.id);
		this._queue.push({ scenario, deferred });
		// Highest priority first; stable for equal priorities.
		this._queue.sort((a, b) => (b.scenario.priority ?? 0) - (a.scenario.priority ?? 0));

		this._pump();
		return deferred.p;
	}

	private _pump(): void {
		if (this._pumping) {
			return;
		}
		// Mark as pumping synchronously so a batch of `_enqueue` calls made in the
		// same tick all land (and re-sort by priority) before we consume the queue.
		this._pumping = true;
		this._doPump();
	}

	private async _doPump(): Promise<void> {
		await Promise.resolve(); // let the current synchronous batch of enqueues settle
		try {
			let entry: { scenario: IOnboardingScenario; deferred: DeferredPromise<OnboardingOutcome> } | undefined;
			while (!this._stopped && (entry = this._queue.shift())) {
				const { scenario, deferred } = entry;
				// Track the running scenario so a concurrent `_enqueue` for the same
				// id joins this run instead of scheduling another.
				this._inflight.set(scenario.id, deferred);
				let outcome: OnboardingOutcome;
				try {
					outcome = await this._runPresentation(scenario);
				} catch (error) {
					onUnexpectedError(error);
					outcome = OnboardingOutcome.Aborted;
				} finally {
					this._inflight.delete(scenario.id);
					this._pending.delete(scenario.id);
				}
				deferred.complete(outcome);
			}
		} finally {
			this._pumping = false;
		}
	}

	private async _runPresentation(scenario: IOnboardingScenario): Promise<OnboardingOutcome> {
		const presentation = onboardingPresentationRegistry.get(scenario.presentation.kind);
		if (!presentation) {
			return OnboardingOutcome.Aborted;
		}

		// Mark shown the moment a scenario starts so a crash/reload won't re-trigger it.
		this._markShown(this._seenKey(scenario));

		const abort = new Emitter<void>();
		this._activeAbort = abort;
		const startTime = Date.now();
		try {
			const result = await presentation.run(scenario, { targetWindow: mainWindow, onAbort: abort.event });
			this._recordOutcome(this._seenKey(scenario), result.outcome);
			// Only emit outcome telemetry when a tour was genuinely displayed; a degenerate
			// run that rendered nothing (no steps / all steps skipped) must not pollute metrics.
			if (result.shown) {
				this._reportOutcome(scenario, result, Date.now() - startTime);
			}
			return result.outcome;
		} finally {
			this._activeAbort = undefined;
			abort.dispose();
		}
	}

	/** Emit per-tour telemetry. Only called when a tour was actually shown. */
	private _reportOutcome(scenario: IOnboardingScenario, result: IOnboardingRunResult, durationMs: number): void {
		const experimentActive = !!scenario.experiment && this._experimentStates.get(scenario.id)?.active === true;

		type OnboardingScenarioOutcomeEvent = {
			scenarioId: string;
			outcome: string;
			dismissReason: string;
			lastStepIndex: number;
			stepCount: number;
			durationMs: number;
			experimentActive: boolean;
		};
		type OnboardingScenarioOutcomeClassification = {
			owner: 'benibenj';
			comment: 'Reports how a user progressed through an onboarding tour to evaluate onboarding effectiveness.';
			scenarioId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the onboarding scenario that ran.' };
			outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the tour ended: completed, skipped, dismissed or aborted.' };
			dismissReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The concrete action that ended the tour, e.g. skipButton, escapeKey, targetClick, completed or aborted.' };
			lastStepIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The furthest 0-based step index the user reached.' };
			stepCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of steps in the tour.' };
			durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long the tour was on screen, in milliseconds.' };
			experimentActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether an active experiment drove this run.' };
		};
		this.telemetryService.publicLog2<OnboardingScenarioOutcomeEvent, OnboardingScenarioOutcomeClassification>('onboarding.scenarioOutcome', {
			scenarioId: scenario.id,
			outcome: result.outcome,
			dismissReason: result.dismissReason,
			lastStepIndex: result.lastStepIndex,
			stepCount: result.stepCount,
			durationMs,
			experimentActive
		});
	}

	//#endregion

	//#region Triggers & experiments

	private _registerTriggerListeners(): void {
		this._triggerListeners.clear();
		for (const scenario of onboardingScenarioRegistry.getScenarios()) {
			if (scenario.trigger.kind === 'observable') {
				const signal = scenario.trigger.signal;
				this._triggerListeners.add(autorun(reader => {
					signal.read(reader);
					this._evaluate();
				}));
			}
		}
	}

	/**
	 * Resolve the two experiment treatment flags for each scenario that declares an experiment.
	 * The experiment is only active when both resolve: the boolean to a boolean and the id to a
	 * non-empty string that starts with {@link ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}. Resolved
	 * once per scenario; re-evaluation is triggered when an experiment becomes active.
	 */
	private _resolveExperiments(): void {
		for (const scenario of onboardingScenarioRegistry.getScenarios()) {
			const experiment = scenario.experiment;
			if (!experiment || this._experimentStates.has(scenario.id)) {
				continue;
			}
			// Seed an inactive state so the scenario is not eligible until both flags resolve.
			this._experimentStates.set(scenario.id, { active: false, behavior: false, assignmentContextId: '' });
			Promise.all([
				this.assignmentService.getTreatment<boolean>(experiment.behaviorFlag),
				this.assignmentService.getTreatment<string>(experiment.assignmentContextIdFlag)
			]).then(([behavior, assignmentContextId]) => {
				const hasBehavior = typeof behavior === 'boolean';
				const hasId = typeof assignmentContextId === 'string' && assignmentContextId.length > 0;

				// Defensively require the reserved prefix. The eager telemetry gate only blocks
				// ids that start with it, so an id missing the prefix would never be gated and
				// would leak into telemetry from the very first event — silently corrupting the
				// scorecard baseline. Catch the misconfiguration loudly and treat the experiment
				// as inactive rather than running it with an ungated id.
				const hasValidId = hasId && assignmentContextId!.startsWith(ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX);
				if (hasId && !hasValidId) {
					onUnexpectedError(new Error(`Onboarding experiment for scenario '${scenario.id}' resolved an assignment-context id '${assignmentContextId}' that does not start with the required '${ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}' prefix; treating the experiment as inactive.`));
				}

				const active = hasBehavior && hasValidId;
				this._experimentStates.set(scenario.id, {
					active,
					behavior: behavior === true,
					assignmentContextId: active ? assignmentContextId! : ''
				});
				if (active) {
					this._evaluate();
				}
			}, error => onUnexpectedError(error));
		}
	}

	//#endregion

	//#region Telemetry gate

	private _loadOpenedIds(): Set<string> {
		const raw = this.storageService.get(OnboardingScenarioService.OPENED_IDS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return new Set<string>();
		}
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? new Set<string>(parsed.filter((id): id is string => typeof id === 'string')) : new Set<string>();
		} catch (error) {
			onUnexpectedError(error);
			return new Set<string>();
		}
	}

	/**
	 * Open the telemetry gate for an assignment-context id: from now on (and after reload) the
	 * id is no longer filtered out, so every event carries it. Idempotent.
	 */
	private _openGate(assignmentContextId: string): void {
		if (!assignmentContextId || this._openedAssignmentContextIds.has(assignmentContextId)) {
			return;
		}
		this._openedAssignmentContextIds.add(assignmentContextId);
		this.storageService.store(
			OnboardingScenarioService.OPENED_IDS_STORAGE_KEY,
			JSON.stringify(Array.from(this._openedAssignmentContextIds)),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
		// Recompute the filtered assignment context so the id starts flowing immediately.
		this._onDidChangeOpenedIds.fire();
	}

	//#endregion

	//#region Persistence

	/**
	 * The key under which a scenario's once-per-user "shown" state is stored.
	 * Scenarios may opt into a shared {@link IOnboardingScenario.seenKey} so that
	 * variations of the same onboarding are gated together; otherwise the
	 * scenario id is used.
	 */
	private _seenKey(scenario: IOnboardingScenario): string {
		return scenario.seenKey ?? scenario.id;
	}

	private _hasBeenShownKey(key: string, scenarioId: string): boolean {
		if (this._isDeveloperMode(scenarioId)) {
			return this._shownSinceStart.has(key);
		}
		return !!this._state[key]?.shownAt;
	}

	private _markShown(id: string): void {
		this._shownSinceStart.add(id);
		const previous = this._state[id];
		const next: IScenarioState = {
			shownAt: Date.now(),
			outcome: previous?.outcome,
			seenCount: (previous?.seenCount ?? 0) + 1
		};
		this._state[id] = next;
		this._memento.saveMemento();
	}

	private _recordOutcome(id: string, outcome: OnboardingOutcome): void {
		const state = this._state[id];
		if (state) {
			state.outcome = outcome;
			this._memento.saveMemento();
		}
	}

	//#endregion
}
