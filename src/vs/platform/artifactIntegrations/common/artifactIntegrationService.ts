/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { Disposable, DisposableMap, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignal, observableValue, observableValueOpts, waitForState } from '../../../base/common/observable.js';
import { CancellationError } from '../../../base/common/errors.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ArtifactAutomationConfiguration, ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactContributionView, ArtifactRecord, ArtifactSnapshot, IArtifactDetailsModel, IArtifactIntegrationAccess, IArtifactModel, artifactOptionDisabledValue, isArtifactOptionEnabled, isArtifactRunSettled } from './artifactIntegration.js';
import { isArtifactDetails, isArtifactSnapshot } from './artifactIntegrationProtocol.js';
import { ArtifactExecutionService, IArtifactExecutionBinding } from './artifactExecutionService.js';
import { ArtifactIntegrationRegistry, IRegisteredArtifactIntegration } from './artifactIntegrationRegistry.js';
import { ArtifactConfigurationConflictError, ArtifactIntegrationStore, artifactBindingId, artifactOptionConsent, emptyArtifactConfiguration, isArtifactJsonValue } from './artifactIntegrationStore.js';
import { ArtifactSessionState, IArtifactIntegrationStorage, IArtifactRuntime } from './artifactRuntime.js';

function unavailableView(reason: string): ArtifactContributionView {
	return { availability: { kind: 'unavailable', reason }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] };
}

interface IModelEntry {
	readonly session: string;
	readonly artifactId: string;
	readonly promise: Promise<ArtifactModel>;
	references: number;
}

export class ArtifactIntegrationService extends Disposable implements IArtifactIntegrationAccess {
	readonly ledger: ArtifactIntegrationStore;
	private readonly executor: ArtifactExecutionService;
	private readonly models = new Map<string, IModelEntry>();
	private readonly lifetimeToken = this._register(new CancellationTokenSource());
	private initialization: Promise<void> | undefined;

	constructor(
		readonly runtime: IArtifactRuntime,
		storage: IArtifactIntegrationStorage,
		readonly registry: ArtifactIntegrationRegistry,
		private readonly logService: ILogService,
	) {
		super();
		this.ledger = new ArtifactIntegrationStore(runtime.authority.id, storage, () => !this._store.isDisposed && runtime.isOwner());
		this.executor = this._register(new ArtifactExecutionService(this.ledger, runtime, logService));
		this._register(autorun(reader => {
			this.ledger.state.read(reader);
			for (const [key, entry] of this.models) {
				this.releaseUnused(key, entry);
			}
		}));
	}

	initialize(): Promise<void> {
		return this.initialization ??= this.restore();
	}

	private async restore(): Promise<void> {
		await this.ledger.initialize();
		const retained = new Map(this.ledger.state.get().bindings.filter(binding => this.retains(binding.session, binding.artifact.id)).map(binding => [JSON.stringify([binding.session, binding.artifact.id]), binding]));
		for (const binding of retained.values()) {
			try {
				const reference = await this.acquire(binding.session, binding.artifact.id);
				reference.dispose();
			} catch (error) {
				this.logService.error('[ArtifactIntegrations] Could not restore artifact automation', error);
			}
		}
	}

	async acquireArtifact(session: string, artifactId: string): Promise<IReference<IArtifactModel>> {
		await this.initialize();
		return this.acquire(session, artifactId);
	}

