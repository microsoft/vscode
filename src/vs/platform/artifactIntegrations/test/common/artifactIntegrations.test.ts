/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue, waitForState } from '../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactAction, ArtifactAutomationOption, ArtifactContributionView, ArtifactDetails, ArtifactPromptReceipt, ArtifactRecord, IArtifactAutomationContext, IArtifactBindingContext, IArtifactIntegration, IArtifactIntegrationBinding, isArtifactRunSettled } from '../../common/artifactIntegration.js';
import { ArtifactIntegrationRegistry } from '../../common/artifactIntegrationRegistry.js';
import { ArtifactIntegrationService } from '../../common/artifactIntegrationService.js';
import { ArtifactConfigurationConflictError, ArtifactIntegrationStore, ArtifactRetryLimitError } from '../../common/artifactIntegrationStore.js';
import { ArtifactPromptOutcome, ArtifactPromptRequest, ArtifactPromptState, ArtifactPromptTrackingError, ArtifactSessionState, IArtifactIntegrationStorage, IArtifactPromptHandle, IArtifactRuntime, isArtifactPromptOutcome, selectArtifactCoordinator } from '../../common/artifactRuntime.js';

class MemoryStorage implements IArtifactIntegrationStorage {
	value: string | undefined;
	failure: Error | undefined;
	barrier: DeferredPromise<void> | undefined;

	async read() { return this.value; }

	async write(value: string): Promise<void> {
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

	acquireDetails() {
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
	const options: readonly ArtifactAutomationOption[] = optionDefinitions ?? [{ id: 'automatic', kind: 'boolean', label: 'Automatically Act', description: 'Run Act automatically.', defaultValue: false, actionIds: [action.id], maxAttempts: 2 }];
	const integration: IArtifactIntegration<DisposableStore> = {
		id: 'test', label: 'Test', automationOptions: options,
		match: resource => ({ resource, key: canonicalKey ?? resource.toString(), credentialScope }),
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
	store.add(registry.register(integration, 'test-runtime'));
	const available = observableValue('available', true);
	const session = observableValue<ArtifactSessionState>('session', { availability: { kind: 'available' }, archived: false, artifacts: [record] });
	const progress = observableValue<ArtifactPromptState>('progress', { kind: 'submitted' });
	const submitted: ArtifactPromptRequest[] = [];
	const recovered: { requestId: string; receipt: ArtifactPromptReceipt | undefined }[] = [];
	const handles: TestPromptHandle[] = [];
	const createHandle = (request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt) => {
		const handle = new TestPromptHandle(request.requestId, receipt, progress);
		handles.push(handle);
		return handle;
	};
	const runtime: IArtifactRuntime = {
		authority: { id: 'test-authority', targetHost: 'test-host', location: 'host' },
		available,
		isOwner: () => !store.isDisposed,
		acquireSession: async () => ({ object: session, dispose() { } }),
		authorize: async () => ({ kind: 'allowed' }),
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
	return { service, registry, integration, bindings, available, session, progress, submitted, recovered, handles, runtime, storage, counts: () => ({ resources, disposedResources }), setCredentialScope: (scope: string) => { credentialScope = scope; }, setCanonicalKey: (key: string) => { canonicalKey = key; } };
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
		storage.failure = new Error('Disk full');
		await assert.rejects(ledger.transact(state => state.runs.length), /Disk full/);
		storage.failure = undefined;
		await assert.rejects(ledger.transact(state => state.runs.length), /Disk full/);
		assert.deepStrictEqual({ revision: ledger.state.get().revision, stored: storage.value }, { revision: 0, stored: undefined });
	});

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

	test('later metadata cannot overwrite the origin already captured by the coordinator', () => run(async store => {
		const f = fixture(store);
		const first = store.add(await f.service.acquireArtifact('session', artifact.id));
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
});
