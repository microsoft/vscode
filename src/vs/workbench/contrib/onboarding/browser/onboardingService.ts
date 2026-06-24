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
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { Memento } from '../../../common/memento.js';
import { onboardingPresentationRegistry } from '../common/onboardingPresentation.js';
import { onboardingScenarioRegistry } from '../common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingOutcome } from '../common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from '../common/onboardingScenarioService.js';

/** Persisted "shown" state for a single scenario. */
interface IScenarioState {
	readonly shownAt: number;
	outcome?: OnboardingOutcome;
	seenCount: number;
}

type OnboardingMementoData = { [scenarioId: string]: IScenarioState };

export class OnboardingScenarioService extends Disposable implements IOnboardingScenarioService {

	declare readonly _serviceBrand: undefined;

	private static readonly MEMENTO_ID = 'onboarding';

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

	/** Cached experiment treatment results for scenarios that declare one. */
	private readonly _experimentResults = new Map<string, boolean>();

	private _started = false;
	private _stopped = false;
	private readonly _shownSinceStart = new Set<string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
	) {
		super();

		this._memento = new Memento(OnboardingScenarioService.MEMENTO_ID, this.storageService);
		this._state = this._memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);

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
			this._fetchExperiments();
			this._evaluate();
		}));

		this._register(this.contextKeyService.onDidChangeContext(() => this._evaluate()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ONBOARDING_ENABLED_CONFIG) || e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)) {
				this._evaluate();
			}
		}));

		this._registerTriggerListeners();
		this._fetchExperiments();
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
		if (this._developerMode) {
			return this._shownSinceStart.has(id);
		}
		return !!this._state[id]?.shownAt;
	}

	reset(id: string): void {
		delete this._state[id];
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

	private get _developerMode(): boolean {
		return this.configurationService.getValue<boolean>(ONBOARDING_DEVELOPER_MODE_CONFIG) === true;
	}

	/**
	 * Re-evaluate every scenario and enqueue any that are eligible to run
	 * automatically. Idempotent: already shown / queued scenarios are skipped.
	 */
	private _evaluate(): void {
		if (!this._enabled || this._stopped) {
			return;
		}

		const eligible = onboardingScenarioRegistry.getScenarios()
			.filter(scenario => this._isAutoEligible(scenario));

		for (const scenario of eligible) {
			this._enqueue(scenario);
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

		if (!scenario.repeatable && this.hasBeenShown(scenario.id)) {
			return false;
		}

		if (scenario.when && !this.contextKeyService.contextMatchesRules(scenario.when)) {
			return false;
		}

		if (scenario.experiment && this._experimentResults.get(scenario.experiment) !== true) {
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
		this._markShown(scenario.id);

		const abort = new Emitter<void>();
		this._activeAbort = abort;
		try {
			const outcome = await presentation.run(scenario, { targetWindow: mainWindow, onAbort: abort.event });
			this._recordOutcome(scenario.id, outcome);
			return outcome;
		} finally {
			this._activeAbort = undefined;
			abort.dispose();
		}
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

	private _fetchExperiments(): void {
		for (const scenario of onboardingScenarioRegistry.getScenarios()) {
			const id = scenario.experiment;
			if (!id || this._experimentResults.has(id)) {
				continue;
			}
			this._experimentResults.set(id, false);
			this.assignmentService.getTreatment<boolean>(id).then(value => {
				if (value === true) {
					this._experimentResults.set(id, true);
					this._evaluate();
				}
			}, error => onUnexpectedError(error));
		}
	}

	//#endregion

	//#region Persistence

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