	private async acquire(session: string, artifactId: string): Promise<IReference<IArtifactModel>> {
		if (this._store.isDisposed) {
			throw new Error('Artifact integration runtime is disposed');
		}
		const key = JSON.stringify([session, artifactId]);
		let entry = this.models.get(key);
		if (!entry) {
			const promise = this.createModel(session, artifactId);
			entry = { session, artifactId, promise, references: 0 };
			this.models.set(key, entry);
		}
		entry.references++;
		const current = entry;
		const release = toDisposable(() => {
			current.references--;
			this.releaseUnused(key, current);
		});
		try {
			const model = await current.promise;
			const hold = async <T>(operation: () => Promise<T>): Promise<T> => {
				current.references++;
				try {
					return await operation();
				} finally {
					current.references--;
					this.releaseUnused(key, current);
				}
			};
			return {
				object: {
					snapshot: model.snapshot,
					configure: (integrationId, revision, values) => hold(() => model.configure(integrationId, revision, values)),
					invoke: (integrationId, actionId, chat, requestId) => hold(() => model.invoke(integrationId, actionId, chat, requestId)),
					cancel: runId => hold(() => model.cancel(runId)),
					reconcile: runId => hold(() => model.reconcile(runId)),
					getRuns: (before, limit) => hold(() => model.getRuns(before, limit)),
					acquireDetails: async (integrationId, detailsId) => {
						const reference = await this.acquire(session, artifactId);
						try {
							const details = await model.acquireDetails(integrationId, detailsId);
							const lease = toDisposable(() => { details.dispose(); reference.dispose(); });
							return { details: details.details, loadMore: details.loadMore ? token => details.loadMore!(token) : undefined, dispose: () => lease.dispose() };
						} catch (error) {
							reference.dispose();
							throw error;
						}
					},
				},
				dispose: () => release.dispose(),
			};
		} catch (error) {
			release.dispose();
			if (this.models.get(key) === current) {
				this.models.delete(key);
			}
			throw error;
		}
	}

	private async createModel(session: string, artifactId: string): Promise<ArtifactModel> {
		const reference = await this.runtime.acquireSession(session);
		let sessionState: ArtifactSessionState;
		try {
			sessionState = await waitForState(reference.object, value => value.availability.kind !== 'loading', undefined, this.lifetimeToken.token);
		} catch (error) {
			reference.dispose();
			throw error;
		}
		const stored = this.ledger.state.get().bindings.find(binding => binding.session === session && binding.artifact.id === artifactId)?.artifact;
		const current = sessionState.artifacts.find(artifact => artifact.id === artifactId);
		const artifact = current
			? stored?.resource === current.resource ? { ...current, origin: stored.origin } : current
			: sessionState.availability.kind !== 'available' ? stored : undefined;
		if (!artifact) {
			reference.dispose();
			throw new Error(localize('artifactNotFound', "The recorded artifact could not be found."));
		}
		const model = new ArtifactModel(session, artifact, reference, this.runtime, this.registry, this.ledger, this.executor, this.logService);
		try {
			await model.initialize();
			return model;
		} catch (error) {
			model.dispose();
			throw error;
		}
	}

	private retains(session: string, artifactId: string): boolean {
		const state = this.ledger.state.get();
		return state.bindings.some(binding => binding.session === session && binding.artifact.id === artifactId
			&& (binding.options.some(option => isArtifactOptionEnabled(option, binding.configuration.values[option.id]))
				|| state.runs.some(run => run.bindingId === binding.id && (!isArtifactRunSettled(run) || run.indeterminate))));
	}

	private releaseUnused(key: string, entry: IModelEntry): void {
		if (entry.references === 0 && !this.retains(entry.session, entry.artifactId) && this.models.get(key) === entry) {
			this.models.delete(key);
			void entry.promise.then(model => model.dispose(), () => { /* Acquisition reports the initialization failure. */ });
		}
	}

	override dispose(): void {
		this.lifetimeToken.cancel();
		super.dispose();
		for (const entry of this.models.values()) {
			void entry.promise.then(model => model.dispose(), error => this.logService.error('[ArtifactIntegrations] Artifact disposal failed', error));
		}
		this.models.clear();
	}

	async whenIdle(): Promise<void> {
		await this.executor.whenIdle();
		await this.ledger.whenIdle();
	}
}

class ArtifactModel extends Disposable implements IArtifactModel {
	private readonly bindings = this._register(new DisposableMap<string, ArtifactBinding>());
	private readonly contributions = observableValue<readonly ArtifactContributionSnapshot[]>(this, []);
	private readonly bindingsChanged = observableSignal(this);
	private readonly refreshSequencer = new Sequencer();
	private readonly lifetimeToken = this._register(new CancellationTokenSource());
	readonly snapshot: IObservable<ArtifactSnapshot>;

