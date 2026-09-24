/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError } from '../../../base/common/errors.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../base/common/observable.js';
import { getComparisonKey } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ArtifactAction, ArtifactAutomationOption, ArtifactAutomationRequest, ArtifactContributionView, ArtifactRecord, ArtifactRun, IArtifactActionContext, IArtifactIntegrationBinding, artifactOptionDisabledValue, isArtifactOptionEnabled, isArtifactRunSettled } from './artifactIntegration.js';
import { ArtifactConfigurationConflictError, ArtifactIntegrationState, ArtifactIntegrationStore, ArtifactRetryLimitError, ArtifactStoredBinding, artifactActionConsent, artifactOptionConsent, isArtifactJsonValue } from './artifactIntegrationStore.js';
import { ArtifactPromptOutcome, ArtifactPromptRequest, ArtifactPromptTrackingError, ArtifactSessionState, IArtifactChatObservation, IArtifactPromptHandle, IArtifactRuntime, isArtifactPromptOutcome } from './artifactRuntime.js';

export interface IArtifactExecutionBinding {
	readonly id: string;
	readonly session: string;
	readonly artifact: ArtifactRecord;
	readonly integrationId: string;
	readonly options: readonly ArtifactAutomationOption[];
	readonly credentialScope: string;
	readonly resourceKey: string;
	readonly sessionState: IObservable<ArtifactSessionState>;
	readonly provider: IArtifactIntegrationBinding;
	readonly presentation: IObservable<ArtifactContributionView>;
	isCurrent(): boolean;
}

