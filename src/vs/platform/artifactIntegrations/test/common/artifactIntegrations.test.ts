/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue, waitForState } from '../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactAction, ArtifactAuthenticationRequiredError, ArtifactAutomationOption, ArtifactContributionView, ArtifactDetails, ArtifactPromptReceipt, ArtifactRecord, IArtifactAutomationContext, IArtifactBindingContext, IArtifactDetailsModel, IArtifactIntegration, IArtifactIntegrationBinding, isArtifactRunSettled } from '../../common/artifactIntegration.js';
import { applyArtifactAutomationSelection, disableArtifactAutomation, reconcileArtifactAutomationOptions } from '../../common/artifactAutomationConfiguration.js';
import { ArtifactIntegrationRegistry } from '../../common/artifactIntegrationRegistry.js';
import { ArtifactIntegrationService } from '../../common/artifactIntegrationService.js';
import { ArtifactConfigurationConflictError, ArtifactIntegrationState, ArtifactIntegrationStore, ArtifactRetryLimitError } from '../../common/artifactIntegrationStore.js';
import { ArtifactAutomationNotice, ArtifactPromptOutcome, ArtifactPromptRequest, ArtifactPromptState, ArtifactPromptTrackingError, ArtifactSessionState, ArtifactStorageCommitError, IArtifactIntegrationStorage, IArtifactPromptHandle, IArtifactRuntime, isArtifactPromptOutcome, selectArtifactCoordinator } from '../../common/artifactRuntime.js';

class MemoryStorage implements IArtifactIntegrationStorage {
	value: string | undefined;
	failure: Error | undefined;
	barrier: DeferredPromise<void> | undefined;
	beforeWrite: ((value: string) => Promise<void>) | undefined;

	async read() { return this.value; }

	async write(value: string): Promise<void> {
		await this.beforeWrite?.(value);
		await this.barrier?.p;
		if (this.failure) {
			throw this.failure;
		}
		this.value = value;
	}
}

class TestPromptHandle extends Disposable implements IArtifactPromptHandle {
	private readonly lifetime = this._register(new CancellationTokenSource());
	private completionPromise: Promise<ArtifactPromptOutcome> | undefined;
	cancelCalls = 0;

	constructor(
		readonly requestId: string,
		readonly receipt: ArtifactPromptReceipt,
		readonly state: ISettableObservable<ArtifactPromptState>,
	) {
		super();
	}

	get completion(): Promise<ArtifactPromptOutcome> {
		return this.completionPromise ??= waitForState(this.state, isArtifactPromptOutcome,
			state => state.kind === 'indeterminate' ? new ArtifactPromptTrackingError(state.reason) : undefined, this.lifetime.token);
	}

	async cancel(_token: CancellationToken): Promise<void> {
		this.cancelCalls++;
		this.state.set({ kind: 'cancelled', reason: 'Cancelled' }, undefined);
	}

	override dispose(): void {
		this.lifetime.cancel();
		super.dispose();
	}
}

class TestBinding extends Disposable implements IArtifactIntegrationBinding {
	readonly view;
	readonly details = observableValue<ArtifactDetails>(this, { title: 'Details', availability: { kind: 'available' }, facts: [], links: [], items: [], completeness: 'complete' });
	automation: IArtifactAutomationContext | undefined;
	detailsOpened = 0;
	detailsClosed = 0;

	constructor(readonly context: IArtifactBindingContext, readonly actions: readonly ArtifactAction[], options: readonly ArtifactAutomationOption[]) {
		super();
		this.view = observableValue<ArtifactContributionView>(this, {
			availability: { kind: 'available' },
			main: { icon: { id: 'link' }, label: 'Resource', detailsId: 'main' },
			sections: [],
			stateActions: actions.map(action => ({ id: action.id, enabled: true })),
			generalActions: [],
			automationAvailability: options.map(option => ({ id: option.id, available: true })),
		});
	}

	acquireDetails(): IArtifactDetailsModel {
		this.detailsOpened++;
		const lifetime = toDisposable(() => this.detailsClosed++);
		return { details: this.details, dispose: () => lifetime.dispose() };
	}

	activateAutomation(context: IArtifactAutomationContext) {
		this.automation = context;
		return toDisposable(() => {
			if (this.automation === context) {
				this.automation = undefined;
			}
		});
	}
}

const artifact: ArtifactRecord = { id: 'artifact', label: 'Example', resource: 'https://example.test/resource', origin: { chat: 'origin-chat', turnId: 'origin-turn' } };
const codeAction: ArtifactAction = {
	id: 'act', label: 'Act', iconId: 'play', kind: 'code', executionScope: 'resource',
	prepare: async () => ({ kind: 'ready', value: { run: async () => ({ kind: 'completed', summary: 'Done' }) } }),
};

function fixture(store: DisposableStore, action: ArtifactAction = codeAction, storage = new MemoryStorage(), record = artifact, optionDefinitions?: readonly ArtifactAutomationOption[]) {
	const registry = store.add(new ArtifactIntegrationRegistry());
	const bindings: TestBinding[] = [];
	let credentialScope = 'account-a';
	let canonicalKey: string | undefined;
	let resources = 0;
	let disposedResources = 0;
	let authenticationRequired = false;
	let authenticationHook: ((token: CancellationToken) => Promise<void>) | undefined;
	const authenticationRequests: string[] = [];
	const changed = store.add(new Emitter<void>());
	const options: readonly ArtifactAutomationOption[] = optionDefinitions ?? [{ id: 'automatic', kind: 'boolean', label: 'Automatically Act', description: 'Run Act automatically.', defaultValue: false, actionIds: [action.id], maxAttempts: 2 }];
	const integration: IArtifactIntegration<DisposableStore> = {
		id: 'test', label: 'Test', automationOptions: options,
		onDidChange: changed.event,
		match: resource => {
			if (authenticationRequired) {
				throw new ArtifactAuthenticationRequiredError('Sign in to continue.', { label: 'Resource', icon: { id: 'link' }, detailsId: 'main' });
			}
			return { resource, key: canonicalKey ?? resource.toString(), credentialScope };
		},
		getAuthenticationRequest: async (resource, token) => {
			authenticationRequests.push(resource.toString());
			await authenticationHook?.(token);
			return { resource: resource.toString(), scopes: ['read'] };
		},
		createResource: async () => {
			resources++;
			const resource = new DisposableStore();
			resource.add(toDisposable(() => disposedResources++));
			return resource;
		},
		createBinding: (_resource, context) => {
			const binding = new TestBinding(context, [action], options);
			bindings.push(binding);
			return binding;
		},
	};
	const registration = store.add(registry.register(integration, 'test-runtime'));
	const available = observableValue('available', true);
	const enabled = observableValue('enabled', true);
	const session = observableValue<ArtifactSessionState>('session', { availability: { kind: 'available' }, archived: false, artifacts: [record] });
	const progress = observableValue<ArtifactPromptState>('progress', { kind: 'submitted' });
	const submitted: ArtifactPromptRequest[] = [];
	const notices: ArtifactAutomationNotice[] = [];
	const recovered: { requestId: string; receipt: ArtifactPromptReceipt | undefined }[] = [];
	const handles: TestPromptHandle[] = [];
	const createHandle = (request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt) => {
		const handle = new TestPromptHandle(request.requestId, receipt, progress);
		handles.push(handle);
		return handle;
	};
	const deletedSessions = store.add(new Emitter<string>());
	const runtime: IArtifactRuntime = {
		authority: { id: 'test-authority', targetHost: 'test-host', location: 'host' },
		available, enabled,
		isOwner: () => !store.isDisposed,
		acquireSession: async () => ({ object: session, dispose() { } }),
		onDidDeleteSession: deletedSessions.event,
		authorize: async () => ({ kind: 'allowed' }),
		postNotice: async notice => { notices.push(notice); },
		chat: {
			admission: 'bestEffort',
			observeChat: () => ({ state: constObservable({ available: true, busy: false }), dispose() { } }),
			submit: async request => {
				submitted.push(request);
				return { kind: 'accepted', handle: createHandle(request, { kind: 'queued', queuedMessageId: request.requestId }) };
			},
			recover: async (request, receipt) => {
				recovered.push({ requestId: request.requestId, receipt });
				return receipt ? { kind: 'attached', handle: createHandle(request, receipt) } : { kind: 'indeterminate', reason: 'No acknowledgement' };
			},
		},
	};
	const service = store.add(new ArtifactIntegrationService(runtime, storage, registry, store.add(new NullLogService())));
	return {
		service, registry, registration, integration, bindings, available, enabled, session, progress, submitted, notices, recovered, handles, runtime, storage, authenticationRequests,
		counts: () => ({ resources, disposedResources }),
		setCredentialScope: (scope: string) => { credentialScope = scope; },
		setCanonicalKey: (key: string) => { canonicalKey = key; },
		setAuthenticationRequired: (required: boolean) => { authenticationRequired = required; changed.fire(); },
		deleteSession: (id: string) => deletedSessions.fire(id),
		onAuthentication: (hook: (token: CancellationToken) => Promise<void>) => { authenticationHook = hook; },
	};
}