	constructor(
		private readonly session: string,
		private readonly artifact: ArtifactRecord,
		private readonly sessionReference: IReference<IObservable<ArtifactSessionState>>,
		private readonly runtime: IArtifactRuntime,
		private readonly registry: ArtifactIntegrationRegistry,
		private readonly ledger: ArtifactIntegrationStore,
		private readonly executor: ArtifactExecutionService,
		private readonly logService: ILogService,
	) {
		super();
		this._register(sessionReference);
		this.snapshot = derived(this, reader => {
			const contributions = this.contributions.read(reader);
			const state = this.ledger.state.read(reader);
			const ids = new Set(state.bindings.filter(binding => binding.session === session && binding.artifact.id === artifact.id).map(binding => binding.id));
			return {
				authority: runtime.authority, session, artifact, contributions,
				mainIntegrationId: contributions.find(contribution => contribution.view.main)?.integrationId,
				runs: state.runs.filter(run => ids.has(run.bindingId)).slice(-50),
			};
		});
	}

	async initialize(): Promise<void> {
		await this.refresh();
		let initial = true;
		this._register(autorun(reader => {
			const registrations = this.registry.integrations.read(reader);
			if (!initial) {
				for (const [id, binding] of this.bindings) {
					if (!registrations.includes(binding.registration)) {
						this.bindings.deleteAndDispose(id);
					}
				}
				this.bindingsChanged.trigger(undefined);
				void this.refresh().catch(error => this.logService.error('[ArtifactIntegrations] Could not refresh integrations', error));
			}
			initial = false;
		}));
		this._register(autorun(reader => {
			this.bindingsChanged.read(reader);
			const state = this.ledger.state.read(reader);
			const registrations = this.registry.integrations.read(reader);
			const contributions: ArtifactContributionSnapshot[] = [];
			for (const registration of registrations) {
				const binding = this.bindings.get(registration.id);
				if (binding) {
					contributions.push(binding.snapshot.read(reader));
				}
			}
			for (const stored of state.bindings.filter(binding => binding.session === this.session && binding.artifact.id === this.artifact.id)) {
				if (!contributions.some(contribution => contribution.integrationId === stored.integrationId)) {
					contributions.push({
						integrationId: stored.integrationId, label: stored.integrationId, options: stored.options, configuration: stored.configuration, actions: [],
						view: unavailableView(localize('artifactProviderUnavailable', "This artifact integration is not currently available. You can still turn off its automations.")),
					});
				}
			}
			this.contributions.set(contributions, undefined);
		}));
	}

	private refresh(): Promise<void> {
		return this.refreshSequencer.queue(async () => {
			const registrations = this.registry.integrations.get();
			for (const [id, binding] of this.bindings) {
				if (!registrations.includes(binding.registration)) {
					this.bindings.deleteAndDispose(id);
				}
			}
			for (const registration of registrations) {
				if (this._store.isDisposed || this.bindings.has(registration.id)) {
					continue;
				}
				const binding = new ArtifactBinding(registration, this.session, this.artifact, this.sessionReference.object, this.runtime, this.ledger, this.executor, this.logService);
				try {
					if (await binding.initialize(this.lifetimeToken.token) && this.registry.integrations.get().includes(registration)) {
						this.bindings.set(registration.id, binding);
					} else {
						binding.dispose();
					}
				} catch (error) {
					if (this._store.isDisposed) {
						binding.dispose();
						throw error;
					}
					binding.setError(error);
					this.bindings.set(registration.id, binding);
					this.logService.error('[ArtifactIntegrations] Integration binding failed', error);
				}
			}
			this.bindingsChanged.trigger(undefined);
		});
	}

