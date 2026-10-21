/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer, SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { Disposable, DisposableMap, DisposableStore, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableSignal, observableValue, observableValueOpts, waitForState } from '../../../base/common/observable.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ArtifactActor, ArtifactAuthenticationRequest, ArtifactAuthenticationRequiredError, ArtifactAutomationConfiguration, ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactContributionView, ArtifactRecord, ArtifactSnapshot, IArtifactDetailsModel, IArtifactIntegrationAccess, IArtifactModel, artifactBindingId, isArtifactOptionEnabled, isArtifactRunSettled } from './artifactIntegration.js';
import { applyArtifactAutomationSelection, artifactOptionConsent, disableArtifactAutomation, emptyArtifactConfiguration, reconcileArtifactAutomationOptions, validateArtifactAutomationSelection } from './artifactAutomationConfiguration.js';
import { isArtifactActionDescriptor, isArtifactAuthenticationRequest, isArtifactJsonValue } from './artifactIntegrationValidation.js';
import { hasValidArtifactPresentationReferences, isArtifactContributionView, isArtifactDetails } from './artifactPresentationValidation.js';
import { ArtifactExecutionService, IArtifactExecutionBinding } from './artifactExecutionService.js';
import { getArtifactAutomationNotices } from './artifactIntegrationNotices.js';
import { IArtifactIntegrationRegistry, IRegisteredArtifactIntegration } from './artifactIntegrationRegistry.js';
import { ArtifactConfigurationConflictError, ArtifactIntegrationState, ArtifactIntegrationStore, ArtifactStoredBinding } from './artifactIntegrationStore.js';
import { ArtifactAutomationNotice, ArtifactSessionState, IArtifactIntegrationStorage, IArtifactRuntime, isArtifactRuntimeAvailable } from './artifactRuntime.js';

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
		readonly registry: IArtifactIntegrationRegistry,
		private readonly logService: ILogService,
	) {
		super();
		this.ledger = new ArtifactIntegrationStore(runtime.authority.id, storage, () => !this._store.isDisposed && runtime.isOwner());
		this.executor = this._register(new ArtifactExecutionService(this.ledger, runtime, logService));
		this._register(autorun(reader => {
			this.ledger.state.read(reader);
			runtime.enabled?.read(reader);
			for (const [key, entry] of this.models) {
				this.releaseUnused(key, entry);
			}
		}));
		if (runtime.onDidDeleteSession) {
			this._register(runtime.onDidDeleteSession(session => void this.forgetSession(session)));
		}
	}

	initialize(): Promise<void> {
		return this.initialization ??= this.restore();
	}

	private async restore(): Promise<void> {
		await this.ledger.initialize();
		if (this._store.isDisposed) {
			return;
		}
		if (this.runtime.postNotice) {
			const posts = new SequencerByKey<string>();
			let previous = this.ledger.state.get();
			this._register(autorun(reader => {
				const current = this.ledger.state.read(reader);
				const notices = getArtifactAutomationNotices(previous, current);
				previous = current;
				for (const notice of notices) {
					void posts.queue(notice.session, async () => {
						const model = notice.kind === 'disabled' ? undefined
							: await this.models.get(JSON.stringify([notice.session, notice.artifact.id]))?.promise;
						if (!this._store.isDisposed && this.runtime.isOwner()) {
							const snapshot = model?.snapshot.read(undefined);
							const iconId = snapshot?.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main?.icon.id;
							await this.runtime.postNotice!({ ...notice, iconId });
						}
					}).catch(error => this.logService.error('[ArtifactIntegrations] Could not post automation notice', error));
				}
			}));
		}
		let initialUpdate: Promise<void> | undefined;
		this._register(autorun(reader => {
			const enabled = this.runtime.enabled?.read(reader) !== false;
			if (!enabled) {
				this.ledger.state.read(reader);
			}
			const update = enabled ? this.restoreBindings() : this.pauseAutomation();
			if (!initialUpdate) {
				initialUpdate = update;
			} else {
				void update.catch(error => this.logService.error('[ArtifactIntegrations] Could not apply feature enablement', error));
			}
		}));
		await initialUpdate;
	}

	private async restoreBindings(): Promise<void> {
		const retained = new Map(this.ledger.state.get().bindings.filter(binding => this.retains(binding.session, binding.artifact.id)).map(binding => [JSON.stringify([binding.session, binding.artifact.id]), binding]));
		for (const binding of retained.values()) {
			if (this._store.isDisposed || this.runtime.enabled?.get() === false) {
				return;
			}
			try {
				const reference = await this.acquire(binding.session, binding.artifact.id);
				reference.dispose();
			} catch (error) {
				this.logService.error('[ArtifactIntegrations] Could not restore artifact automation', error);
			}
		}
	}

	private async pauseAutomation(): Promise<void> {
		await Promise.all(this.ledger.state.get().runs
			.filter(run => run.source === 'automation' && !isArtifactRunSettled(run))
			.map(async run => {
				try {
					await this.executor.cancel(run.bindingId, run.id);
				} catch (error) {
					this.logService.error('[ArtifactIntegrations] Could not stop automation while disabling the feature', error);
				}
			}));
	}

	async acquireArtifact(session: string, artifactId: string): Promise<IReference<IArtifactModel>> {
		await this.initialize();
		if (this.runtime.enabled?.get() === false) {
			throw new Error(localize('artifactIntegrationsDisabled', "Artifact integrations are disabled."));
		}
		return this.acquire(session, artifactId);
	}

	async postNotice(notice: ArtifactAutomationNotice): Promise<void> {
		const reference = await this.runtime.acquireSession(notice.session);
		try {
			const state = reference.object.get();
			const artifact = state.artifacts.find(artifact => artifact.id === notice.artifact.id && artifact.resource === notice.artifact.resource);
			if (!artifact || state.availability.kind !== 'available' || state.deleted || !this.runtime.postNotice
				|| this._store.isDisposed || !isArtifactRuntimeAvailable(this.runtime) || !this.runtime.isOwner()) {
				throw new Error(localize('artifactNoticeUnavailable', "The artifact automation notice cannot be posted because its session or runtime is unavailable."));
			}
			await this.runtime.postNotice({ ...notice, artifact });
		} finally {
			reference.dispose();
		}
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
					requestAuthentication: integrationId => hold(() => model.requestAuthentication(integrationId)),
					configure: (integrationId, revision, values, actor) => hold(() => model.configure(integrationId, revision, values, actor)),
					invoke: (integrationId, actionId, chat, requestId, actor) => hold(() => model.invoke(integrationId, actionId, chat, requestId, actor)),
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
		const enabled = this.runtime.enabled?.get() !== false;
		return state.bindings.some(binding => binding.session === session && binding.artifact.id === artifactId
			&& ((enabled && binding.options.some(option => isArtifactOptionEnabled(option, binding.configuration.values[option.id])))
				|| state.runs.some(run => run.bindingId === binding.id && (!isArtifactRunSettled(run) || (enabled && run.indeterminate)))));
	}

	private releaseUnused(key: string, entry: IModelEntry): void {
		if (entry.references === 0 && !this.retains(entry.session, entry.artifactId) && this.models.get(key) === entry) {
			this.models.delete(key);
			void entry.promise.then(model => model.dispose(), () => { /* Acquisition reports the initialization failure. */ });
		}
	}

	/** Removes a deleted session's bindings and their history, which no artifact can reach again. */
	private async forgetSession(session: string): Promise<void> {
		// Unsettled and uncertain runs keep their binding: the executor still records their outcome, and an uncertain
		// effect keeps blocking conflicting work on the resource. Other bindings go now, the rest once their runs settle.
		const forget = () => this.ledger.transact(state => {
			const kept = new Set(state.runs.filter(run => !isArtifactRunSettled(run) || run.indeterminate).map(run => run.bindingId));
			const removed = new Set(state.bindings.filter(binding => binding.session === session && !kept.has(binding.id)).map(binding => binding.id));
			state.bindings = state.bindings.filter(binding => !removed.has(binding.id));
			state.runs = state.runs.filter(run => !removed.has(run.bindingId));
		});
		const isSettled = (state: ArtifactIntegrationState) => {
			const bindings = new Set(state.bindings.filter(binding => binding.session === session).map(binding => binding.id));
			return !state.runs.some(run => bindings.has(run.bindingId) && !isArtifactRunSettled(run));
		};
		try {
			if (this._store.isDisposed || !this.ledger.state.get().bindings.some(binding => binding.session === session)) {
				return;
			}
			await forget();
			if (!isSettled(this.ledger.state.get())) {
				await waitForState(this.ledger.state, isSettled, undefined, this.lifetimeToken.token);
				await forget();
			}
		} catch (error) {
			if (!this._store.isDisposed && !isCancellationError(error)) {
				this.logService.error('[ArtifactIntegrations] Could not remove the artifact bindings of a deleted session', error);
			}
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
		private artifact: ArtifactRecord,
		private readonly sessionReference: IReference<IObservable<ArtifactSessionState>>,
		private readonly runtime: IArtifactRuntime,
		private readonly registry: IArtifactIntegrationRegistry,
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
				authority: runtime.authority, session, artifact: this.artifact, contributions,
				mainIntegrationId: contributions.find(contribution => contribution.view.main)?.integrationId,
				runs: state.runs.filter(run => ids.has(run.bindingId)).slice(-50),
			};
		});
	}

	async initialize(): Promise<void> {
		let initial = true;
		this._register(autorun(reader => {
			const registrations = this.registry.integrations.read(reader);
			const currentArtifact = this.sessionReference.object.read(reader).artifacts.find(artifact => artifact.id === this.artifact.id);
			if (!initial) {
				if (currentArtifact && currentArtifact.isArtifact !== this.artifact.isArtifact) {
					this.artifact = { ...this.artifact, isArtifact: currentArtifact.isArtifact };
					this.bindings.clearAndDisposeAll();
				}
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
		await this.refresh();
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
				if (!contributions.some(contribution => contribution.integrationId === stored.integrationId)
					&& (stored.options.length > 0 || state.runs.some(run => run.bindingId === stored.id))) {
					contributions.push({
						integrationId: stored.integrationId, label: stored.integrationId, options: stored.options, configuration: stored.configuration, actions: [],
						view: unavailableView(stored.options.length > 0
							? localize('artifactProviderUnavailable', "This artifact integration is not currently available. You can still turn off its automations.")
							: localize('artifactProviderActivityOnly', "This artifact integration is not currently available. Its activity is still available.")),
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
					if (!this.registry.integrations.get().includes(registration)) {
						binding.dispose();
						continue;
					}
					binding.setError(error);
					this.bindings.set(registration.id, binding);
					this.logService.error('[ArtifactIntegrations] Integration binding failed', error);
				}
			}
			this.bindingsChanged.trigger(undefined);
		});
	}

	async configure(integrationId: string, expectedRevision: number, values: Readonly<Record<string, boolean | string>>, actor: ArtifactActor = { kind: 'user' }): Promise<void> {
		const id = artifactBindingId(this.runtime.authority.id, this.session, this.artifact.id, integrationId);
		const binding = this.bindings.get(integrationId);
		await this.ledger.transact(state => {
			const stored = binding?.storedIn(state) ?? state.bindings.find(binding => binding.id === id);
			if (!stored || stored.configuration.revision !== expectedRevision) {
				throw new ArtifactConfigurationConflictError();
			}
			const options = binding ? [...binding.registration.options, ...stored.options.filter(option => !binding.registration.options.some(current => current.id === option.id))] : stored.options;
			validateArtifactAutomationSelection({
				options,
				view: binding?.snapshot.get().view ?? unavailableView(localize('artifactIntegrationNotAvailable', "This artifact integration is not currently available.")),
			}, values);
			const signatures: Record<string, string | undefined> = {};
			for (const optionId of Object.keys(values)) {
				const option = options.find(option => option.id === optionId)!;
				if (isArtifactOptionEnabled(option, values[optionId]) && !isArtifactRuntimeAvailable(this.runtime)) {
					throw new Error(localize('artifactCannotEnable', "This artifact automation is unavailable and cannot be enabled."));
				}
				signatures[optionId] = binding?.getConsent(option) ?? stored.consent[optionId];
			}
			const updated = applyArtifactAutomationSelection(stored.configuration, options, stored.consent, values, signatures, Date.now(), actor);
			const next = { ...stored, options, ...updated };
			state.bindings = state.bindings.map(binding => binding.id === id ? next : binding);
		});
		await this.executor.revokeDisabled(id);
		this.executor.wake();
	}

	async invoke(integrationId: string, actionId: string, chat: string, requestId: string, actor: ArtifactActor = { kind: 'user' }) {
		// Runs are recorded against a stored binding.
		await this.bindings.get(integrationId)?.ensureStored();
		return this.executor.invoke(artifactBindingId(this.runtime.authority.id, this.session, this.artifact.id, integrationId), actionId, chat, requestId, actor);
	}

	async requestAuthentication(integrationId: string): Promise<ArtifactAuthenticationRequest | undefined> {
		const binding = this.bindings.get(integrationId);
		if (!binding || !this.registry.integrations.get().includes(binding.registration)) {
			throw new Error(localize('artifactAuthenticationUnavailable', "Sign-in is not available for this artifact."));
		}
		const request = await binding.requestAuthentication(this.lifetimeToken.token);
		// Without a request, a self-service sign-in already took effect inside the integration's own runtime.
		if (request && (this._store.isDisposed || !this.registry.integrations.get().includes(binding.registration))) {
			throw new CancellationError();
		}
		return request;
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
	private readonly lifetimeToken = this._register(new CancellationTokenSource());
	/** The binding to persist on its first change, while it has not been stored yet. */
	private unstored: ArtifactStoredBinding | undefined;
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
			const view = this.view.read(reader);
			return {
				integrationId: registration.id, label: registration.label,
				options: [...registration.options, ...stored?.options.filter(option => !registration.options.some(current => current.id === option.id)) ?? []],
				configuration: stored?.configuration ?? this.configuration.read(reader), view,
				actions: this.provider.value?.object.binding.actions.map(action => ({ id: action.id, label: action.label, iconId: action.iconId, kind: action.kind, consentVersion: action.consentVersion })) ?? [],
				authentication: (this.registration.getAuthenticationRequest || this.registration.signIn) && view.availability.kind === 'authenticationRequired'
					? { enabled: true, ...(this.registration.signIn ? { handledByIntegration: true } : {}) } : undefined,
			};
		});
	}

	async initialize(token: CancellationToken): Promise<boolean> {
		const stored = this.ledger.state.get().bindings.find(binding => binding.id === this.id);
		this.configuration.set(stored?.configuration ?? emptyArtifactConfiguration(this.registration.options), undefined);
		const reference = await this.registration.create({
			session: this.session, artifact: this.artifact, configuration: this.configuration,
			state: {
				read: () => this.ledger.state.get().bindings.find(binding => binding.id === this.id)?.checkpoint ?? { revision: 0 },
				write: (expectedRevision, value) => this.ledger.transact(state => {
					if (!isArtifactJsonValue(value)) {
						throw new Error('Artifact checkpoint must contain JSON data');
					}
					const binding = this.storedIn(state);
					if (!binding || binding.checkpoint.revision !== expectedRevision) {
						throw new ArtifactConfigurationConflictError();
					}
					state.bindings = state.bindings.map(candidate => candidate.id === this.id ? { ...binding, checkpoint: { revision: expectedRevision + 1, value } } : candidate);
				}),
			},
		}, { authority: this.runtime.authority, runtimeId: this.registration.runtimeId }, token).catch(error => {
			if (!(error instanceof ArtifactAuthenticationRequiredError) || token.isCancellationRequested) {
				throw error;
			}
			return error;
		});
		if (reference instanceof ArtifactAuthenticationRequiredError) {
			this.observeView(constObservable({
				availability: { kind: 'authenticationRequired', reason: reference.message },
				main: reference.main, sections: [], stateActions: [], generalActions: [], automationAvailability: [],
			}));
			return true;
		}
		if (!reference) {
			return false;
		}
		this.provider.value = reference;
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const { binding, match } = reference.object;
		if (!binding.actions.every(isArtifactActionDescriptor) || new Set(binding.actions.map(action => action.id)).size !== binding.actions.length
			|| this.registration.options.some(option => option.actionIds.some(id => !binding.actions.some(action => action.id === id)))) {
			throw new Error('Artifact action descriptors are missing or duplicated');
		}
		if (stored && (stored.runtimeId !== this.registration.runtimeId || stored.credentialScope !== match.credentialScope || stored.resourceKey !== match.key)) {
			throw new Error(localize('artifactIdentityChanged', "The integration runtime, account, or resource identity changed. The previous binding remains paused."));
		}
		if (!stored) {
			// Persisted on the first change, so observing an artifact never writes to the ledger.
			this.unstored = {
				id: this.id, session: this.session, artifact: this.artifact, integrationId: this.registration.id, runtimeId: this.registration.runtimeId,
				credentialScope: match.credentialScope, resourceKey: match.key, options: this.registration.options, consent: {}, configuration: this.configuration.get(), checkpoint: { revision: 0 },
			};
		} else {
			const reconciled = reconcileArtifactAutomationOptions(
				stored.options,
				this.registration.options,
				stored.configuration,
				stored.consent,
				binding.actions,
				localize('artifactConsentChanged', "This automation was turned off because its definition or permitted actions changed. Review it before enabling it again."),
			);
			if (reconciled.changed) {
				const previous = stored;
				await this.ledger.transact(state => {
					const latest = state.bindings.find(candidate => candidate.id === this.id);
					if (latest?.configuration.revision !== previous.configuration.revision) {
						throw new ArtifactConfigurationConflictError();
					}
					state.bindings = state.bindings.map(candidate => candidate.id === this.id
						? { ...candidate, options: reconciled.options, configuration: reconciled.configuration } : candidate);
				});
			}
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this.execution.value = this.executor.registerBinding({
			id: this.id, session: this.session, artifact: this.artifact, integrationId: this.registration.id, integrationLabel: this.registration.label, options: this.registration.options,
			credentialScope: match.credentialScope, resourceKey: match.key, sessionState: this.sessionState, provider: binding, presentation: this.view,
			isCurrent: () => this.registration.isActive() && !this._store.isDisposed,
		});
		await this.executor.recover(this.id);
		this.observeView(binding.view);
		return true;
	}

	private observeView(presentation: IObservable<ArtifactContributionView>): void {
		this._register(autorun(reader => {
			const next = this.ledger.state.read(reader).bindings.find(binding => binding.id === this.id);
			if (next && next.configuration.revision !== this.configuration.read(undefined).revision) {
				this.configuration.set(next.configuration, undefined);
			}
			const binding = this.provider.value?.object.binding;
			const view = presentation.read(reader);
			const session = this.sessionState.read(reader);
			const available = isArtifactRuntimeAvailable(this.runtime, reader);
			const automationUnavailableReason = this.runtime.automationUnavailableReason?.read(reader);
			try {
				if (!isArtifactContributionView(view) || !hasValidArtifactPresentationReferences(view,
					new Set(binding?.actions.map(action => action.id)), new Set(this.registration.options.map(option => option.id)))) {
					throw new Error('Artifact presentation contains invalid references');
				}
				const reason = this.runtime.enabled?.read(reader) === false ? localize('artifactIntegrationsDisabled', "Artifact integrations are disabled.")
					: !available ? localize('artifactCoordinatorPaused', "The artifact coordinator is unavailable. Automation is paused.")
						: session.deleted || session.availability.kind !== 'available' ? localize('artifactSessionUnavailable', "The artifact's session is unavailable.")
							: !session.artifacts.some(artifact => artifact.id === this.artifact.id && artifact.resource === this.artifact.resource) ? localize('artifactRecordRemoved', "The artifact is no longer recorded in this session.") : undefined;
				this.view.set(reason ? {
					...view, availability: { kind: 'unavailable', reason },
					stateActions: view.stateActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
					generalActions: view.generalActions.map(action => ({ ...action, enabled: false, disabledReason: reason })),
					automationAvailability: view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: reason })),
				} : session.archived || automationUnavailableReason ? {
					...view,
					automationAvailability: view.automationAvailability.map(option => ({ ...option, available: false, unavailableReason: automationUnavailableReason ?? localize('artifactArchived', "Artifact automation is paused while the session is archived.") })),
				} : view, undefined);
			} catch (error) {
				this.view.set({ ...this.view.read(undefined), availability: { kind: 'error', reason: toErrorMessage(error) } }, undefined);
				this.logService.error('[ArtifactIntegrations] Invalid artifact presentation', error);
			}
			const enabled = binding && next && available && !automationUnavailableReason && this.view.read(undefined).availability.kind === 'available' && session.availability.kind === 'available' && !session.archived && session.artifacts.some(artifact => artifact.id === this.artifact.id)
				&& this.registration.options.some(option => isArtifactOptionEnabled(option, next.configuration.values[option.id]) && next.consent[option.id] === this.getConsent(option));
			if (enabled && !this.automation.value) {
				this.automation.value = binding.activateAutomation({
					runAutomation: request => this.executor.runAutomation(this.id, request),
					reconcileRun: runId => this.executor.reconcile(this.id, runId),
					disableAutomation: (optionId, expectedRevision, reason) => this.disableAutomation(optionId, expectedRevision, reason),
					runs: derived(this, reader => this.ledger.state.read(reader).runs.filter(run => run.bindingId === this.id)),
				});
			} else if (!enabled) {
				this.automation.clear();
			}
		}));
	}

	async requestAuthentication(modelLifetime: CancellationToken): Promise<ArtifactAuthenticationRequest | undefined> {
		const { getAuthenticationRequest, signIn } = this.registration;
		const canContinue = () => {
			const session = this.sessionState.get();
			return this.registration.isActive() && this.runtime.isOwner() && isArtifactRuntimeAvailable(this.runtime)
				&& !session.deleted && session.availability.kind === 'available'
				&& session.artifacts.some(artifact => artifact.id === this.artifact.id && artifact.resource === this.artifact.resource);
		};
		const canRequest = () => !this._store.isDisposed && canContinue() && this.view.get().availability.kind === 'authenticationRequired';
		if ((!getAuthenticationRequest && !signIn) || !canRequest()) {
			throw new Error(localize('artifactAuthenticationUnavailable', "Sign-in is not available for this artifact."));
		}
		const store = new DisposableStore();
		// A self-service sign-in succeeds by changing the integration, which replaces this binding and its view; neither may cancel it.
		const source = store.add(new CancellationTokenSource(signIn ? modelLifetime : this.lifetimeToken.token));
		store.add(autorun(reader => {
			this.sessionState.read(reader);
			isArtifactRuntimeAvailable(this.runtime, reader);
			this.view.read(reader);
			if (!(signIn ? canContinue() : canRequest())) {
				source.cancel();
			}
		}));
		try {
			if (signIn) {
				// The integration signs in within its own runtime; the result reaches it as a change, not as a credential.
				await raceCancellationError(signIn(this.artifact, source.token), source.token);
				return undefined;
			}
			const request = await raceCancellationError(getAuthenticationRequest!(this.artifact, source.token), source.token);
			if (!canRequest()) {
				throw new CancellationError();
			}
			if (!isArtifactAuthenticationRequest(request)) {
				throw new Error('The artifact integration supplied an invalid authentication request');
			}
			return request;
		} finally {
			store.dispose();
		}
	}

	/** The binding as stored in `state`, adding it there on the first change. */
	storedIn(state: ArtifactIntegrationState): ArtifactStoredBinding | undefined {
		const stored = state.bindings.find(binding => binding.id === this.id);
		if (stored || !this.unstored) {
			return stored;
		}
		state.bindings.push(this.unstored);
		return this.unstored;
	}

	async ensureStored(): Promise<void> {
		if (this.unstored && !this.ledger.state.get().bindings.some(binding => binding.id === this.id)) {
			await this.ledger.transact(state => { this.storedIn(state); });
		}
	}

	private async disableAutomation(optionId: string, expectedRevision: number, reason: string): Promise<void> {
		const option = this.registration.options.find(option => option.id === optionId);
		if (!option || !reason.trim()) {
			throw new Error('An automation disablement requires a registered option and a reason');
		}
		await this.ledger.transact(state => {
			const stored = this.storedIn(state);
			if (!stored || stored.configuration.revision !== expectedRevision) {
				throw new ArtifactConfigurationConflictError();
			}
			state.bindings = state.bindings.map(binding => binding.id === this.id ? {
				...stored,
				configuration: disableArtifactAutomation(stored.configuration, option, reason),
			} : binding);
		});
		await this.executor.revokeDisabled(this.id);
		this.executor.wake();
	}

	getConsent(option: ArtifactAutomationOption): string | undefined {
		return this.provider.value ? artifactOptionConsent(option, this.provider.value.object.binding.actions) : undefined;
	}

	acquireDetails(detailsId: string): IArtifactDetailsModel {
		const view = this.view.get();
		if (!this.provider.value && view.main?.detailsId === detailsId && (this.registration.getAuthenticationRequest || this.registration.signIn)) {
			return {
				details: this.view.map(view => ({
					availability: view.availability, title: view.main?.label ?? this.artifact.label,
					links: [], items: [], completeness: 'complete',
				})),
				dispose: () => { },
			};
		}
		if (!this.provider.value || !this.exposesDetails(view, detailsId)) {
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
				if (!isArtifactDetails(details) || !provider || !this.exposesDetails(view, detailsId)
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

	private exposesDetails(view: ArtifactContributionView, detailsId: string): boolean {
		return view.main?.detailsId === detailsId || view.sections.some(section => section.detailsId === detailsId)
			|| !!view.lists?.some(list => list.detailsId === detailsId);
	}

	setError(error: unknown): void {
		this.automation.clear();
		this.execution.clear();
		this.provider.clear();
		this.view.set({ ...this.view.get(), availability: { kind: 'error', reason: toErrorMessage(error) } }, undefined);
	}

	override dispose(): void {
		this.lifetimeToken.cancel();
		for (const entry of this.details.values()) {
			entry.model.dispose();
		}
		this.details.clear();
		super.dispose();
	}
}