suite('Artifact Integrations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function run(body: (store: DisposableStore) => Promise<void>): Promise<void> {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const store = disposables.add(new DisposableStore());
			try {
				await body(store);
			} finally {
				store.dispose();
			}
		});
	}

	test('falls back only for positively unsupported hosts and never changes an existing authority', () => {
		assert.deepStrictEqual([
			selectArtifactCoordinator('supported', true, true),
			selectArtifactCoordinator('unsupported', true, true),
			selectArtifactCoordinator('pending', true, true),
			selectArtifactCoordinator('unsupported', false, true),
			selectArtifactCoordinator('unsupported', true, false),
			selectArtifactCoordinator('unsupported', true, true, 'host'),
			selectArtifactCoordinator('supported', true, true, 'client'),
		], [
			{ kind: 'host' }, { kind: 'client' },
			{ kind: 'unavailable', reason: 'pending' },
			{ kind: 'unavailable', reason: 'disconnected' },
			{ kind: 'unavailable', reason: 'denied' },
			{ kind: 'unavailable', reason: 'authorityChanged' },
			{ kind: 'unavailable', reason: 'authorityChanged' },
		]);
	});

	test('feature enablement pauses and restores saved consent without observing disabled integrations', () => run(async store => {
		const firstStore = store.add(new DisposableStore());
		const first = fixture(firstStore);
		const reference = firstStore.add(await first.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const completed = await first.bindings[0].automation!.runAutomation({
			optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'completed-before-toggle', reason: 'Due',
		});
		await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(run => run.id === completed.id && run.state === 'completed'));
		await first.service.whenIdle();
		const saved = first.storage.value;
		firstStore.dispose();
		await first.service.whenIdle();
		const f = fixture(store, codeAction, first.storage);
		f.enabled.set(false, undefined);
		await f.service.initialize();
		await assert.rejects(f.service.acquireArtifact('session', artifact.id), /disabled/);
		const initiallyDisabled = f.counts();
		f.enabled.set(true, undefined);
		await timeout(0);
		const resumed = !!f.bindings.at(-1)?.automation;
		f.enabled.set(false, undefined);
		await f.service.whenIdle();
		await timeout(0);
		assert.deepStrictEqual({
			initiallyDisabled, resumed, active: f.bindings.some(binding => !!binding.automation),
			counts: f.counts(), unchanged: f.storage.value === saved,
		}, {
			initiallyDisabled: { resources: 0, disposedResources: 0 }, resumed: true, active: false,
			counts: { resources: 1, disposedResources: 1 }, unchanged: true,
		});
	}));

	for (const busy of [false, true]) {
		test(`disabling integrations stops ${busy ? 'queued' : 'submitted'} automation without cancelling manual work or revoking consent`, () => run(async store => {
			const action: ArtifactAction = { id: 'act', label: 'Act', iconId: 'play', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Act' } }) };
			const f = fixture(store, action);
			f.runtime.chat.observeChat = () => ({ state: constObservable({ available: true, busy }), dispose() { } });
			const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
			await reference.object.configure('test', 0, { automatic: true });
			const automatic = await f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'first', reason: 'Due' });
			await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(run => run.id === automatic.id && run.state === (busy ? 'blocked' : 'submitted')));
			const manual = await reference.object.invoke('test', 'act', 'manual-chat', 'manual');
			await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(run => run.id === manual.id && run.state === 'blocked'));
			const consent = reference.object.snapshot.get().contributions[0].configuration;
			f.enabled.set(false, undefined);
			await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(run => run.id === automatic.id && run.state === 'cancelled'));
			await f.service.whenIdle();
			assert.deepStrictEqual({
				runs: reference.object.snapshot.get().runs.map(run => [run.source, run.state]),
				cancellations: f.handles.map(handle => handle.cancelCalls),
				consent: reference.object.snapshot.get().contributions[0].configuration,
			}, { runs: [['automation', 'cancelled'], ['manual', 'blocked']], cancellations: busy ? [] : [1], consent });
		}));
	}

	test('connection unavailability pauses automation without cancelling an accepted prompt', () => run(async store => {
		const f = fixture(store, { id: 'act', label: 'Act', iconId: 'play', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Act' } }) });
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const requested = await f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'first', reason: 'Due' });
		await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(run => run.id === requested.id && run.state === 'submitted'));
		f.available.set(false, undefined);
		await f.service.whenIdle();
		assert.deepStrictEqual({
			state: reference.object.snapshot.get().runs[0].state, cancellations: f.handles[0].cancelCalls,
			enabled: reference.object.snapshot.get().contributions[0].configuration.values.automatic,
		}, { state: 'submitted', cancellations: 0, enabled: true });
	}));

	test('switching off and back on while an automation claim is being saved cannot revive that work', () => run(async store => {
		let effects = 0;
		const f = fixture(store, {
			...codeAction,
			prepare: async () => ({ kind: 'ready', value: { run: async () => { effects++; return { kind: 'completed', summary: 'Done' }; } } }),
		});
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const saving = new DeferredPromise<void>();
		const saved = new DeferredPromise<void>();
		f.storage.beforeWrite = async value => {
			const state: ArtifactIntegrationState = JSON.parse(value);
			if (state.runs.some(run => run.state === 'queued')) {
				void saving.complete();
				await saved.p;
			}
		};
		const request = f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'before-switch', reason: 'Due' });
		await saving.p;
		f.enabled.set(false, undefined);
		f.enabled.set(true, undefined);
		await saved.complete();
		await request;
		await timeout(0);
		await f.service.whenIdle();
		assert.deepStrictEqual({
			effects, runs: reference.object.snapshot.get().runs.map(run => [run.state, run.dispatched]),
			consent: reference.object.snapshot.get().contributions[0].configuration.values,
		}, { effects: 0, runs: [['cancelled', false]], consent: { automatic: true } });
	}));

	test('shares resource observation but not session consent, and isolates credential scopes', () => run(async store => {
		const f = fixture(store);
		const a = store.add(await f.service.acquireArtifact('session-a', artifact.id));
		const b = store.add(await f.service.acquireArtifact('session-b', artifact.id));
		await a.object.configure('test', 0, { automatic: true });
		f.setCredentialScope('account-b');
		const c = store.add(await f.service.acquireArtifact('session-c', artifact.id));
		assert.deepStrictEqual({
			resources: f.counts().resources,
			configurations: [a, b, c].map(reference => reference.object.snapshot.get().contributions[0].configuration.values),
			automations: f.bindings.map(binding => !!binding.automation),
		}, { resources: 2, configurations: [{ automatic: true }, { automatic: false }, { automatic: false }], automations: [true, false, false] });
		await a.object.configure('test', 1, { automatic: false });
		a.dispose(); b.dispose(); c.dispose();
		await f.service.whenIdle();
		assert.deepStrictEqual(f.counts(), { resources: 2, disposedResources: 2 });
	}));

	test('observing an artifact stores nothing until its first change, which records who asked', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const observed = f.service.ledger.state.get().bindings.length;
		const invalid = await reference.object.configure('test', 0, { automatic: 'yes' }).catch((error: Error) => error.message);
		await reference.object.configure('test', 0, { automatic: true }, { kind: 'agent', chat: 'agent-chat', turnId: 'agent-turn' });
		const run = await reference.object.invoke('test', 'act', 'chat', 'manual', { kind: 'agent', chat: 'chat', turnId: 'turn' });
		await f.service.whenIdle();
		await timeout(0);
		assert.deepStrictEqual({
			observed,
			invalid,
			stored: f.service.ledger.state.get().bindings.map(binding => binding.integrationId),
			grants: reference.object.snapshot.get().contributions[0].configuration.grants,
			run: { integrationId: run.integrationId, requestedBy: run.requestedBy },
			notices: f.notices.map(notice => notice.content.split('\n\n').at(-1)),
		}, {
			observed: 0,
			invalid: '"automatic" takes true or false.',
			stored: ['test'],
			grants: { automatic: { kind: 'agent', chat: 'agent-chat', turnId: 'agent-turn' } },
			run: { integrationId: 'test', requestedBy: { kind: 'agent', chat: 'chat', turnId: 'turn' } },
			notices: ['Requested by the agent and confirmed by you.'],
		});
	}));

	test('a deleted session loses its bindings and history once nothing is running, but keeps uncertain effects', () => run(async store => {
		const gate = new DeferredPromise<void>();
		const f = fixture(store, {
			...codeAction,
			prepare: async context => ({
				kind: 'ready', value: {
					run: async () => {
						if (context.run.requestId === 'uncertain') {
							throw new Error('Connection lost after effect');
						}
						if (context.run.requestId === 'running') {
							await gate.p;
						}
						return { kind: 'completed', summary: 'Done' };
					},
				},
			}),
		});
		const invoke = async (session: string, requestId: string) => {
			const reference = store.add(await f.service.acquireArtifact(session, artifact.id));
			await reference.object.configure('test', 0, { automatic: true });
			return reference.object.invoke('test', 'act', 'chat', requestId);
		};
		const finished = await invoke('finished-session', 'finished');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === finished.id && isArtifactRunSettled(run)));
		await f.service.acquireArtifact('kept-session', artifact.id).then(reference => store.add(reference).object.configure('test', 0, { automatic: true }));
		await invoke('running-session', 'running');
		// Queued behind the running action on the same resource.
		const uncertain = await invoke('uncertain-session', 'uncertain');
		for (const session of ['uncertain-session', 'running-session', 'finished-session', 'unknown-session']) {
			f.deleteSession(session);
		}
		const whileRunning = await waitForState(f.service.ledger.state, state => !state.bindings.some(binding => binding.session === 'finished-session'));
		gate.complete();
		await waitForState(f.service.ledger.state, state => !state.bindings.some(binding => binding.session === 'running-session')
			&& state.runs.some(run => run.id === uncertain.id && run.indeterminate === true));
		await timeout(0);
		await f.service.whenIdle();
		const settled = f.service.ledger.state.get();
		assert.deepStrictEqual({
			whileRunning: whileRunning.bindings.map(binding => binding.session),
			settled: { bindings: settled.bindings.map(binding => binding.session), runs: settled.runs.map(run => [run.id, run.indeterminate]) },
		}, {
			whileRunning: ['kept-session', 'running-session', 'uncertain-session'],
			settled: { bindings: ['kept-session', 'uncertain-session'], runs: [[uncertain.id, true]] },
		});
	}));

	test('integrations that sign in within their own runtime need no credential handler', () => run(async store => {
		const f = fixture(store);
		const signIns: string[] = [];
		let signedIn = false;
		const changed = store.add(new Emitter<void>());
		store.add(f.registry.register({
			id: 'self', label: 'Self', automationOptions: [], onDidChange: changed.event,
			match: resource => {
				if (!signedIn) {
					throw new ArtifactAuthenticationRequiredError('Sign in to Self.', { label: 'Self', icon: { id: 'account' }, detailsId: 'main' });
				}
				return { resource, key: resource.toString(), credentialScope: 'self-account' };
			},
			signIn: async resource => {
				signIns.push(resource.toString());
				signedIn = true;
				changed.fire();
			},
			createResource: async () => new DisposableStore(),
			createBinding: (_resource, context) => new TestBinding(context, [], []),
		}, 'self-runtime'));
		const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
		const before = model.snapshot.get().contributions.find(contribution => contribution.integrationId === 'self')?.authentication;
		const challenge = await model.requestAuthentication('self');
		const after = await waitForState(model.snapshot, snapshot => snapshot.contributions.find(contribution => contribution.integrationId === 'self')?.view.availability.kind === 'available');
		assert.deepStrictEqual({
			before, challenge, signIns,
			after: after.contributions.find(contribution => contribution.integrationId === 'self')?.authentication,
			conflicting: (() => {
				try {
					f.registry.register({ ...f.integration, id: 'both', signIn: async () => { } }, 'both-runtime');
					return 'registered';
				} catch (error) {
					return (error as Error).message;
				}
			})(),
		}, {
			before: { enabled: true, handledByIntegration: true },
			challenge: undefined,
			signIns: [artifact.resource],
			after: undefined,
			conflicting: 'Invalid or duplicate artifact integration: both',
		});
	}));

	test('duplicate automation references fail closed and a valid snapshot restores the binding', () => run(async store => {
		const f = fixture(store);
		const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
		const binding = f.bindings[0];
		const valid = binding.view.get();
		binding.view.set({ ...valid, automationAvailability: [...valid.automationAvailability, ...valid.automationAvailability] }, undefined);
		const invalidKind = model.snapshot.get().contributions[0].view.availability.kind;
		const invalidAutomationActive = !!binding.automation;
		await assert.rejects(model.configure('test', 0, { automatic: true }));
		binding.view.set(valid, undefined);
		await model.configure('test', 0, { automatic: true });
		assert.deepStrictEqual({
			invalidKind, invalidAutomationActive, restoredKind: model.snapshot.get().contributions[0].view.availability.kind,
			automationActive: !!binding.automation, runs: model.snapshot.get().runs,
		}, { invalidKind: 'error', invalidAutomationActive: false, restoredKind: 'available', automationActive: true, runs: [] });
	}));

	test('authentication recovery exposes a preview without creating an account binding or action run', () => run(async store => {
		const f = fixture(store);
		f.setAuthenticationRequired(true);
		const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
		const details = store.add(await model.acquireDetails('test', 'main'));
		const request = await model.requestAuthentication('test');
		await assert.rejects(model.invoke('test', 'act', 'chat', 'request'));
		await assert.rejects(model.configure('test', 0, { automatic: true }));
		assert.deepStrictEqual({
			main: model.snapshot.get().mainIntegrationId,
			availability: model.snapshot.get().contributions[0].view.availability,
			authentication: model.snapshot.get().contributions[0].authentication,
			actions: model.snapshot.get().contributions[0].actions,
			details: details.details.get(),
			request, requests: f.authenticationRequests,
			bindings: f.service.ledger.state.get().bindings, runs: f.service.ledger.state.get().runs,
			resources: f.counts().resources, prompts: f.submitted,
		}, {
			main: 'test',
			availability: { kind: 'authenticationRequired', reason: 'Sign in to continue.' },
			authentication: { enabled: true }, actions: [],
			details: { title: 'Resource', availability: { kind: 'authenticationRequired', reason: 'Sign in to continue.' }, links: [], items: [], completeness: 'complete' },
			request: { resource: artifact.resource, scopes: ['read'] }, requests: [artifact.resource],
			bindings: [], runs: [], resources: 0, prompts: [],
		});
	}));

	test('preventing new consent does not pause an already enabled automation', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const binding = f.bindings[0];
		binding.view.set({
			...binding.view.get(),
			automationAvailability: [{ id: 'automatic', available: true, enablement: { enabled: false, disabledReason: 'New schedules require a running resource.' } }],
		}, undefined);
		assert.ok(binding.automation);
		const run = await binding.automation.runAutomation({
			optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'already-scheduled', reason: 'An existing schedule is due',
		});
		await waitForState(reference.object.snapshot, snapshot => snapshot.runs.some(candidate => candidate.id === run.id && isArtifactRunSettled(candidate)));
		await reference.object.configure('test', 1, { automatic: false });
		await assert.rejects(reference.object.configure('test', 2, { automatic: true }));
		assert.deepStrictEqual({
			runs: reference.object.snapshot.get().runs.map(run => run.state),
			values: reference.object.snapshot.get().contributions[0].configuration.values,
		}, { runs: ['completed'], values: { automatic: false } });
	}));

	test('losing credentials between matching and resource creation also exposes recovery', () => run(async store => {
		const f = fixture(store);
		f.integration.createResource = async () => {
			throw new ArtifactAuthenticationRequiredError('Credentials expired.', { label: 'Resource', icon: { id: 'link' }, detailsId: 'main' });
		};
		const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
		assert.deepStrictEqual({
			availability: model.snapshot.get().contributions[0].view.availability,
			request: await model.requestAuthentication('test'),
			bindings: f.service.ledger.state.get().bindings,
		}, {
			availability: { kind: 'authenticationRequired', reason: 'Credentials expired.' },
			request: { resource: artifact.resource, scopes: ['read'] },
			bindings: [],
		});
	}));

	for (const state of ['coordinator', 'session', 'deleted', 'removed', 'replaced', 'owner', 'registration'] as const) {
		test(`authentication recovery is blocked when ${state} becomes unavailable`, () => run(async store => {
			const f = fixture(store);
			f.setAuthenticationRequired(true);
			const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
			switch (state) {
				case 'coordinator': f.available.set(false, undefined); break;
				case 'session': f.session.set({ ...f.session.get(), availability: { kind: 'unavailable', reason: 'Disconnected' } }, undefined); break;
				case 'deleted': f.session.set({ ...f.session.get(), deleted: true }, undefined); break;
				case 'removed': f.session.set({ ...f.session.get(), artifacts: [] }, undefined); break;
				case 'replaced': f.session.set({ ...f.session.get(), artifacts: [{ ...artifact, resource: 'https://other.test/resource' }] }, undefined); break;
				case 'owner': f.runtime.isOwner = () => false; break;
				case 'registration': f.setAuthenticationRequired(true); break;
			}
			await assert.rejects(model.requestAuthentication('test'));
			assert.deepStrictEqual(f.authenticationRequests, []);
		}));
	}

	test('an in-flight authentication request is cancelled when its artifact disappears', () => run(async store => {
		const f = fixture(store);
		f.setAuthenticationRequired(true);
		const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
		let token: CancellationToken | undefined;
		const barrier = new DeferredPromise<void>();
		f.onAuthentication(async value => { token = value; await barrier.p; });
		const request = model.requestAuthentication('test');
		const rejection = assert.rejects(request, isCancellationError);
		f.session.set({ ...f.session.get(), artifacts: [] }, undefined);
		await rejection;
		await barrier.complete();
		assert.deepStrictEqual({ cancelled: token?.isCancellationRequested, runs: f.service.ledger.state.get().runs }, { cancelled: true, runs: [] });
	}));

	for (const account of ['same', 'different'] as const) {
		test(`sign-in with the ${account} account never transfers saved automation consent`, () => run(async store => {
			const f = fixture(store);
			const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
			await model.configure('test', 0, { automatic: true });
			f.setAuthenticationRequired(true);
			await waitForState(model.snapshot, snapshot => snapshot.contributions[0]?.view.availability.kind === 'authenticationRequired');
			const paused = f.bindings.every(binding => !binding.automation);
			await model.requestAuthentication('test');
			if (account === 'different') {
				f.setCredentialScope('account-b');
			}
			f.setAuthenticationRequired(false);
			await waitForState(model.snapshot, snapshot => snapshot.contributions[0]?.view.availability.kind === (account === 'same' ? 'available' : 'error'));
			assert.deepStrictEqual({
				paused,
				active: !!f.bindings.at(-1)?.automation,
				stored: f.service.ledger.state.get().bindings.map(binding => ({ account: binding.credentialScope, consent: binding.configuration.values })),
				runs: f.service.ledger.state.get().runs,
			}, {
				paused: true, active: account === 'same',
				stored: [{ account: 'account-a', consent: { automatic: true } }], runs: [],
			});
		}));
	}

	test('shares detail leases and retains the binding after its main consumer closes', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const first = store.add(await reference.object.acquireDetails('test', 'main'));
		const second = store.add(await reference.object.acquireDetails('test', 'main'));
		reference.dispose();
		first.dispose();
		f.bindings[0].details.set({ ...f.bindings[0].details.get(), title: 'Updated' }, undefined);
		assert.deepStrictEqual({ title: second.details.get().title, opened: f.bindings[0].detailsOpened, closed: f.bindings[0].detailsClosed }, { title: 'Updated', opened: 1, closed: 0 });
		second.dispose();
		await f.service.whenIdle();
		assert.deepStrictEqual({ closed: f.bindings[0].detailsClosed, resources: f.counts() }, { closed: 1, resources: { resources: 1, disposedResources: 1 } });
	}));

	test('persists before publishing and rejects competing configuration revisions', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		f.storage.barrier = new DeferredPromise<void>();
		const first = reference.object.configure('test', 0, { automatic: true });
		const second = reference.object.configure('test', 0, { automatic: false });
		const results = Promise.allSettled([first, second]);
		assert.deepStrictEqual(reference.object.snapshot.get().contributions[0].configuration.values, { automatic: false });
		await f.storage.barrier.complete();
		const settled = await results;
		assert.deepStrictEqual(settled.map(result => result.status === 'fulfilled' ? 'saved' : result.reason instanceof ArtifactConfigurationConflictError ? 'conflict' : 'unexpected'), ['saved', 'conflict']);
	}));

	test('failed persistence never publishes consent and prevents later writes', async () => {
		const storage = new MemoryStorage();
		const ledger = new ArtifactIntegrationStore('authority', storage, () => true);
		await ledger.initialize();
		const store = (state: ArtifactIntegrationState) => {
			state.bindings.push({
				id: 'binding', session: 'session', artifact, integrationId: 'test', runtimeId: 'runtime', credentialScope: 'account', resourceKey: artifact.resource,
				options: [], consent: {}, configuration: { revision: 0, values: {}, generations: {}, disablements: {} }, checkpoint: { revision: 0 },
			});
		};
		storage.failure = new Error('Disk full');
		await assert.rejects(ledger.transact(store), /Disk full/);
		storage.failure = undefined;
		await assert.rejects(ledger.transact(store), /Disk full/);
		assert.deepStrictEqual({ revision: ledger.state.get().revision, stored: storage.value }, { revision: 0, stored: undefined });
	});

	test('uncertain durability publishes the committed consent but prevents further changes and dispatch', () => run(async store => {
		const storage = new class extends MemoryStorage {
			override async write(value: string): Promise<void> {
				await super.write(value);
				throw new ArtifactStorageCommitError(new Error('Directory sync failed'));
			}
		}();
		const f = fixture(store, codeAction, storage);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await assert.rejects(reference.object.configure('test', 0, { automatic: true }), ArtifactStorageCommitError);
		await assert.rejects(reference.object.configure('test', 1, { automatic: false }), ArtifactStorageCommitError);
		await assert.rejects(reference.object.invoke('test', 'act', 'chat', 'request'), ArtifactStorageCommitError);
		assert.deepStrictEqual({
			configuration: reference.object.snapshot.get().contributions[0].configuration.values,
			stored: JSON.parse(storage.value!),
			runs: reference.object.snapshot.get().runs,
		}, { configuration: { automatic: true }, stored: f.service.ledger.state.get(), runs: [] });
	}));

	test('configuration transitions preserve enablement metadata', () => {
		const option: ArtifactAutomationOption = { id: 'automatic', kind: 'boolean', label: 'Automatically Act', description: 'Run automatically.', defaultValue: false, actionIds: ['act'], maxAttempts: 2 };
		const enabled = applyArtifactAutomationSelection(
			{ revision: 0, values: { automatic: false }, generations: { automatic: 0 }, disablements: {} },
			[option],
			{},
			{ automatic: true },
			{ automatic: 'consent' },
			42,
			{ kind: 'agent', chat: 'chat', turnId: 'turn' },
		);
		const reconciled = reconcileArtifactAutomationOptions(
			[option],
			[option],
			enabled.configuration,
			enabled.consent,
			[codeAction],
			'Consent changed',
		);
		const disabled = disableArtifactAutomation(reconciled.configuration, option, 'Provider disabled');
		assert.deepStrictEqual({
			enabled: enabled.configuration,
			reconciled: reconciled.configuration,
			disabled,
		}, {
			enabled: { revision: 1, values: { automatic: true }, generations: { automatic: 1 }, enabledAt: { automatic: 42 }, grants: { automatic: { kind: 'agent', chat: 'chat', turnId: 'turn' } }, disablements: {} },
			reconciled: { revision: 2, values: { automatic: false }, generations: { automatic: 1 }, enabledAt: { automatic: 42 }, grants: { automatic: { kind: 'agent', chat: 'chat', turnId: 'turn' } }, disablements: { automatic: { reason: 'Consent changed', attempts: 0 } } },
			disabled: { revision: 3, values: { automatic: false }, generations: { automatic: 1 }, enabledAt: { automatic: 42 }, grants: { automatic: { kind: 'agent', chat: 'chat', turnId: 'turn' } }, disablements: { automatic: { reason: 'Provider disabled', attempts: 0 } } },
		});
	});

	test('a provider can revoke but not broaden automation consent, with revision fencing', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automation = f.bindings[0].automation!;
		await assert.rejects(automation.disableAutomation('automatic', 0, 'Checkout changed'), ArtifactConfigurationConflictError);
		await assert.rejects(automation.disableAutomation('missing', 1, 'Checkout changed'), /registered option/);
		await automation.disableAutomation('automatic', 1, 'Checkout changed');
		assert.deepStrictEqual(reference.object.snapshot.get().contributions[0].configuration, {
			revision: 2, values: { automatic: false }, generations: { automatic: 1 },
			enabledAt: { automatic: 0 }, grants: { automatic: { kind: 'user' } },
			disablements: { automatic: { reason: 'Checkout changed', attempts: 0 } },
		});
	}));

	test('integration changes retry failed matching and preserve registration lifetime', () => run(async store => {
		const f = fixture(store);
		const changed = store.add(new Emitter<void>());
		let ready = false;
		const registration = store.add(f.registry.register({
			...f.integration, id: 'refreshable', onDidChange: changed.event,
			match: resource => {
				if (!ready) {
					throw new Error('Authentication required');
				}
				return { resource, key: resource.toString(), credentialScope: 'account' };
			},
		}, 'refreshable'));
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const before = reference.object.snapshot.get().contributions.find(contribution => contribution.integrationId === 'refreshable')?.view.availability.kind;
		ready = true;
		changed.fire();
		await waitForState(reference.object.snapshot, snapshot => snapshot.contributions.some(contribution => contribution.integrationId === 'refreshable' && contribution.view.availability.kind === 'available'));
		registration.dispose();
		assert.deepStrictEqual({ before, registered: f.registry.integrations.get().map(integration => integration.id) }, { before: 'error', registered: ['test'] });
	}));

	for (const phase of ['match', 'createResource'] as const) {
		test(`integration changes during initial ${phase} refresh the replacement registration`, () => run(async store => {
			const f = fixture(store);
			const started = new DeferredPromise<void>();
			const resume = new DeferredPromise<void>();
			let calls = 0;
			if (phase === 'match') {
				const match = f.integration.match;
				f.integration.match = async (...args) => {
					if (++calls === 1) {
						void started.complete();
						await resume.p;
					}
					return match(...args);
				};
			} else {
				const createResource = f.integration.createResource;
				f.integration.createResource = async (...args) => {
					if (++calls === 1) {
						void started.complete();
						await resume.p;
					}
					return createResource(...args);
				};
			}
			const acquiring = f.service.acquireArtifact('session', artifact.id);
			await started.p;
			f.setAuthenticationRequired(false);
			await resume.complete();
			const reference = store.add(await acquiring);
			await timeout(0);
			assert.deepStrictEqual({
				calls,
				contributions: reference.object.snapshot.get().contributions.map(contribution => [contribution.integrationId, contribution.view.availability.kind]),
			}, { calls: 2, contributions: [['test', 'available']] });
		}));
	}

	test('retrying an accepted manual request does not require the action to remain available', () => run(async store => {
		let effects = 0;
		const f = fixture(store, {
			...codeAction,
			prepare: async () => ({ kind: 'ready', value: { run: async () => { effects++; return { kind: 'completed', summary: 'Done' }; } } }),
		});
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const original = await reference.object.invoke('test', 'act', 'chat', 'request');
		await waitForState(reference.object.snapshot, snapshot => snapshot.runs[0]?.state === 'completed');
		f.bindings[0].view.set({ ...f.bindings[0].view.get(), stateActions: [] }, undefined);
		const repeated = await reference.object.invoke('test', 'act', 'chat', 'request');
		await assert.rejects(reference.object.invoke('test', 'act', 'other-chat', 'request'), /different arguments/);
		await assert.rejects(reference.object.invoke('test', 'other-action', 'chat', 'request'), /different arguments/);
		await assert.rejects(reference.object.invoke('test', 'act', 'chat', 'new-request'), /no longer available/);
		assert.deepStrictEqual({ id: repeated.id, state: repeated.state, effects }, { id: original.id, state: 'completed', effects: 1 });
	}));

	test('promoting a reference rematches integrations without changing its recorded identity', () => run(async store => {
		const record = { ...artifact, isArtifact: false };
		const f = fixture(store, codeAction, undefined, record);
		store.add(f.registry.register({
			...f.integration, id: 'artifacts-only',
			match: (resource, _token, record) => record.isArtifact ? { resource, key: resource.toString(), credentialScope: 'account' } : undefined,
		}, 'artifacts-only'));
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const before = reference.object.snapshot.get().contributions.map(contribution => contribution.integrationId);
		f.session.set({ ...f.session.get(), artifacts: [{ ...record, isArtifact: true }] }, undefined);
		await waitForState(reference.object.snapshot, snapshot => snapshot.contributions.length === 2 && snapshot.contributions.every(contribution => contribution.view.availability.kind === 'available'));
		assert.deepStrictEqual({ before, after: reference.object.snapshot.get().contributions.map(contribution => contribution.integrationId), id: reference.object.snapshot.get().artifact.id },
			{ before: ['test'], after: ['artifacts-only', 'test'], id: artifact.id });
	}));

	test('deduplicates occurrences, requires explicit retries, and disables only at N+1', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automation = f.bindings[0].automation!;
		const request = { optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'objective-1', reason: 'Objective not yet met' };
		const first = await automation.runAutomation(request);
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === first.id && isArtifactRunSettled(run)));
		const duplicate = await automation.runAutomation(request);
		const second = await automation.runAutomation({ ...request, retryOf: first.id });
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === second.id && isArtifactRunSettled(run)));
		await assert.rejects(automation.runAutomation({ ...request, retryOf: second.id }), ArtifactRetryLimitError);
		const configuration = reference.object.snapshot.get().contributions[0].configuration;
		assert.deepStrictEqual({
			duplicate: duplicate.id === first.id,
			states: f.service.ledger.state.get().runs.map(run => [run.state, run.dispatched]),
			values: configuration.values,
			attempts: configuration.disablements.automatic.attempts,
			lastRun: configuration.disablements.automatic.lastRunId,
		}, { duplicate: true, states: [['completed', true], ['completed', true]], values: { automatic: false }, attempts: 2, lastRun: second.id });
		await reference.object.configure('test', configuration.revision, { automatic: true });
		assert.deepStrictEqual(reference.object.snapshot.get().contributions[0].configuration.generations, { automatic: 2 });
	}));

	test('a repeated occurrence neither writes nor notifies', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automation = f.bindings[0].automation!;
		const request = { optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'objective-1', reason: 'Objective not yet met' };
		const first = await automation.runAutomation(request);
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === first.id && isArtifactRunSettled(run)));
		await f.service.whenIdle();
		const state = f.service.ledger.state.get();
		const written = f.storage.value;
		const repeated = await automation.runAutomation(request);
		assert.deepStrictEqual({
			sameRun: repeated.id === first.id,
			sameState: f.service.ledger.state.get() === state,
			sameStorage: f.storage.value === written,
		}, { sameRun: true, sameState: true, sameStorage: true });
	}));

	test('preparation skips do not consume dispatched-attempt budgets', () => run(async store => {
		const f = fixture(store, { ...codeAction, prepare: async () => ({ kind: 'skip', reason: 'No work needed' }) });
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automation = f.bindings[0].automation!;
		let previous: string | undefined;
		for (let i = 0; i < 4; i++) {
			const run = await automation.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'skip', reason: 'Check again', retryOf: previous });
			await waitForState(f.service.ledger.state, state => state.runs.some(candidate => candidate.id === run.id && isArtifactRunSettled(candidate)));
			previous = run.id;
		}
		assert.deepStrictEqual({
			runs: f.service.ledger.state.get().runs.map(run => [run.state, run.dispatched]),
			enabled: reference.object.snapshot.get().contributions[0].configuration.values.automatic,
		}, { runs: [['skipped', false], ['skipped', false], ['skipped', false], ['skipped', false]], enabled: true });
	}));

	test('revocation while preparing prevents the effect and does not overwrite cancellation', () => run(async store => {
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		let effects = 0;
		const f = fixture(store, {
			...codeAction,
			prepare: async () => {
				await started.complete();
				await finish.p;
				return { kind: 'ready', value: { run: async () => { effects++; return { kind: 'completed', summary: 'Done' }; } } };
			},
		});
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		await f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'revoke', reason: 'Prepare' });
		await started.p;
		await reference.object.configure('test', 1, { automatic: false });
		await finish.complete();
		await f.service.whenIdle();
		assert.deepStrictEqual({ effects, runs: f.service.ledger.state.get().runs.map(run => [run.state, run.dispatched]) }, { effects: 0, runs: [['cancelled', false]] });
	}));

	test('manual action availability is checked again after asynchronous preparation', () => run(async store => {
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		let effects = 0;
		const f = fixture(store, {
			...codeAction,
			prepare: async () => {
				await started.complete();
				await finish.p;
				return { kind: 'ready', value: { run: async () => { effects++; return { kind: 'completed', summary: 'Done' }; } } };
			},
		});
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const run = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual-1');
		await started.p;
		const binding = f.bindings[0];
		binding.view.set({ ...binding.view.get(), stateActions: [{ id: 'act', enabled: false }] }, undefined);
		await finish.complete();
		await f.service.whenIdle();
		assert.deepStrictEqual({ effects, state: f.service.ledger.state.get().runs.find(candidate => candidate.id === run.id)?.state }, { effects: 0, state: 'blocked' });
	}));

	test('manual availability is scoped to the invoking chat, not the artifact origin', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const binding = f.bindings[0];
		binding.view.set({
			...binding.view.get(), stateActions: [{
				id: 'act', enabled: true, chatAvailability: { 'invoking-chat': { enabled: true }, 'origin-chat': { enabled: false, disabledReason: 'Wrong checkout' } },
			}]
		}, undefined);
		await assert.rejects(reference.object.invoke('test', 'act', 'origin-chat', 'rejected'), /Wrong checkout/);
		await assert.rejects(reference.object.invoke('test', 'act', 'unknown-chat', 'unknown'), /not available in the invoking chat/);
		await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.state === 'completed'));
		assert.deepStrictEqual(f.service.ledger.state.get().runs.map(run => [run.chat, run.state]), [['invoking-chat', 'completed']]);
	}));

	test('changing one automation control does not revoke another control in the same binding', () => run(async store => {
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const options: readonly ArtifactAutomationOption[] = ['first', 'second'].map(id => ({ id, kind: 'boolean', label: id, description: id, defaultValue: false, actionIds: ['act'], maxAttempts: 2 }));
		const f = fixture(store, {
			...codeAction,
			prepare: async () => {
				await started.complete();
				await finish.p;
				return { kind: 'ready', value: { run: async () => ({ kind: 'completed', summary: 'Done' }) } };
			},
		}, new MemoryStorage(), artifact, options);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { first: true, second: true });
		const run = await f.bindings[0].automation!.runAutomation({ optionId: 'second', actionId: 'act', configurationRevision: 1, occurrenceKey: 'second-objective', reason: 'Second control' });
		await started.p;
		await reference.object.configure('test', 1, { first: false });
		await finish.complete();
		await waitForState(f.service.ledger.state, state => state.runs.some(candidate => candidate.id === run.id && isArtifactRunSettled(candidate)));
		assert.deepStrictEqual({ state: f.service.ledger.state.get().runs[0].state, values: reference.object.snapshot.get().contributions[0].configuration.values }, { state: 'completed', values: { first: false, second: true } });
	}));

	test('canonical aliases share uncertainty barriers as well as their resource model', () => run(async store => {
		let effects = 0;
		const f = fixture(store, {
			...codeAction,
			prepare: async () => ({ kind: 'ready', value: { run: async () => { effects++; throw new Error('Unknown result'); } } }),
		});
		f.setCanonicalKey('canonical-resource');
		const alias = { ...artifact, id: 'alias', resource: 'https://example.test/resource?tracking=1' };
		f.session.set({ ...f.session.get(), artifacts: [artifact, alias] }, undefined);
		const first = store.add(await f.service.acquireArtifact('session', artifact.id));
		const second = store.add(await f.service.acquireArtifact('session', alias.id));
		await first.object.invoke('test', 'act', 'chat', 'first');
		await waitForState(f.service.ledger.state, state => state.runs[0]?.indeterminate === true);
		const blocked = await second.object.invoke('test', 'act', 'chat', 'alias');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === blocked.id && run.state === 'blocked'));
		assert.deepStrictEqual({ effects, resources: f.counts().resources }, { effects: 1, resources: 1 });
	}));

	test('main presentation follows registration priority rather than availability timing', () => run(async store => {
		const f = fixture(store);
		store.add(f.registry.register({ ...f.integration, id: 'preferred', presentationPriority: 10 }, 'test-runtime'));
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const preferred = f.bindings[0];
		preferred.view.set({ ...preferred.view.get(), availability: { kind: 'loading' } }, undefined);
		assert.deepStrictEqual(reference.object.snapshot.get().mainIntegrationId, 'preferred');
	}));

	test('automatic prompts target origin, manual prompts target the captured chat, and acceptance is not completion', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse this resource' } }) };
		const f = fixture(store, action);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automatic = await f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'monday', reason: 'Weekly analysis' });
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === automatic.id && run.state === 'submitted'));
		const admitted = f.service.ledger.state.get().runs[0].state;
		f.progress.set({ kind: 'completed', turnId: 'turn-1', reason: 'Turn finished' }, undefined);
		await waitForState(f.service.ledger.state, state => state.runs[0].state === 'completed');
		f.progress.set({ kind: 'submitted' }, undefined);
		const manual = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === manual.id && run.state === 'submitted'));
		assert.deepStrictEqual({ admitted, destinations: f.submitted.map(request => request.chat) }, { admitted: 'submitted', destinations: ['origin-chat', 'invoking-chat'] });
	}));

	test('publishes one expandable notice for each committed enable or disable without sending a prompt', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		await reference.object.configure('test', 1, { automatic: true });
		await reference.object.configure('test', 2, { automatic: false });
		await timeout(0);
		assert.deepStrictEqual({
			notices: f.notices.map(notice => ({
				kind: notice.kind, session: notice.session, chat: notice.artifact.origin?.chat, iconId: notice.iconId,
				lines: notice.content.split('\n\n'),
			})),
			prompts: f.submitted,
		}, {
			notices: [{
				kind: 'enabled', session: 'session', chat: 'origin-chat', iconId: 'link',
				lines: [
					'Automatically Act enabled for Example',
					'Run Act automatically.',
				],
			}, {
				kind: 'disabled', session: 'session', chat: 'origin-chat', iconId: undefined,
				lines: [
					'Automatically Act disabled for Example',
					'No new automatic runs will start for this rule. Pending runs will be cancelled; work already sent may still finish. Completed changes are not undone.',
					'No automation rules remain enabled for this artifact integration.',
				],
			}],
			prompts: [],
		});
	}));

	test('notices explain changed modes, remaining rules, and automatic disablements', () => run(async store => {
		const options: readonly ArtifactAutomationOption[] = [
			{ id: 'automatic', kind: 'boolean', label: 'Repair', description: 'Repair failures.', defaultValue: false, actionIds: ['act'], maxAttempts: 2 },
			{
				id: 'merge', kind: 'enum', label: 'Merge', description: 'Merge when ready.', defaultValue: 'off', disabledValue: 'off', actionIds: ['act'], maxAttempts: 1,
				choices: [{ value: 'off', label: 'Off' }, { value: 'ready', label: 'When Ready' }, { value: 'unchanged', label: 'Only if Unchanged', description: 'Do not merge changed work.' }],
			},
		];
		const f = fixture(store, codeAction, new MemoryStorage(), artifact, options);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true, merge: 'ready' });
		await reference.object.configure('test', 1, { merge: 'unchanged' });
		await f.bindings[0].automation!.disableAutomation('automatic', 2, 'Attempt limit reached');
		await timeout(0);
		assert.deepStrictEqual(f.notices.map(notice => ({
			kind: notice.kind, heading: notice.content.split('\n')[0],
			changedMode: notice.content.includes('Mode: Only if Unchanged'),
			modeExplanation: notice.content.includes('Do not merge changed work'),
			disabledReason: notice.content.includes('Attempt limit reached'),
			remaining: notice.content.includes('Still enabled: Merge'),
		})), [
			{ kind: 'enabled', heading: 'Repair enabled for Example', changedMode: false, modeExplanation: false, disabledReason: false, remaining: false },
			{ kind: 'enabled', heading: 'Merge enabled for Example', changedMode: false, modeExplanation: false, disabledReason: false, remaining: false },
			{ kind: 'changed', heading: 'Merge updated for Example', changedMode: true, modeExplanation: true, disabledReason: false, remaining: false },
			{ kind: 'disabled', heading: 'Repair disabled for Example', changedMode: false, modeExplanation: false, disabledReason: true, remaining: true },
		]);
	}));

	test('restoring enabled automation does not repeat enable notices and failed writes announce nothing', () => run(async store => {
		const firstStore = store.add(new DisposableStore());
		const first = fixture(firstStore);
		const reference = firstStore.add(await first.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		await timeout(0);
		firstStore.dispose();
		const restarted = fixture(store, codeAction, first.storage);
		const restored = store.add(await restarted.service.acquireArtifact('session', artifact.id));
		restarted.storage.failure = new Error('Disk full');
		await assert.rejects(restored.object.configure('test', 1, { automatic: false }), /Disk full/);
		await timeout(0);
		assert.deepStrictEqual({
			firstNotices: first.notices.map(notice => notice.kind),
			restoredNotices: restarted.notices,
			enabled: restored.object.snapshot.get().contributions[0].configuration.values.automatic,
		}, { firstNotices: ['enabled'], restoredNotices: [], enabled: true });
	}));

	test('notice content escapes artifact and integration text without preventing line wrapping', () => run(async store => {
		const f = fixture(store, codeAction, new MemoryStorage(), { ...artifact, label: '[Example](command:run)' }, [{
			id: 'automatic', kind: 'boolean', label: '*Automatically Act*', description: 'Use [this](command:run).', defaultValue: false, actionIds: ['act'], maxAttempts: 2,
		}]);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		await timeout(0);
		assert.deepStrictEqual(f.notices[0].content.split('\n\n').slice(0, 2), [
			'\\*Automatically Act\\* enabled for \\[Example\\]\\(command:run\\)',
			'Use \\[this\\]\\(command:run\\).',
		]);
	}));

	test('prompt identity and dispatch reservation are durable before submission', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const f = fixture(store, action);
		const submit = f.runtime.chat.submit;
		let persistedBeforeSend = false;
		f.runtime.chat.submit = async (request, token, isCurrent) => {
			const persisted = f.service.ledger.state.get().runs.find(run => run.id === request.requestId);
			persistedBeforeSend = !!persisted?.dispatched && !!f.storage.value?.includes(JSON.stringify(persisted));
			return submit(request, token, isCurrent);
		};
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const requested = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'submitted'));
		assert.deepStrictEqual({ persistedBeforeSend, requestId: f.handles[0].requestId }, { persistedBeforeSend: true, requestId: requested.id });
	}));

	for (const source of ['manual', 'automation'] as const) {
		test(`${source} prompts capture related details without retaining live observations or changing the prompt`, () => run(async store => {
			const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'graph', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Model-facing instructions' } }) };
			const f = fixture(store, action);
			const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
			const binding = f.bindings[0];
			binding.view.set({
				...binding.view.get(),
				sections: [
					{ id: 'scorecard', label: 'Ready', description: 'Ready to analyse', icon: { id: 'graph' }, detailsId: 'scorecard' },
					{ id: 'unrelated', label: 'Activity', icon: { id: 'history' }, detailsId: 'unrelated' },
				],
			}, undefined);
			const scorecard = {
				title: 'Scorecard', availability: { kind: 'available' as const },
				links: [{ kind: 'automation' as const, optionId: 'automatic' }],
				facts: [{ id: 'state', label: 'State', value: 'Completed' }],
				items: [{ id: 'metric', label: 'Successful searches', icon: { id: 'pass', colorId: 'charts.green' }, resource: artifact.resource }],
				completeness: 'partial' as const,
			};
			const acquired: string[] = [];
			const released: string[] = [];
			binding.acquireDetails = (detailsId = 'main') => {
				acquired.push(detailsId);
				const lifetime = toDisposable(() => released.push(detailsId));
				return { details: constObservable(detailsId === 'scorecard' ? scorecard : binding.details.get()), dispose: () => lifetime.dispose() };
			};
			await model.configure('test', 0, { automatic: true });
			const requested = source === 'manual'
				? await model.invoke('test', 'act', 'invoking-chat', 'manual')
				: await binding.automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'ready', reason: 'Ready now' });
			await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'submitted'));
			scorecard.items[0].label = 'Changed after submission';
			const expected = {
				version: 1, integrationLabel: 'Test', source, action: { label: 'Analyse', iconId: 'graph' },
				artifact: { resource: artifact.resource, label: 'Resource', description: undefined, icon: { id: 'link' } },
				details: [{
					...scorecard, description: 'Ready to analyse', links: [],
					items: [{ ...scorecard.items[0], label: 'Successful searches' }],
				}],
			};
			assert.deepStrictEqual({
				prompt: f.submitted[0].prompt,
				presentation: f.submitted[0].presentation,
				persisted: JSON.parse(f.storage.value!).runs[0].presentation,
				acquired, released,
			}, {
				prompt: { text: 'Model-facing instructions' },
				presentation: expected,
				persisted: JSON.parse(JSON.stringify(expected)),
				acquired: ['main', 'scorecard', 'unrelated'], released: ['main', 'scorecard', 'unrelated'],
			});
		}));
	}

	test('prompt presentation still describes the action when the integration has no details', () => run(async store => {
		const f = fixture(store, { id: 'act', label: 'Analyse', iconId: 'graph', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) });
		const model = store.add(await f.service.acquireArtifact('session', artifact.id)).object;
		f.bindings[0].view.set({ ...f.bindings[0].view.get(), main: undefined }, undefined);
		const requested = await model.invoke('test', 'act', 'invoking-chat', 'manual');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'submitted'));
		assert.deepStrictEqual(f.submitted[0].presentation, {
			version: 1, integrationLabel: 'Test', source: 'manual', action: { label: 'Analyse', iconId: 'graph' },
			artifact: { resource: artifact.resource, label: artifact.label, description: undefined, icon: undefined },
			details: [],
		});
	}));

	for (const source of ['manual', 'automation'] as const) {
		test(`retains an asynchronously loaded chat while admitting ${source} prompts`, () => run(async store => {
			const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
			const f = fixture(store, action);
			let opened = 0;
			let closed = 0;
			f.runtime.chat.observeChat = () => {
				opened++;
				const state = observableValue<{ available: boolean; busy: boolean; reason?: string }>('chat', { available: false, busy: false, reason: 'Loading the chat' });
				let disposed = false;
				const lifetime = toDisposable(() => { disposed = true; closed++; });
				queueMicrotask(() => {
					if (!disposed) {
						state.set({ available: true, busy: false }, undefined);
					}
				});
				return { state, dispose: () => lifetime.dispose() };
			};
			const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
			await reference.object.configure('test', 0, { automatic: true });
			const requested = source === 'manual'
				? await reference.object.invoke('test', 'act', 'invoking-chat', 'manual')
				: await f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'ready', reason: 'Ready now' });
			await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'submitted'));
			assert.deepStrictEqual({ opened, closed, destinations: f.submitted.map(request => request.chat) }, {
				opened: 1, closed: 1, destinations: [source === 'manual' ? 'invoking-chat' : 'origin-chat'],
			});
		}));
	}

	test('retries with the same chat observation when readiness changes during blocked-state persistence', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const f = fixture(store, action);
		const observed = new DeferredPromise<void>();
		const write = new DeferredPromise<void>();
		const state = observableValue('chat', { available: false, busy: false });
		let opened = 0;
		f.runtime.chat.observeChat = () => {
			opened++;
			f.storage.barrier = write;
			void observed.complete();
			return { state, dispose() { } };
		};
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const requested = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await observed.p;
		state.set({ available: true, busy: false }, undefined);
		await timeout(1);
		await write.complete();
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'submitted'));
		assert.deepStrictEqual({ opened, submissions: f.submitted.length }, { opened: 1, submissions: 1 });
	}));

	for (const cleanup of ['cancel', 'unregister', 'dispose'] as const) {
		test(`releases the waiting chat observation on ${cleanup}`, () => run(async store => {
			const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
			const f = fixture(store, action);
			const state = observableValue('chat', { available: false, busy: false });
			let closed = 0;
			f.runtime.chat.observeChat = () => ({ state, dispose: () => { closed++; } });
			const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
			const requested = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
			await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'blocked'));
			if (cleanup === 'cancel') {
				await reference.object.cancel(requested.id);
			} else if (cleanup === 'unregister') {
				f.registration.dispose();
			} else {
				f.service.dispose();
			}
			await f.service.whenIdle();
			state.set({ available: true, busy: false }, undefined);
			await timeout(0);
			assert.deepStrictEqual({ closed, submissions: f.submitted.length }, { closed: 1, submissions: 0 });
		}));
	}

	test('explicit cancellation uses the submitted request handle', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const f = fixture(store, action);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const requested = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === requested.id && run.state === 'submitted'));
		await reference.object.cancel(requested.id);
		await waitForState(f.service.ledger.state, state => state.runs[0].state === 'cancelled');
		assert.deepStrictEqual({ submissions: f.submitted.length, cancellations: f.handles[0].cancelCalls, recoveries: f.recovered }, { submissions: 1, cancellations: 1, recoveries: [] });
	}));

	test('cancellation before acknowledgement is applied to the handle when it arrives', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const f = fixture(store, action);
		const sent = new DeferredPromise<void>();
		const acknowledged = new DeferredPromise<void>();
		const submit = f.runtime.chat.submit;
		f.runtime.chat.submit = async (request, token, isCurrent) => {
			const result = await submit(request, token, isCurrent);
			void sent.complete();
			await acknowledged.p;
			return result;
		};
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const requested = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await sent.p;
		await reference.object.cancel(requested.id);
		void acknowledged.complete();
		await waitForState(f.service.ledger.state, state => state.runs[0]?.state === 'cancelled');
		assert.deepStrictEqual({ submissions: f.submitted.length, cancellations: f.handles[0].cancelCalls }, { submissions: 1, cancellations: 1 });
	}));

	for (const phase of ['submission', 'queue persistence'] as const) {
		test(`cancellation during ${phase} is retained when prompt submission reports busy`, () => run(async store => {
			const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
			const f = fixture(store, action);
			const submitted = new DeferredPromise<void>();
			const busy = new DeferredPromise<void>();
			const queued = new DeferredPromise<void>();
			const persist = new DeferredPromise<void>();
			f.storage.beforeWrite = async value => {
				const state: ArtifactIntegrationState = JSON.parse(value);
				if (phase === 'queue persistence' && state.runs.some(run => run.state === 'queued' && run.prompt)) {
					void queued.complete();
					await persist.p;
				}
			};
			let submissions = 0;
			f.runtime.chat.submit = async () => {
				submissions++;
				void submitted.complete();
				await busy.p;
				return { kind: 'busy' };
			};
			const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
			const requested = await reference.object.invoke('test', 'act', 'chat', 'request');
			await submitted.p;
			if (phase === 'queue persistence') {
				await busy.complete();
				await queued.p;
			}
			await reference.object.cancel(requested.id);
			await busy.complete();
			await persist.complete();
			await f.service.whenIdle();
			await timeout(1001);
			assert.deepStrictEqual({
				submissions,
				runs: reference.object.snapshot.get().runs.map(run => ({ state: run.state, dispatched: run.dispatched })),
			}, { submissions: 1, runs: [{ state: 'cancelled', dispatched: false }] });
		}));
	}

	test('restart reattaches a persisted prompt without cancelling or resending it', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const firstStore = store.add(new DisposableStore());
		const first = fixture(firstStore, action);
		const reference = firstStore.add(await first.service.acquireArtifact('session', artifact.id));
		const requested = await reference.object.invoke('test', 'act', 'invoking-chat', 'manual');
		await waitForState(first.service.ledger.state, state => state.runs[0]?.state === 'submitted');
		await first.service.whenIdle();
		first.service.dispose();
		firstStore.dispose();
		await first.service.whenIdle();

		const restarted = fixture(store, action, first.storage);
		await restarted.service.initialize();
		restarted.progress.set({ kind: 'completed', turnId: 'recovered-turn', reason: 'Turn finished' }, undefined);
		await waitForState(restarted.service.ledger.state, state => state.runs[0]?.state === 'completed');
		assert.deepStrictEqual({
			cancelCalls: first.handles[0].cancelCalls,
			submissions: restarted.submitted,
			recovered: restarted.recovered,
			receipt: restarted.service.ledger.state.get().runs[0].receipt,
		}, {
			cancelCalls: 0, submissions: [],
			recovered: [{ requestId: requested.id, receipt: { kind: 'queued', queuedMessageId: requested.id } }],
			receipt: { kind: 'turn', turnId: 'recovered-turn' },
		});
	}));

	test('tracking loss stays uncertain until a fresh handle reconciles the same prompt', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const f = fixture(store, action);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const first = await reference.object.invoke('test', 'act', 'invoking-chat', 'first');
		await waitForState(f.service.ledger.state, state => state.runs[0]?.state === 'submitted');
		f.progress.set({ kind: 'indeterminate', reason: 'The turn is missing' }, undefined);
		await waitForState(f.service.ledger.state, state => state.runs[0]?.indeterminate === true);
		const blocked = await reference.object.invoke('test', 'act', 'invoking-chat', 'second');
		await waitForState(f.service.ledger.state, state => state.runs[1]?.state === 'blocked');
		await reference.object.cancel(blocked.id);
		await f.service.whenIdle();
		f.progress.set({ kind: 'failed', turnId: 'original-turn', reason: 'Confirmed failure' }, undefined);
		await reference.object.reconcile(first.id);
		await waitForState(f.service.ledger.state, state => state.runs[0]?.state === 'failed');
		assert.deepStrictEqual({
			submissions: f.submitted.length,
			recovered: f.recovered.map(recovery => recovery.requestId),
			runs: f.service.ledger.state.get().runs.map(run => [run.state, run.indeterminate === true]),
		}, { submissions: 1, recovered: [first.id], runs: [['failed', false], ['cancelled', false]] });
	}));

	for (const kind of ['prompt', 'code'] as const) {
		test(`restart preserves ${kind} recovery when the original action was removed`, () => run(async store => {
			const firstStore = store.add(new DisposableStore());
			const action: ArtifactAction = kind === 'prompt'
				? { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) }
				: { ...codeAction, prepare: async () => ({ kind: 'ready', value: { run: async () => { throw new Error('Unknown effect'); } } }) };
			const first = fixture(firstStore, action);
			const reference = firstStore.add(await first.service.acquireArtifact('session', artifact.id));
			const requested = await reference.object.invoke('test', 'act', 'chat', 'request');
			await waitForState(first.service.ledger.state, state => state.runs[0]?.state === (kind === 'prompt' ? 'submitted' : 'interrupted'));
			await first.service.whenIdle();
			first.service.dispose();
			firstStore.dispose();
			await first.service.whenIdle();
			const restarted = fixture(store, { ...codeAction, id: 'other' }, first.storage, artifact, []);
			const restored = store.add(await restarted.service.acquireArtifact('session', artifact.id));
			if (kind === 'prompt') {
				restarted.progress.set({ kind: 'completed', turnId: 'original-turn', reason: 'Recovered completion' }, undefined);
				await timeout(0);
			}
			assert.deepStrictEqual({
				availability: restored.object.snapshot.get().contributions[0].view.availability.kind,
				actions: restored.object.snapshot.get().contributions[0].actions.map(action => action.id),
				recovered: restarted.recovered.map(recovery => recovery.requestId),
				submissions: restarted.submitted,
				runs: restored.object.snapshot.get().runs.map(run => [run.id, run.state, run.indeterminate === true]),
			}, {
				availability: 'available', actions: ['other'],
				recovered: kind === 'prompt' ? [requested.id] : [], submissions: [],
				runs: [[requested.id, kind === 'prompt' ? 'completed' : 'interrupted', kind === 'code']],
			});
		}));
	}

	test('legacy records without origin cannot automatically send a prompt', () => run(async store => {
		const action: ArtifactAction = { id: 'act', label: 'Analyse', iconId: 'search', kind: 'prompt', prepare: async () => ({ kind: 'ready', value: { text: 'Analyse' } }) };
		const f = fixture(store, action, new MemoryStorage(), { ...artifact, origin: undefined });
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automatic = await f.bindings[0].automation!.runAutomation({ optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'missing-origin', reason: 'Automatic analysis' });
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === automatic.id && run.state === 'blocked'));
		assert.deepStrictEqual({ submitted: f.submitted, dispatched: f.service.ledger.state.get().runs[0].dispatched }, { submitted: [], dispatched: false });
	}));

	test('an unknown native effect blocks new request IDs and different occurrences until reconciled', () => run(async store => {
		let effects = 0;
		const action: ArtifactAction = {
			...codeAction,
			prepare: async () => ({ kind: 'ready', value: { run: async () => { effects++; throw new Error('Connection lost after effect'); } } }),
			reconcile: async () => ({ kind: 'completed', summary: 'Verified externally' }),
		};
		const f = fixture(store, action);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		const first = await reference.object.invoke('test', 'act', 'chat', 'first');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === first.id && run.indeterminate === true));
		const second = await reference.object.invoke('test', 'act', 'chat', 'different-request');
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === second.id && run.state === 'blocked'));
		await reference.object.cancel(second.id);
		await reference.object.reconcile(first.id);
		assert.deepStrictEqual({ effects, runs: f.service.ledger.state.get().runs.map(run => [run.state, run.indeterminate === true]) }, { effects: 1, runs: [['completed', false], ['cancelled', false]] });
	}));

	test('expanded action consent is disabled on restart instead of silently inheriting authorization', () => run(async store => {
		const firstStore = store.add(new DisposableStore());
		const first = fixture(firstStore);
		const reference = firstStore.add(await first.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		firstStore.dispose();
		await first.service.whenIdle();
		const restarted = fixture(store, { ...codeAction, consentVersion: 'expanded-effects' }, first.storage);
		const restored = store.add(await restarted.service.acquireArtifact('session', artifact.id));
		const configuration = restored.object.snapshot.get().contributions[0].configuration;
		assert.deepStrictEqual({ value: configuration.values.automatic, disabled: !!configuration.disablements.automatic, active: restarted.bindings.some(binding => !!binding.automation) }, { value: false, disabled: true, active: false });
	}));

	test('later metadata cannot overwrite the origin captured when the binding was first changed', () => run(async store => {
		const f = fixture(store);
		const first = store.add(await f.service.acquireArtifact('session', artifact.id));
		await first.object.configure('test', 0, { automatic: false });
		first.dispose();
		await f.service.whenIdle();
		f.session.set({ ...f.session.get(), artifacts: [{ ...artifact, origin: { chat: 'replacement-chat' } }] }, undefined);
		const reopened = store.add(await f.service.acquireArtifact('session', artifact.id));
		assert.deepStrictEqual(reopened.object.snapshot.get().artifact.origin, artifact.origin);
	}));

	test('history is paged independently of the bounded live snapshot', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		for (let i = 0; i < 55; i++) {
			const run = await reference.object.invoke('test', 'act', 'chat', `manual-${i}`);
			await reference.object.cancel(run.id);
		}
		const first = await reference.object.getRuns(undefined, 50);
		const second = await reference.object.getRuns(first.next, 50);
		assert.deepStrictEqual({ live: reference.object.snapshot.get().runs.length, pages: [first.runs.length, second.runs.length], next: second.next }, { live: 50, pages: [50, 5], next: undefined });
	}));

	test('repeat protection and attempt budgets survive history pruning', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		await reference.object.configure('test', 0, { automatic: true });
		const automation = f.bindings[0].automation!;
		const request = { optionId: 'automatic', actionId: 'act', configurationRevision: 1, occurrenceKey: 'objective-1', reason: 'Objective not yet met' };
		const first = await automation.runAutomation(request);
		await waitForState(f.service.ledger.state, state => state.runs.some(run => run.id === first.id && isArtifactRunSettled(run)));
		for (let i = 0; i < 205; i++) {
			const run = await reference.object.invoke('test', 'act', 'chat', `manual-${i}`);
			await reference.object.cancel(run.id);
		}
		const repeated = await automation.runAutomation(request);
		assert.deepStrictEqual({
			repeated: repeated.id === first.id,
			stored: f.service.ledger.state.get().runs.length,
			oldestManual: f.service.ledger.state.get().runs.find(run => run.source === 'manual')?.requestId,
		}, { repeated: true, stored: 201, oldestManual: 'manual-5' });
	}));

	test('settled run history is bounded per binding', () => run(async store => {
		const f = fixture(store);
		const reference = store.add(await f.service.acquireArtifact('session', artifact.id));
		for (let i = 0; i < 205; i++) {
			const run = await reference.object.invoke('test', 'act', 'chat', `retained-${i}`);
			await reference.object.cancel(run.id);
		}
		assert.deepStrictEqual({
			stored: f.service.ledger.state.get().runs.length,
			oldest: f.service.ledger.state.get().runs[0].requestId,
			newest: f.service.ledger.state.get().runs.at(-1)?.requestId,
		}, { stored: 200, oldest: 'retained-5', newest: 'retained-204' });
	}));
});