	async configure(integrationId: string, expectedRevision: number, values: Readonly<Record<string, boolean | string>>): Promise<void> {
		const id = artifactBindingId(this.runtime.authority.id, this.session, this.artifact.id, integrationId);
		const binding = this.bindings.get(integrationId);
		await this.ledger.transact(state => {
			const stored = state.bindings.find(binding => binding.id === id);
			if (!stored || stored.configuration.revision !== expectedRevision) {
				throw new ArtifactConfigurationConflictError();
			}
			const configuration = stored.configuration;
			const nextValues = { ...configuration.values };
			const generations = { ...configuration.generations };
			const disablements = { ...configuration.disablements };
			const consent = { ...stored.consent };
			for (const [optionId, value] of Object.entries(values)) {
				const option = binding?.registration.options.find(option => option.id === optionId) ?? stored.options.find(option => option.id === optionId);
				if (!option || (option.kind === 'boolean' ? typeof value !== 'boolean' : !option.choices.some(choice => choice.value === value))) {
					throw new Error(localize('artifactInvalidOption', "Invalid artifact automation selection: {0}", optionId));
				}
				const enabled = isArtifactOptionEnabled(option, value);
				if (enabled && (!binding?.canEnable(optionId) || !this.runtime.available.get())) {
					throw new Error(localize('artifactCannotEnable', "This artifact automation is unavailable and cannot be enabled."));
				}
				const signature = binding?.getConsent(option) ?? stored.consent[optionId];
				if (enabled && (value !== configuration.values[optionId] || stored.consent[optionId] !== signature)) {
					generations[optionId] = (generations[optionId] ?? 0) + 1;
				}
				nextValues[optionId] = value;
				if (signature) {
					consent[optionId] = signature;
				}
				delete disablements[optionId];
			}
			const options = binding ? [...binding.registration.options, ...stored.options.filter(option => !binding.registration.options.some(current => current.id === option.id))] : stored.options;
			const next = { ...stored, options, consent, configuration: { revision: configuration.revision + 1, values: nextValues, generations, disablements } };
			state.bindings = state.bindings.map(binding => binding.id === id ? next : binding);
		});
		await this.executor.revokeDisabled(id);
		this.executor.wake();
	}

	invoke(integrationId: string, actionId: string, chat: string, requestId: string) {
		return this.executor.invoke(artifactBindingId(this.runtime.authority.id, this.session, this.artifact.id, integrationId), actionId, chat, requestId);
	}

	async cancel(runId: string): Promise<void> {
		const run = this.runs().find(run => run.id === runId);
		if (!run) {
			throw new Error('Artifact run not found');
		}
		await this.executor.cancel(run.bindingId, runId);
	}

	async reconcile(runId: string): Promise<void> {
		const run = this.runs().find(run => run.id === runId);
		if (!run) {
			throw new Error('Artifact run not found');
		}
		await this.executor.reconcile(run.bindingId, runId);
	}

	private runs() {
		const state = this.ledger.state.get();
		const bindings = new Set(state.bindings.filter(binding => binding.session === this.session && binding.artifact.id === this.artifact.id).map(binding => binding.id));
		return state.runs.filter(run => bindings.has(run.bindingId));
	}

	async getRuns(before?: string, limit = 50) {
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
			throw new Error('Invalid artifact history page size');
		}
		const runs = this.runs().reverse();
		const index = before === undefined ? -1 : runs.findIndex(run => run.id === before);
		if (before !== undefined && index < 0) {
			throw new Error('Invalid artifact history cursor');
		}
		const page = runs.slice(index + 1, index + 1 + limit);
		return { runs: page, next: index + 1 + page.length < runs.length ? page.at(-1)?.id : undefined };
	}

	async acquireDetails(integrationId: string, detailsId: string): Promise<IArtifactDetailsModel> {
		const binding = this.bindings.get(integrationId);
		if (!binding) {
			throw new Error(localize('artifactDetailsUnavailable', "The artifact details are unavailable."));
		}
		return binding.acquireDetails(detailsId);
	}

	override dispose(): void {
		this.lifetimeToken.cancel();
		super.dispose();
	}
}