export class ArtifactExecutionService extends Disposable {
	private readonly bindings = new Map<string, IArtifactExecutionBinding>();
	private readonly recovering = new Set<string>();
	private readonly active = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly observations = this._register(new DisposableMap<string, DisposableStore>());
	private readonly promptHandles = new Map<string, IArtifactPromptHandle>();
	private readonly lanes = new SequencerByKey<string>();
	private readonly inFlight = new Set<Promise<void>>();
	private readonly cancellations = new Map<string, Promise<void>>();
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.pump(), 0));

	constructor(
		private readonly ledger: ArtifactIntegrationStore,
		private readonly runtime: IArtifactRuntime,
		private readonly logService: ILogService,
	) {
		super();
		this._register(autorun(reader => {
			if (runtime.available.read(reader)) {
				this.wake();
			}
		}));
	}

	registerBinding(binding: IArtifactExecutionBinding): IDisposable {
		if (this.bindings.has(binding.id)) {
			throw new Error(`Duplicate artifact execution binding: ${binding.id}`);
		}
		this.bindings.set(binding.id, binding);
		this.recovering.add(binding.id);
		const store = new DisposableStore();
		store.add(autorun(reader => {
			const session = binding.sessionState.read(reader);
			binding.presentation.read(reader);
			this.ledger.state.read(reader);
			for (const run of this.ledger.state.get().runs.filter(run => run.bindingId === binding.id && run.state === 'cancelled')) {
				this.active.get(run.id)?.cancel();
			}
			if (!this.recovering.has(binding.id)) {
				void this.revokeDisabled(binding.id).catch(error => this.logService.error('[ArtifactIntegrations] Could not revoke disabled automation', error));
			}
			if (session.deleted || (session.availability.kind === 'available' && (session.archived || !session.artifacts.some(artifact => artifact.id === binding.artifact.id)))) {
				for (const run of this.ledger.state.get().runs.filter(run => run.bindingId === binding.id && run.source === 'automation' && !isArtifactRunSettled(run))) {
					void this.cancel(binding.id, run.id).catch(error => this.logService.error('[ArtifactIntegrations] Could not revoke automation', error));
				}
			}
			this.wake();
		}));
		store.add(toDisposable(() => {
			this.bindings.delete(binding.id);
			this.recovering.delete(binding.id);
			for (const run of this.ledger.state.get().runs.filter(run => run.bindingId === binding.id)) {
				this.active.get(run.id)?.cancel();
				if (!this._store.isDisposed && !isArtifactRunSettled(run) && run.actionKind === 'prompt' && run.receipt) {
					void this.cancel(binding.id, run.id).catch(error => this.logService.error('[ArtifactIntegrations] Could not cancel work after integration removal', error));
				}
			}
		}));
		return store;
	}

	wake(): void {
		if (!this._store.isDisposed) {
			this.scheduler.schedule();
		}
	}

	async invoke(bindingId: string, actionId: string, chat: string, requestId: string): Promise<ArtifactRun> {
		if (!chat.trim() || !requestId.trim()) {
			throw new Error('An invoking chat and request ID are required');
		}
		const binding = this.requireBinding(bindingId);
		const action = this.requireAction(binding, actionId, true);
		const run = await this.ledger.transact(state => {
			const existing = state.runs.find(run => run.bindingId === bindingId && run.source === 'manual' && run.requestId === requestId);
			if (existing) {
				if (existing.actionId !== actionId || existing.chat !== chat) {
					throw new Error('Artifact action request ID was reused with different arguments');
				}
				return existing;
			}
			const run = this.newRun(bindingId, action, requestId, 'manual', action.label, chat);
			state.runs.push(run);
			return run;
		});
		this.wake();
		return run;
	}

	async runAutomation(bindingId: string, request: ArtifactAutomationRequest): Promise<ArtifactRun> {
		if (!request.occurrenceKey.trim() || !request.reason.trim() || (request.input !== undefined && !isArtifactJsonValue(request.input))) {
			throw new Error('Invalid artifact automation request');
		}
		const binding = this.requireBinding(bindingId);
		const action = this.requireAction(binding, request.actionId, false);
		const option = binding.options.find(option => option.id === request.optionId);
		if (!option || !option.actionIds.includes(action.id)) {
			throw new Error('Artifact automation action is not authorized by this control');
		}
		const result = await this.ledger.transact(state => {
			const stored = this.requireStoredBinding(state, bindingId);
			const config = stored.configuration;
			if (config.revision !== request.configurationRevision) {
				throw new ArtifactConfigurationConflictError();
			}
			if (!isArtifactOptionEnabled(option, config.values[option.id]) || stored.consent[option.id] !== artifactOptionConsent(option, binding.provider.actions)) {
				throw new Error(localize('artifactAutomationNotEnabled', "This artifact automation is not enabled with the current permissions."));
			}
			const generation = config.generations[option.id];
			const attempts = state.runs.filter(run => run.bindingId === bindingId && run.optionId === option.id && run.generation === generation && run.occurrenceKey === request.occurrenceKey);
			const latest = attempts.at(-1);
			if (request.retryOf) {
				const successor = attempts.find(run => run.retryOf === request.retryOf);
				if (successor) {
					return { run: successor };
				}
				if (!latest || latest.id !== request.retryOf || !isArtifactRunSettled(latest) || latest.indeterminate) {
					throw new Error(localize('artifactRetryNotSettled', "Only the latest reconciled, finished attempt can be retried."));
				}
			} else if (latest) {
				if (latest.actionId !== request.actionId) {
					throw new Error('An artifact occurrence cannot be reused for a different action');
				}
				return { run: latest };
			}
			if (state.runs.some(run => run.bindingId === bindingId && run.optionId === option.id && run.occurrenceKey === request.occurrenceKey && run.indeterminate)) {
				throw new Error(localize('artifactReconciliationRequired', "A previous attempt has an unknown outcome. Reconcile it before requesting more work."));
			}
			const dispatched = attempts.filter(run => run.dispatched).length;
			if (dispatched >= option.maxAttempts && latest) {
				this.disableExhaustedOption(state, stored, option, dispatched, latest);
				return { limit: new ArtifactRetryLimitError(option.id, latest.id) };
			}
			const run: ArtifactRun = {
				...this.newRun(bindingId, action, generateUuid(), 'automation', request.reason, binding.artifact.origin?.chat),
				optionId: option.id,
				configurationRevision: config.revision,
				generation,
				occurrenceKey: request.occurrenceKey,
				retryOf: request.retryOf,
				input: request.input,
			};
			state.runs.push(run);
			return { run };
		});
		this.wake();
		if (result.limit) {
			throw result.limit;
		}
		return result.run;
	}

	private newRun(bindingId: string, action: ArtifactAction, requestId: string, source: 'manual' | 'automation', reason: string, chat: string | undefined): ArtifactRun {
		const now = Date.now();
		return {
			id: generateUuid(), bindingId, actionId: action.id, actionKind: action.kind, actionConsent: artifactActionConsent(action), requestId, source, reason, chat,
			state: 'queued', createdAt: now, updatedAt: now, dispatched: false,
			...(action.kind === 'prompt' ? { admission: this.runtime.chat.admission } : {}),
		};
	}

	private disableExhaustedOption(state: ArtifactIntegrationState, binding: ArtifactStoredBinding, option: ArtifactAutomationOption, attempts: number, lastRun: ArtifactRun): void {
		const reason = localize('artifactAttemptsExhausted', "Turned off after {0} attempts. Review the last run before enabling this automation again.", attempts);
		const configuration = {
			...binding.configuration,
			revision: binding.configuration.revision + 1,
			values: { ...binding.configuration.values, [option.id]: artifactOptionDisabledValue(option) },
			disablements: { ...binding.configuration.disablements, [option.id]: { reason, attempts, lastRunId: lastRun.id } },
		};
		state.bindings = state.bindings.map(candidate => candidate.id === binding.id ? { ...binding, configuration } : candidate);
		state.runs = state.runs.map(run => run.bindingId === binding.id && run.optionId === option.id && !run.dispatched && !isArtifactRunSettled(run)
			? { ...run, state: 'cancelled', reason, updatedAt: Date.now() } : run);
	}

	private pump(): void {
		if (!this.runtime.isOwner() || !this.runtime.available.get()) {
			return;
		}
		for (const run of this.ledger.state.get().runs) {
			if ((run.state !== 'queued' && run.state !== 'blocked') || this.active.has(run.id) || !this.bindings.has(run.bindingId) || this.recovering.has(run.bindingId)) {
				continue;
			}
			if (run.retryOf) {
				const previous = this.ledger.state.get().runs.find(candidate => candidate.id === run.retryOf);
				const delay = (previous?.updatedAt ?? 0) + 1000 - Date.now();
				if (delay > 0) {
					this.scheduler.schedule(delay);
					continue;
				}
			}
			const token = new CancellationTokenSource();
			this.active.set(run.id, token);
			const binding = this.requireBinding(run.bindingId);
			const resourceKey = JSON.stringify(['resource', getComparisonKey(URI.parse(binding.artifact.resource)), binding.credentialScope]);
			const integrationKey = JSON.stringify(['integration', binding.integrationId, binding.resourceKey, binding.credentialScope]);
			const execution = this.lanes.queue(resourceKey, () => this.lanes.queue(integrationKey, () => this.execute(run.id, token.token)));
			this.inFlight.add(execution);
			void execution.catch(error => {
				this.logService.error('[ArtifactIntegrations] Could not record action outcome', error);
			}).finally(() => {
				this.inFlight.delete(execution);
				this.active.deleteAndDispose(run.id);
				if (isArtifactRunSettled(this.getRun(run.id))) {
					this.wake();
				}
			});
		}
	}

	private async execute(runId: string, token: CancellationToken): Promise<void> {
		let run = this.getRun(runId);
		try {
			const binding = this.requireBinding(run.bindingId);
			const action = this.requireAction(binding, run.actionId, false);
			const blocked = this.blockedReason(binding, run);
			if (blocked) {
				await this.updateRun(runId, { state: 'blocked', reason: blocked });
				return;
			}
			let chatObservation: IArtifactChatObservation | undefined;
			if (action.kind === 'prompt') {
				if (!run.chat) {
					await this.updateRun(runId, { state: 'blocked', reason: localize('artifactOriginMissing', "The chat that originally recorded this artifact is unknown.") });
					return;
				}
				const store = new DisposableStore();
				this.observations.set(runId, store);
				chatObservation = store.add(this.runtime.chat.observeChat(binding.session, run.chat));
				const observation = chatObservation;
				let initial = true;
				store.add(autorun(reader => {
					observation.state.read(reader);
					if (!initial) {
						this.wake();
					}
					initial = false;
				}));
				const chat = chatObservation.state.get();
				if (!chat.available || chat.busy) {
					await this.updateRun(runId, { state: 'blocked', reason: chat.reason ?? localize('artifactChatBusy', "Waiting for the artifact's chat to become available.") });
					return;
				}
			}
			if (token.isCancellationRequested || isArtifactRunSettled(this.getRun(runId))) {
				return;
			}
			await this.updateRun(runId, { state: 'preparing' });
			const context = this.context(binding, run);
			const authorization = await this.runtime.authorize(context, action.kind === 'code' ? action.executionScope : 'resource', token);
			if (authorization.kind === 'blocked') {
				await this.updateRun(runId, { state: 'blocked', reason: authorization.reason });
				return;
			}
			if (action.kind === 'code') {
				const prepared = await action.prepare(context, token);
				if (prepared.kind === 'skip') {
					await this.updateRun(runId, { state: 'skipped', reason: prepared.reason });
					return;
				}
				if (!await this.reserve(binding, action, run, token)) {
					return;
				}
				if (!this.canDispatch(binding, run.id, token)) {
					await this.updateRun(runId, { state: 'cancelled', dispatched: false, reason: localize('artifactRevokedBeforeExecution', "The artifact action was revoked before execution.") });
					return;
				}
				const result = await prepared.value.run({ token, runId });
				await this.updateRun(runId, result.kind === 'completed'
					? { state: 'completed', reason: result.summary, result: result.result, indeterminate: false }
					: { state: 'skipped', reason: result.reason, indeterminate: false });
			} else {
				const prepared = await action.prepare(context, token);
				if (prepared.kind === 'skip') {
					await this.updateRun(runId, { state: 'skipped', reason: prepared.reason });
					return;
				}
				if (!prepared.value.text.trim()) {
					throw new Error('An artifact action prepared an empty prompt');
				}
				await this.updateRun(runId, { prompt: prepared.value });
				if (chatObservation?.state.get().busy) {
					await this.updateRun(runId, { state: 'queued' });
					return;
				}
				if (!await this.reserve(binding, action, run, token)) {
					return;
				}
				run = this.getRun(runId);
				const submission = await this.runtime.chat.submit(this.promptRequest(binding, run), token, () => this.canDispatch(binding, runId, token));
				switch (submission.kind) {
					case 'notSent':
						await this.updateRun(runId, { state: token.isCancellationRequested ? 'cancelled' : 'failed', dispatched: false, indeterminate: false, reason: submission.reason });
						break;
					case 'busy':
						await this.updateRun(runId, { state: 'queued', dispatched: false });
						this.scheduler.schedule(1000);
						break;
					case 'indeterminate':
						await this.updateRun(runId, { state: 'interrupted', indeterminate: true, reason: submission.reason });
						break;
					case 'accepted':
						await this.trackPrompt(run, submission.handle);
						if (token.isCancellationRequested && !this._store.isDisposed && this.runtime.isOwner()) {
							await this.cancel(binding.id, runId);
						}
						break;
				}
			}
		} catch (error) {
			run = this.getRun(runId);
			if (!isArtifactRunSettled(run) && this.runtime.isOwner()) {
				await this.updateRun(runId, { state: run.dispatched ? 'interrupted' : 'failed', indeterminate: run.dispatched, reason: toErrorMessage(error) });
			}
			this.logService.error('[ArtifactIntegrations] Action failed', error);
		} finally {
			if (isArtifactRunSettled(this.getRun(runId))) {
				this.observations.deleteAndDispose(runId);
			}
		}
	}

	private async reserve(binding: IArtifactExecutionBinding, action: ArtifactAction, run: ArtifactRun, token: CancellationToken): Promise<boolean> {
		const authorization = await this.runtime.authorize(this.context(binding, run), action.kind === 'code' ? action.executionScope : 'resource', token);
		const reason = this.blockedReason(binding, this.getRun(run.id));
		if (token.isCancellationRequested || reason || authorization.kind === 'blocked' || isArtifactRunSettled(this.getRun(run.id))) {
			if (!isArtifactRunSettled(this.getRun(run.id))) {
				await this.updateRun(run.id, { state: 'blocked', reason: reason ?? (authorization.kind === 'blocked' ? authorization.reason : localize('artifactCancelled', "Artifact action cancelled.")) });
			}
			return false;
		}
		await this.updateRun(run.id, { state: action.kind === 'code' ? 'running' : 'preparing', dispatched: true });
		this.ledger.assertOwner();
		const finalAuthorization = await this.runtime.authorize(this.context(binding, run), action.kind === 'code' ? action.executionScope : 'resource', token);
		// Persistence can yield to a disable/remove operation; do not cross the effect boundary with stale consent.
		if (token.isCancellationRequested || isArtifactRunSettled(this.getRun(run.id)) || finalAuthorization.kind === 'blocked' || this.blockedReason(binding, this.getRun(run.id))) {
			await this.updateRun(run.id, { state: 'cancelled', dispatched: false });
			return false;
		}
		return true;
	}

	private blockedReason(binding: IArtifactExecutionBinding, run: ArtifactRun): string | undefined {
		if (!this.runtime.available.get() || !this.runtime.isOwner() || !binding.isCurrent() || this.bindings.get(binding.id) !== binding) {
			return localize('artifactRuntimeUnavailable', "The artifact integration runtime is unavailable.");
		}
		const session = binding.sessionState.get();
		if (session.availability.kind !== 'available') {
			return 'reason' in session.availability ? session.availability.reason : localize('artifactSessionLoading', "The artifact's session is loading.");
		}
		const artifact = session.artifacts.find(artifact => artifact.id === binding.artifact.id);
		if (!artifact || artifact.resource !== binding.artifact.resource) {
			return localize('artifactRemoved', "This artifact is no longer recorded in the session.");
		}
		const presentation = binding.presentation.get();
		const action = binding.provider.actions.find(action => action.id === run.actionId);
		if (!action || artifactActionConsent(action) !== run.actionConsent) {
			return localize('artifactActionDefinitionChanged', "This action's definition changed after it was requested. Cancel it and review the new action before requesting it again.");
		}
		if (presentation.availability.kind !== 'available') {
			return 'reason' in presentation.availability ? presentation.availability.reason : localize('artifactStateLoading', "Waiting for current artifact state.");
		}
		if (run.source === 'manual' && ![...presentation.stateActions, ...presentation.generalActions].some(action => action.id === run.actionId && action.enabled)) {
			return localize('artifactActionUnavailable', "This artifact action is no longer available.");
		}
		const state = this.ledger.state.get();
		const related = new Set(state.bindings.filter(candidate => candidate.credentialScope === binding.credentialScope
			&& ((candidate.integrationId === binding.integrationId && candidate.resourceKey === binding.resourceKey)
				|| getComparisonKey(URI.parse(candidate.artifact.resource)) === getComparisonKey(URI.parse(binding.artifact.resource)))).map(candidate => candidate.id));
		if (state.runs.some(candidate => candidate.id !== run.id && related.has(candidate.bindingId) && (candidate.indeterminate || (candidate.dispatched && !isArtifactRunSettled(candidate))))) {
			return localize('artifactResourcePending', "Another action on this resource is still running or has an unknown outcome. Wait for it or reconcile its outcome before continuing.");
		}
		if (run.source === 'automation') {
			const stored = this.requireStoredBinding(this.ledger.state.get(), binding.id);
			const option = binding.options.find(option => option.id === run.optionId);
			const availability = presentation.automationAvailability.find(option => option.id === run.optionId);
			if (session.archived || !option || !availability?.available
				|| stored.configuration.generations[option.id] !== run.generation
				|| !isArtifactOptionEnabled(option, stored.configuration.values[option.id]) || stored.consent[option.id] !== artifactOptionConsent(option, binding.provider.actions)) {
				return localize('artifactAutomationPaused', "This artifact automation is paused or its authorization has changed.");
			}
		}
		return undefined;
	}

	private canDispatch(binding: IArtifactExecutionBinding, runId: string, token: CancellationToken): boolean {
		const run = this.getRun(runId);
		return !token.isCancellationRequested && !isArtifactRunSettled(run) && !this.blockedReason(binding, run);
	}

	private async trackPrompt(run: ArtifactRun, handle: IArtifactPromptHandle, reconciliation = false): Promise<void> {
		if (this._store.isDisposed || !this.runtime.isOwner()) {
			handle.dispose();
			throw new CancellationError();
		}
		const store = new DisposableStore();
		this.observations.set(run.id, store);
		store.add(handle);
		if (store.isDisposed) {
			throw new CancellationError();
		}
		this.promptHandles.set(run.id, handle);
		store.add(toDisposable(() => {
			if (this.promptHandles.get(run.id) === handle) {
				this.promptHandles.delete(run.id);
			}
		}));
		try {
			await this.updateRun(run.id, { state: handle.receipt.kind === 'queued' ? 'submitted' : 'running', receipt: handle.receipt, indeterminate: false }, reconciliation);
			if (store.isDisposed || !this.runtime.isOwner() || isArtifactRunSettled(this.getRun(run.id))) {
				store.dispose();
				return;
			}
			store.add(autorun(reader => {
				const state = handle.state.read(reader);
				if (state.kind === 'running') {
					this.recordPromptUpdate(run.id, handle, { state: 'running', receipt: { kind: 'turn', turnId: state.turnId } });
				}
			}));
			void this.completePrompt(run.id, handle).catch(error => this.logService.error('[ArtifactIntegrations] Could not track prompt outcome', error));
		} catch (error) {
			store.dispose();
			throw error;
		}
	}

	private async completePrompt(runId: string, handle: IArtifactPromptHandle): Promise<void> {
		let outcome: ArtifactPromptOutcome;
		try {
			outcome = await handle.completion;
		} catch (error) {
			this.recordPromptUpdate(runId, handle, { state: 'interrupted', indeterminate: true, reason: toErrorMessage(error) });
			return;
		}
		this.recordPromptUpdate(runId, handle, {
			state: outcome.kind, reason: outcome.reason, indeterminate: false,
			...(outcome.turnId ? { receipt: { kind: 'turn', turnId: outcome.turnId } } : {}),
		});
	}

	private recordPromptUpdate(runId: string, handle: IArtifactPromptHandle, update: Partial<ArtifactRun>): void {
		if (this.promptHandles.get(runId) !== handle || this._store.isDisposed || !this.runtime.isOwner() || isArtifactRunSettled(this.getRun(runId))) {
			return;
		}
		const persistence = this.updateRun(runId, update);
		this.inFlight.add(persistence);
		void persistence.catch(error => this.logService.error('[ArtifactIntegrations] Could not record prompt progress', error)).finally(() => {
			this.inFlight.delete(persistence);
			if (this.promptHandles.get(runId) === handle && isArtifactRunSettled(this.getRun(runId))) {
				this.observations.deleteAndDispose(runId);
			}
		});
	}

	cancel(bindingId: string, runId: string): Promise<void> {
		if (this.getRun(runId).bindingId !== bindingId) {
			return Promise.reject(new Error('Artifact run belongs to a different binding'));
		}
		let cancellation = this.cancellations.get(runId);
		if (!cancellation) {
			cancellation = this.cancelRun(bindingId, runId).finally(() => this.cancellations.delete(runId));
			this.cancellations.set(runId, cancellation);
		}
		return cancellation;
	}

	async revokeDisabled(bindingId: string): Promise<void> {
		const stored = this.requireStoredBinding(this.ledger.state.get(), bindingId);
		const binding = this.bindings.get(bindingId);
		for (const run of this.ledger.state.get().runs.filter(run => run.bindingId === bindingId && run.source === 'automation' && !isArtifactRunSettled(run))) {
			const option = (binding?.options ?? stored.options).find(option => option.id === run.optionId);
			if (!option || !isArtifactOptionEnabled(option, stored.configuration.values[option.id])
				|| stored.configuration.generations[option.id] !== run.generation
				|| (binding && stored.consent[option.id] !== artifactOptionConsent(option, binding.provider.actions))) {
				await this.cancel(bindingId, run.id);
			}
		}
	}

	private async cancelRun(bindingId: string, runId: string): Promise<void> {
		const run = this.getRun(runId);
		if (run.bindingId !== bindingId) {
			throw new Error('Artifact run belongs to a different binding');
		}
		if (isArtifactRunSettled(run)) {
			if (run.indeterminate) {
				throw new Error(localize('artifactCancelUnknown', "This action has an unknown outcome. Reconcile it before attempting cancellation."));
			}
			return;
		}
		this.active.get(runId)?.cancel();
		if (!run.dispatched) {
			await this.updateRun(runId, { state: 'cancelled', reason: localize('artifactActionCancelled', "Artifact action cancelled.") });
			this.observations.deleteAndDispose(runId);
		} else if (run.actionKind === 'prompt' && (run.receipt || this.promptHandles.has(runId))) {
			let handle = this.promptHandles.get(runId);
			if (!handle) {
				const binding = this.bindings.get(bindingId) ?? this.requireStoredBinding(this.ledger.state.get(), bindingId);
				const recovered = await this.runtime.chat.recover(this.promptRequest(binding, run), run.receipt, CancellationToken.None);
				if (recovered.kind === 'notSent') {
					await this.updateRun(runId, { state: 'cancelled', dispatched: false, indeterminate: false });
					return;
				}
				if (recovered.kind === 'indeterminate') {
					await this.updateRun(runId, { state: 'interrupted', indeterminate: true, reason: recovered.reason });
					throw new ArtifactPromptTrackingError(recovered.reason);
				}
				handle = recovered.handle;
				await this.trackPrompt(run, handle);
			}
			if (!isArtifactPromptOutcome(handle.state.get())) {
				await handle.cancel(CancellationToken.None);
			}
		} else if (!this.active.has(runId)) {
			throw new Error(localize('artifactCancellationUnknown', "This action's outcome is unknown and must be reconciled before it can be cancelled."));
		}
	}

	async recover(bindingId: string): Promise<void> {
		try {
			for (const run of this.ledger.state.get().runs.filter(run => run.bindingId === bindingId && (!isArtifactRunSettled(run) || run.indeterminate))) {
				if (run.dispatched) {
					await this.reconcile(bindingId, run.id);
				} else if (run.state === 'preparing') {
					await this.updateRun(run.id, { state: 'queued' });
				}
			}
		} finally {
			this.recovering.delete(bindingId);
		}
		await this.revokeDisabled(bindingId);
		this.wake();
	}

	async reconcile(bindingId: string, runId: string): Promise<void> {
		const run = this.getRun(runId);
		if (run.bindingId !== bindingId || this.active.has(runId)) {
			throw new Error('Cannot reconcile an unrelated or executing artifact run');
		}
		if (isArtifactRunSettled(run) && !run.indeterminate) {
			return;
		}
		const binding = this.requireBinding(bindingId);
		const action = this.requireAction(binding, run.actionId, false);
		if (action.kind === 'prompt' && run.prompt && run.chat) {
			const recovered = await this.runtime.chat.recover(this.promptRequest(binding, run), run.receipt, CancellationToken.None);
			if (recovered.kind === 'attached') {
				await this.trackPrompt(run, recovered.handle, true);
				return;
			}
			await this.updateRun(runId, { state: 'interrupted', indeterminate: recovered.kind !== 'notSent', dispatched: recovered.kind !== 'notSent', reason: recovered.kind === 'indeterminate' ? recovered.reason : localize('artifactPromptNotSent', "The prompt was not submitted.") }, true);
		} else {
			const result = action.kind === 'code' && action.reconcile
				? await action.reconcile(this.context(binding, run), CancellationToken.None)
				: { kind: 'indeterminate' as const, reason: localize('artifactCodeInterrupted', "The artifact action was interrupted. Its external outcome must be reconciled.") };
			await this.updateRun(runId, result.kind === 'completed'
				? { state: 'completed', indeterminate: false, reason: result.summary }
				: { state: 'interrupted', indeterminate: result.kind !== 'notExecuted', dispatched: result.kind !== 'notExecuted', reason: result.kind === 'indeterminate' ? result.reason : localize('artifactCodeNotExecuted', "The artifact action did not execute.") }, true);
		}
	}

	private promptRequest(binding: Pick<IArtifactExecutionBinding, 'session'>, run: ArtifactRun): ArtifactPromptRequest {
		if (!run.chat || !run.prompt) {
			throw new Error('Artifact prompt is missing its destination or content');
		}
		return { session: binding.session, chat: run.chat, requestId: run.id, prompt: run.prompt };
	}

	private context(binding: IArtifactExecutionBinding, run: ArtifactRun): IArtifactActionContext {
		return { authority: this.runtime.authority, session: binding.session, artifact: binding.artifact, integrationId: binding.integrationId, run };
	}

	private requireAction(binding: IArtifactExecutionBinding, actionId: string, manual: boolean): ArtifactAction {
		const action = binding.provider.actions.find(action => action.id === actionId);
		const view = binding.presentation.get();
		const offered = [...view.stateActions, ...view.generalActions].find(action => action.id === actionId);
		if (!action || (manual && !offered?.enabled)) {
			throw new Error(localize('artifactActionUnavailable', "This artifact action is no longer available."));
		}
		return action;
	}

	private requireBinding(id: string): IArtifactExecutionBinding {
		const binding = this.bindings.get(id);
		if (!binding) {
			throw new Error(localize('artifactIntegrationUnavailable', "This artifact integration is unavailable."));
		}
		return binding;
	}

	private requireStoredBinding(state: ArtifactIntegrationState, id: string): ArtifactStoredBinding {
		const binding = state.bindings.find(binding => binding.id === id);
		if (!binding) {
			throw new Error('Artifact binding is not persisted');
		}
		return binding;
	}

	private getRun(id: string): ArtifactRun {
		const run = this.ledger.state.get().runs.find(run => run.id === id);
		if (!run) {
			throw new Error('Artifact run not found');
		}
		return run;
	}

	private async updateRun(id: string, update: Partial<ArtifactRun>, reconciliation = false): Promise<void> {
		const current = this.getRun(id);
		if ((isArtifactRunSettled(current) && !(reconciliation && current.indeterminate)) || structuralEquals(current, { ...current, ...update })) {
			return;
		}
		await this.ledger.transact(state => {
			state.runs = state.runs.map(run => run.id === id && (!isArtifactRunSettled(run) || (reconciliation && run.indeterminate))
				? { ...run, ...update, updatedAt: Date.now() } : run);
		});
		if (isArtifactRunSettled(this.getRun(id))) {
			this.wake();
		}
	}

	async whenIdle(): Promise<void> {
		while (this.inFlight.size || this.cancellations.size) {
			await Promise.allSettled([...this.inFlight, ...this.cancellations.values()]);
		}
	}

	override dispose(): void {
		for (const token of this.active.values()) {
			token.cancel();
		}
		super.dispose();
	}
}