class ArtifactBinding extends Disposable {
	private readonly automation = this._register(new MutableDisposable());
	private readonly execution = this._register(new MutableDisposable());
	private readonly configuration = observableValue<ArtifactAutomationConfiguration>(this, emptyArtifactConfiguration([]));
	private readonly view = observableValueOpts<ArtifactContributionView>({ owner: this, equalsFn: structuralEquals }, unavailableView(localize('artifactLoading', "Loading artifact integration.")));
	private readonly provider = this._register(new MutableDisposable<IReference<{ readonly binding: IArtifactExecutionBinding['provider']; readonly match: { readonly credentialScope: string } }>>());
	private readonly details = new Map<string, { readonly model: IArtifactDetailsModel; references: number }>();
	readonly snapshot: IObservable<ArtifactContributionSnapshot>;
	private readonly id: string;

	constructor(
		readonly registration: IRegisteredArtifactIntegration,
		private readonly session: string,
		private readonly artifact: ArtifactRecord,
		private readonly sessionState: IObservable<ArtifactSessionState>,
		private readonly runtime: IArtifactRuntime,
		private readonly ledger: ArtifactIntegrationStore,
		private readonly executor: ArtifactExecutionService,
		private readonly logService: ILogService,
	) {
		super();
		this.configuration.set(emptyArtifactConfiguration(registration.options), undefined);
		this.id = artifactBindingId(runtime.authority.id, session, artifact.id, registration.id);
		this.snapshot = derived(this, reader => {
			const stored = this.ledger.state.read(reader).bindings.find(binding => binding.id === this.id);
			return {
				integrationId: registration.id, label: registration.label,
				options: [...registration.options, ...stored?.options.filter(option => !registration.options.some(current => current.id === option.id)) ?? []],
				configuration: stored?.configuration ?? this.configuration.read(reader), view: this.view.read(reader),
				actions: this.provider.value?.object.binding.actions.map(action => ({ id: action.id, label: action.label, iconId: action.iconId, kind: action.kind, consentVersion: action.consentVersion })) ?? [],
			};
		});
	}

	async initialize(token: CancellationToken): Promise<boolean> {
		let stored = this.ledger.state.get().bindings.find(binding => binding.id === this.id);
		this.configuration.set(stored?.configuration ?? emptyArtifactConfiguration(this.registration.options), undefined);
		const reference = await this.registration.create({
			session: this.session, artifact: this.artifact, configuration: this.configuration,
			state: {
				read: () => this.ledger.state.get().bindings.find(binding => binding.id === this.id)?.checkpoint ?? { revision: 0 },
				write: (expectedRevision, value) => this.ledger.transact(state => {
					if (!isArtifactJsonValue(value)) {
						throw new Error('Artifact checkpoint must contain JSON data');
					}
					const binding = state.bindings.find(binding => binding.id === this.id);
					if (!binding || binding.checkpoint.revision !== expectedRevision) {
						throw new ArtifactConfigurationConflictError();
					}
					state.bindings = state.bindings.map(candidate => candidate.id === this.id ? { ...binding, checkpoint: { revision: expectedRevision + 1, value } } : candidate);
				}),
			},
		}, { authority: this.runtime.authority, runtimeId: this.registration.runtimeId }, token);
		if (!reference) {
			return false;
		}
		this.provider.value = reference;
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const { binding, match } = reference.object;
		if (new Set(binding.actions.map(action => action.id)).size !== binding.actions.length
			|| this.registration.options.some(option => option.actionIds.some(id => !binding.actions.some(action => action.id === id)))) {
			throw new Error('Artifact action descriptors are missing or duplicated');
		}
		if (stored && (stored.runtimeId !== this.registration.runtimeId || stored.credentialScope !== match.credentialScope || stored.resourceKey !== match.key)) {
			throw new Error(localize('artifactIdentityChanged', "The integration runtime, account, or resource identity changed. The previous binding remains paused."));
		}
		if (!stored) {
			stored = {
				id: this.id, session: this.session, artifact: this.artifact, integrationId: this.registration.id, runtimeId: this.registration.runtimeId,
				credentialScope: match.credentialScope, resourceKey: match.key, options: this.registration.options, consent: {}, configuration: this.configuration.get(), checkpoint: { revision: 0 },
			};
			const initial = stored;
			await this.ledger.transact(state => { state.bindings.push(initial); });
		} else {
			const options = [...this.registration.options, ...stored.options.filter(option => !this.registration.options.some(current => current.id === option.id))];
			const values = { ...stored.configuration.values };
			const generations = { ...stored.configuration.generations };
			const disablements = { ...stored.configuration.disablements };
			for (const option of options) {
				const current = this.registration.options.find(current => current.id === option.id);
				const previous = stored.options.find(previous => previous.id === option.id);
				const wasEnabled = previous && isArtifactOptionEnabled(previous, values[option.id]);
				const sameConsent = current && stored.consent[option.id] === artifactOptionConsent(current, binding.actions);
				const validValue = option.kind === 'boolean' ? typeof values[option.id] === 'boolean' : option.choices.some(choice => choice.value === values[option.id]);
				if (!previous || !current || !sameConsent || !validValue) {
					values[option.id] = artifactOptionDisabledValue(option);
					generations[option.id] ??= 0;
					if (wasEnabled) {
						disablements[option.id] = {
							reason: localize('artifactConsentChanged', "This automation was turned off because its definition or permitted actions changed. Review it before enabling it again."),
							attempts: 0,
						};
					}
				}
			}
			if (!structuralEquals(options, stored.options) || !structuralEquals(values, stored.configuration.values)) {
				const previous = stored;
				await this.ledger.transact(state => {
					const latest = state.bindings.find(candidate => candidate.id === this.id);
					if (latest?.configuration.revision !== previous.configuration.revision) {
						throw new ArtifactConfigurationConflictError();
					}
					state.bindings = state.bindings.map(candidate => candidate.id === this.id
						? { ...candidate, options, configuration: { revision: candidate.configuration.revision + 1, values, generations, disablements } } : candidate);
				});
			}
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this.execution.value = this.executor.registerBinding({
			id: this.id, session: this.session, artifact: this.artifact, integrationId: this.registration.id, options: this.registration.options,
			credentialScope: match.credentialScope, resourceKey: match.key, sessionState: this.sessionState, provider: binding, presentation: this.view,
			isCurrent: () => this.registration.isActive() && !this._store.isDisposed,
		});
		await this.executor.recover(this.id);
		this._register(autorun(reader => {
			const next = this.ledger.state.read(reader).bindings.find(binding => binding.id === this.id);
			if (next && next.configuration.revision !== this.configuration.get().revision) {
				this.configuration.set(next.configuration, undefined);
			}
			const view = binding.view.read(reader);
			const session = this.sessionState.read(reader);
			const available = this.runtime.available.read(reader);
			try {
				const actions = [...view.stateActions, ...view.generalActions];
				const candidate = { authority: this.runtime.authority, session: this.session, artifact: this.artifact, contributions: [{ ...this.snapshot.get(), view }], runs: [] };
				if (!isArtifactSnapshot(candidate) || new Set(actions.map(action => action.id)).size !== actions.length
					|| actions.some(action => !binding.actions.some(registered => registered.id === action.id))
					|| new Set(view.sections.map(section => section.id)).size !== view.sections.length
					|| view.automationAvailability.some(option => !this.registration.options.some(registered => registered.id === option.id))) {
					throw new Error('Artifact presentation contains invalid references');
				}
				const reason = !available ? localize('artifactCoordinatorPaused', "The artifact coordinator is unavailable. Automation is paused.")
					: session.availability.kind !== 'available' ? localize('artifactSessionUnavailable', "The artifact's session is unavailable.")
						: !session.artifacts.some(artifact => artifact.id === this.artifact.id && artifact.resource === this.artifact.resource) ? localize('artifactRecordRemoved', "The artifact is no longer recorded in this session.") : undefined;
				this.view.set(reason ? {
					...view, availability: { kind: 'unavailable', reason },
					stateActions: view.stateActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
					generalActions: view.generalActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
					automationAvailability: view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: reason })),
				} : session.archived ? {
					...view,
					automationAvailability: view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: localize('artifactArchived', "Artifact automation is paused while the session is archived.") })),
				} : view, undefined);
			} catch (error) {
				this.view.set({ ...this.view.get(), availability: { kind: 'error', reason: toErrorMessage(error) } }, undefined);
				this.logService.error('[ArtifactIntegrations] Invalid artifact presentation', error);
			}
			const enabled = next && available && this.view.get().availability.kind === 'available' && session.availability.kind === 'available' && !session.archived && session.artifacts.some(artifact => artifact.id === this.artifact.id)
				&& this.registration.options.some(option => isArtifactOptionEnabled(option, next.configuration.values[option.id]) && next.consent[option.id] === this.getConsent(option));
			if (enabled && !this.automation.value) {
				this.automation.value = binding.activateAutomation({
					runAutomation: request => this.executor.runAutomation(this.id, request),
					reconcileRun: runId => this.executor.reconcile(this.id, runId),
					runs: derived(this, reader => this.ledger.state.read(reader).runs.filter(run => run.bindingId === this.id)),
				});
			} else if (!enabled) {
				this.automation.clear();
			}
		}));
		return true;
	}

	canEnable(optionId: string): boolean {
		return !!this.provider.value && this.view.get().availability.kind === 'available' && this.view.get().automationAvailability.some(option => option.id === optionId && option.available);
	}

	getConsent(option: ArtifactAutomationOption): string | undefined {
		return this.provider.value ? artifactOptionConsent(option, this.provider.value.object.binding.actions) : undefined;
	}

	acquireDetails(detailsId: string): IArtifactDetailsModel {
		const view = this.view.get();
		if (!this.provider.value || (view.main?.detailsId !== detailsId && !view.sections.some(section => section.detailsId === detailsId))) {
			throw new Error('Artifact details are not exposed by this binding');
		}
		let entry = this.details.get(detailsId);
		if (!entry) {
			entry = { model: this.provider.value.object.binding.acquireDetails(detailsId), references: 0 };
			this.details.set(detailsId, entry);
		}
		entry.references++;
		const current = entry;
		const lease = toDisposable(() => {
			if (--current.references === 0 && this.details.get(detailsId) === current) {
				this.details.delete(detailsId);
				current.model.dispose();
			}
		});
		let reportedError: string | undefined;
		return {
			details: derived(this, reader => {
				const details = current.model.details.read(reader);
				const provider = this.provider.value?.object.binding;
				const view = this.view.read(reader);
				if (!isArtifactDetails(details) || !provider || (view.main?.detailsId !== detailsId && !view.sections.some(section => section.detailsId === detailsId))
					|| details.links.some(link => link.kind === 'action' ? !provider.actions.some(action => action.id === link.actionId) : !this.registration.options.some(option => option.id === link.optionId))) {
					const reason = localize('artifactInvalidDetails', "The integration supplied invalid or stale artifact details.");
					if (reportedError !== reason) {
						this.logService.error('[ArtifactIntegrations]', reason);
						reportedError = reason;
					}
					return { title: this.artifact.label, availability: { kind: 'error' as const, reason }, links: [], items: [], completeness: 'complete' as const };
				}
				reportedError = undefined;
				return details;
			}),
			loadMore: current.model.loadMore ? token => current.model.loadMore!(token) : undefined,
			dispose: () => lease.dispose(),
		};
	}

	setError(error: unknown): void {
		this.automation.clear();
		this.execution.clear();
		this.provider.clear();
		this.view.set({ ...this.view.get(), availability: { kind: 'error', reason: toErrorMessage(error) } }, undefined);
	}

	override dispose(): void {
		for (const entry of this.details.values()) {
			entry.model.dispose();
		}
		this.details.clear();
		super.dispose();
	}
}
